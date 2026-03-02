// ============================================================
// FACULTY EVALUATION ROUTES
// ============================================================
// SRS §4.4 — Faculty Evaluation Module
// Mounts at /api/faculty-evaluation
// All routes require authentication.
// Admin routes require authorize('admin', 'faculty').
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getActiveSessions,
  getSessionFaculty,
  saveDraft,
  submitAllocations,
  getSessionResults,
  createSession,
  getAllSessions,
  updateSession,
} = require("../controllers/facultyEvaluationController");

// ── Student Routes ─────────────────────────────────────────
// All require authentication AND student role
// Per SRS §4.4: "Student evaluates multiple faculty members"
// Faculty should NOT access these routes (they are the subjects, not evaluators)

// List active sessions the student can participate in
router.get("/sessions", authenticate, authorize("student"), getActiveSessions);

// Get eligible faculty + budget + existing allocations for a session
router.get(
  "/sessions/:sessionId/faculty",
  authenticate,
  authorize("student"),
  getSessionFaculty,
);

// Auto-save draft tier assignments
router.post(
  "/sessions/:sessionId/save-draft",
  authenticate,
  authorize("student"),
  saveDraft,
);

// Submit final evaluation (irreversible)
router.post(
  "/sessions/:sessionId/submit",
  authenticate,
  authorize("student"),
  submitAllocations,
);

// View aggregated results (banded, per SRS §7.2)
router.get("/sessions/:sessionId/results", authenticate, getSessionResults);

// ── Admin / Faculty Routes ─────────────────────────────────

// Create a new faculty evaluation session
router.post(
  "/admin/sessions",
  authenticate,
  authorize("admin", "faculty"),
  createSession,
);

// List all sessions with submission counts
router.get(
  "/admin/sessions",
  authenticate,
  authorize("admin", "faculty"),
  getAllSessions,
);

// Update session (status, title, dates)
router.put(
  "/admin/sessions/:sessionId",
  authenticate,
  authorize("admin", "faculty"),
  updateSession,
);

// ── Analytics & Normalization Routes (SRS §4.4.3) ──────────
const {
  getNormalizationWeights,
  updateNormalizationWeights,
  getNormalizationExplanation,
  getFacultyTrend,
  getNormalizedResults,
  getDepartmentRankings,
  getResponseRate,
  getSessionOverview,
  exportSessionData,
  assignFaculty,
  getAssignments,
  recalculateScores,
  validateAllocation,
  getScarcityEducation,
  simulateWhatIf,
  saveWhatIfScenario,
  getWhatIfScenarios,
  deleteWhatIfScenario,
  getWeightHistory,
  getAuditHistory,
  getDeptBenchmarks,
  getEnhancedExplanation,
} = require("../controllers/facultyEvalAnalyticsController");

// Student: real-time scarcity validation
router.post("/validate-allocation", authenticate, validateAllocation);

// Student/faculty: scarcity education content
router.get("/scarcity-education", authenticate, getScarcityEducation);

// Faculty: own performance trend
router.get(
  "/faculty/trend",
  authenticate,
  authorize("faculty", "admin"),
  getFacultyTrend,
);

// Faculty: normalization explanation for own score
router.get(
  "/sessions/:sessionId/normalization/:facultyId",
  authenticate,
  getNormalizationExplanation,
);

// Admin: normalized results for a session
router.get(
  "/sessions/:sessionId/normalized-results",
  authenticate,
  authorize("admin", "faculty"),
  getNormalizedResults,
);

// Admin: session overview stats
router.get(
  "/sessions/:sessionId/overview",
  authenticate,
  authorize("admin", "faculty"),
  getSessionOverview,
);

// Admin: department rankings
router.get(
  "/sessions/:sessionId/department-rankings",
  authenticate,
  authorize("admin"),
  getDepartmentRankings,
);

// Admin: response rate analysis
router.get(
  "/sessions/:sessionId/response-rate",
  authenticate,
  authorize("admin"),
  getResponseRate,
);

// Admin: export session data
router.get(
  "/sessions/:sessionId/export",
  authenticate,
  authorize("admin"),
  exportSessionData,
);

// Admin: normalization weights
router.get(
  "/admin/normalization/weights",
  authenticate,
  authorize("admin"),
  getNormalizationWeights,
);

router.post(
  "/admin/normalization/weights",
  authenticate,
  authorize("admin"),
  updateNormalizationWeights,
);

// Admin: faculty assignments (exposure data)
router.post(
  "/admin/sessions/:sessionId/assign",
  authenticate,
  authorize("admin", "faculty"),
  assignFaculty,
);

router.get(
  "/admin/sessions/:sessionId/assignments",
  authenticate,
  authorize("admin", "faculty"),
  getAssignments,
);

// Admin: trigger score recalculation
router.post(
  "/admin/sessions/:sessionId/recalculate",
  authenticate,
  authorize("admin"),
  recalculateScores,
);

// Admin: faculty trend (for any faculty)
router.get(
  "/admin/faculty/:facultyId/trend",
  authenticate,
  authorize("admin"),
  getFacultyTrend,
);

// ── What-If Simulation Routes (B-02, SRS §4.4.3) ──────────

// Simulate custom weights (faculty/admin)
router.post("/what-if/simulate", authenticate, simulateWhatIf);

// Save a what-if scenario
router.post("/what-if/save", authenticate, saveWhatIfScenario);

// Get saved scenarios for a faculty member
router.get("/what-if/scenarios/:facultyId", authenticate, getWhatIfScenarios);

// Get own saved scenarios
router.get("/what-if/scenarios", authenticate, (req, res) => {
  req.params.facultyId = req.user.personId;
  getWhatIfScenarios(req, res);
});

// Delete a scenario
router.delete(
  "/what-if/scenarios/:scenarioId",
  authenticate,
  deleteWhatIfScenario,
);

// ── Enhanced Transparency Routes (B-02) ────────────────────

// Enhanced transparency report for a faculty in a session
router.get(
  "/sessions/:sessionId/transparency/:facultyId",
  authenticate,
  getEnhancedExplanation,
);

// Department benchmarks for a session (admin)
router.get(
  "/sessions/:sessionId/benchmarks",
  authenticate,
  authorize("admin", "faculty"),
  getDeptBenchmarks,
);

// Audit history for own calculations
router.get("/normalization/audit", authenticate, (req, res) => {
  req.params.facultyId = req.user.personId;
  getAuditHistory(req, res);
});

// Admin: audit history for any faculty
router.get(
  "/normalization/audit/:facultyId",
  authenticate,
  authorize("admin"),
  getAuditHistory,
);

// Admin: weight configuration history
router.get(
  "/admin/normalization/weight-history",
  authenticate,
  authorize("admin"),
  getWeightHistory,
);

module.exports = router;
