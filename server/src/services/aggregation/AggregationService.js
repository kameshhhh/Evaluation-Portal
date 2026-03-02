// ============================================================
// AGGREGATION SERVICE — Core Engine for Multi-Judge Aggregation
// ============================================================
// Transforms raw scarcity allocations into per-target statistical
// results. This is the HEART of Step 4.
//
// Responsibilities:
//   1. Fetch raw allocations for a session from the database
//   2. Group allocations by target
//   3. Compute statistics per target via StatisticalAnalyzer
//   4. Store immutable result rows in session_aggregation_results
//   5. Serve cached or freshly-computed results to controllers
//
// Data flow:
//   scarcity_allocations (Step 3)
//       ↓
//   AggregationService._computeTargetStats()
//       ↓
//   session_aggregation_results (Step 4 output)
//       ↓
//   Credibility Engine (Step 5 — future)
//
// SRS 4.2.2: Aggregation Logic
// ============================================================

"use strict";

// Database access — parameterised queries + transaction client
const db = require("../../config/database");

// Winston logger — structured logging for observability
const logger = require("../../utils/logger");

// Pure math helpers — all statistics computation lives here
const {
  computeMean,
  computeVariance,
  computeStdDev,
  analyzeDistribution,
  computeConsensus,
  classifyEdgeCase,
} = require("./StatisticalAnalyzer");

// ============================================================
// AggregationService class
// ============================================================
class AggregationService {
  // ==========================================================
  // PUBLIC: aggregateSession(sessionId)
  // ==========================================================
  /**
   * Run the full aggregation pipeline for one evaluation session.
   * Idempotent — safe to call multiple times; results are replaced.
   *
   * @param {string} sessionId — UUID of the evaluation session
   * @returns {Promise<Object[]>} array of per-target result objects
   * @throws {Error} if session has no allocations or DB fails
   */
  async aggregateSession(sessionId) {
    // Timestamp for performance tracking
    const startTime = Date.now();

    logger.info("AggregationService: starting aggregation", { sessionId });

    try {
      // -------------------------------------------------------
      // Step 1: Pull all raw allocations from the DB
      // -------------------------------------------------------
      const allocations = await this._fetchSessionAllocations(sessionId);

      // Guard: no allocations submitted yet
      if (allocations.length === 0) {
        logger.warn("AggregationService: no allocations found", { sessionId });
        return [];
      }

      // -------------------------------------------------------
      // Step 2: Group allocations by target_id
      // -------------------------------------------------------
      const targetGroups = this._groupByTarget(allocations);

      // -------------------------------------------------------
      // Step 3: Compute statistics for each target
      // -------------------------------------------------------
      const results = Object.entries(targetGroups).map(
        ([targetId, targetAllocations]) =>
          this._computeTargetStats(targetId, targetAllocations),
      );

      // -------------------------------------------------------
      // Step 4: Persist the computed results (atomic transaction)
      // -------------------------------------------------------
      await this._storeResults(sessionId, results);

      // -------------------------------------------------------
      // Step 5: Mark the queue entry as processed
      // -------------------------------------------------------
      await this._markQueueProcessed(sessionId);

      // Duration in ms
      const duration = Date.now() - startTime;

      logger.info("AggregationService: aggregation complete", {
        sessionId,
        targetCount: results.length,
        totalAllocations: allocations.length,
        durationMs: duration,
      });

      return results;
    } catch (error) {
      // Log and re-throw so the controller can handle the HTTP response
      logger.error("AggregationService: aggregation failed", {
        sessionId,
        error: error.message,
      });
      throw new Error(`Aggregation failed: ${error.message}`);
    }
  }

  // ==========================================================
  // PUBLIC: getSessionResults(sessionId)
  // ==========================================================
  /**
   * Return aggregated results from the DB cache (session_aggregation_results).
   * Falls back to live aggregation if no cached rows exist.
   *
   * @param {string} sessionId — UUID of the evaluation session
   * @returns {Promise<Object[]>} per-target result objects
   */
  async getSessionResults(sessionId) {
    // Try the persisted cache first
    const cached = await this._getCachedResults(sessionId);

    // If cache has results, return them directly
    if (cached && cached.length > 0) {
      logger.debug("AggregationService: serving cached results", {
        sessionId,
        count: cached.length,
      });
      return cached;
    }

    // No cache — run live aggregation
    logger.debug("AggregationService: cache miss, computing live", {
      sessionId,
    });
    return await this.aggregateSession(sessionId);
  }

