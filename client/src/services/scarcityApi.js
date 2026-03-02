// ============================================================
// SCARCITY API SERVICE — HTTP Client for Scarcity Endpoints
// ============================================================
// Provides all API calls for the Scarcity Enforcement Engine.
// Uses the shared axios instance (api.js) which automatically
// attaches JWT tokens and handles 401 responses.
//
// ENDPOINTS:
//   POST   /scarcity/sessions/:id/configure — Configure session scarcity
//   GET    /scarcity/sessions/my             — List my evaluation sessions
//   GET    /scarcity/sessions/:id            — Get session details
//   POST   /scarcity/sessions/:id/allocate   — Submit point allocations
//   GET    /scarcity/sessions/:id/pool       — Get pool usage status
//
// All functions return the response.data payload directly.
// Errors are formatted by the api.js interceptor as { message, status, code }.
// ============================================================

// Import the shared axios instance — preloaded with JWT auth
import api from "./api";

// ============================================================
// getMyScarcitySessions — List evaluation sessions for current user
// ============================================================
/**
 * Fetch all evaluation sessions assigned to the authenticated evaluator.
 * Used on the dashboard to show pending/completed evaluations.
 *
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Promise<Object>} Response with { success, data: sessions[] }
 */
export const getMyScarcitySessions = async (evaluatorId) => {
  // GET /api/scarcity/sessions/my?evaluatorId=... — returns sessions for current user
  // Backend requires evaluatorId query param for session lookup
  const response = await api.get("/scarcity/sessions/my", {
    params: { evaluatorId },
  });
  return response.data;
};

// ============================================================
// getScarcitySession — Get a single session with evaluator-scoped data
// ============================================================
/**
 * Fetch detailed session information including targets, allocations,
 * and pool status — scoped to the authenticated evaluator.
 *
 * SRS 4.2.1 isolation is enforced on the backend — this will only
 * return the evaluator's own allocations while the session is active.
 *
 * @param {string} sessionId - UUID of the evaluation session
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Promise<Object>} Response with { success, data: sessionData }
 */
export const getScarcitySession = async (sessionId, evaluatorId) => {
  // GET /api/scarcity/sessions/:id?evaluatorId=... — returns session + own allocations
  // Backend requires evaluatorId query param for SRS 4.2.1 isolation
  const response = await api.get(`/scarcity/sessions/${sessionId}`, {
    params: { evaluatorId },
  });
  return response.data;
};

// ============================================================
// submitAllocations — Submit point distributions for a session
// ============================================================
/**
 * Submit or update point allocations for a scarcity evaluation session.
 * This is an atomic operation — all previous allocations for this
 * evaluator in this session are replaced.
 *
 * SRS 4.1.3: System enforces Σ allocations ≤ pool size.
 * Backend will return { success: false, error: "POOL_EXCEEDED" }
 * if the allocation would violate the scarcity constraint.
 *
 * @param {string} sessionId - UUID of the evaluation session
 * @param {string} evaluatorId - UUID of the evaluator (current user)
 * @param {Array<Object>} allocations - Point distributions
 *   Each: { targetId: string, points: number }
 * @returns {Promise<Object>} Response with { success, data, poolInfo }
 */
export const submitAllocations = async (
  sessionId,
  evaluatorId,
  allocations,
  zeroScoreReasons = [],
) => {
  // POST /api/scarcity/sessions/:id/allocate — atomic allocation submission
  const response = await api.post(`/scarcity/sessions/${sessionId}/allocate`, {
    evaluatorId, // Who is submitting
    allocations, // Array of { targetId, points }
    zeroScoreReasons, // Optional evaluator-provided zero-score reasons
  });
  return response.data;
};

// ============================================================
// getPoolStatus — Get current pool usage for evaluator
// ============================================================
/**
 * Fetch the current pool usage status for the evaluator in a session.
 * Returns pool size, allocated total, remaining points, and utilization %.
 *
 * @param {string} sessionId - UUID of the evaluation session
 * @param {string} evaluatorId - UUID of the evaluator
 * @returns {Promise<Object>} Response with { success, data: poolStatus }
 */
