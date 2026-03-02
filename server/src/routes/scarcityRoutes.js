// ============================================================
// SCARCITY ROUTES — HTTP Route Definitions for Scarcity API
// ============================================================
// Defines the Express route handlers for the scarcity evaluation
// system. All routes are protected by the authenticate middleware.
//
// ROUTES — ALLOCATION (Step 3):
//   GET  /api/scarcity/sessions/my                              → Get evaluator's sessions
//   GET  /api/scarcity/sessions/:sessionId                      → Get session (isolated view)
//   POST /api/scarcity/sessions/:sessionId/configure            → Configure scarcity pool
//   POST /api/scarcity/sessions/:sessionId/allocate             → Submit allocations
//   GET  /api/scarcity/sessions/:sessionId/pool                 → Get pool status
//
// ROUTES — AGGREGATION RESULTS (Step 4):
//   GET  /api/scarcity/sessions/:sessionId/results              → Session-level aggregated results
//   GET  /api/scarcity/sessions/:sessionId/results/:targetId    → Single-target detailed results
//   POST /api/scarcity/sessions/:sessionId/recalculate          → Admin: force re-aggregation
//
// ROUTES — SESSION GOVERNANCE (Step 4 — Governance Layer):
//   GET  /api/scarcity/sessions/:sessionId/status               → Session status + readiness
//   POST /api/scarcity/sessions/:sessionId/finalize             → Finalize session (admin)
//   POST /api/scarcity/sessions/:sessionId/aggregate            → Aggregate locked session (admin)
//   GET  /api/scarcity/sessions/:sessionId/governance-results   → Governance-aware results
//   GET  /api/scarcity/admin/sessions/ready                     → List ready-to-finalize (admin)
//
// ROUTES — CREDIBILITY ENGINE (Step 5):
//   POST /api/scarcity/sessions/:sessionId/credibility/process  → Process session credibility (admin)
//   GET  /api/scarcity/sessions/:sessionId/credibility/weighted → Weighted aggregation results
//   GET  /api/scarcity/credibility/profiles                     → List all profiles (admin)
//   GET  /api/scarcity/credibility/profiles/:evaluatorId        → Get evaluator profile (admin)
//
// ROUTES — CREDIBILITY DASHBOARD (Step 5 — Part 5):
//   GET  /api/scarcity/credibility/dashboard/overview           → System overview (admin)
//   GET  /api/scarcity/credibility/dashboard/evaluators         → Evaluator list (admin)
//   GET  /api/scarcity/credibility/dashboard/evaluators/:id     → Evaluator deep dive (admin)
//   GET  /api/scarcity/credibility/dashboard/anomalies          → Anomaly alerts (admin)
//   POST /api/scarcity/credibility/dashboard/anomalies/:id/resolve → Resolve anomaly (admin)
//   GET  /api/scarcity/credibility/dashboard/trends             → System trends (admin)
//   GET  /api/scarcity/credibility/dashboard/recent-changes     → Recent changes feed (admin)
//   GET  /api/scarcity/credibility/dashboard/stream             → SSE real-time stream
//   POST /api/scarcity/credibility/dashboard/export             → Export dashboard data (admin)
//   GET  /api/scarcity/credibility/my-dashboard                 → Personal dashboard (faculty)
//   GET  /api/scarcity/credibility/my-trends                    → Personal trends (faculty)
//   GET  /api/scarcity/credibility/peer-comparison              → Peer comparison (faculty)
//   GET  /api/scarcity/credibility/recommendations              → Recommendations (faculty)
//   GET  /api/scarcity/credibility/my-evaluations               → Evaluation impact (faculty)
//   POST /api/scarcity/credibility/goals                        → Set improvement goal (faculty)
//   GET  /api/scarcity/credibility/my-goal                      → Get active goal (faculty)
//   POST /api/scarcity/credibility/recalculate                  → Batch recalculate (admin)
//   POST /api/scarcity/credibility/queue/process                → Process queue (admin)
//   GET  /api/scarcity/credibility/config                       → Get engine config (admin)
//   PUT  /api/scarcity/credibility/config/:key                  → Update config (admin)
//
// Mount: app.use("/api/scarcity", scarcityRoutes)
//
// NOTE: The /my route is defined BEFORE /:sessionId to prevent
// Express from treating "my" as a sessionId parameter.
// ============================================================

