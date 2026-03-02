// ============================================================
// EVALUATION CONTROLLER — HTTP Endpoints for Evaluations
// ============================================================
// Handles evaluation-related operations:
//
//   POST   /api/evaluations/freeze/:projectId   — Freeze a project
//   GET    /api/evaluations/snapshots/:projectId — Get freeze snapshots
//   POST   /api/evaluations/verify/:snapshotId   — Verify snapshot integrity
//   POST   /api/evaluations/integrity-check      — Run full integrity check
//   GET    /api/evaluations/consistency/:projectId — Check temporal consistency
//   POST   /api/evaluations/violations/:sessionId  — Check freeze violations
//
// These endpoints are typically used by:
//   - Admin/faculty initiating evaluation sessions
//   - System health checks
//   - Pre-evaluation preparation tasks
// ============================================================

// Import Express Router
const { Router } = require("express");

// Import services
const RealityFreezeService = require("../services/RealityFreezeService");
const EntityIntegrityService = require("../services/EntityIntegrityService");
const TemporalConsistencyService = require("../services/TemporalConsistencyService");
const FreezeViolationDetector = require("../services/FreezeViolationDetector");

// Import audit logger
const { EntityAuditLogger } = require("../services/EntityAuditLogger");

// Import logger
const logger = require("../utils/logger");
const { broadcastChange } = require("../socket");

// ============================================================
// Create the router instance
// ============================================================
const router = Router();

// ============================================================
// POST /api/evaluations/freeze/:projectId — Freeze project
// ============================================================
router.post("/freeze/:projectId", async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const { projectId } = req.params;
    const { sessionId } = req.body;

    // Validate sessionId is provided
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "sessionId is required in request body",
      });
    }

    // Freeze the project
    const snapshot = await RealityFreezeService.freezeProject(
      projectId,
      sessionId,
      actorId,
    );

    // Log the freeze action
    await EntityAuditLogger.logStateChange(
      "project",
      projectId,
      "active",
      "frozen",
      actorId,
      req,
    );

    broadcastChange("evaluation", "freeze_project", { projectId, sessionId });
    res.status(201).json({
      success: true,
      data: {
        snapshotId: snapshot.snapshotId,
        entityType: snapshot.entityType,
        entityId: snapshot.entityId,
        stateHash: snapshot.stateHash,
        previousHash: snapshot.previousHash,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/evaluations/snapshots/:projectId — Get freeze snapshots
// ============================================================
router.get("/snapshots/:projectId", async (req, res, next) => {
  try {
    const snapshots = await RealityFreezeService.getProjectSnapshots(
      req.params.projectId,
    );

    res.json({
      success: true,
      data: snapshots.map((s) => ({
        snapshotId: s.snapshot_id,
        sessionId: s.session_id,
        stateHash: s.state_hash,
        frozenAt: s.frozen_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/evaluations/verify/:snapshotId — Verify snapshot
// ============================================================
router.post("/verify/:snapshotId", async (req, res, next) => {
  try {
    const result = await RealityFreezeService.verifySnapshot(
      req.params.snapshotId,
    );

    broadcastChange("evaluation", "verify_snapshot", {
      snapshotId: req.params.snapshotId,
    });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/evaluations/integrity-check — Full integrity check
// ============================================================
router.post("/integrity-check", async (req, res, next) => {
  try {
    const verifiedBy = req.user?.userId || req.user?.id || "system";

    // Run the full check (can take a while for large datasets)
    const result =
      await EntityIntegrityService.runFullIntegrityCheck(verifiedBy);

    broadcastChange("evaluation", "integrity_check", {});
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/evaluations/consistency/:projectId — Temporal check
// ============================================================
router.get("/consistency/:projectId", async (req, res, next) => {
  try {
    const projectId = req.params.projectId;

    // Get submission summary across all periods
    const summary =
      await TemporalConsistencyService.getSubmissionSummary(projectId);

    // Get hour consistency check
    const hourCheck =
      await TemporalConsistencyService.checkHourConsistency(projectId);

    // Get plan completeness check
    const planCheck =
      await TemporalConsistencyService.checkPlanCompleteness(projectId);

    res.json({
      success: true,
      data: {
        workLogSummary: summary,
        hourConsistency: hourCheck,
        planCompleteness: planCheck,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/evaluations/violations/:sessionId — Check violations
// ============================================================
router.post("/violations/:sessionId", async (req, res, next) => {
  try {
    const result = await FreezeViolationDetector.checkAllSessionViolations(
      req.params.sessionId,
    );

    broadcastChange("evaluation", "check_violations", {
      sessionId: req.params.sessionId,
    });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Export the router
// ============================================================
module.exports = router;