export const getPoolStatus = async (sessionId, evaluatorId) => {
  // GET /api/scarcity/sessions/:id/pool?evaluatorId=...
  const response = await api.get(`/scarcity/sessions/${sessionId}/pool`, {
    params: { evaluatorId },
  });
  return response.data;
};

// ============================================================
// configureSessionScarcity — Set up scarcity on an existing session
// ============================================================
/**
 * Configure scarcity parameters on an existing evaluation session.
 * Called by faculty/admin when creating a new scarcity evaluation.
 *
 * @param {string} sessionId - UUID of the evaluation session to configure
 * @param {string} mode - Evaluation mode (project_member/cross_project/faculty/peer)
 * @param {Array<string>} evaluatorIds - Person UUIDs of assigned evaluators
 * @param {Object} [poolConfig={}] - Mode-specific pool configuration
 * @returns {Promise<Object>} Response with { success, data: configuredSession }
 */
export const configureSessionScarcity = async (
  sessionId,
  mode,
  evaluatorIds,
  poolConfig = {},
) => {
  // POST /api/scarcity/sessions/:id/configure — configure scarcity on session
  // Fixed URL: was posting to /scarcity/sessions instead of /:id/configure
  const response = await api.post(`/scarcity/sessions/${sessionId}/configure`, {
    mode, // Evaluation mode
    evaluatorIds, // Who will evaluate
    poolConfig, // Mode-specific settings (teamSize, poolSize, etc.)
  });
  return response.data;
};

// ============================================================
// AGGREGATION RESULTS API (Step 4)
// ============================================================

// ============================================================
// getSessionResults — Fetch aggregated results for a closed session
// ============================================================
/**
 * Fetch the aggregated statistical results for an evaluation session.
 * Results include per-target mean, variance, consensus score, etc.
 *
 * Only available for sessions in 'closed' or 'locked' status.
 * Returns 403 if the session is still open/in-progress.
 *
 * SRS 4.2.2: Aggregation of multi-judge allocations
 *
 * @param {string}  sessionId   — UUID of the evaluation session
 * @param {boolean} [includeRaw=false] — include per-evaluator raw allocations
 * @returns {Promise<Object>} Response with { success, data: { results[], ... } }
 */
export const getSessionResults = async (sessionId, includeRaw = false) => {
  // GET /api/scarcity/sessions/:id/results?includeRaw=true|false
  const response = await api.get(`/scarcity/sessions/${sessionId}/results`, {
    params: { includeRaw: includeRaw ? "true" : "false" },
  });
  return response.data;
};

// ============================================================
// getTargetResults — Fetch detailed results for a single target
// ============================================================
/**
 * Fetch the full statistical breakdown for one target in a session.
 * Includes statistics, distribution info, and raw evaluator allocations.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @param {string} targetId  — UUID of the target person/entity
 * @returns {Promise<Object>} Response with { success, data: { statistics, distribution, allocations } }
 */
export const getTargetResults = async (sessionId, targetId) => {
  // GET /api/scarcity/sessions/:id/results/:targetId
  const response = await api.get(
    `/scarcity/sessions/${sessionId}/results/${targetId}`,
  );
  return response.data;
};

// ============================================================
// recalculateAggregation — Admin: force re-aggregation
// ============================================================
/**
 * Force the backend to re-compute aggregation results from scratch.
 * Clears all cached results and runs the full aggregation pipeline.
 * Admin-only endpoint.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @returns {Promise<Object>} Response with { success, data: { recalculatedAt, targetCount } }
 */
export const recalculateAggregation = async (sessionId) => {
  // POST /api/scarcity/sessions/:id/recalculate
  const response = await api.post(
    `/scarcity/sessions/${sessionId}/recalculate`,
  );
  return response.data;
};

// ============================================================
// SESSION GOVERNANCE API (Step 4 — Governance Layer)
// ============================================================

// ============================================================
// getSessionStatus — Fetch detailed session status + readiness
// ============================================================
/**
 * Fetch the full session status including readiness indicators,
 * aggregation status, and available actions for the current state.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @returns {Promise<Object>} Response with { success, data: { session, readiness, aggregation, actions } }
 */