// Import Express Router for route definition
const express = require("express");

// Create a new router instance for scarcity routes
const router = express.Router();

// Import the authentication middleware
// Verifies JWT and sets req.user = { userId, email, role, tokenId }
// authorize() = role-based access factory (e.g. authorize('admin'))
const { authenticate, authorize } = require("../middleware/auth");

// Import the scarcity validation middleware
// Validates request body structure before reaching controller
const {
  validateCreateSession,
  validateSubmitAllocations,
} = require("../middleware/scarcityValidation");

// Import the allocation controller methods (Step 3)
const {
  configureSession, // Handler for POST /:sessionId/configure
  getSession, // Handler for GET /:sessionId
  submitAllocations, // Handler for POST /:sessionId/allocate
  getPoolStatus, // Handler for GET /:sessionId/pool
  getMySessions, // Handler for GET /sessions/my
  createNewSession, // Handler for POST /sessions/create
  getMyResults, // Handler for GET /sessions/my-results
} = require("../controllers/scarcityController");

// Import the results controller methods (Step 4 — Aggregation)
const {
  getSessionResults, // Handler for GET /:sessionId/results
  getTargetResults, // Handler for GET /:sessionId/results/:targetId
  recalculateAggregation, // Handler for POST /:sessionId/recalculate
} = require("../controllers/resultsController");

// Import the session governance controller (Step 4 — Governance Layer)
const {
  getSessionStatus, // Handler for GET /:sessionId/status
  finalizeSession, // Handler for POST /:sessionId/finalize
  aggregateSession, // Handler for POST /:sessionId/aggregate
  getGovernanceResults, // Handler for GET /:sessionId/governance-results
  getReadySessions, // Handler for GET /admin/sessions/ready
} = require("../controllers/sessionController");

// Import the credibility controller (Step 5 — Credibility Engine)
const {
  processSessionCredibility, // Handler for POST /:sessionId/credibility/process
  getWeightedResults, // Handler for GET /:sessionId/credibility/weighted
  getCredibilityProfiles, // Handler for GET /credibility/profiles
  getEvaluatorProfile, // Handler for GET /credibility/profiles/:evaluatorId
  batchRecalculate, // Handler for POST /credibility/recalculate
  processQueue, // Handler for POST /credibility/queue/process
  getCredibilityConfig, // Handler for GET /credibility/config
  updateCredibilityConfig, // Handler for PUT /credibility/config/:key
} = require("../controllers/credibilityController");

// Import the weighted results controller (Step 5 — Enriched Multi-Judge Results)
const {
  getWeightedSessionResults, // Handler for GET /:sessionId/weighted-results
} = require("../controllers/weightedResultsController");

// Import the credibility bands controller (Step 5 — SRS-Compliant Bands)
const {
  getCredibilityBands, // Handler for GET /credibility/bands
  recalculateAll, // Handler for POST /credibility/recalculate
} = require("../controllers/credibilityDashboardController");

// Import the evaluator status controller (SRS §4.2 — Multi-Judge Status)
const {
  getMySessionStatus, // Handler for GET /:sessionId/evaluator-status
  getDetailedSessionStatus, // Handler for GET /:sessionId/evaluator-status/detailed
  submitEvaluation, // Handler for POST /:sessionId/submit
  getMySessionsWithStatus, // Handler for GET /evaluator/my-sessions
  assignEvaluatorToSession, // Handler for POST /:sessionId/assign
  getMultiJudgeInfo, // Handler for GET /:sessionId/multi-judge-info
} = require("../controllers/evaluatorStatusController");

// ============================================================
// ROUTE DEFINITIONS
// All routes require authentication (JWT via authenticate middleware)
// ============================================================

