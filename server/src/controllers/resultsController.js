// ============================================================
// RESULTS CONTROLLER — HTTP Interface for Aggregation Results
// ============================================================
// Thin controller that maps HTTP requests to AggregationService.
// All business logic lives in the service layer — this file only
// handles request parsing, validation, and response formatting.
//
// ROUTES HANDLED:
//   GET  /api/scarcity/sessions/:sessionId/results            → Session results
//   GET  /api/scarcity/sessions/:sessionId/results/:targetId  → Single target
//   POST /api/scarcity/sessions/:sessionId/recalculate        → Admin recalc
//
// SECURITY:
//   - All routes require authentication (via auth middleware)
//   - Recalculate requires admin role (via authorize middleware)
//   - Results only served for closed/locked sessions
//
// SRS 4.2.2: Read-only results computation
// ============================================================

"use strict";

// Import the aggregation service (singleton)
const AggregationService = require("../services/aggregation/AggregationService");

// Database access for session lookup
const db = require("../config/database");

// Winston logger for structured request logging
const logger = require("../utils/logger");

// ============================================================
// GET /api/scarcity/sessions/:sessionId/results
// ============================================================
/**
 * Get aggregated results for an entire evaluation session.
 * Results are only available for sessions in 'closed' or 'locked' status.
 *
 * Query params:
 *   includeRaw=true — include per-evaluator raw allocations (default: false)
 *
 * @param {Request}  req — Express request (params.sessionId, query.includeRaw)
 * @param {Response} res — Express response
 */
