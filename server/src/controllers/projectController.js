// ============================================================
// PROJECT CONTROLLER — HTTP Endpoints for Project Operations
// ============================================================
// Handles all project-related HTTP requests.
// Integrates freeze guard middleware on mutation routes.
//
// Routes:
//   POST   /api/projects                     — Create project with team
//   GET    /api/projects                     — List projects
//   GET    /api/projects/:id                 — Get project with team
//   PATCH  /api/projects/:id                 — Update project details
//   POST   /api/projects/:id/transition      — State transition
//   POST   /api/projects/:id/members         — Add team member
//   DELETE /api/projects/:id/members/:personId — Remove team member
//   GET    /api/projects/:id/history         — Get transition history
//   GET    /api/projects/:id/members         — Get active members
// ============================================================

// Import Express Router
const { Router } = require("express");

// Import the project service
const ProjectEntityService = require("../services/ProjectEntityService");

// Import freeze guard middleware
const { projectFreezeGuard } = require("../middleware/freezeGuard");

// Import audit logger
const { EntityAuditLogger } = require("../services/EntityAuditLogger");

// Import personalization service to invalidate caches after project mutations
// Ensures all dashboards (student projects, faculty dept stats, admin counts) stay fresh
const personalizationService = require("../services/personalization/PersonalizationService");

// Import logger
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// Create the router instance
// ============================================================
const router = Router();