// GET /api/scarcity/sessions/my
// Protected — requires valid JWT token
// Returns all evaluation sessions assigned to the requesting evaluator
// MUST be defined BEFORE /:sessionId to avoid "my" being treated as UUID
router.get("/sessions/my", authenticate, getMySessions);

// GET /api/scarcity/sessions/my-results
// Protected — requires valid JWT token
// Returns the student's own scores from all completed sessions
// MUST be defined BEFORE /:sessionId to avoid "my-results" being treated as UUID
router.get("/sessions/my-results", authenticate, getMyResults);

// ============================================================
// EVALUATOR STATUS ROUTES (SRS §4.2 — Multi-Judge Status)
// These endpoints track evaluator submission status WITHOUT exposing scores
// CRITICAL: submission_status only — never allocation data
// ============================================================

// GET /api/scarcity/evaluator/my-sessions
// Protected — requires valid JWT token
// Returns all sessions for current evaluator with submission status
// Used for faculty dashboard multi-judge indicators
// MUST be defined BEFORE /:sessionId routes
router.get("/evaluator/my-sessions", authenticate, getMySessionsWithStatus);

// POST /api/scarcity/sessions/create
// Protected — requires valid JWT token (faculty/admin)
// Creates a new evaluation session with scarcity configuration
router.post("/sessions/create", authenticate, createNewSession);

// GET /api/scarcity/sessions/:sessionId
// Protected — requires valid JWT token
// Returns the session with evaluator-scoped allocations (SRS 4.2.1 isolation)
// Query: ?evaluatorId=<UUID>
router.get("/sessions/:sessionId", authenticate, getSession);

// POST /api/scarcity/sessions/:sessionId/configure
// Protected — requires valid JWT token
// Configures scarcity pool size and mode on an existing session
// Body: { mode, poolConfig, evaluatorIds }
// Validation middleware checks body structure before controller
router.post(
  "/sessions/:sessionId/configure",
  authenticate,
  validateCreateSession,
  configureSession,
);

// POST /api/scarcity/sessions/:sessionId/allocate
// Protected — requires valid JWT token
// Submits point allocations for an evaluator in a session
// Body: { evaluatorId, allocations: [{ targetId, points, headId? }] }
// Validation middleware checks body structure before controller
router.post(
  "/sessions/:sessionId/allocate",
  authenticate,
  validateSubmitAllocations,
  submitAllocations,
);

// GET /api/scarcity/sessions/:sessionId/pool
// Protected — requires valid JWT token
// Returns the current pool usage for an evaluator
// Query: ?evaluatorId=<UUID>
router.get("/sessions/:sessionId/pool", authenticate, getPoolStatus);

// ============================================================
// EVALUATOR STATUS ROUTES (SRS §4.2 — Multi-Judge Status)
// Session-specific evaluator submission tracking
// CRITICAL: submission_status only — never allocation data
// ============================================================

// GET /api/scarcity/sessions/:sessionId/evaluator-status
// Protected — requires valid JWT token
// Returns current evaluator's submission status and multi-judge counts
// Used in evaluation header — shows "You are 1 of X evaluators"
router.get(
  "/sessions/:sessionId/evaluator-status",
  authenticate,
  getMySessionStatus,
);

// GET /api/scarcity/sessions/:sessionId/evaluator-status/detailed
// Protected — requires valid JWT + admin role
// Returns detailed evaluator status WITH names (admin view)
// Used in session management dashboard
router.get(
  "/sessions/:sessionId/evaluator-status/detailed",
  authenticate,
  authorize("admin"),
  getDetailedSessionStatus,
);

// POST /api/scarcity/sessions/:sessionId/submit
// Protected — requires valid JWT token
// Marks evaluator's evaluation as submitted (irreversible)
// Sets has_submitted=true, submitted_at=NOW()
router.post("/sessions/:sessionId/submit", authenticate, submitEvaluation);

