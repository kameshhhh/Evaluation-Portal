// ============================================================
// ANALYTICS ROUTES — HTTP Route Definitions for SRS Analytics API
// ============================================================
// Defines Express route handlers for the SRS analytics features:
//   - Temporal growth tracking (SRS Section 6)
//   - Person vector analytics (SRS Section 7)
//   - Peer ranking with safeguards (SRS 4.5.3)
//   - Faculty exposure normalization (SRS 4.4.3)
//   - Intent-aware evaluation (SRS 6.2)
//
// All routes are protected by the authenticate middleware.
// Admin routes additionally require authorize('admin').
//
// Mount: app.use("/api/analytics", analyticsRoutes)
//
// DOES NOT modify any existing routes.
// ============================================================

"use strict";

const express = require("express");
const router = express.Router();

// Import authentication + authorization middleware
const { authenticate, authorize } = require("../middleware/auth");

// Import all analytics controller handlers
const {
  // Temporal Growth (SRS Section 6)
  getGrowthHistory,
  computeGrowth,
  computeBatchGrowth,
  // Person Vectors (SRS Section 7)
  getPersonVector,
  buildPersonVector,
  batchBuildVectors,
  getVectorHistory,
  snapshotVector,
  // Peer Rankings (SRS 4.5.3)
  createPeerSurvey,
  submitPeerRanking,
  aggregatePeerResults,
  detectPeerGaming,
  getPeerSurveyResults,
  // Faculty Normalization (SRS 4.4.3)
  logFacultyExposure,
  batchNormalizeFaculty,
  getFacultyProfile,
  getExposureWeight,
  // Intent-Aware (SRS 6.2)
  listIntents,
  getIntentConfig,
  classifySessionIntent,
  getIntentReport,
} = require("../controllers/analyticsController");

// Import sparkline controller handlers — SRS §6.1 Trajectory Visualization
const {
  getMemberSparkline,
  getMemberProjectSparkline,
  getBulkSparklines,
  getMemberTrend,
} = require("../controllers/sparklineController");

// Import project trajectory controller handlers — SRS §4.1.2, §6.1 Project Improvement
const {
  getProjectTrajectory,
  getProjectDelta,
  getSessionProjectDeltas,
} = require("../controllers/projectTrajectoryController");

// ============================================================
// TEMPORAL GROWTH ROUTES — SRS Section 6
// ============================================================

// GET /api/analytics/growth/:personId — Growth trajectory for a person
// Returns: { trajectory, summaries, overallTrend }
// Access: Authenticated users (faculty/admin see all, students see own)
router.get("/growth/:personId", authenticate, getGrowthHistory);

// POST /api/analytics/growth/compute — Compute growth between two periods
// Body: { personId, fromPeriod, toPeriod }
// Access: Admin only
router.post("/growth/compute", authenticate, authorize("admin"), computeGrowth);

// POST /api/analytics/growth/batch/:sessionId — Batch growth computation
// Computes growth for all targets in a session
// Access: Admin only
router.post(
  "/growth/batch/:sessionId",
  authenticate,
  authorize("admin"),
  computeBatchGrowth,
);

// ============================================================
// PERSON VECTOR ROUTES — SRS Section 7
// SRS 7.2: "Used for mentoring, NOT labeling"
// ============================================================

// GET /api/analytics/vectors/:personId — Get person's trait vector
// Returns: { communication, leadership, consistency, trustworthiness, growth_potential }
// Access: Faculty/admin (not exposed to students per SRS 7.2)
router.get(
  "/vectors/:personId",
  authenticate,
  authorize("admin", "faculty"),
  getPersonVector,
);

// POST /api/analytics/vectors/:personId/build — Build/rebuild person vector
// Collects all data sources and computes weighted vector
// Access: Admin only
router.post(
  "/vectors/:personId/build",
  authenticate,
  authorize("admin"),
  buildPersonVector,
);

// POST /api/analytics/vectors/batch — Batch build vectors for multiple people
// Body: { personIds: string[] }
// Access: Admin only
router.post(
  "/vectors/batch",
  authenticate,
  authorize("admin"),
  batchBuildVectors,
);

// GET /api/analytics/vectors/:personId/history — Trait trajectory over time
// Returns: { snapshots, traitTrajectories }
// Access: Faculty/admin (trends only, not raw scores — SRS 7.2)
router.get(
  "/vectors/:personId/history",
  authenticate,
  authorize("admin", "faculty"),
  getVectorHistory,
);

// POST /api/analytics/vectors/:personId/snapshot — Take immutable snapshot
// Body: { periodId, sessionId }
// Access: Admin only
router.post(
  "/vectors/:personId/snapshot",
  authenticate,
  authorize("admin"),
  snapshotVector,
);

// ============================================================
// PEER RANKING ROUTES — SRS 4.5.3
// Ethical safeguards are enforced at the service layer
// ============================================================

// POST /api/analytics/peer-rankings/surveys — Create peer survey
// Body: { sessionId, title, questions, participantIds, closesAt }
// Access: Admin only
router.post(
  "/peer-rankings/surveys",
  authenticate,
  authorize("admin"),
  createPeerSurvey,
);

// POST /api/analytics/peer-rankings/surveys/:surveyId/submit — Submit ranking
// Body: { rankings: [{ questionIndex, rankings: [{ personId, rank }] }] }
// Access: Authenticated participants (SRS 4.5.3: no self-ranking enforced)
router.post(
  "/peer-rankings/surveys/:surveyId/submit",
  authenticate,
  submitPeerRanking,
);

