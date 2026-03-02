// ============================================================
// SESSION CONTROLLER — Session Governance & Results API
// ============================================================
// HTTP layer for session lifecycle management and results access.
//
// ENDPOINTS HANDLED:
//   GET  /sessions/:sessionId/status     — Session status + readiness
//   POST /sessions/:sessionId/finalize   — Finalize session (admin)
//   POST /sessions/:sessionId/aggregate  — Aggregate locked session (admin)
//   GET  /sessions/:sessionId/results    — Aggregated results (read-only)
//   GET  /admin/sessions/ready           — List ready-to-finalize sessions
//
// GOVERNANCE RULES ENFORCED:
//   - Finalization requires OPEN/IN_PROGRESS session
//   - Aggregation requires LOCKED session
//   - Results only available for AGGREGATED sessions
//   - State transitions are atomic and audited
//
// SRS REFERENCES:
//   4.2.2 — Aggregation Logic (controller orchestration)
//   8.2   — Transparency (rules visible, judgments private)
//
// DEPENDENCY GRAPH:
//   SessionController
//     → SessionFinalizationService (governance)
//     → EnhancedAggregationService (statistical distillation)
//     → config/database (direct session queries)
//     → utils/logger (structured logging)
// ============================================================

"use strict";

const SessionFinalizationService = require("../services/scarcity/SessionFinalizationService");
const EnhancedAggregationService = require("../services/scarcity/EnhancedAggregationService");
const db = require("../config/database");
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// GET /sessions/:sessionId/status
// ============================================================
// Returns detailed session status, readiness indicators,
// aggregation status, and available actions for the current state.
// ============================================================
const getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Fetch session details with evaluator/allocation counts
    const sessionResult = await db.query(
      `SELECT
          es.*,
          COUNT(DISTINCT sa.evaluator_id) AS active_evaluators,
          COUNT(DISTINCT sa.target_id) AS evaluated_targets,
          COUNT(sa.allocation_id) AS total_allocations
        FROM evaluation_sessions es
        LEFT JOIN scarcity_allocations sa ON sa.session_id = es.session_id
        WHERE es.session_id = $1
        GROUP BY es.session_id`,
      [sessionId],
    );

    // Guard: session must exist
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    const session = sessionResult.rows[0];

    // Get finalization readiness (only meaningful for open sessions)
    let readiness = null;
    if (["open", "in_progress"].includes(session.status)) {
      readiness =
        await SessionFinalizationService.getFinalizationReadiness(sessionId);
    }

    // Get aggregation status (only meaningful for aggregated sessions)
    let aggregation = null;
    if (session.status === "aggregated") {
      const aggResult = await db.query(
        `SELECT * FROM session_aggregation_summary
          WHERE session_id = $1`,
        [sessionId],
      );
      if (aggResult.rows.length > 0) {
        const a = aggResult.rows[0];
        aggregation = {
          targetCount: parseInt(a.aggregated_targets, 10),
          avgMeanScore: parseFloat(a.avg_mean_score || 0),
          avgVariance: parseFloat(a.avg_variance || 0),
          avgConsensus: parseFloat(a.avg_consensus || 0),
          totalZeros: parseInt(a.total_zeros || 0, 10),
          totalEvaluators: parseInt(a.total_evaluators || 0, 10),
        };
      }
    }

    // Determine available actions based on current state
    const actions = _getAvailableActions(session.status);

    return res.json({
      success: true,
      data: {
        session: {
          id: session.session_id,
          sessionType: session.session_type,
          status: session.status,
          evaluationMode: session.evaluation_mode,
          intent: session.intent,
          poolSize: session.scarcity_pool_size
            ? parseFloat(session.scarcity_pool_size)
            : null,
          minEvaluators: session.min_evaluators || 1,
          deadline: session.evaluation_window_end,
          createdAt: session.created_at,
          finalizedAt: session.finalized_at,
          aggregatedAt: session.aggregated_at,
          sealed: !!session.finalization_seal,
          activeEvaluators: parseInt(session.active_evaluators, 10),
          evaluatedTargets: parseInt(session.evaluated_targets, 10),
          totalAllocations: parseInt(session.total_allocations, 10),
        },
        readiness,
        aggregation,
        actions,
      },
    });
  } catch (error) {
    logger.error("SessionController: getSessionStatus failed", {
      sessionId: req.params.sessionId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to fetch session status",
    });
  }
};