// POST /api/scarcity/sessions/:sessionId/assign
// Protected — requires valid JWT + admin role
// Assigns an evaluator to a session
// Body: { evaluatorId: UUID }
router.post(
  "/sessions/:sessionId/assign",
  authenticate,
  authorize("admin"),
  assignEvaluatorToSession,
);

// GET /api/scarcity/sessions/:sessionId/multi-judge-info
// Protected — requires valid JWT token
// Quick check if session is multi-judge (returns counts only)
router.get(
  "/sessions/:sessionId/multi-judge-info",
  authenticate,
  getMultiJudgeInfo,
);

// ============================================================
// AGGREGATION RESULT ROUTES (Step 4)
// These endpoints serve computed statistical results.
// Results are READ-ONLY — only available for closed/locked sessions.
// ============================================================

// GET /api/scarcity/sessions/:sessionId/results
// Protected — requires valid JWT token
// Returns aggregated mean/variance/consensus per target for the session
// Query: ?includeRaw=true to include per-evaluator raw allocations
router.get("/sessions/:sessionId/results", authenticate, getSessionResults);

// GET /api/scarcity/sessions/:sessionId/results/:targetId
// Protected — requires valid JWT token
// Returns detailed statistics + raw allocations for a single target
router.get(
  "/sessions/:sessionId/results/:targetId",
  authenticate,
  getTargetResults,
);

// POST /api/scarcity/sessions/:sessionId/recalculate
// Protected — requires valid JWT + admin role
// Forces a fresh re-aggregation, clearing all cached results
router.post(
  "/sessions/:sessionId/recalculate",
  authenticate,
  authorize("admin"),
  recalculateAggregation,
);

// ============================================================
// SESSION GOVERNANCE ROUTES (Step 4 — Governance Layer)
// These endpoints manage the session lifecycle:
//   open → closed → locked → aggregated
// Finalization and aggregation require admin role.
// ============================================================

// GET /api/scarcity/admin/sessions/ready
// Protected — requires valid JWT + admin role
// Returns all sessions that meet finalization readiness criteria
// MUST be defined BEFORE /:sessionId/status to avoid route collision
router.get(
  "/admin/sessions/ready",
  authenticate,
  authorize("admin"),
  getReadySessions,
);

// GET /api/scarcity/sessions/:sessionId/status
// Protected — requires valid JWT token
// Returns session status, readiness indicators, and available actions
router.get("/sessions/:sessionId/status", authenticate, getSessionStatus);

// POST /api/scarcity/sessions/:sessionId/finalize
// Protected — requires valid JWT + admin or faculty role
// Finalizes an OPEN session: validates, seals, locks
// Body: { force?: boolean, reason?: string }
router.post(
  "/sessions/:sessionId/finalize",
  authenticate,
  authorize("admin", "faculty"),
  finalizeSession,
);

// POST /api/scarcity/sessions/:sessionId/aggregate
// Protected — requires valid JWT + admin or faculty role
// Aggregates a LOCKED session: computes statistics, stores results
router.post(
  "/sessions/:sessionId/aggregate",
  authenticate,
  authorize("admin", "faculty"),
  aggregateSession,
);

// GET /api/scarcity/sessions/:sessionId/governance-results
// Protected — requires valid JWT token
// Returns governance-aware aggregated results (richer than /results)
// Query: ?format=summary|detailed&includeRaw=true
router.get(
  "/sessions/:sessionId/governance-results",
  authenticate,
  getGovernanceResults,
);

// ============================================================
// ENRICHED WEIGHTED RESULTS ROUTE (Step 5 — Multi-Judge UI)
// Returns comprehensive credibility-weighted results with
// evaluator profiles, visualization data, and comparison metrics.
// Used by the WeightedResultsDashboard frontend component.
// ============================================================

// GET /api/scarcity/sessions/:sessionId/weighted-results
// Protected — requires valid JWT token
// Returns enriched weighted results with evaluator analysis
// Query: ?view=summary|detailed|comparison
router.get(
  "/sessions/:sessionId/weighted-results",
  authenticate,
  getWeightedSessionResults,
);

