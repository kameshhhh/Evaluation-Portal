// ============================================================
// COMPARATIVE EVALUATION ROUTES — SRS §4.3
// ============================================================
// Hybrid model: Admin manages rounds, Judges create sessions
//
// Route pattern follows scarcityRoutes.js:
//   - authenticate on every route
//   - authorize("admin") for admin-only routes
//   - Static routes (/my, /my-rounds) BEFORE dynamic (/:id)
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createRound,
  listRounds,
  getRound,
  updateRound,
  activateRound,
  closeRound,
  addProjectsToRound,
  removeProjectFromRound,
  assignJudgesToRound,
  removeJudgeFromRound,
  getEligibleProjects,
  createSession,
  getMySessions,
  getMyActiveRounds,
  getSession,
  saveAllocations,
  saveAllocationForCriterion,
  submitSession,
  saveSnapshot,
  getSnapshots,
  restoreSnapshot,
  getRoundResults,
} = require("../controllers/comparativeController");

// ============================================================
// ROUND MANAGEMENT — Admin
// ============================================================
router.post(
  "/rounds",
  authenticate,
  authorize("admin", "faculty"),
  createRound,
);
router.get("/rounds", authenticate, listRounds);
router.get("/rounds/:roundId", authenticate, getRound);
router.put(
  "/rounds/:roundId",
  authenticate,
  authorize("admin", "faculty"),
  updateRound,
);
router.post(
  "/rounds/:roundId/activate",
  authenticate,
  authorize("admin", "faculty"),
  activateRound,
);
router.post(
  "/rounds/:roundId/close",
  authenticate,
  authorize("admin", "faculty"),
  closeRound,
);

// ROUND — Project Pool
router.post(
  "/rounds/:roundId/projects",
  authenticate,
  authorize("admin", "faculty"),
  addProjectsToRound,
);
router.delete(
  "/rounds/:roundId/projects/:projectId",
  authenticate,
  authorize("admin", "faculty"),
  removeProjectFromRound,
);

// ROUND — Judge Assignment
router.post(
  "/rounds/:roundId/judges",
  authenticate,
  authorize("admin", "faculty"),
  assignJudgesToRound,
);
router.delete(
  "/rounds/:roundId/judges/:judgeId",
  authenticate,
  authorize("admin", "faculty"),
  removeJudgeFromRound,
);

// ROUND — Eligible Projects (Judge sees available projects)
router.get(
  "/rounds/:roundId/eligible-projects",
  authenticate,
  getEligibleProjects,
);

// ROUND — Results (Admin)
router.get(
  "/rounds/:roundId/results",
  authenticate,
  authorize("admin", "faculty"),
  getRoundResults,
);

// ============================================================
// SESSION MANAGEMENT — Judge
// CRITICAL: Static /my and /my-rounds BEFORE /:sessionId
// ============================================================
router.get("/sessions/my", authenticate, getMySessions);
router.get("/sessions/my-rounds", authenticate, getMyActiveRounds);
router.post("/sessions", authenticate, createSession);
router.get("/sessions/:sessionId", authenticate, getSession);

// SESSION — Allocations
router.put("/sessions/:sessionId/allocations", authenticate, saveAllocations);
router.put(
  "/sessions/:sessionId/allocations/:criterionKey",
  authenticate,
  saveAllocationForCriterion,
);

// SESSION — Submit
router.post("/sessions/:sessionId/submit", authenticate, submitSession);

// SESSION — Snapshots
router.post("/sessions/:sessionId/snapshot", authenticate, saveSnapshot);
router.get("/sessions/:sessionId/snapshots", authenticate, getSnapshots);
router.post(
  "/sessions/:sessionId/snapshots/:snapshotId/restore",
  authenticate,
  restoreSnapshot,
);

module.exports = router;
