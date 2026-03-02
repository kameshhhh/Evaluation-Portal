// ============================================================
// ENHANCED AGGREGATION SERVICE — Governance-Aware Aggregation
// ============================================================
// This service extends the original AggregationService (services/aggregation/)
// with governance awareness. It ONLY aggregates LOCKED sessions,
// stores results in the enhanced aggregated_results table, and
// transitions the session to AGGREGATED state.
//
// Differences from the original AggregationService:
//   1. Verifies session is LOCKED before aggregating
//   2. Supports multi-head evaluations (head_id grouping)
//   3. Computes zero semantic classification (SRS 4.1.5)
//   4. Stores results in aggregated_results (not session_aggregation_results)
//   5. Marks session as AGGREGATED after successful computation
//   6. Captures session context (pool_size, mode, intent)
//
// DATA FLOW:
//   SessionFinalizationService.finalizeSession()  → session becomes LOCKED
//   EnhancedAggregationService.aggregateSession() → session becomes AGGREGATED
//
// SRS REFERENCES:
//   4.1.5 — Zero-Score Semantics (zero_semantic column)
//   4.2.2 — Aggregation Logic (stat. distillation)
//   5.1   — Credibility foundation (variance/consensus stored)
//   7.2   — Reporting rules (only statistics, no raw rankings)
//
// DEPENDENCY GRAPH:
//   EnhancedAggregationService
//     → services/aggregation/StatisticalAnalyzer (pure math)
//     → config/database (pg pool)
//     → utils/logger (Winston)
// ============================================================

"use strict";

const db = require("../../config/database");
const logger = require("../../utils/logger");

// Import the pure math module from the existing aggregation layer
const {
  computeMean,
  computeVariance,
  computeStdDev,
  computeMedian,
  computePercentile,
  computeSkewness,
  computeKurtosis,
  computeConsensus,
  classifyEdgeCase,
} = require("../aggregation/StatisticalAnalyzer");

// ============================================================
// AggregationError — Custom error for aggregation failures
// ============================================================
class AggregationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AggregationError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class EnhancedAggregationService {
  // ============================================================
  // PUBLIC: aggregateSession
  // ============================================================
  // Full aggregation pipeline for a LOCKED session.
  // 1. Verify session is LOCKED
  // 2. Fetch all allocations
  // 3. Group by head_id → target_id
  // 4. Compute statistics per target per head
  // 5. Store immutable results
  // 6. Transition session to AGGREGATED
  //
  // @param {string} sessionId — LOCKED session UUID
  // @returns {Promise<Object>} — Aggregation report
  // ============================================================
  async aggregateSession(sessionId) {
    const startTime = Date.now();

    // Build the report object
    const report = {
      sessionId,
      timestamp: new Date().toISOString(),
      phase: "AGGREGATION",
      steps: [],
      statistics: {},
      targets: [],
      durationMs: 0,
      status: null,
    };

    try {
      // STEP 0: Verify session is LOCKED (governance gate)
      report.steps.push("0. Verify session is LOCKED");
      const session = await this._verifySessionLocked(sessionId);

      // STEP 1: Fetch all allocations for this session
      report.steps.push("1. Fetch allocations");
      const allocations = await this._fetchAllocations(sessionId);
      report.statistics.totalAllocations = allocations.length;

      if (allocations.length === 0) {
        logger.warn("EnhancedAggregation: no allocations found", { sessionId });
        report.status = "EMPTY";
        report.targets = [];
        return report;
      }

      // STEP 2: Group allocations by head_id → target_id
      report.steps.push("2. Group allocations");
      const grouped = this._groupAllocations(allocations);
      report.statistics.headCount = Object.keys(grouped).length;

      // STEP 3: Compute statistics per target per head
      report.steps.push("3. Compute per-target statistics");
      const targetResults = [];

      for (const [headId, targets] of Object.entries(grouped)) {
        for (const [targetId, targetAllocations] of Object.entries(targets)) {
          const stats = this._computeTargetStatistics(
            targetId,
            headId,
            targetAllocations,
            session,
          );

          targetResults.push({
            session_id: sessionId,
            head_id: headId === "null" ? null : headId,
            target_id: targetId,
            ...stats,
            computed_at: new Date().toISOString(),
          });
        }
      }

      report.targets = targetResults;
      report.statistics.targetCount = targetResults.length;

      // STEP 4: Compute session-level insights
      report.steps.push("4. Compute session insights");
      report.statistics.sessionInsights =
        this._computeSessionInsights(targetResults);

      // STEP 5: Store results immutably
      report.steps.push("5. Store aggregation results");
      await this._storeResults(sessionId, targetResults);

      // STEP 6: Transition session to AGGREGATED
      report.steps.push("6. Mark session as AGGREGATED");
      await this._markSessionAggregated(sessionId);

      report.durationMs = Date.now() - startTime;
      report.status = "COMPLETED";

      logger.info("EnhancedAggregation: session aggregated", {
        sessionId,
        targetCount: targetResults.length,
        durationMs: report.durationMs,
      });

      return report;
    } catch (error) {
      report.status = "FAILED";
      report.durationMs = Date.now() - startTime;
      report.error = error.message;

      logger.error("EnhancedAggregation: aggregation failed", {
        sessionId,
        error: error.message,
        code: error.code,
      });

      throw new AggregationError("AGGREGATION_FAILED", error.message, report);
    }
  }