// ============================================================
// CREDIBILITY ENGINE ROUTES (Step 5)
// These endpoints manage the credibility trust layer:
//   process session → profiles → weighted aggregation
// Most credibility routes require admin role.
// ============================================================

// GET /api/scarcity/credibility/profiles
// Protected — requires valid JWT + admin role
// Lists all evaluator credibility profiles
// Query: ?band=HIGH|MEDIUM|LOW&limit=100&offset=0
// MUST be defined BEFORE /credibility/profiles/:evaluatorId
router.get(
  "/credibility/profiles",
  authenticate,
  authorize("admin"),
  getCredibilityProfiles,
);

// GET /api/scarcity/credibility/profiles/:evaluatorId
// Protected — requires valid JWT
// Faculty can only view their own profile; admin can view any
router.get(
  "/credibility/profiles/:evaluatorId",
  authenticate,
  getEvaluatorProfile,
);

// POST /api/scarcity/credibility/recalculate
// Protected — requires valid JWT + admin role
// Batch recalculates all credibility profiles from historical data
// WARNING: expensive operation
router.post(
  "/credibility/recalculate",
  authenticate,
  authorize("admin"),
  batchRecalculate,
);

// POST /api/scarcity/credibility/queue/process
// Protected — requires valid JWT + admin role
// Processes all unprocessed sessions in the credibility queue
router.post(
  "/credibility/queue/process",
  authenticate,
  authorize("admin"),
  processQueue,
);

// GET /api/scarcity/credibility/config
// Protected — requires valid JWT + admin role
// Returns current credibility engine configuration
router.get(
  "/credibility/config",
  authenticate,
  authorize("admin"),
  getCredibilityConfig,
);

// PUT /api/scarcity/credibility/config/:key
// Protected — requires valid JWT + admin role
// Updates a single credibility configuration value
// Body: { value: <object> }
router.put(
  "/credibility/config/:key",
  authenticate,
  authorize("admin"),
  updateCredibilityConfig,
);

// POST /api/scarcity/sessions/:sessionId/credibility/process
// Protected — requires valid JWT + admin role
// Runs the full credibility pipeline for a session
router.post(
  "/sessions/:sessionId/credibility/process",
  authenticate,
  authorize("admin"),
  processSessionCredibility,
);

// GET /api/scarcity/sessions/:sessionId/credibility/weighted
// Protected — requires valid JWT token
// Returns credibility-weighted aggregation results
// Query: ?headId=<UUID>
router.get(
  "/sessions/:sessionId/credibility/weighted",
  authenticate,
  getWeightedResults,
);

// ============================================================
// CREDIBILITY BAND ROUTES (Step 5 — SRS-Compliant)
// SRS 5.3: Statistical dilution only, no monitoring
// SRS 7.2: Bands only, no raw scores
// ============================================================

// GET /api/scarcity/credibility/bands
// Returns band distribution (HIGH/MEDIUM/LOW counts) — admin only
router.get(
  "/credibility/bands",
  authenticate,
  authorize("admin"),
  getCredibilityBands,
);

// POST /api/scarcity/credibility/recalculate
// Admin-triggered full recalculation
router.post(
  "/credibility/recalculate",
  authenticate,
  authorize("admin"),
  recalculateAll,
);

// ============================================================
// HISTORICAL SCORES ROUTES (SRS §4.1.2 — Monthly Review History)
// ============================================================
// These endpoints provide previous month scores for growth-aware
// evaluation. Judges see historical context to assess improvement.
//
// NEW ENDPOINTS:
//   GET  /sessions/:id/projects-with-history  — Projects with previous scores
//   GET  /sessions/:id/history-summary        — Session historical summary
//   GET  /members/:id/history                 — Full member history trend
// ============================================================

// Import the HistoricalScoreService for previous month scores
// SRS §4.1.2: "Judges shall see: Last month's score (per member)"
const HistoricalScoreService = require("../services/scarcity/HistoricalScoreService");