  // ==========================================================
  // PUBLIC: getTargetResult(sessionId, targetId)
  // ==========================================================
  /**
   * Return the aggregated result for a single target in a session.
   *
   * @param {string} sessionId — UUID of the evaluation session
   * @param {string} targetId  — UUID of the target person/entity
   * @returns {Promise<Object|null>} result object, or null if not found
   */
  async getTargetResult(sessionId, targetId) {
    // Fetch all results for the session (uses cache)
    const results = await this.getSessionResults(sessionId);

    // Find the target in the results array
    return results.find((r) => r.targetId === targetId) || null;
  }

  // ==========================================================
  // PUBLIC: clearSessionCache(sessionId)
  // ==========================================================
  /**
   * Delete cached aggregation results for a session.
   * Used before forced re-aggregation (admin recalculate action).
   *
   * @param {string} sessionId — UUID of the evaluation session
   */
  async clearSessionCache(sessionId) {
    await db.query(
      "DELETE FROM session_aggregation_results WHERE session_id = $1",
      [sessionId],
    );

    logger.info("AggregationService: cache cleared", { sessionId });
  }

  // ==========================================================
  // PRIVATE: _fetchSessionAllocations(sessionId)
  // ==========================================================
  /**
   * Pull all raw allocation rows for a session from scarcity_allocations.
   *
   * @param {string} sessionId — UUID
   * @returns {Promise<Object[]>} rows with evaluator_id, target_id, points, created_at
   */
  async _fetchSessionAllocations(sessionId) {
    const result = await db.query(
      `SELECT evaluator_id, target_id, points, created_at
         FROM scarcity_allocations
        WHERE session_id = $1
        ORDER BY evaluator_id, target_id`,
      [sessionId],
    );

    return result.rows;
  }

  // ==========================================================
  // PRIVATE: _groupByTarget(allocations)
  // ==========================================================
  /**
   * Group a flat allocation array into a map keyed by target_id.
   *
   * @param {Object[]} allocations — rows from scarcity_allocations
   * @returns {Object} { [targetId]: allocationRows[] }
   */
  _groupByTarget(allocations) {
    return allocations.reduce((groups, alloc) => {
      const tid = alloc.target_id;

      // Initialise group array if first allocation for this target
      if (!groups[tid]) groups[tid] = [];

      // Push the allocation into its target group
      groups[tid].push(alloc);

      return groups;
    }, {});
  }

  // ==========================================================
  // PRIVATE: _computeTargetStats(targetId, allocations)
  // ==========================================================
  /**
   * Compute all statistical metrics for a single target.
   * Delegates maths to StatisticalAnalyzer.
   *
   * @param {string}   targetId    — UUID of the target
   * @param {Object[]} allocations — raw allocation rows for this target
   * @returns {Object} result object with all metrics
   */
  _computeTargetStats(targetId, allocations) {
    // Extract numeric points array, coercing DB DECIMAL to Number
    const points = allocations.map((a) => parseFloat(a.points));

    // How many distinct judges scored this target
    const judgeCount = allocations.length;

    // How many judges gave exactly 0
    const zeroCount = points.filter((p) => p === 0).length;

    // ----- Single evaluator short-circuit -----
    if (judgeCount === 1) {
      return this._buildSingleEvaluatorResult(
        targetId,
        points[0],
        allocations[0],
      );
    }

    // ----- Core statistics -----
    const mean = computeMean(points);
    const min = Math.min(...points);
    const max = Math.max(...points);
    const variance = computeVariance(points, mean);
    const stdDev = computeStdDev(points, mean);

    // ----- Distribution analysis -----
    const distribution = analyzeDistribution(points);
    const consensusScore = computeConsensus(points);

    // ----- Edge-case flag (for credibility pipeline) -----
    const edgeCaseFlag = classifyEdgeCase(points);

    return {
      targetId,

      // Core statistics (SRS 4.2.2)
      mean: parseFloat(mean.toFixed(3)),
      min: parseFloat(min.toFixed(3)),
      max: parseFloat(max.toFixed(3)),
      variance: parseFloat(variance.toFixed(3)),
      stdDev: parseFloat(stdDev.toFixed(3)),

      // Distribution metrics (for credibility engine / Step 5)
      judgeCount,
      zeroCount,
      median: distribution.median,
      skewness: distribution.skewness,
      kurtosis: distribution.kurtosis,
      consensusScore,

      // Edge-case metadata (nullable)
      edgeCaseFlag,

      // Raw allocations (preserves evaluator truth for audit)
      allocations: allocations.map((a) => ({
        evaluatorId: a.evaluator_id,
        points: parseFloat(a.points),
        submittedAt: a.created_at,
      })),
    };
  }

