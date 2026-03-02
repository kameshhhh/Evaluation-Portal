// ============================================================
// COHORT ROUTES — HTTP Routes for Evaluation Cohort System
// ============================================================
// Part 5: Evaluation Orchestration & Cohort Management
// Part 6: Lightweight Peer Group Optimization
//
// Mounted at: /api/cohorts
//
// AUTH: All routes require authentication.
//       Admin-only routes use authorize("admin").
//       Evaluator view routes use authenticated user's personId.
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createCohort,
  listCohorts,
  getCohort,
  updateCohort,
  autoSetupCohort,
  activateCohort,
  completeCohort,
  addTargets,
  getTargets,
  removeTarget,
  autoPopulateTargets,
  addEvaluators,
  getEvaluators,
  removeEvaluator,
  autoPopulateEvaluators,
  generateAssignments,
  getAssignments,
  overrideAssignment,
  getCoverageDashboard,
  detectGaps,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getMyAssignments,
  startEvaluationForAssignment,
  getPeerSuggestions,
  refreshPeerSuggestions,
} = require("../controllers/cohortController");

// All routes require authentication
router.use(authenticate);

// ==========================================================
// EVALUATOR VIEW — No admin required (before :cohortId params)
// ==========================================================

// GET /my-assignments — Get my active cohort assignments
router.get("/my-assignments", getMyAssignments);

// POST /assignments/:assignmentId/start — Start evaluation for a cohort assignment
router.post("/assignments/:assignmentId/start", startEvaluationForAssignment);

// GET /peer-suggestions — Get smart peer suggestions for current student
router.get("/peer-suggestions", getPeerSuggestions);

// ==========================================================
// ADMIN: PEER SUGGESTION MANAGEMENT
// ==========================================================

// POST /peer-suggestions/refresh — Refresh all suggestion caches (admin)
router.post(
  "/peer-suggestions/refresh",
  authorize("admin"),
  refreshPeerSuggestions,
);

// ==========================================================
// ADMIN: COHORT CRUD
// ==========================================================

// POST / — Create a new evaluation cohort
router.post("/", authorize("admin"), createCohort);

// GET / — List all cohorts (with optional status/type filters)
router.get("/", authorize("admin"), listCohorts);

// GET /:cohortId — Get cohort detail with summary counts
router.get("/:cohortId", authorize("admin"), getCohort);

// PUT /:cohortId — Update a draft/scheduled cohort
router.put("/:cohortId", authorize("admin"), updateCohort);

// POST /:cohortId/auto-setup — Auto-fill targets + evaluators + assignments
router.post("/:cohortId/auto-setup", authorize("admin"), autoSetupCohort);

// POST /:cohortId/activate — Activate cohort (draft → active)
router.post("/:cohortId/activate", authorize("admin"), activateCohort);

// POST /:cohortId/complete — Complete cohort (active → completed)
router.post("/:cohortId/complete", authorize("admin"), completeCohort);

// ==========================================================
// ADMIN: TARGET MANAGEMENT
// ==========================================================

// POST /:cohortId/targets — Add specific targets to cohort
router.post("/:cohortId/targets", authorize("admin"), addTargets);

// GET /:cohortId/targets — List targets with coverage info
router.get("/:cohortId/targets", authorize("admin"), getTargets);

// DELETE /:cohortId/targets/:targetId — Remove a target
router.delete("/:cohortId/targets/:targetId", authorize("admin"), removeTarget);

// POST /:cohortId/targets/auto — Auto-populate targets from rules
router.post("/:cohortId/targets/auto", authorize("admin"), autoPopulateTargets);

// ==========================================================
// ADMIN: EVALUATOR MANAGEMENT
// ==========================================================

// POST /:cohortId/evaluators — Add evaluators to cohort
router.post("/:cohortId/evaluators", authorize("admin"), addEvaluators);

// GET /:cohortId/evaluators — List evaluators with workload
router.get("/:cohortId/evaluators", authorize("admin"), getEvaluators);

// DELETE /:cohortId/evaluators/:evaluatorId — Remove evaluator
router.delete(
  "/:cohortId/evaluators/:evaluatorId",
  authorize("admin"),
  removeEvaluator,
);

// POST /:cohortId/evaluators/auto — Auto-populate evaluators from rules
router.post(
  "/:cohortId/evaluators/auto",
  authorize("admin"),
  autoPopulateEvaluators,
);

// ==========================================================
// ADMIN: ASSIGNMENT ENGINE
// ==========================================================

// POST /:cohortId/assignments/generate — Generate fair assignments
router.post(
  "/:cohortId/assignments/generate",
  authorize("admin"),
  generateAssignments,
);

// GET /:cohortId/assignments — List all assignments
router.get("/:cohortId/assignments", authorize("admin"), getAssignments);

// PUT /:cohortId/assignments/:assignmentId/override — Override an assignment
router.put(
  "/:cohortId/assignments/:assignmentId/override",
  authorize("admin"),
  overrideAssignment,
);

// ==========================================================
// ADMIN: COVERAGE & ALERTS
// ==========================================================

// GET /:cohortId/coverage — Coverage dashboard data
router.get("/:cohortId/coverage", authorize("admin"), getCoverageDashboard);

// POST /:cohortId/alerts/detect — Detect gaps and create alerts
router.post("/:cohortId/alerts/detect", authorize("admin"), detectGaps);

// GET /:cohortId/alerts — List alerts (add ?all=true for resolved)
router.get("/:cohortId/alerts", authorize("admin"), getAlerts);

// ==========================================================
// ADMIN: ALERT MANAGEMENT (alert-level routes)
// ==========================================================

// PUT /alerts/:alertId/acknowledge — Acknowledge an alert
router.put(
  "/alerts/:alertId/acknowledge",
  authorize("admin"),
  acknowledgeAlert,
);

// PUT /alerts/:alertId/resolve — Resolve an alert
router.put("/alerts/:alertId/resolve", authorize("admin"), resolveAlert);

module.exports = router;