  // ============================================================
  // PUBLIC: getSessionResults
  // ============================================================
  // Fetches stored aggregation results for a session.
  // Only returns data for AGGREGATED sessions.
  //
  // @param {string} sessionId — Session UUID
  // @param {boolean} includeRaw — Include raw allocation data
  // @returns {Promise<Object>} — Formatted results
  // ============================================================
  async getSessionResults(sessionId, includeRaw = false) {
    // Fetch from the aggregated_results table
    const result = await db.query(
      `SELECT * FROM aggregated_results
        WHERE session_id = $1
        ORDER BY mean_score DESC`,
      [sessionId],
    );

    if (result.rows.length === 0) return null;

    // Map DB rows to API response format
    const targets = result.rows.map((row) => ({
      targetId: row.target_id,
      headId: row.head_id,
      statistics: {
        mean: parseFloat(row.mean_score),
        min: parseFloat(row.min_score),
        max: parseFloat(row.max_score),
        range: parseFloat(row.range),
        variance: parseFloat(row.variance),
        stdDev: parseFloat(row.std_dev),
      },
      distribution: {
        median: row.median ? parseFloat(row.median) : null,
        q1: row.q1 ? parseFloat(row.q1) : null,
        q3: row.q3 ? parseFloat(row.q3) : null,
        iqr: row.iqr ? parseFloat(row.iqr) : null,
        skewness: row.skewness ? parseFloat(row.skewness) : null,
        kurtosis: row.kurtosis ? parseFloat(row.kurtosis) : null,
      },
      zeroAnalysis: {
        count: row.zero_count,
        ratio: parseFloat(row.zero_ratio),
        semantic: row.zero_semantic,
      },
      consensus: {
        score: parseFloat(row.consensus_score),
        category: row.consensus_category,
        evaluatorCount: row.evaluator_count,
      },
      computedAt: row.computed_at,
      version: row.aggregation_version,
    }));

    // Optionally attach raw allocations
    if (includeRaw) {
      for (const target of targets) {
        const allocs = await db.query(
          `SELECT evaluator_id, points, created_at
             FROM scarcity_allocations
            WHERE session_id = $1 AND target_id = $2
            ORDER BY evaluator_id`,
          [sessionId, target.targetId],
        );
        target.rawAllocations = allocs.rows.map((a) => ({
          evaluatorId: a.evaluator_id,
          points: parseFloat(a.points),
          submittedAt: a.created_at,
        }));
      }
    }

    return targets;
  }