  // ==========================================================
  // PRIVATE: _buildSingleEvaluatorResult(targetId, pointVal, alloc)
  // ==========================================================
  /**
   * Build a result object for the single-evaluator edge case.
   * Variance is 0, consensus is 1.0 by definition.
   *
   * @param {string} targetId — UUID
   * @param {number} pointVal — the lone score
   * @param {Object} alloc    — the allocation DB row
   * @returns {Object} result object
   */
  _buildSingleEvaluatorResult(targetId, pointVal, alloc) {
    return {
      targetId,
      mean: parseFloat(pointVal.toFixed(3)),
      min: parseFloat(pointVal.toFixed(3)),
      max: parseFloat(pointVal.toFixed(3)),
      variance: 0,
      stdDev: 0,
      judgeCount: 1,
      zeroCount: pointVal === 0 ? 1 : 0,
      median: parseFloat(pointVal.toFixed(3)),
      skewness: 0,
      kurtosis: 0,
      consensusScore: 1.0,
      edgeCaseFlag: "SINGLE_EVALUATOR",
      allocations: [
        {
          evaluatorId: alloc.evaluator_id,
          points: parseFloat(alloc.points),
          submittedAt: alloc.created_at,
        },
      ],
    };
  }

  // ==========================================================
  // PRIVATE: _storeResults(sessionId, results)
  // ==========================================================
  /**
   * Persist aggregation results in an atomic transaction.
   * Deletes old rows first (idempotent replacement strategy).
   *
   * @param {string}   sessionId — UUID
   * @param {Object[]} results   — computed target result objects
   */
  async _storeResults(sessionId, results) {
    // Acquire a dedicated client for the transaction
    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Delete any existing results for this session (idempotent)
      await client.query(
        "DELETE FROM session_aggregation_results WHERE session_id = $1",
        [sessionId],
      );

      // Insert one row per target
      for (const r of results) {
        await client.query(
          `INSERT INTO session_aggregation_results (
              session_id, target_id,
              mean_score, min_score, max_score,
              variance, std_dev,
              judge_count, zero_count,
              median_score, skewness, kurtosis,
              consensus_score
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            sessionId,
            r.targetId,
            r.mean,
            r.min,
            r.max,
            r.variance,
            r.stdDev,
            r.judgeCount,
            r.zeroCount,
            r.median,
            r.skewness,
            r.kurtosis,
            r.consensusScore,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      // Roll back on any failure to keep data consistent
      await client.query("ROLLBACK");
      throw error;
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  }

  // ==========================================================
  // PRIVATE: _markQueueProcessed(sessionId)
  // ==========================================================
  /**
   * Mark the aggregation_queue entry as processed.
   *
   * @param {string} sessionId — UUID
   */
  async _markQueueProcessed(sessionId) {
    await db.query(
      `UPDATE aggregation_queue
          SET processed    = TRUE,
              processed_at = NOW(),
              error_message = NULL
        WHERE session_id = $1`,
      [sessionId],
    );
  }

  // ==========================================================
  // PRIVATE: _getCachedResults(sessionId)
  // ==========================================================
  /**
   * Read pre-computed results from session_aggregation_results.
   * Returns null if no rows exist (cache miss).
   *
   * @param {string} sessionId — UUID
   * @returns {Promise<Object[]|null>} result objects or null
   */
  async _getCachedResults(sessionId) {
    const result = await db.query(
      `SELECT
          target_id, mean_score, min_score, max_score,
          variance, std_dev, judge_count, zero_count,
          median_score, skewness, kurtosis, consensus_score,
          computed_at, version
        FROM session_aggregation_results
       WHERE session_id = $1
       ORDER BY mean_score DESC`,
      [sessionId],
    );

    // Cache miss
    if (result.rows.length === 0) return null;

    // Map DB rows to application-level result objects
    return result.rows.map((row) => ({
      targetId: row.target_id,
      mean: parseFloat(row.mean_score),
      min: parseFloat(row.min_score),
      max: parseFloat(row.max_score),
      variance: parseFloat(row.variance),
      stdDev: parseFloat(row.std_dev),
      judgeCount: row.judge_count,
      zeroCount: row.zero_count,
      median: row.median_score ? parseFloat(row.median_score) : null,
      skewness: row.skewness ? parseFloat(row.skewness) : null,
      kurtosis: row.kurtosis ? parseFloat(row.kurtosis) : null,
      consensusScore: row.consensus_score
        ? parseFloat(row.consensus_score)
        : null,
      computedAt: row.computed_at,
      version: row.version,
      // Raw allocations not stored in cache table — returned as empty
      allocations: [],
    }));
  }
}

// Export a singleton instance for use across the application
module.exports = new AggregationService();