export const getSessionStatus = async (sessionId) => {
  // GET /api/scarcity/sessions/:id/status
  const response = await api.get(`/scarcity/sessions/${sessionId}/status`);
  return response.data;
};

// ============================================================
// finalizeSession — Admin: finalize an OPEN session → LOCKED
// ============================================================
/**
 * Finalize a session: validates completeness + integrity,
 * generates a cryptographic seal, transitions to LOCKED.
 * Only callable by admin users. Requires session to be OPEN/IN_PROGRESS.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @param {Object} options — { force?: boolean, reason?: string }
 * @returns {Promise<Object>} Response with { success, data: { finalState, seal, validations } }
 */
export const finalizeSession = async (sessionId, options = {}) => {
  // POST /api/scarcity/sessions/:id/finalize
  const response = await api.post(
    `/scarcity/sessions/${sessionId}/finalize`,
    options,
  );
  return response.data;
};

// ============================================================
// aggregateSession — Admin: aggregate a LOCKED session → AGGREGATED
// ============================================================
/**
 * Aggregate a locked session: computes per-target statistics,
 * stores immutable results, transitions to AGGREGATED state.
 * Only callable by admin users. Requires session to be LOCKED.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @returns {Promise<Object>} Response with { success, data: { targetCount, insights } }
 */
export const aggregateSession = async (sessionId) => {
  // POST /api/scarcity/sessions/:id/aggregate
  const response = await api.post(`/scarcity/sessions/${sessionId}/aggregate`);
  return response.data;
};

// ============================================================
// getGovernanceResults — Fetch governance-aware aggregated results
// ============================================================
/**
 * Fetch the full governance-aware aggregated results for a session.
 * Richer than /results — includes zero semantics, consensus categories,
 * and optional raw allocations. Only for AGGREGATED sessions.
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @param {string} [format='summary'] — 'summary' or 'detailed'
 * @param {boolean} [includeRaw=false] — include per-evaluator raw allocations
 * @returns {Promise<Object>} Response with { success, data: { session, summary, targets[] } }
 */
export const getGovernanceResults = async (
  sessionId,
  format = "summary",
  includeRaw = false,
) => {
  // GET /api/scarcity/sessions/:id/governance-results?format=...&includeRaw=...
  const response = await api.get(
    `/scarcity/sessions/${sessionId}/governance-results`,
    {
      params: {
        format,
        includeRaw: includeRaw ? "true" : "false",
      },
    },
  );
  return response.data;
};

// ============================================================
// getReadySessions — Admin: list sessions ready for finalization
// ============================================================
/**
 * Fetch all sessions that meet the readiness criteria for finalization.
 * Admin-only endpoint for the governance dashboard.
 *
 * @returns {Promise<Object>} Response with { success, data: [{ sessionId, status, ... }] }
 */
export const getReadySessions = async () => {
  // GET /api/scarcity/admin/sessions/ready
  const response = await api.get("/scarcity/admin/sessions/ready");
  return response.data;
};

// ============================================================
// CREDIBILITY ENGINE API METHODS (Step 5)
// ============================================================

// ============================================================
// getWeightedSessionResults — Enriched multi-judge weighted results
// ============================================================
/**
 * Fetch comprehensive credibility-weighted aggregation results for a session.
 * Returns enriched data including:
 *   - Session metadata (id, pool size, evaluator count)
 *   - Summary statistics (avg weighted, avg raw, credibility impact)
 *   - Per-person results (raw vs weighted comparison, evaluator breakdown)
 *   - Evaluator analysis (credibility profiles, evaluation patterns)
 *   - Pre-formatted visualization data (chart-ready arrays)
 *
 * This is the primary data source for the WeightedResultsDashboard component.
 *
 * SRS 4.2.2: "Final score per person = credibility-weighted average"
 *
 * @param {string} sessionId — UUID of the evaluation session
 * @param {string} [view='detailed'] — 'summary' | 'detailed' | 'comparison'
 * @returns {Promise<Object>} Response with { success, data: { session, summary, person_results, evaluator_analysis, visualization_data } }
 */
export const getWeightedSessionResults = async (
  sessionId,
  view = "detailed",
) => {
  // GET /api/scarcity/sessions/:id/weighted-results?view=...
  const response = await api.get(
    `/scarcity/sessions/${sessionId}/weighted-results`,
    { params: { view } },
  );
  return response.data;
};