// ============================================================
// POST /api/projects — Create a new project with initial team
// ============================================================
router.post("/", async (req, res, next) => {
  try {
    // Extract the actor ID from the authenticated user
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;

    // Extract project data and team members from request body
    const { members, ...projectData } = req.body;

    // Create the project with team in a transaction
    const result = await ProjectEntityService.createProjectWithTeam(
      projectData,
      members || [],
      actorId,
    );

    // Log to audit trail
    await EntityAuditLogger.logCreation(
      "project",
      result.project.projectId,
      result.project.toJSON(),
      actorId,
      req,
    );

    // Invalidate ALL caches — new project affects student & faculty & admin dashboards
    personalizationService.invalidateAllCaches();

    // Broadcast real-time change
    broadcastChange("project", "created", {
      projectId: result.project.projectId,
    });

    // Respond with 201 Created
    res.status(201).json({
      success: true,
      data: {
        project: result.project.toJSON(),
        members: result.members.map((m) => m.toJSON()),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/projects/mine — List only the authenticated user's projects
// ============================================================
// Returns projects where the user is an active team member.
// Scoped view for students and faculty — admins should use GET /.
// MUST be defined BEFORE /:id to avoid route conflicts.
// ============================================================
router.get("/mine", async (req, res, next) => {
  try {
    // Resolve personId from auth middleware enrichment
    const personId = req.user?.personId;

    if (!personId) {
      return res.status(400).json({
        success: false,
        error: "Your account does not have a linked person profile yet. Contact your department admin.",
      });
    }

    // Extract filters from query string
    const filters = {
      academicYear: req.query.academicYear
        ? parseInt(req.query.academicYear, 10)
        : undefined,
      semester: req.query.semester
        ? parseInt(req.query.semester, 10)
        : undefined,
      status: req.query.status || undefined,
    };

    // Pagination
    const pagination = {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0,
    };

    const { projects, total } = await ProjectEntityService.listProjectsByMember(
      personId,
      filters,
      pagination,
    );

    res.json({
      success: true,
      data: projects.map((p) => p.toJSON()),
      pagination: { total, limit: pagination.limit, offset: pagination.offset },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/projects — List projects with filters
// ============================================================
router.get("/", async (req, res, next) => {
  try {
    // Extract filters from query string
    const filters = {
      academicYear: req.query.academicYear
        ? parseInt(req.query.academicYear, 10)
        : undefined,
      semester: req.query.semester
        ? parseInt(req.query.semester, 10)
        : undefined,
      status: req.query.status || undefined,
    };

    // Pagination
    const pagination = {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0,
    };

    const { projects, total } = await ProjectEntityService.listProjects(
      filters,
      pagination,
    );

    res.json({
      success: true,
      data: projects.map((p) => p.toJSON()),
      pagination: { total, limit: pagination.limit, offset: pagination.offset },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/projects/:id — Get project with team members
// ============================================================
router.get("/:id", async (req, res, next) => {
  try {
    const { project, members } = await ProjectEntityService.getProjectWithTeam(
      req.params.id,
    );

    res.json({
      success: true,
      data: {
        project: project.toJSON(),
        members: members.map((m) => m.toJSON()),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// PATCH /api/projects/:id — Update project details
// Freeze guard: blocks if project is frozen
// ============================================================
router.patch("/:id", projectFreezeGuard, async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const projectId = req.params.id;

    // Get before state for audit
    const { project: before } =
      await ProjectEntityService.getProjectWithTeam(projectId);

    // Perform the update
    const updated = await ProjectEntityService.updateProject(
      projectId,
      req.body,
      actorId,
    );

    // Audit log
    await EntityAuditLogger.logUpdate(
      "project",
      projectId,
      before.toJSON(),
      updated.toJSON(),
      actorId,
      req,
    );

    // Invalidate ALL caches — project update affects student & faculty & admin views
    personalizationService.invalidateAllCaches();

    // Broadcast real-time change
    broadcastChange("project", "updated", { projectId });

    res.json({
      success: true,
      data: updated.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/projects/:id/transition — Change project state
// ============================================================
router.post("/:id/transition", async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const projectId = req.params.id;
    const { targetStatus, reason, ...context } = req.body;

    // Get before state for audit
    const { project: before } =
      await ProjectEntityService.getProjectWithTeam(projectId);

    // Execute the state transition
    const updated = await ProjectEntityService.transitionProject(
      projectId,
      targetStatus,
      actorId,
      reason || "",
      context,
    );

    // Audit the state change
    await EntityAuditLogger.logStateChange(
      "project",
      projectId,
      before.status,
      updated.status,
      actorId,
      req,
    );

    // Invalidate ALL caches — state transition affects all dashboard views
    personalizationService.invalidateAllCaches();

    // Broadcast real-time change
    broadcastChange("project", "updated", { projectId });

    res.json({
      success: true,
      data: updated.toJSON(),
      transition: {
        from: before.status,
        to: updated.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/projects/:id/members — Add a team member
// Freeze guard: blocks if project is frozen
// ============================================================
router.post("/:id/members", projectFreezeGuard, async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const projectId = req.params.id;

    const member = await ProjectEntityService.addMember(
      projectId,
      req.body,
      actorId,
    );

    // Invalidate ALL caches — new member affects student & faculty team counts
    personalizationService.invalidateAllCaches();

    // Broadcast real-time change
    broadcastChange("project_member", "added", { projectId });

    res.status(201).json({
      success: true,
      data: member.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// DELETE /api/projects/:id/members/:personId — Remove a member
// Freeze guard: blocks if project is frozen
// ============================================================
router.delete(
  "/:id/members/:personId",
  projectFreezeGuard,
  async (req, res, next) => {
    try {
      // Falls back to req.body.actorId for API testing without auth middleware
      const actorId = req.user?.userId || req.user?.id || req.body.actorId;
      const { id: projectId, personId } = req.params;

      const removed = await ProjectEntityService.removeMember(
        projectId,
        personId,
        actorId,
        req.body.reason || "",
      );

      // Invalidate ALL caches — member removal affects student & faculty views
      personalizationService.invalidateAllCaches();

      // Broadcast real-time change
      broadcastChange("project_member", "removed", { projectId });

      res.json({
        success: true,
        message: removed ? "Member removed successfully" : "Member not found",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================
// GET /api/projects/:id/members — Get active team members
// ============================================================
router.get("/:id/members", async (req, res, next) => {
  try {
    const { members } = await ProjectEntityService.getProjectWithTeam(
      req.params.id,
    );

    res.json({
      success: true,
      data: members.map((m) => m.toJSON()),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/projects/:id/history — Get state transition history
// ============================================================
router.get("/:id/history", async (req, res, next) => {
  try {
    const history = await ProjectEntityService.getProjectHistory(req.params.id);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Export the router
// ============================================================
module.exports = router;
