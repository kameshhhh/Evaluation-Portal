// ============================================================
// ZERO SCORE REASON ROUTES — HTTP Routes for Zero-Score Capture
// ============================================================
// SRS §4.1.5 — Zero-Score Reason Capture
// SRS §5.3 — Anti-Collusion Behavior Detection
//
// ROUTES:
//   POST /api/zero-score/reasons                          → Record batch reasons from dialog
//   GET  /api/zero-score/classifications                  → Get classification labels
//   GET  /api/zero-score/suggest/:evaluatorId             → Suggest default classification
//   GET  /api/zero-score/session/:sessionId               → Get reasons for a session
//   GET  /api/zero-score/evaluator/:evaluatorId/patterns  → Evaluator patterns
//   GET  /api/zero-score/target/:targetId/patterns        → Target patterns
//   GET  /api/zero-score/analytics                        → Admin aggregate analytics
//   GET  /api/zero-score/analytics/enhanced               → Enhanced analytics with anomalies
//   GET  /api/zero-score/anomalies                        → Anomaly detection
//   GET  /api/zero-score/collusion                        → Collusion pattern detection
//   GET  /api/zero-score/export                           → Export data (CSV/JSON)
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  recordReasons,
  getSessionReasons,
  getEvaluatorPatterns,
  getTargetPatterns,
  getAggregateAnalytics,
  getClassifications,
  suggestDefault,
  getEnhancedAnalytics,
  getAnomalies,
  getCollusionPatterns,
  exportData,
} = require("../controllers/zeroScoreController");

// All routes require authentication
router.use(authenticate);

// ----------------------------------------------------------
// Student/Faculty endpoints
// ----------------------------------------------------------

// POST /reasons — Record batch zero-score reasons at submit time
router.post("/reasons", recordReasons);

// GET /classifications — Get the three classification labels + descriptions
router.get("/classifications", getClassifications);

// GET /suggest/:evaluatorId — Suggest a default classification
router.get("/suggest/:evaluatorId", suggestDefault);

// GET /session/:sessionId — Get all reasons for a session
router.get("/session/:sessionId", getSessionReasons);

// ----------------------------------------------------------
// Admin-only endpoints
// ----------------------------------------------------------

// GET /evaluator/:evaluatorId/patterns — Evaluator's zero-score patterns
router.get(
  "/evaluator/:evaluatorId/patterns",
  authorize("admin"),
  getEvaluatorPatterns,
);

// GET /target/:targetId/patterns — Target's zero-score patterns
router.get("/target/:targetId/patterns", authorize("admin"), getTargetPatterns);

// GET /analytics — System-wide aggregate analytics (admin)
router.get("/analytics", authorize("admin"), getAggregateAnalytics);

// GET /analytics/enhanced — Enhanced analytics with anomalies and collusion
// Query params: startDate, endDate, evaluationType, groupId
router.get("/analytics/enhanced", authorize("admin"), getEnhancedAnalytics);

// GET /anomalies — Anomaly detection (lazy/harsh evaluators)
router.get("/anomalies", authorize("admin"), getAnomalies);

// GET /collusion — Collusion pattern detection (SRS §5.3)
// Query params: startDate, endDate, evaluationType, groupId
router.get("/collusion", authorize("admin"), getCollusionPatterns);

// GET /export — Export data for external analysis (CSV/JSON)
// Query params: startDate, endDate, evaluationType, groupId, format (csv|json)
router.get("/export", authorize("admin"), exportData);

module.exports = router;