// ============================================================
// processSessionCredibility — Admin: process credibility for a session
// ============================================================
/**
 * Run the full credibility pipeline for a session:
 * analyze signals → composite → EMA smooth → weighted aggregation.
 * Requires admin role.
 *
 * @param {string} sessionId - UUID of the session to process
 * @returns {Promise<Object>} Response with { success, data: { credibility, weightedAggregation } }
 */
export const processSessionCredibility = async (sessionId) => {
  // POST /api/scarcity/sessions/:id/credibility/process
  const response = await api.post(
    `/scarcity/sessions/${sessionId}/credibility/process`,
  );
  return response.data;
};

// ============================================================
// getWeightedResults — Get credibility-weighted aggregation results
// ============================================================
/**
 * Fetch credibility-weighted aggregation results for a session.
 * Compares weighted vs raw means per target.
 *
 * @param {string} sessionId - UUID of the session
 * @param {string} [headId] - Optional filter by evaluation head
 * @returns {Promise<Object>} Response with { success, data: { results[], count } }
 */
export const getWeightedResults = async (sessionId, headId = null) => {
  // GET /api/scarcity/sessions/:id/credibility/weighted?headId=...
  const params = {};
  if (headId) params.headId = headId;

  const response = await api.get(
    `/scarcity/sessions/${sessionId}/credibility/weighted`,
    { params },
  );
  return response.data;
};

// ============================================================
// getCredibilityProfiles — Admin: list all evaluator profiles
// ============================================================
/**
 * Fetch all evaluator credibility profiles with optional band filter.
 * Admin-only endpoint for the credibility dashboard.
 *
 * @param {Object} [filters] - Optional filters
 * @param {string} [filters.band] - Filter by band (HIGH/MEDIUM/LOW)
 * @param {number} [filters.limit] - Max results (default 100)
 * @param {number} [filters.offset] - Pagination offset
 * @returns {Promise<Object>} Response with { success, data: { profiles[] } }
 */
export const getCredibilityProfiles = async (filters = {}) => {
  // GET /api/scarcity/credibility/profiles?band=...&limit=...&offset=...
  const response = await api.get("/scarcity/credibility/profiles", {
    params: filters,
  });
  return response.data;
};

// ============================================================
// getEvaluatorProfile — Admin: get single evaluator's profile
// ============================================================
/**
 * Fetch detailed credibility profile, weight, and signal history
 * for a specific evaluator.
 *
 * @param {string} evaluatorId - UUID of the evaluator
 * @returns {Promise<Object>} Response with { success, data: { profile, weight, history } }
 */
export const getEvaluatorProfile = async (evaluatorId) => {
  // GET /api/scarcity/credibility/profiles/:evaluatorId
  const response = await api.get(
    `/scarcity/credibility/profiles/${evaluatorId}`,
  );
  return response.data;
};

// ============================================================
// batchRecalculateCredibility — Admin: full recalculation
// ============================================================
/**
 * Batch recalculate all credibility profiles from historical data.
 * WARNING: expensive operation — re-processes all sessions.
 *
 * @returns {Promise<Object>} Response with { success, data: { sessions_recalculated, ... } }
 */
export const batchRecalculateCredibility = async () => {
  // POST /api/scarcity/credibility/recalculate
  const response = await api.post("/scarcity/credibility/recalculate");
  return response.data;
};

// ============================================================
// processCredibilityQueue — Admin: process pending sessions
// ============================================================
/**
 * Process all unprocessed sessions in the credibility queue.
 *
 * @returns {Promise<Object>} Response with { success, data: { sessions_processed } }
 */
export const processCredibilityQueue = async () => {
  // POST /api/scarcity/credibility/queue/process
  const response = await api.post("/scarcity/credibility/queue/process");
  return response.data;
};

// ============================================================
// getCredibilityConfig — Admin: get engine configuration
// ============================================================
/**
 * Fetch current credibility engine configuration parameters.
 *
 * @returns {Promise<Object>} Response with { success, data: { config } }
 */