  // ============================================================
  // PRIVATE: _verifySessionLocked
  // ============================================================
  // Governance gate: only LOCKED sessions can be aggregated.
  // ============================================================
  async _verifySessionLocked(sessionId) {
    const result = await db.query(
      `SELECT * FROM evaluation_sessions
        WHERE session_id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) {
      throw new AggregationError(
        "SESSION_NOT_FOUND",
        `Session ${sessionId} not found`,
      );
    }

    const session = result.rows[0];

    if (session.status !== "locked") {
      throw new AggregationError(
        "INVALID_STATE",
        `Session must be LOCKED to aggregate (current: ${session.status})`,
        { required: "locked", current: session.status },
      );
    }

    return session;
  }

  // ============================================================
  // PRIVATE: _fetchAllocations
  // ============================================================
  // Fetch all allocations ordered for deterministic grouping.
  // ============================================================
  async _fetchAllocations(sessionId) {
    const result = await db.query(
      `SELECT evaluator_id, target_id, head_id, points, created_at
         FROM scarcity_allocations
        WHERE session_id = $1
        ORDER BY head_id, target_id, evaluator_id`,
      [sessionId],
    );
    return result.rows;
  }

  // ============================================================
  // PRIVATE: _groupAllocations
  // ============================================================
  // Groups allocations into a two-level map:
  //   { [headId]: { [targetId]: Allocation[] } }
  // This supports multi-head evaluation sessions.
  // ============================================================
  _groupAllocations(allocations) {
    const groups = {};

    for (const alloc of allocations) {
      // Use "null" string as key for allocations without a head
      const hid = alloc.head_id || "null";
      const tid = alloc.target_id;

      if (!groups[hid]) groups[hid] = {};
      if (!groups[hid][tid]) groups[hid][tid] = [];
      groups[hid][tid].push(alloc);
    }

    return groups;
  }

  // ============================================================
  // PRIVATE: _computeTargetStatistics
  // ============================================================
  // Core statistical distillation for a single target.
  // Uses StatisticalAnalyzer for all pure math operations.
  //
  // Returns a flat object ready for database insertion.
  // ============================================================
  _computeTargetStatistics(targetId, headId, allocations, session) {
    // Extract numerical values from allocation rows
    const points = allocations.map((a) => parseFloat(a.points));
    const evaluatorIds = [...new Set(allocations.map((a) => a.evaluator_id))];

    // Edge case: single evaluator
    if (evaluatorIds.length === 1) {
      return this._buildSingleEvaluatorResult(
        targetId,
        points[0],
        allocations[0],
        session,
      );
    }

    // ── Core Statistics (SRS 4.2.2) ──
    const mean = computeMean(points);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min;
    const variance = computeVariance(points, mean);
    const stdDev = computeStdDev(points, mean);

    // ── Distribution Shape ──
    const sorted = [...points].sort((a, b) => a - b);
    const median = computeMedian(sorted);
    const q1 = computePercentile(sorted, 25);
    const q3 = computePercentile(sorted, 75);
    const iqr = q3 - q1;
    const skewness = computeSkewness(points, mean);
    const kurtosis = computeKurtosis(points, mean);

    // ── Zero Allocation Analysis (SRS 4.1.5) ──
    const zeroCount = points.filter((p) => p === 0).length;
    const zeroRatio = zeroCount / evaluatorIds.length;
    const zeroSemantic = this._classifyZeroSemantic(zeroRatio);

    // ── Consensus Score (0-1, higher = more agreement) ──
    const consensusScore = computeConsensus(points);
    const consensusCategory = this._categorizeConsensus(consensusScore);

    return {
      mean_score: parseFloat(mean.toFixed(3)),
      min_score: parseFloat(min.toFixed(3)),
      max_score: parseFloat(max.toFixed(3)),
      range: parseFloat(range.toFixed(3)),
      variance: parseFloat(variance.toFixed(3)),
      std_dev: parseFloat(stdDev.toFixed(3)),
      median: parseFloat(median.toFixed(3)),
      q1: parseFloat(q1.toFixed(3)),
      q3: parseFloat(q3.toFixed(3)),
      iqr: parseFloat(iqr.toFixed(3)),
      skewness: parseFloat((skewness || 0).toFixed(3)),
      kurtosis: parseFloat((kurtosis || 0).toFixed(3)),
      zero_count: zeroCount,
      zero_ratio: parseFloat(zeroRatio.toFixed(3)),
      zero_semantic: zeroSemantic,
      evaluator_count: evaluatorIds.length,
      consensus_score: parseFloat(consensusScore.toFixed(3)),
      consensus_category: consensusCategory,
      allocation_count: allocations.length,
      pool_size: session.scarcity_pool_size || null,
      evaluation_mode: session.evaluation_mode || null,
      intent: session.intent || null,
    };
  }

  // ============================================================
  // PRIVATE: _buildSingleEvaluatorResult
  // ============================================================
  // Special case when only one evaluator submitted for a target.
  // Variance and distribution are meaningless with n=1.
  // ============================================================
  _buildSingleEvaluatorResult(targetId, pointVal, alloc, session) {
    return {
      mean_score: parseFloat(pointVal.toFixed(3)),
      min_score: parseFloat(pointVal.toFixed(3)),
      max_score: parseFloat(pointVal.toFixed(3)),
      range: 0,
      variance: 0,
      std_dev: 0,
      median: parseFloat(pointVal.toFixed(3)),
      q1: parseFloat(pointVal.toFixed(3)),
      q3: parseFloat(pointVal.toFixed(3)),
      iqr: 0,
      skewness: 0,
      kurtosis: 0,
      zero_count: pointVal === 0 ? 1 : 0,
      zero_ratio: pointVal === 0 ? 1 : 0,
      zero_semantic: pointVal === 0 ? "UNANIMOUS_ZERO" : "NO_ZEROS",
      evaluator_count: 1,
      consensus_score: 1.0,
      consensus_category: "PERFECT",
      allocation_count: 1,
      pool_size: session.scarcity_pool_size || null,
      evaluation_mode: session.evaluation_mode || null,
      intent: session.intent || null,
      metadata: {
        single_evaluator: true,
        evaluator_id: alloc.evaluator_id,
        credibility_note: "Variance unavailable with single evaluator",
      },
    };
  }

  // ============================================================
  // PRIVATE: _classifyZeroSemantic
  // ============================================================
  // Classifies the zero allocation ratio into semantic categories.
  // This feeds into the SRS 4.1.5 zero-score interpretation.
  // ============================================================
  _classifyZeroSemantic(zeroRatio) {
    if (zeroRatio === 0) return "NO_ZEROS";
    if (zeroRatio === 1) return "UNANIMOUS_ZERO";
    if (zeroRatio > 0.5) return "MAJORITY_ZERO";
    if (zeroRatio > 0.3) return "PLURALITY_ZERO";
    return "MINORITY_ZERO";
  }

  // ============================================================
  // PRIVATE: _categorizeConsensus
  // ============================================================
  // Maps the numeric consensus score to a human-readable category.
  // ============================================================
  _categorizeConsensus(score) {
    if (score >= 0.95) return "PERFECT";
    if (score >= 0.75) return "HIGH";
    if (score >= 0.5) return "MODERATE";
    if (score >= 0.25) return "LOW";
    return "SPLIT";
  }

  // ============================================================
  // PRIVATE: _computeSessionInsights
  // ============================================================
  // Aggregates across all targets to produce session-level stats.
  // ============================================================
  _computeSessionInsights(targetResults) {
    if (targetResults.length === 0) {
      return { avgMean: 0, avgVariance: 0, avgConsensus: 0, totalZeros: 0 };
    }

    const avgMean =
      targetResults.reduce((s, r) => s + r.mean_score, 0) /
      targetResults.length;
    const avgVariance =
      targetResults.reduce((s, r) => s + r.variance, 0) / targetResults.length;
    const avgConsensus =
      targetResults.reduce((s, r) => s + r.consensus_score, 0) /
      targetResults.length;
    const totalZeros = targetResults.reduce((s, r) => s + r.zero_count, 0);

    return {
      avgMean: parseFloat(avgMean.toFixed(3)),
      avgVariance: parseFloat(avgVariance.toFixed(3)),
      avgConsensus: parseFloat(avgConsensus.toFixed(3)),
      totalZeros,
      targetCount: targetResults.length,
    };
  }

  // ============================================================
  // PRIVATE: _storeResults
  // ============================================================
  // Atomically stores all target results in aggregated_results.
  // Deletes any previous results for this session first.
  // ============================================================
  async _storeResults(sessionId, targetResults) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Clear previous results for this session
      await client.query(
        "DELETE FROM aggregated_results WHERE session_id = $1",
        [sessionId],
      );

      // Insert each target result
      for (const r of targetResults) {
        await client.query(
          `INSERT INTO aggregated_results (
              session_id, head_id, target_id,
              mean_score, min_score, max_score, range,
              variance, std_dev,
              median, q1, q3, iqr, skewness, kurtosis,
              zero_count, zero_ratio, zero_semantic,
              evaluator_count, consensus_score, consensus_category,
              allocation_count,
              pool_size, evaluation_mode, intent,
              computed_at
           ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19,
              $20, $21, $22, $23, $24, $25
           )`,
          [
            r.session_id,
            r.head_id,
            r.target_id,
            r.mean_score,
            r.min_score,
            r.max_score,
            r.range,
            r.variance,
            r.std_dev,
            r.median,
            r.q1,
            r.q3,
            r.iqr,
            r.skewness,
            r.kurtosis,
            r.zero_count,
            r.zero_ratio,
            r.zero_semantic,
            r.evaluator_count,
            r.consensus_score,
            r.consensus_category,
            r.allocation_count,
            r.pool_size,
            r.evaluation_mode,
            r.intent,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // PRIVATE: _markSessionAggregated
  // ============================================================
  // Transitions the session to AGGREGATED state and records timing.
  // Also inserts an audit trail row in session_state_transitions.
  // ============================================================
  async _markSessionAggregated(sessionId) {
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Update session status and aggregation timestamp
      await client.query(
        `UPDATE evaluation_sessions
            SET status = 'aggregated',
                aggregated_at = NOW(),
                aggregation_version = COALESCE(aggregation_version, 0) + 1
          WHERE session_id = $1`,
        [sessionId],
      );

      // Insert audit trail
      await client.query(
        `INSERT INTO session_state_transitions
            (session_id, from_state, to_state, metadata)
         VALUES ($1, 'locked', 'aggregated', $2)`,
        [sessionId, JSON.stringify({ reason: "aggregation_complete" })],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = new EnhancedAggregationService();
module.exports.AggregationError = AggregationError;
