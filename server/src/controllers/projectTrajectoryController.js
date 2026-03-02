// ============================================================
// PROJECT TRAJECTORY CONTROLLER — HTTP Interface for Team Analytics
// ============================================================
// SRS §4.1.2: Project-level improvement visualization
// SRS §6.1: Team trajectory analysis
//
// Handles HTTP requests for project-level performance data.
//
// ENDPOINTS:
//   GET  /api/analytics/project/:projectId/trajectory    → Team trajectory
//   GET  /api/analytics/project/:projectId/delta         → Month-over-month delta
//   GET  /api/analytics/session/:sessionId/project-deltas → Bulk project deltas
// ============================================================

"use strict";

const ProjectTrajectoryService = require("../services/analytics/ProjectTrajectoryService");
const { query } = require("../config/database");

// ============================================================
// GET PROJECT TRAJECTORY
// ============================================================
/**
 * GET /api/analytics/project/:projectId/trajectory
 * Get team performance trajectory over time.
 *
 * Access: Faculty, Admin, Project Members
 *
 * @param {Request} req - req.params.projectId, req.query.limit
 * @param {Response} res - Team trajectory data
 */
const getProjectTrajectory = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { limit = 6 } = req.query;
    const requestingUser = req.user;

    // Verify project exists
    const projectQuery = `
      SELECT project_id, title, status
      FROM projects
      WHERE project_id = $1 AND is_deleted = FALSE
    `;
    const projectResult = await query(projectQuery, [projectId]);

    if (!projectResult.rows || projectResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Project not found",
      });
    }

    const project = projectResult.rows[0];

    // Authorization: Students can only view their own projects
    if (requestingUser.role === "student") {
      const membershipQuery = `
        SELECT 1 FROM project_members
        WHERE project_id = $1
          AND person_id = $2
          AND left_at IS NULL
        LIMIT 1
      `;
      const membershipResult = await query(membershipQuery, [
        projectId,
        requestingUser.personId || requestingUser.userId,
      ]);

      if (!membershipResult.rows || membershipResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          message: "You can only view your own projects",
        });
      }
    }

    const trajectory = await ProjectTrajectoryService.getProjectTeamTrajectory(
      projectId,
      parseInt(limit),
    );

    res.json({
      success: true,
      project: {
        id: project.project_id,
        title: project.title,
      },
      ...trajectory,
    });
  } catch (error) {
    console.error("Error in getProjectTrajectory:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch project trajectory",
    });
  }
};

// ============================================================
// GET PROJECT DELTA
// ============================================================
/**
 * GET /api/analytics/project/:projectId/delta
 * Get month-over-month improvement delta.
 * Ultra-lightweight for UI badges.
 *
 * Access: Authenticated users
 *
 * @param {Request} req - req.params.projectId, req.query.sessionId
 * @param {Response} res - Delta data for badge display
 */
const getProjectDelta = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { sessionId } = req.query;

    const delta = await ProjectTrajectoryService.getProjectDelta(
      projectId,
      sessionId || null,
    );

    res.json({
      success: true,
      ...delta,
    });
  } catch (error) {
    console.error("Error in getProjectDelta:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch project improvement delta",
    });
  }
};

// ============================================================
// GET SESSION PROJECT DELTAS (BULK)
// ============================================================
/**
 * GET /api/analytics/session/:sessionId/project-deltas
 * Get deltas for all projects in a session.
 * CRITICAL: Prevents N+1 queries on evaluation page.
 *
 * Access: Faculty, Admin
 *
 * @param {Request} req - req.params.sessionId
 * @param {Response} res - Map of projectId -> delta data
 */
const getSessionProjectDeltas = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deltas =
      await ProjectTrajectoryService.getSessionProjectDeltas(sessionId);

    res.json({
      success: true,
      session_id: sessionId,
      project_count: Object.keys(deltas).length,
      deltas,
    });
  } catch (error) {
    console.error("Error in getSessionProjectDeltas:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch session project deltas",
    });
  }
};

module.exports = {
  getProjectTrajectory,
  getProjectDelta,
  getSessionProjectDeltas,
};