// ============================================================
// POST /sessions/:sessionId/finalize
// ============================================================
// Finalizes an OPEN session: validates completeness + integrity,
// generates cryptographic seal, transitions to LOCKED.
// Requires admin role.
//
// Body: { force?: boolean, reason?: string }
// ============================================================
const finalizeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { force = false, reason } = req.body;
    const adminId = req.user.userId;

    logger.info("SessionController: finalize request", {
      sessionId,
      adminId,
      force,
      reason,
    });

    // Delegate to the finalization service
    const report = await SessionFinalizationService.finalizeSession(sessionId, {
      force,
      reason,
      adminId,
    });

    broadcastChange("session", "finalized", { sessionId });

    return res.json({
      success: true,
      message: "Session finalized successfully",
      data: {
        finalState: report.finalState,
        cryptographicSeal: report.cryptographicSeal,
        durationMs: report.durationMs,
        validations: report.validations,
      },
    });
  } catch (error) {
    logger.error("SessionController: finalize failed", {
      sessionId: req.params.sessionId,
      error: error.message,
      code: error.code,
    });

    // Return structured error based on error type
    if (error.code === "INCOMPLETE_SESSION") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        details: error.details,
        suggestion: "Use force=true to override completeness checks",
      });
    }

    if (error.code === "INTEGRITY_VIOLATION") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: "Session data integrity check failed",
        violations: error.details,
      });
    }

    if (error.code === "INVALID_STATE_TRANSITION") {
      return res.status(409).json({
        success: false,
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error.code === "SESSION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Finalization failed unexpectedly",
    });
  }
};

// ============================================================
// POST /sessions/:sessionId/aggregate
// ============================================================
// Aggregates a LOCKED session: computes statistics per target,
// stores results, transitions to AGGREGATED.
// Requires admin role.
// ============================================================
const aggregateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const adminId = req.user.userId;

    logger.info("SessionController: aggregate request", {
      sessionId,
      adminId,
    });

    // Delegate to the enhanced aggregation service
    const report = await EnhancedAggregationService.aggregateSession(sessionId);

    broadcastChange("session", "aggregated", { sessionId });

    return res.json({
      success: true,
      message: "Session aggregated successfully",
      data: {
        targetCount: report.targets.length,
        durationMs: report.durationMs,
        sessionInsights: report.statistics.sessionInsights,
      },
    });
  } catch (error) {
    logger.error("SessionController: aggregate failed", {
      sessionId: req.params.sessionId,
      error: error.message,
      code: error.code,
    });

    if (error.code === "INVALID_STATE") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error.code === "SESSION_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Aggregation failed unexpectedly",
    });
  }
};