// POST /api/analytics/peer-rankings/surveys/:surveyId/aggregate — Compute aggregates
// Access: Admin only — produces anonymized results
router.post(
  "/peer-rankings/surveys/:surveyId/aggregate",
  authenticate,
  authorize("admin"),
  aggregatePeerResults,
);

// POST /api/analytics/peer-rankings/surveys/:surveyId/detect-gaming — Run gaming detection
// Checks for collusion, reciprocity, outlier inflation
// Access: Admin only
router.post(
  "/peer-rankings/surveys/:surveyId/detect-gaming",
  authenticate,
  authorize("admin"),
  detectPeerGaming,
);

// GET /api/analytics/peer-rankings/surveys/:surveyId/results — Anonymized results
// SRS 4.5.3: "Individual rankings NEVER revealed"
// Access: Admin/faculty only
router.get(
  "/peer-rankings/surveys/:surveyId/results",
  authenticate,
  authorize("admin", "faculty"),
  getPeerSurveyResults,
);

// ============================================================
// FACULTY NORMALIZATION ROUTES — SRS 4.4.3
// ============================================================

// POST /api/analytics/faculty/exposure — Log faculty-student interaction
// Body: { facultyId, targetId, sessionId, roleType, contactHours, interactionType }
// Access: Admin only
router.post(
  "/faculty/exposure",
  authenticate,
  authorize("admin"),
  logFacultyExposure,
);

// POST /api/analytics/faculty/normalize/:sessionId — Batch normalize session
// Access: Admin only
router.post(
  "/faculty/normalize/:sessionId",
  authenticate,
  authorize("admin"),
  batchNormalizeFaculty,
);

// GET /api/analytics/faculty/:facultyId/profile — Faculty exposure stats
// Access: Admin only
router.get(
  "/faculty/:facultyId/profile",
  authenticate,
  authorize("admin"),
  getFacultyProfile,
);

// GET /api/analytics/faculty/exposure-weight — Compute exposure weight
// Query: ?facultyId=...&targetId=...
// Access: Admin/faculty
router.get(
  "/faculty/exposure-weight",
  authenticate,
  authorize("admin", "faculty"),
  getExposureWeight,
);

// ============================================================
// INTENT-AWARE EVALUATION ROUTES — SRS 6.2
// ============================================================

// GET /api/analytics/intents — List all intent modes
// Access: Authenticated users
router.get("/intents", authenticate, listIntents);

// GET /api/analytics/intents/:intentCode/config — Get intent weight config
// Access: Authenticated users
router.get("/intents/:intentCode/config", authenticate, getIntentConfig);

// GET /api/analytics/intents/session/:sessionId — Classify session intent
// Access: Authenticated users
router.get("/intents/session/:sessionId", authenticate, classifySessionIntent);

// GET /api/analytics/intents/report/:targetId — Intent-specific evaluation
// Query: ?intentCode=growth&sessionId=...
// Access: Faculty/admin
router.get(
  "/intents/report/:targetId",
  authenticate,
  authorize("admin", "faculty"),
  getIntentReport,
);

// ============================================================
// SPARKLINE ROUTES — SRS §6.1 Trajectory Visualization
// Ultra-lightweight endpoints for performance sparklines
// ============================================================

// GET /api/analytics/sparkline/member/:memberId — Member sparkline
// Returns: { dates, scores, trend, delta, color }
// Access: Faculty/admin (students see only own)
router.get("/sparkline/member/:memberId", authenticate, getMemberSparkline);

// GET /api/analytics/sparkline/member/:memberId/project/:projectId
// Project-specific sparkline for a member
// Access: Faculty/admin (students see only own)
router.get(
  "/sparkline/member/:memberId/project/:projectId",
  authenticate,
  getMemberProjectSparkline,
);

// POST /api/analytics/sparkline/bulk — Bulk sparklines
// CRITICAL: Use this for dashboards to prevent N+1 queries!
// Body: { memberIds: string[] }
// Access: Faculty/admin only
router.post(
  "/sparkline/bulk",
  authenticate,
  authorize("admin", "faculty"),
  getBulkSparklines,
);

// GET /api/analytics/sparkline/member/:memberId/trend — Quick trend only
// Ultra-lightweight - just trend direction and delta
// Access: Faculty/admin (students see only own)
router.get("/sparkline/member/:memberId/trend", authenticate, getMemberTrend);

// ============================================================
// PROJECT TRAJECTORY ROUTES — SRS §4.1.2, §6.1 Team Analytics
// Team-level improvement visualization
// ============================================================

// GET /api/analytics/project/:projectId/trajectory — Team trajectory
// Returns: { trajectory, summary, team_size, months_analyzed }
// Access: Faculty/admin (students see only their own projects)
router.get(
  "/project/:projectId/trajectory",
  authenticate,
  getProjectTrajectory,
);

// GET /api/analytics/project/:projectId/delta — Project improvement badge
// Returns: { delta, delta_percentage, trend, display, improvement_distribution }
// Access: Authenticated users
router.get("/project/:projectId/delta", authenticate, getProjectDelta);

// GET /api/analytics/session/:sessionId/project-deltas — Bulk project deltas
// CRITICAL: Prevents N+1 queries on evaluation page
// Returns: { deltas: { projectId: deltaData } }
// Access: Faculty/admin
router.get(
  "/session/:sessionId/project-deltas",
  authenticate,
  authorize("admin", "faculty"),
  getSessionProjectDeltas,
);

module.exports = router;