export const getCredibilityConfig = async () => {
  // GET /api/scarcity/credibility/config
  const response = await api.get("/scarcity/credibility/config");
  return response.data;
};

// ============================================================
// updateCredibilityConfig — Admin: update a config parameter
// ============================================================
/**
 * Update a single credibility configuration value.
 *
 * @param {string} key - Configuration key (e.g., "signal_weights")
 * @param {Object} value - New value object
 * @returns {Promise<Object>} Response with { success, data: { key, value } }
 */
export const updateCredibilityConfig = async (key, value) => {
  // PUT /api/scarcity/credibility/config/:key
  const response = await api.put(`/scarcity/credibility/config/${key}`, {
    value,
  });
  return response.data;
};

// ============================================================
// CREDIBILITY BANDS API — SRS-Compliant (Part 5)
// SRS 5.3: Statistical dilution only — no monitoring, no alerts
// SRS 7.2: Bands only — no raw scores, no individual data
// ============================================================

/**
 * Get credibility band distribution (admin only)
 * Returns { bands: { HIGH, MEDIUM, LOW }, total }
 */
export const getCredibilityBands = async () => {
  const response = await api.get("/scarcity/credibility/bands");
  return response.data;
};

/**
 * Trigger full credibility recalculation (admin only)
 */
export const recalculateCredibility = async () => {
  const response = await api.post("/scarcity/credibility/recalculate");
  return response.data;
};

// ============================================================
// HISTORICAL SCORES API — SRS §4.1.2 Monthly Review History
// ============================================================
// These functions fetch previous month scores for growth-aware
// evaluation. Judges see improvement trajectories rather than
// scoring in isolation.
//
// SRS §4.1.2: "Judges shall see: Last month's score (per member)"
// SRS §6.1: "Trajectory Analysis - month-to-month improvement"
// ============================================================

/**
 * Get projects with previous month scores for an evaluation session.
 * Primary endpoint for growth-aware evaluation interface.
 *
 * SRS §4.1.2: Display historical context for each member
 *
 * @param {string} sessionId - UUID of the current evaluation session
 * @returns {Promise<Object>} Response with:
 *   - session: Current session details
 *   - hasPreviousSession: Boolean indicating if history exists
 *   - previousSessionMonth: Name of previous month
 *   - projects: Array of projects with members including:
 *     - previous_score: Previous month score
 *     - previous_total: Previous session pool size
 *     - previous_percentage: Score as percentage
 *     - has_history: Whether historical data exists
 */
export const getSessionProjectsWithHistory = async (sessionId) => {
  // GET /api/scarcity/sessions/:id/projects-with-history
  const response = await api.get(
    `/scarcity/sessions/${sessionId}/projects-with-history`,
  );
  return response.data;
};

/**
 * Get session history summary for banner display.
 * Shows coverage stats and previous session info.
 *
 * @param {string} sessionId - UUID of the evaluation session
 * @returns {Promise<Object>} Response with:
 *   - hasPrevious: Boolean
 *   - previousSessionMonth: String
 *   - totalTargets: Number
 *   - targetsWithHistory: Number
 *   - coveragePercentage: Number
 */
export const getSessionHistorySummary = async (sessionId) => {
  // GET /api/scarcity/sessions/:id/history-summary
  const response = await api.get(
    `/scarcity/sessions/${sessionId}/history-summary`,
  );
  return response.data;
};

/**
 * Get complete historical trend for a member.
 * Used for detailed analytics and growth tracking.
 *
 * SRS §6.1: Trajectory Analysis
 *
 * @param {string} memberId - UUID of the member
 * @param {string} sessionType - Type of sessions to include (default: project_review)
 * @param {number} limit - Max number of historical records (default: 12)
 * @returns {Promise<Object>} Response with:
 *   - member: Member details
 *   - history: Array of historical scores with deltas
 *   - totalSessions: Number of sessions in history
 *   - trend: Overall trend summary
 */
export const getMemberHistoricalTrend = async (
  memberId,
  sessionType = "project_review",
  limit = 12,
) => {
  // GET /api/scarcity/members/:id/history
  const response = await api.get(`/scarcity/members/${memberId}/history`, {
    params: { sessionType, limit },
  });
  return response.data;
};
