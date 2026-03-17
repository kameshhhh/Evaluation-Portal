// ============================================================
// SCARCITY CONTROLLER — HTTP Interface for Scarcity API
// ============================================================
// Maps HTTP requests to ScarcityEngine method calls.
// Thin controller — all business logic lives in ScarcityEngine.
//
// ROUTES HANDLED:
//   POST /api/scarcity/sessions/:sessionId/configure  → Configure scarcity
//   GET  /api/scarcity/sessions/:sessionId             → Get session (isolated)
//   POST /api/scarcity/sessions/:sessionId/allocate    → Submit allocations
//   GET  /api/scarcity/sessions/:sessionId/pool        → Get pool status
//   GET  /api/scarcity/sessions/my                     → Get my sessions
//
// SECURITY:
//   - All routes require authentication (via auth middleware)
//   - req.user is set by the authenticate middleware
//   - Evaluator isolation enforced by ScarcityEngine (SRS 4.2.1)
// ============================================================

// Import the ScarcityEngine — main orchestrator
const ScarcityEngine = require("../services/scarcity/ScarcityEngine");

// Import database utilities — pool for raw operations, query for simple queries,
// getClient for transactions (dedicated connection with BEGIN/COMMIT/ROLLBACK)
const { pool, query, getClient } = require("../config/database");

// Import PoolComputationService for SRS-compliant pool size calculation
// SRS 4.1.3: "Score pool is proportional to team size"
const {
  calculatePoolSize: computePoolSize,
} = require("../services/scarcity/PoolComputationService");

// Import personalization service to invalidate caches after scarcity mutations
// Evaluation session changes affect student assigned evaluations & faculty session lists
const personalizationService = require("../services/personalization/PersonalizationService");

// Import logger for request tracking
const logger = require("../utils/logger");
const {
  broadcastChange,
  emitToAll,
  emitToSession,
  EVENTS,
} = require("../socket");

// ============================================================
// POST /api/scarcity/sessions/:sessionId/configure
// ============================================================
/**
 * Configure scarcity settings on an existing evaluation session.
 *
 * Body: { mode, poolConfig, evaluatorIds }
 * - mode: evaluation mode (project_member/cross_project/faculty/peer)
 * - poolConfig: mode-specific pool configuration (teamSize, etc.)
 * - evaluatorIds: array of person UUIDs to assign as evaluators
 *
 * @param {Request} req - Express request (req.user set by auth middleware)
 * @param {Response} res - Express response
 */
const configureSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { mode, poolConfig = {}, evaluatorIds = [] } = req.body;

    // Log the configuration request
    logger.debug("ScarcityController: Session configuration requested", {
      sessionId,
      mode,
      userId: req.user.userId,
    });

    // Delegate to the ScarcityEngine
    const result = await ScarcityEngine.createSession({
      sessionId,
      mode,
      poolConfig,
      evaluatorIds,
      createdBy: req.user.userId,
    });

    // Return the configured session
    // Invalidate ALL caches — new session config affects student & faculty dashboards
    personalizationService.invalidateAllCaches();

    broadcastChange("scarcity_session", "configured", { sessionId });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Log the error with context
    logger.error("ScarcityController: Session configuration failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });

    // Return appropriate status code based on error type
    const statusCode = error.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/:sessionId
// ============================================================
/**
 * Get an evaluation session with evaluator-scoped data.
 * Enforces SRS 4.2.1 isolation — evaluators only see own allocations.
 *
 * Query: ?evaluatorId=<UUID>
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { evaluatorId } = req.query;

    // evaluatorId is required for scoped access
    if (!evaluatorId) {
      return res.status(400).json({
        success: false,
        error: "evaluatorId query parameter is required",
      });
    }

    // Delegate to ScarcityEngine (handles isolation internally)
    const session = await ScarcityEngine.getSessionForEvaluator(
      sessionId,
      evaluatorId,
    );

    // Return 404 if session not found or evaluator not authorized
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Session not found or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    logger.error("ScarcityController: Session fetch failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to load session data",
    });
  }
};

// ============================================================
// POST /api/scarcity/sessions/:sessionId/allocate
// ============================================================
/**
 * Submit point allocations for an evaluator in a session.
 *
 * Body: { evaluatorId, allocations: [{ targetId, points, headId? }] }
 *
 * This is THE core operation. The ScarcityEngine:
 *   1. Validates the submission against pool constraints
 *   2. Stores allocations atomically
 *   3. Interprets zero allocations (SRS 4.1.5)
 *   4. Returns pool status
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const submitAllocations = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { evaluatorId, allocations, zeroScoreReasons } = req.body;

    // Log the allocation submission
    logger.debug("ScarcityController: Allocation submission received", {
      sessionId,
      evaluatorId,
      allocationCount: allocations.length,
      hasZeroReasons: !!(zeroScoreReasons && zeroScoreReasons.length),
    });

    // Delegate to ScarcityEngine
    const result = await ScarcityEngine.submitAllocations(
      sessionId,
      evaluatorId,
      allocations,
      zeroScoreReasons || [],
    );

    // Check if submission was rejected (pool violation, etc.)
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
        details: result.details,
      });
    }

    // Return success with pool status
    // Invalidate evaluator's cache — their dashboard pool usage should update
    personalizationService.invalidateUserCache(req.user.userId);

    broadcastChange("scarcity_allocation", "submitted", { sessionId });

    return res.status(200).json({
      success: true,
      data: result.data,
      poolInfo: result.poolInfo,
    });
  } catch (error) {
    // Handle database scarcity constraint violations
    if (error.message && error.message.includes("SCARCITY_VIOLATION")) {
      return res.status(400).json({
        success: false,
        error: "SCARCITY_VIOLATION",
        message: error.message,
      });
    }

    logger.error("ScarcityController: Allocation submission failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to submit allocations",
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/:sessionId/pool
// ============================================================
/**
 * Get the current pool usage for an evaluator in a session.
 *
 * Query: ?evaluatorId=<UUID>
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getPoolStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { evaluatorId } = req.query;

    // evaluatorId is required
    if (!evaluatorId) {
      return res.status(400).json({
        success: false,
        error: "evaluatorId query parameter is required",
      });
    }

    // Delegate to ScarcityEngine
    const poolInfo = await ScarcityEngine.getPoolStatus(sessionId, evaluatorId);

    if (!poolInfo) {
      return res.status(404).json({
        success: false,
        error: "Pool information not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: poolInfo,
    });
  } catch (error) {
    logger.error("ScarcityController: Pool status fetch failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to load pool status",
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/my
// ============================================================
/**
 * Get all evaluation sessions assigned to the current user.
 *
 * Query: ?evaluatorId=<UUID>
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getMySessions = async (req, res) => {
  try {
    const { evaluatorId } = req.query;

    // evaluatorId is required
    if (!evaluatorId) {
      return res.status(400).json({
        success: false,
        error: "evaluatorId query parameter is required",
      });
    }

    // Delegate to ScarcityEngine
    const sessions = await ScarcityEngine.getEvaluatorSessions(evaluatorId);

    return res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    logger.error("ScarcityController: My sessions fetch failed", {
      userId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to load sessions",
    });
  }
};

// ============================================================
// POST /api/scarcity/sessions/create
// ============================================================
/**
 * Create a new evaluation session with scarcity configuration.
 * Faculty/Admin creates the evaluation_sessions row + sets scarcity params.
 *
 * Body: { sessionType, intent, evaluationMode, poolSize,
 *         evaluationWindowStart, evaluationWindowEnd }
 */
const createNewSession = async (req, res) => {
  try {
    const {
      sessionType,
      intent,
      evaluationMode,
      poolSize,
      evaluationWindowStart,
      evaluationWindowEnd,
      selectedStudentIds,
    } = req.body;

    logger.debug("ScarcityController: Creating new session", {
      sessionType,
      intent,
      studentCount: selectedStudentIds?.length || 0,
      userId: req.user.userId,
    });

    // Validate required fields
    if (
      !sessionType ||
      !intent ||
      !evaluationWindowStart ||
      !evaluationWindowEnd
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: sessionType, intent, evaluationWindowStart, evaluationWindowEnd",
      });
    }

    // ============================================================
    // AUTOMATION VALIDATION — Window end is the auto-finalization deadline
    // The SessionAutoFinalizer worker will auto-close sessions at this time
    // ============================================================
    const windowEndDate = new Date(evaluationWindowEnd);
    const windowStartDate = new Date(evaluationWindowStart);
    const now = new Date();

    // Window end must be in the future
    if (windowEndDate <= now) {
      return res.status(400).json({
        success: false,
        error: "INVALID_WINDOW_END",
        message:
          "Evaluation window end must be in the future. Sessions auto-finalize at this deadline.",
      });
    }

    // Window end must be after window start
    if (windowEndDate <= windowStartDate) {
      return res.status(400).json({
        success: false,
        error: "INVALID_WINDOW_RANGE",
        message: "Evaluation window end must be after window start.",
      });
    }

    if (!selectedStudentIds || selectedStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please select at least one student for the evaluation.",
      });
    }

    // Get the person_id for created_by from the authenticated user
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1 LIMIT 1`,
      [req.user.userId],
    );

    const createdBy = personResult.rows[0]?.person_id;
    if (!createdBy) {
      return res.status(400).json({
        success: false,
        error: "Could not resolve person identity for the current user.",
      });
    }

    // Find or create a default period (use the first available academic_months)
    const periodResult = await query(
      `SELECT period_id FROM academic_months ORDER BY start_date DESC LIMIT 1`,
    );

    let periodId;
    if (periodResult.rows.length > 0) {
      periodId = periodResult.rows[0].period_id;
    } else {
      // Create a default academic month if none exists
      const newPeriod = await query(
        `INSERT INTO academic_months (month_name, start_date, end_date, semester, academic_year)
         VALUES ('Default Period', NOW(), NOW() + INTERVAL '30 days', 'odd', '2025-2026')
         RETURNING period_id`,
      );
      periodId = newPeriod.rows[0].period_id;
    }

    // -----------------------------------------------------------
    // AUTO-CALCULATE POOL SIZE based on SRS 4.1.3 formula
    // SRS: "Score pool is proportional to team size."
    //   2 members → 10 pts, 3 members → 15 pts, 4 members → 20 pts
    //   General: teamSize × 5 points per member
    //
    // If the client sends a custom poolSize, use it as-is
    // (faculty may override for non-standard evaluation modes).
    // Otherwise, auto-calculate from the selected student count.
    // -----------------------------------------------------------
    let effectivePoolSize;
    if (poolSize && Number(poolSize) > 0) {
      // Client-provided pool size — use as-is
      effectivePoolSize = Number(poolSize);
    } else {
      // Auto-calculate: 5 points per selected student (SRS 4.1.3)
      effectivePoolSize = selectedStudentIds.length * 5;
    }

    // Use a transaction to create session + assign students atomically
    // getClient() returns a dedicated connection for transaction safety
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Insert the evaluation session
      // Status is 'open' — evaluators can begin allocating immediately
      // (SRS workflow: faculty creates → evaluators evaluate → faculty finalizes)
      const sessionResult = await client.query(
        `INSERT INTO evaluation_sessions (
          session_type, intent, period_id,
          evaluation_window_start, evaluation_window_end,
          status, created_by, scarcity_pool_size, evaluation_mode
        ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8)
        RETURNING session_id, session_type, intent, status,
                  evaluation_window_start, evaluation_window_end,
                  scarcity_pool_size, evaluation_mode`,
        [
          sessionType,
          intent,
          periodId,
          evaluationWindowStart,
          evaluationWindowEnd,
          createdBy,
          effectivePoolSize,
          evaluationMode || "project_member",
        ],
      );

      const session = sessionResult.rows[0];

      // Register the faculty (creator) as an evaluator for this session
      await client.query(
        `INSERT INTO session_evaluators (session_id, evaluator_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [session.session_id, createdBy],
      );

      // Store selected students as frozen_entities JSON on the session
      // These are the TARGETS of the evaluation
      await client.query(
        `UPDATE evaluation_sessions SET frozen_entities = $1 WHERE session_id = $2`,
        [JSON.stringify(selectedStudentIds), session.session_id],
      );

      await client.query("COMMIT");

      logger.info("ScarcityController: Session created with students", {
        sessionId: session.session_id,
        studentCount: selectedStudentIds.length,
        userId: req.user.userId,
      });

      // Invalidate ALL caches — new session affects faculty dashboard (session list)
      // and student dashboards (assigned evaluations)
      personalizationService.invalidateAllCaches();

      broadcastChange("scarcity_session", "created", {
        sessionId: session.session_id,
      });

      return res.status(201).json({
        success: true,
        data: {
          sessionId: session.session_id,
          sessionType: session.session_type,
          intent: session.intent,
          status: session.status,
          poolSize: session.scarcity_pool_size,
          evaluationMode: session.evaluation_mode,
          windowStart: session.evaluation_window_start,
          windowEnd: session.evaluation_window_end,
          selectedStudents: selectedStudentIds.length,
        },
      });
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error("ScarcityController: Session creation failed", {
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/my-results
// ============================================================
/**
 * Get the authenticated student's own evaluation results from all
 * sessions where they were a target. Returns per-session score,
 * rank, and comparison data.
 */
const getMyResults = async (req, res) => {
  try {
    // Get the person_id for the authenticated user
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1 LIMIT 1`,
      [req.user.userId],
    );

    const personId = personResult.rows[0]?.person_id;
    if (!personId) {
      return res.status(404).json({
        success: false,
        error: "Person profile not found.",
      });
    }

    // -----------------------------------------------------------
    // STEP 1: Check for finalized results (Credibility Engine)
    // -----------------------------------------------------------
    const aggregatedQuery = await query(
      `SELECT 
        fsr.session_id,
        fsr.student_id as target_id,
        fsr.normalized_score as mean_score,
        fsr.confidence_score as consensus_score,
        fsr.judge_count as evaluator_count,
        fsr.aggregated_score,
        fsr.scale_max,
        es.session_type,
        es.intent,
        es.evaluation_mode,
        es.scarcity_pool_size,
        es.evaluation_window_start,
        es.evaluation_window_end,
        es.status AS session_status
      FROM final_student_results fsr
      JOIN evaluation_sessions es ON fsr.session_id = es.session_id
      WHERE fsr.student_id = $1
      ORDER BY es.evaluation_window_end DESC`,
      [personId],
    );

    // Build results from finalized data
    const results = [];
    const processedSessionIds = new Set();

    for (const row of aggregatedQuery.rows) {
      // For finalized results, we trust the stored rank/score
      // Use window functions? For now, simple approximation or just 1 if solo.
      // Rank calculation requires querying PEERS in same session.
      // Let's do a quick subquery for rank if needed, or skip rank for now (frontend handles "—").

      // Calculate rank dynamically
      const rankQuery = await query(
        `SELECT student_id, normalized_score 
          FROM final_student_results 
          WHERE session_id = $1 
          ORDER BY normalized_score DESC`,
        [row.session_id],
      );

      const allTargets = rankQuery.rows;
      const rank = allTargets.findIndex((t) => t.student_id === personId) + 1;
      const avgMean =
        allTargets.length > 0
          ? allTargets.reduce((s, t) => s + parseFloat(t.normalized_score || 0), 0) /
          allTargets.length
          : 0;

      results.push({
        sessionId: row.session_id,
        sessionType: row.session_type,
        intent: row.intent,
        evaluationMode: row.evaluation_mode,
        poolSize: row.scarcity_pool_size,
        meanScore: parseFloat(row.mean_score),
        variance: 0, // Not stored in final results
        minScore: 0, // Not stored
        maxScore: parseFloat(row.scale_max || 5),
        judgeCount: parseInt(row.evaluator_count),
        consensusScore: parseFloat(row.consensus_score), // This is Confidence Score
        zeroCount: 0,
        rank,
        totalTargets: allTargets.length,
        avgMean,
        windowStart: row.evaluation_window_start,
        windowEnd: row.evaluation_window_end,
        sessionStatus: row.session_status,
        source: "finalized",
        normalizedScore: parseFloat(row.mean_score),
        confidenceScore: parseFloat(row.consensus_score)
      });

      processedSessionIds.add(row.session_id);
    }

    // -----------------------------------------------------------
    // STEP 2: Also fetch RAW allocation scores from open/in_progress sessions
    // This lets students see their scores immediately after faculty submits,
    // without waiting for the full finalize → aggregate governance flow.
    // -----------------------------------------------------------
    const rawQuery = await query(
      `SELECT
        es.session_id,
        es.session_type,
        es.intent,
        es.evaluation_mode,
        es.scarcity_pool_size,
        es.evaluation_window_start,
        es.evaluation_window_end,
        es.status AS session_status,
        COALESCE(SUM(sa.points), 0) AS total_points,
        COUNT(DISTINCT sa.evaluator_id) AS judge_count,
        COALESCE(AVG(sa.points), 0) AS mean_score,
        COALESCE(MIN(sa.points), 0) AS min_score,
        COALESCE(MAX(sa.points), 0) AS max_score,
        COALESCE(VARIANCE(sa.points), 0) AS variance
      FROM evaluation_sessions es
      JOIN scarcity_allocations sa
        ON sa.session_id = es.session_id
        AND sa.target_id = $1
      WHERE es.session_id IN (
        SELECT DISTINCT s.session_id
        FROM evaluation_sessions s,
          jsonb_array_elements_text(s.frozen_entities) AS target_uuid
        WHERE target_uuid::UUID = $1
      )
      GROUP BY es.session_id, es.session_type, es.intent,
               es.evaluation_mode, es.scarcity_pool_size,
               es.evaluation_window_start, es.evaluation_window_end,
               es.status
      ORDER BY es.evaluation_window_end DESC`,
      [personId],
    );

    // Add raw results for sessions not already in aggregated results
    for (const row of rawQuery.rows) {
      if (processedSessionIds.has(row.session_id)) continue;

      // Compute rank among all targets in this session from raw allocations
      const rawRankQuery = await query(
        `SELECT sa.target_id, AVG(sa.points) AS mean_score
         FROM scarcity_allocations sa
         WHERE sa.session_id = $1
         GROUP BY sa.target_id
         ORDER BY mean_score DESC`,
        [row.session_id],
      );

      const allTargets = rawRankQuery.rows;
      const rank = allTargets.findIndex((t) => t.target_id === personId) + 1;
      const avgMean =
        allTargets.length > 0
          ? allTargets.reduce((s, t) => s + parseFloat(t.mean_score || 0), 0) /
          allTargets.length
          : 0;

      results.push({
        sessionId: row.session_id,
        sessionType: row.session_type,
        intent: row.intent,
        evaluationMode: row.evaluation_mode,
        poolSize: row.scarcity_pool_size,
        meanScore: parseFloat(row.mean_score),
        variance: parseFloat(row.variance),
        minScore: parseFloat(row.min_score),
        maxScore: parseFloat(row.max_score),
        judgeCount: parseInt(row.judge_count, 10),
        consensusScore: null, // Not yet computed — requires aggregation
        zeroCount: 0,
        rank,
        totalTargets: allTargets.length,
        avgMean,
        windowStart: row.evaluation_window_start,
        windowEnd: row.evaluation_window_end,
        sessionStatus: row.session_status,
        source: "live", // Live scores from raw allocations
      });
    }

    // -----------------------------------------------------------
    // STEP 3: Also fetch marks from session_planner_assignments
    // The session planner uses faculty_evaluation_sessions, not
    // evaluation_sessions. This ensures students see their marks
    // from the session planner system as well.
    // -----------------------------------------------------------
    const plannerQuery = await query(
      `SELECT
        fes.id AS session_id,
        fes.title,
        fes.status AS session_status,
        fes.academic_year,
        fes.semester,
        fes.session_date,
        fes.closes_at,
        COUNT(DISTINCT spa.faculty_id) AS judge_count,
        COALESCE(AVG(spa.marks), 0) AS mean_score,
        COALESCE(MIN(spa.marks), 0) AS min_score,
        COALESCE(MAX(spa.marks), 0) AS max_score,
        COALESCE(VARIANCE(spa.marks), 0) AS variance,
        COUNT(CASE WHEN spa.marks IS NOT NULL THEN 1 END) AS marks_count,
        COUNT(spa.id) AS total_assignments,
        5 AS scale_max
      FROM session_planner_assignments spa
      JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      WHERE spa.student_id = $1
        AND spa.status != 'removed'
      GROUP BY fes.id, fes.title, fes.status, fes.academic_year,
               fes.semester, fes.session_date, fes.closes_at,
               fes.preferred_rubric_ids
      ORDER BY fes.created_at DESC`,
      [personId],
    );

    for (const row of plannerQuery.rows) {
      if (processedSessionIds.has(row.session_id)) continue;

      // Only include if at least one mark submitted
      if (parseInt(row.marks_count) === 0) continue;

      // Compute rank among all students in this session
      const plannerRankQuery = await query(
        `SELECT spa.student_id, AVG(spa.marks) AS mean_score
         FROM session_planner_assignments spa
         WHERE spa.session_id = $1
           AND spa.status != 'removed'
           AND spa.marks IS NOT NULL
         GROUP BY spa.student_id
         ORDER BY mean_score DESC`,
        [row.session_id],
      );

      const allTargets = plannerRankQuery.rows;
      const rank = allTargets.findIndex((t) => t.student_id === personId) + 1;
      const avgMean =
        allTargets.length > 0
          ? allTargets.reduce((s, t) => s + parseFloat(t.mean_score || 0), 0) /
          allTargets.length
          : 0;

      results.push({
        sessionId: row.session_id,
        sessionTitle: row.title,
        sessionType: "faculty_evaluation",
        intent: "comparative",
        evaluationMode: "session_planner",
        poolSize: null,
        meanScore: parseFloat(row.mean_score),
        variance: parseFloat(row.variance),
        minScore: parseFloat(row.min_score),
        maxScore: parseFloat(row.scale_max || 5),
        judgeCount: parseInt(row.judge_count),
        consensusScore: null,
        zeroCount: 0,
        rank,
        totalTargets: allTargets.length,
        avgMean,
        windowStart: null,
        windowEnd: row.closes_at,
        sessionStatus: row.session_status,
        source: "live",
      });
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error("ScarcityController: getMyResults failed", {
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// Export controller handlers
// Used by scarcityRoutes.js to wire up HTTP endpoints
// ============================================================
module.exports = {
  configureSession, // POST /api/scarcity/sessions/:sessionId/configure
  getSession, // GET  /api/scarcity/sessions/:sessionId
  submitAllocations, // POST /api/scarcity/sessions/:sessionId/allocate
  getPoolStatus, // GET  /api/scarcity/sessions/:sessionId/pool
  getMySessions, // GET  /api/scarcity/sessions/my
  createNewSession, // POST /api/scarcity/sessions/create
  getMyResults, // GET  /api/scarcity/sessions/my-results
};