// ============================================================
// GET /sessions/:sessionId/governance-results
// ============================================================
// Returns aggregated results for an AGGREGATED session.
// Supports ?format=summary|detailed and ?includeRaw=true
// ============================================================
const getGovernanceResults = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { includeRaw = "false", format = "summary" } = req.query;

    // Verify session is AGGREGATED
    const sessionResult = await db.query(
      `SELECT * FROM evaluation_sessions
        WHERE session_id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }

    const session = sessionResult.rows[0];

    if (session.status !== "aggregated") {
      return res.status(400).json({
        success: false,
        error: "RESULTS_NOT_AVAILABLE",
        message: `Session must be AGGREGATED to view results (current: ${session.status})`,
      });
    }

    // Fetch results from the enhanced aggregation service
    const targets = await EnhancedAggregationService.getSessionResults(
      sessionId,
      includeRaw === "true",
    );

    if (!targets || targets.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No aggregated results found for this session",
      });
    }

    // Build response based on requested format
    const response = {
      success: true,
      data: {
        session: {
          id: session.session_id,
          sessionType: session.session_type,
          status: session.status,
          evaluationMode: session.evaluation_mode,
          intent: session.intent,
          poolSize: session.scarcity_pool_size
            ? parseFloat(session.scarcity_pool_size)
            : null,
          finalizedAt: session.finalized_at,
          aggregatedAt: session.aggregated_at,
          sealed: !!session.finalization_seal,
        },
        summary: _buildResultsSummary(targets),
        targets:
          format === "detailed" ? targets : _buildSummaryTargets(targets),
      },
    };

    return res.json(response);
  } catch (error) {
    logger.error("SessionController: getGovernanceResults failed", {
      sessionId: req.params.sessionId,
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to fetch results",
    });
  }
};

// ============================================================
// GET /admin/sessions/ready
// ============================================================
// Returns all sessions that are ready for finalization.
// Admin-only endpoint for the governance dashboard.
// ============================================================
const getReadySessions = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM session_finalization_readiness
        WHERE ready_for_finalization = TRUE
        ORDER BY deadline ASC NULLS LAST`,
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        sessionId: r.session_id,
        sessionType: r.session_type,
        intent: r.intent,
        status: r.status,
        activeEvaluators: parseInt(r.active_evaluators, 10),
        evaluatedTargets: parseInt(r.evaluated_targets, 10),
        deadline: r.deadline,
        readyForFinalization: r.ready_for_finalization,
      })),
    });
  } catch (error) {
    logger.error("SessionController: getReadySessions failed", {
      error: error.message,
    });
    return res.status(500).json({
      success: false,
      error: "Failed to fetch ready sessions",
    });
  }
};

// ============================================================
// HELPER: _getAvailableActions
// ============================================================
// Maps session status to available user/admin actions.
// ============================================================
function _getAvailableActions(status) {
  const actionMap = {
    draft: ["configure", "delete", "publish"],
    scheduled: ["open"],
    open: ["view", "participate", "finalize"],
    in_progress: ["view", "participate", "finalize"],
    closed: ["view", "lock"],
    locked: ["view", "aggregate"],
    aggregated: ["view_results", "analyze"],
  };
  return actionMap[status] || [];
}

// ============================================================
// HELPER: _buildResultsSummary
// ============================================================
// Creates a session-level summary from per-target results.
// ============================================================
function _buildResultsSummary(targets) {
  if (!targets || targets.length === 0) {
    return {
      targetCount: 0,
      avgMean: 0,
      avgVariance: 0,
      avgConsensus: 0,
      totalZeros: 0,
    };
  }

  const avgMean =
    targets.reduce((s, t) => s + t.statistics.mean, 0) / targets.length;
  const avgVariance =
    targets.reduce((s, t) => s + t.statistics.variance, 0) / targets.length;
  const avgConsensus =
    targets.reduce((s, t) => s + t.consensus.score, 0) / targets.length;
  const totalZeros = targets.reduce((s, t) => s + t.zeroAnalysis.count, 0);

  return {
    targetCount: targets.length,
    avgMean: parseFloat(avgMean.toFixed(3)),
    avgVariance: parseFloat(avgVariance.toFixed(3)),
    avgConsensus: parseFloat(avgConsensus.toFixed(3)),
    totalZeros,
  };
}

// ============================================================
// HELPER: _buildSummaryTargets
// ============================================================
// Strips detailed distribution/raw data for summary view.
// ============================================================
function _buildSummaryTargets(targets) {
  return targets.map((t) => ({
    targetId: t.targetId,
    headId: t.headId,
    meanScore: t.statistics.mean,
    range: t.statistics.range,
    variance: t.statistics.variance,
    consensusScore: t.consensus.score,
    consensusCategory: t.consensus.category,
    zeroRatio: t.zeroAnalysis.ratio,
    evaluatorCount: t.consensus.evaluatorCount,
  }));
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  getSessionStatus,
  finalizeSession,
  aggregateSession,
  getGovernanceResults,
  getReadySessions,
};