// GET /api/scarcity/sessions/:sessionId/projects-with-history
// Protected — requires valid JWT token
// Returns all projects in a session WITH previous month scores
// This is the PRIMARY endpoint for growth-aware evaluation
// SRS §4.1.2: Display historical context for each member
router.get(
  "/sessions/:sessionId/projects-with-history",
  authenticate,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const evaluatorId = req.user.userId || req.user.personId;

      // Step 1: Get the current session data (existing endpoint logic)
      const sessionQuery = `
      SELECT 
        es.session_id,
        es.session_type,
        es.intent,
        es.status,
        es.scarcity_pool_size,
        es.evaluation_mode,
        es.frozen_entities,
        es.evaluation_window_start,
        es.evaluation_window_end,
        am.month_name,
        am.month_index,
        am.semester,
        am.academic_year
      FROM evaluation_sessions es
      JOIN academic_months am ON es.period_id = am.period_id
      WHERE es.session_id = $1
    `;

      const { query } = require("../config/database");
      const sessionResult = await query(sessionQuery, [sessionId]);

      if (!sessionResult.rows[0]) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "Evaluation session not found",
        });
      }

      const session = sessionResult.rows[0];

      // Step 2: Get targets (members/projects) for this session
      // Parse frozen_entities to get project UUIDs
      const frozenEntities = session.frozen_entities || [];

      // Step 3: Get project details with members
      let targets = [];
      if (frozenEntities.length > 0) {
        // Get projects and their members
        const projectsQuery = `
        SELECT 
          p.project_id,
          p.title as project_title,
          p.description as project_description,
          json_agg(
            json_build_object(
              'id', per.person_id,
              'name', per.display_name,
              'photo_url', per.photo_url,
              'role', pm.role_in_project
            )
          ) as members
        FROM projects p
        JOIN project_members pm ON p.project_id = pm.project_id
        JOIN persons per ON pm.person_id = per.person_id
        WHERE p.project_id = ANY($1::uuid[])
        GROUP BY p.project_id
      `;

        const projectsResult = await query(projectsQuery, [frozenEntities]);
        targets = projectsResult.rows;
      }

      // Step 4: Get historical scores for this session
      // SRS §4.1.2: Previous month scores with credibility weighting
      const historicalData =
        await HistoricalScoreService.getPreviousScoresForSession(
          sessionId,
          evaluatorId,
        );

      // Step 5: Enhance each member with historical data
      const enhancedTargets = targets.map((project) => {
        // Add historical data to each member
        const enhancedMembers = (project.members || []).map((member) => {
          const previousData = historicalData.scores?.[member.id];

          if (previousData) {
            return {
              ...member,
              // Previous month score data
              previous_score: previousData.score,
              previous_total: previousData.totalPool,
              previous_percentage: previousData.percentage,
              previous_evaluator_count: previousData.evaluatorCount,
              previous_session_id: historicalData.previousSessionId,
              previous_session_month: historicalData.previousPeriod?.monthName,
              has_history: true,
            };
          } else {
            return {
              ...member,
              has_history: false,
              previous_score: null,
            };
          }
        });

        return {
          id: project.project_id,
          title: project.project_title,
          description: project.project_description,
          members: enhancedMembers,
        };
      });

      // Return enriched response
      res.json({
        success: true,
        session: {
          id: session.session_id,
          type: session.session_type,
          intent: session.intent,
          status: session.status,
          poolSize: parseFloat(session.scarcity_pool_size) || 15,
          mode: session.evaluation_mode,
          period: {
            monthName: session.month_name,
            monthIndex: session.month_index,
            semester: session.semester,
            academicYear: session.academic_year,
          },
          window: {
            start: session.evaluation_window_start,
            end: session.evaluation_window_end,
          },
        },
        hasPreviousSession: historicalData.hasPrevious,
        previousSessionMonth: historicalData.previousPeriod?.monthName || null,
        projects: enhancedTargets,
      });
    } catch (error) {
      console.error("Error fetching projects with history:", error);
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to fetch projects with historical data",
      });
    }
  },
);