const getSessionResults = async (req, res) => {
  try {
    // Extract session ID from URL params
    const { sessionId } = req.params;

    // Optional: include raw allocations in response
    const includeRaw = req.query.includeRaw === "true";

    logger.info("ResultsController: fetching session results", {
      sessionId,
      userId: req.user?.userId,
      includeRaw,
    });

    // -------------------------------------------------------
    // Step 1: Verify the session exists in the database
    // -------------------------------------------------------
    const session = await _getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "Evaluation session does not exist",
      });
    }

    // -------------------------------------------------------
    // Step 2: Check session status — compute live for open sessions
    // Finalized sessions use cached aggregated_results,
    // open/in_progress sessions compute live from raw allocations
    // -------------------------------------------------------
    const isFinalized = ["closed", "locked", "aggregated"].includes(
      session.status,
    );
    const isLive = ["open", "in_progress"].includes(session.status);

    // -------------------------------------------------------
    // Step 3: Get aggregated results from the service
    // -------------------------------------------------------
    // Step 3: Get results — finalized from cache or live from raw allocations
    // -------------------------------------------------------
    let results = null;
    let isLiveData = false;

    if (isFinalized) {
      // Finalized sessions — use AggregationService (cached results)
      results = await AggregationService.getSessionResults(sessionId);
    }

    // For open/in_progress sessions, or if aggregation returned nothing,
    // compute live results directly from raw scarcity_allocations
    if (!results || results.length === 0) {
      const liveQuery = await db.query(
        `SELECT
          sa.target_id AS "targetId",
          COUNT(DISTINCT sa.evaluator_id) AS "judgeCount",
          AVG(sa.points) AS "mean",
          MIN(sa.points) AS "min",
          MAX(sa.points) AS "max",
          VARIANCE(sa.points) AS "variance",
          STDDEV(sa.points) AS "stdDev",
          COUNT(CASE WHEN sa.points = 0 THEN 1 END) AS "zeroCount",
          p.display_name AS "targetName"
        FROM scarcity_allocations sa
        LEFT JOIN persons p ON p.person_id = sa.target_id
        WHERE sa.session_id = $1
        GROUP BY sa.target_id, p.display_name
        ORDER BY AVG(sa.points) DESC`,
        [sessionId],
      );

      if (liveQuery.rows.length > 0) {
        results = liveQuery.rows.map((r) => ({
          targetId: r.targetId,
          targetName: r.targetName,
          mean: parseFloat(r.mean) || 0,
          min: parseFloat(r.min) || 0,
          max: parseFloat(r.max) || 0,
          variance: parseFloat(r.variance) || 0,
          stdDev: parseFloat(r.stdDev) || 0,
          judgeCount: parseInt(r.judgeCount, 10) || 0,
          zeroCount: parseInt(r.zeroCount, 10) || 0,
          median: parseFloat(r.mean) || 0, // Approximate with mean for live
          consensusScore: null, // Not computed for live results
          edgeCaseFlag: null,
          allocations: [],
        }));
        isLiveData = true;
      }
    }

    // Guard: no evaluations submitted
    if (!results || results.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          sessionId,
          status: session.status,
          totalTargets: 0,
          totalEvaluators: 0,
          results: [],
          message: "No evaluations were submitted for this session",
        },
      });
    }

    // -------------------------------------------------------
    // Step 4: Format and return the response
    // -------------------------------------------------------
    const response = {
      sessionId,
      sessionType: session.session_type,
      evaluationMode: session.evaluation_mode || null,
      intent: session.intent,
      poolSize: session.scarcity_pool_size
        ? parseFloat(session.scarcity_pool_size)
        : null,
      status: session.status,
      isLive: isLiveData, // true = computed from raw allocations, not finalized
      totalTargets: results.length,
      totalEvaluators: _countUniqueEvaluators(results),
      aggregatedAt: new Date().toISOString(),

      // Per-target result rows
      results: results.map((r) => ({
        targetId: r.targetId,
        targetName: r.targetName || null,

        // Core statistics (SRS 4.2.2)
        meanScore: r.mean,
        minScore: r.min,
        maxScore: r.max,
        range: parseFloat((r.max - r.min).toFixed(3)),

        // Variance & deviation
        variance: r.variance,
        stdDev: r.stdDev,

        // Distribution insights
        judgeCount: r.judgeCount,
        zeroCount: r.zeroCount,
        median: r.median,
        consensusScore: r.consensusScore,

        // Edge-case flag (nullable — only set for special cases)
        edgeCaseFlag: r.edgeCaseFlag || null,

        // Conditionally include raw evaluator allocations
        ...(includeRaw && r.allocations?.length > 0
          ? { allocations: r.allocations }
          : {}),
      })),
    };

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error("ResultsController: session results failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "AGGREGATION_FAILED",
      message: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/:sessionId/results/:targetId
// ============================================================
/**
 * Get detailed aggregated results for a single target in a session.
 * Includes full statistics + raw allocations for transparency.
 *
 * @param {Request}  req — Express request (params.sessionId, params.targetId)
 * @param {Response} res — Express response
 */
const getTargetResults = async (req, res) => {
  try {
    // Extract IDs from URL params
    const { sessionId, targetId } = req.params;

    logger.info("ResultsController: fetching target results", {
      sessionId,
      targetId,
      userId: req.user?.userId,
    });

    // Verify session exists and is closed/locked
    const session = await _getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
      });
    }

    if (
      !["closed", "locked", "aggregated", "open", "in_progress"].includes(
        session.status,
      )
    ) {
      return res.status(403).json({
        success: false,
        error: "RESULTS_NOT_AVAILABLE",
        currentStatus: session.status,
      });
    }

    // Get the single target's result
    const targetResult = await AggregationService.getTargetResult(
      sessionId,
      targetId,
    );

    if (!targetResult) {
      return res.status(404).json({
        success: false,
        error: "TARGET_NOT_FOUND",
        message: "No allocations found for this target in this session",
      });
    }

    // Format detailed response
    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        targetId,

        // Core statistics
        statistics: {
          mean: targetResult.mean,
          min: targetResult.min,
          max: targetResult.max,
          range: parseFloat((targetResult.max - targetResult.min).toFixed(3)),
          variance: targetResult.variance,
          stdDev: targetResult.stdDev,
          median: targetResult.median,
          skewness: targetResult.skewness,
          kurtosis: targetResult.kurtosis,
        },

        // Distribution summary
        distribution: {
          judgeCount: targetResult.judgeCount,
          zeroCount: targetResult.zeroCount,
          consensusScore: targetResult.consensusScore,
          edgeCaseFlag: targetResult.edgeCaseFlag || null,
        },

        // Raw allocations (full transparency for single-target view)
        allocations: targetResult.allocations || [],
      },
    });
  } catch (error) {
    logger.error("ResultsController: target results failed", {
      sessionId: req.params.sessionId,
      targetId: req.params.targetId,
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
// POST /api/scarcity/sessions/:sessionId/recalculate
// ============================================================
/**
 * Force a re-aggregation of session results.
 * Admin-only endpoint — clears cache and recomputes all statistics.
 *
 * @param {Request}  req — Express request (params.sessionId)
 * @param {Response} res — Express response
 */
const recalculateAggregation = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info("ResultsController: admin recalculation triggered", {
      sessionId,
      adminId: req.user?.userId,
    });

    // Verify session exists
    const session = await _getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
      });
    }

    // Clear cached results (both memory and DB)
    await AggregationService.clearSessionCache(sessionId);

    // Run fresh aggregation
    const results = await AggregationService.aggregateSession(sessionId);

    return res.status(200).json({
      success: true,
      data: {
        recalculatedAt: new Date().toISOString(),
        targetCount: results.length,
        message: "Aggregation recalculated successfully",
      },
    });
  } catch (error) {
    logger.error("ResultsController: recalculation failed", {
      sessionId: req.params.sessionId,
      adminId: req.user?.userId,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// HELPER: _getSession(sessionId)
// ============================================================
/**
 * Fetch a session row from evaluation_sessions.
 *
 * @param {string} sessionId — UUID
 * @returns {Promise<Object|null>} session row or null
 */
async function _getSession(sessionId) {
  const result = await db.query(
    `SELECT session_id, session_type, intent, status,
            scarcity_pool_size, evaluation_mode
       FROM evaluation_sessions
      WHERE session_id = $1`,
    [sessionId],
  );

  return result.rows[0] || null;
}

// ============================================================
// HELPER: _countUniqueEvaluators(results)
// ============================================================
/**
 * Count unique evaluator IDs across all target results.
 *
 * @param {Object[]} results — aggregated result objects
 * @returns {number} unique evaluator count
 */
function _countUniqueEvaluators(results) {
  const ids = new Set();

  results.forEach((r) => {
    // Each result may have an allocations array with evaluatorId
    if (r.allocations) {
      r.allocations.forEach((a) => ids.add(a.evaluatorId));
    }
  });

  return ids.size;
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  getSessionResults,
  getTargetResults,
  recalculateAggregation,
};