// GET /api/scarcity/sessions/:sessionId/history-summary
// Protected — requires valid JWT token
// Returns summary of historical data for session banner
// SRS §4.1.2: Session-level historical context
router.get(
  "/sessions/:sessionId/history-summary",
  authenticate,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Get session history summary
      const summary =
        await HistoricalScoreService.getSessionHistorySummary(sessionId);

      res.json({
        success: true,
        ...summary,
      });
    } catch (error) {
      console.error("Error fetching session history summary:", error);
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to fetch session history summary",
      });
    }
  },
);

// GET /api/scarcity/members/:memberId/history
// Protected — requires valid JWT token
// Returns complete historical trend for a member
// SRS §6.1: Trajectory Analysis
// Query: ?sessionType=project_review&limit=12
router.get("/members/:memberId/history", authenticate, async (req, res) => {
  try {
    const { memberId } = req.params;
    const { sessionType = "project_review", limit = 12 } = req.query;

    // Authorization: Only faculty/admin or the member themselves
    const requestingUser = req.user;
    const isAdmin = requestingUser.role === "admin";
    const isFaculty = requestingUser.role === "faculty";
    const isSelf =
      requestingUser.userId === memberId ||
      requestingUser.personId === memberId;

    if (!isAdmin && !isFaculty && !isSelf) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "You can only view your own history or must be faculty/admin",
      });
    }

    // Get historical trend
    const history = await HistoricalScoreService.getMemberHistoricalTrend(
      memberId,
      sessionType,
      parseInt(limit),
    );

    // Get member details
    const { query } = require("../config/database");
    const memberQuery = `
      SELECT person_id, name, email, photo_url
      FROM persons
      WHERE person_id = $1
    `;
    const memberResult = await query(memberQuery, [memberId]);
    const member = memberResult.rows[0];

    // Calculate trend summary
    const trendSummary =
      history.length >= 2
        ? {
            firstScore: history[history.length - 1]?.score,
            latestScore: history[0]?.score,
            overallChange:
              history[0]?.score - history[history.length - 1]?.score,
            overallPercentage:
              history[history.length - 1]?.score > 0
                ? Math.round(
                    ((history[0]?.score - history[history.length - 1]?.score) /
                      history[history.length - 1]?.score) *
                      100,
                  )
                : 0,
          }
        : null;

    res.json({
      success: true,
      member,
      history,
      totalSessions: history.length,
      trend: trendSummary,
    });
  } catch (error) {
    console.error("Error fetching member history:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch member historical trend",
    });
  }
});

// ============================================================
// SESSION COMPLETION ROUTES (SRS §4.2 — Coordinator View)
// Track overall session completion across all evaluators
// ============================================================

const SessionCompletionService = require("../services/scarcity/SessionCompletionService");

// GET /api/scarcity/sessions/:sessionId/completion
// Protected — requires valid JWT + admin/faculty role
// Returns detailed completion status for a session
// Used by coordinator dashboard to track evaluator submissions
router.get(
  "/sessions/:sessionId/completion",
  authenticate,
  authorize("admin", "faculty"),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const status =
        await SessionCompletionService.getSessionCompletionStatus(sessionId);
      res.json({ success: true, data: status });
    } catch (error) {
      console.error("Error getting session completion:", error);
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to fetch session completion status",
      });
    }
  },
);

// GET /api/scarcity/sessions/completion/summary
// Protected — requires valid JWT + admin role
// Returns completion summary for all active sessions
// Used by admin dashboard overview widget
// NOTE: Defined BEFORE /:sessionId to avoid "completion" being treated as UUID
router.get(
  "/completion/summary",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const summary =
        await SessionCompletionService.getAllSessionsCompletionSummary(limit);
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error("Error getting sessions completion summary:", error);
      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to fetch sessions completion summary",
      });
    }
  },
);

// ============================================================
// Export the router for mounting in app.js
// Mount point: app.use("/api/scarcity", scarcityRoutes)
// ============================================================
module.exports = router;
