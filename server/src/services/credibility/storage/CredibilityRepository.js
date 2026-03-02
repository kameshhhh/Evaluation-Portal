// ============================================================
// CREDIBILITY REPOSITORY — Database Operations for Credibility Tables
// ============================================================
// Handles all database interactions for the credibility engine.
// Implements the REPOSITORY PATTERN — the CredibilityEngine
// orchestrator talks to this repository, never directly to DB.
//
// TABLES MANAGED:
//   - evaluator_session_signals  (per-session credibility facts)
//   - evaluator_credibility_profiles (EMA-smoothed profiles)
//   - credibility_configuration (configurable parameters)
//   - credibility_update_queue (post-aggregation queue)
//   - weighted_aggregation_results (credibility-weighted means)
//   - current_credibility_weights (materialised view)
//
// KEY FEATURES:
//   - Atomic signal storage with UPSERT (ON CONFLICT)
//   - Transaction-safe profile updates
//   - Configuration caching to reduce DB hits
//   - Materialised-view refresh after batch updates
//
// FOLLOWS EXISTING PATTERNS:
//   - Static class (same as ScarcityRepository, PersonRepository)
//   - Parameterized queries ($1, $2, ...)
//   - client-or-pool pattern for transaction support
//   - Returns domain objects or null (never throws on not-found)
// ============================================================

"use strict";

// Import database query function and client checkout
const { query, getClient } = require("../../../config/database");

// Import logger for operation tracking
const logger = require("../../../utils/logger");

// ============================================================
// CredibilityRepository — Static class for credibility DB operations
// ============================================================
class CredibilityRepository {
  // In-memory configuration cache (refreshed periodically)
  static _configCache = null;
  static _configCacheTime = null;
  static CONFIG_CACHE_TTL = 60000; // 1 minute TTL

  // ============================================================
  // SIGNAL OPERATIONS
  // ============================================================

  /**
   * Store evaluator session signals (UPSERT — insert or update on conflict).
   * Each signal captures raw credibility facts for one evaluator
   * in one session for one evaluation head.
   *
   * @param {Object} signal - Signal data to store
   * @param {string} signal.session_id - Session UUID
   * @param {string} signal.evaluator_id - Evaluator person UUID
   * @param {string} signal.head_id - Evaluation head UUID
   * @param {number} signal.alignment_deviation - Raw deviation (0-1)
   * @param {number} signal.alignment_score - Exponential decay score
   * @param {number} signal.pool_usage_ratio - Pool utilisation ratio
   * @param {number} signal.zero_allocation_ratio - Zero allocation ratio
   * @param {number} signal.discipline_score - Composite discipline score
   * @param {number} signal.allocation_variance - Allocation variance
   * @param {number} signal.allocation_skewness - Allocation skewness
   * @param {Object} signal.session_context - JSONB metadata
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object>} Inserted/updated signal row
   */
  static async storeEvaluatorSignal(signal, client = null) {
    const executor = client || { query: query };

    // Extract session context values for legacy columns
    const ctx = signal.session_context || {};

    const sql = `
      INSERT INTO evaluator_session_signals (
        session_id, evaluator_id, head_id,
        alignment_deviation, alignment_score,
        pool_usage_ratio, zero_allocation_ratio,
        discipline_score, allocation_variance, allocation_skewness,
        session_pool_size, session_target_count, session_mode,
        session_context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (session_id, evaluator_id, head_id)
      DO UPDATE SET
        alignment_deviation = EXCLUDED.alignment_deviation,
        alignment_score = EXCLUDED.alignment_score,
        pool_usage_ratio = EXCLUDED.pool_usage_ratio,
        zero_allocation_ratio = EXCLUDED.zero_allocation_ratio,
        discipline_score = EXCLUDED.discipline_score,
        allocation_variance = EXCLUDED.allocation_variance,
        allocation_skewness = EXCLUDED.allocation_skewness,
        session_pool_size = EXCLUDED.session_pool_size,
        session_target_count = EXCLUDED.session_target_count,
        session_mode = EXCLUDED.session_mode,
        session_context = EXCLUDED.session_context,
        computed_at = NOW()
      RETURNING *
    `;

    const params = [
      signal.session_id,
      signal.evaluator_id,
      signal.head_id === "null" ? null : signal.head_id || null,
      signal.alignment_deviation,
      signal.alignment_score,
      signal.pool_usage_ratio,
      signal.zero_allocation_ratio,
      signal.discipline_score,
      signal.allocation_variance || 0,
      signal.allocation_skewness || 0,
      parseFloat(ctx.pool_size) || 0,
      parseInt(ctx.target_count, 10) || 0,
      ctx.scarcity_mode || "moderate",
      JSON.stringify(signal.session_context || {}),
    ];

    const result = await executor.query(sql, params);

    logger.debug("Stored evaluator signal", {
      session_id: signal.session_id,
      evaluator_id: signal.evaluator_id,
      head_id: signal.head_id,
    });

    return result.rows[0];
  }

  /**
   * Retrieve all signals for a specific session.
   * Used by the CredibilityEngine after aggregation.
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of signal rows
   */
  static async getSessionSignals(sessionId, client = null) {
    const executor = client || { query: query };

    const sql = `
      SELECT * FROM evaluator_session_signals
      WHERE session_id = $1
      ORDER BY evaluator_id, head_id
    `;

    const result = await executor.query(sql, [sessionId]);
    return result.rows;
  }

  /**
   * Retrieve historical signals for an evaluator (across sessions).
   * Used by StabilityAnalyzer for cross-session trend analysis.
   *
   * @param {string} evaluatorId - Person UUID
   * @param {string} [headId] - Optional head UUID for head-specific history
   * @param {number} [limit] - Max sessions to retrieve (default 20)
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of signal rows ordered by computed_at ASC
   */
  static async getHistoricalSignals(
    evaluatorId,
    headId = null,
    limit = 20,
    client = null,
  ) {
    const executor = client || { query: query };

    let sql;
    let params;

    if (headId) {
      // Head-specific history
      sql = `
        SELECT ess.*, es.status as session_status, ess.session_pool_size as pool_size
        FROM evaluator_session_signals ess
        JOIN evaluation_sessions es ON es.session_id = ess.session_id
        WHERE ess.evaluator_id = $1 AND ess.head_id = $2
        ORDER BY ess.computed_at ASC
        LIMIT $3
      `;
      params = [evaluatorId, headId, limit];
    } else {
      // Global history (across all heads)
      sql = `
        SELECT ess.*, es.status as session_status, ess.session_pool_size as pool_size
        FROM evaluator_session_signals ess
        JOIN evaluation_sessions es ON es.session_id = ess.session_id
        WHERE ess.evaluator_id = $1
        ORDER BY ess.computed_at ASC
        LIMIT $2
      `;
      params = [evaluatorId, limit];
    }

    const result = await executor.query(sql, params);
    return result.rows;
  }

  /**
   * Clear all signals for a session (for re-computation).
   *
   * @param {string} sessionId - Session UUID
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<number>} Number of rows deleted
   */
  static async clearSessionSignals(sessionId, client = null) {
    const executor = client || { query: query };

    const sql = `DELETE FROM evaluator_session_signals WHERE session_id = $1`;
    const result = await executor.query(sql, [sessionId]);

    logger.debug("Cleared session signals", {
      session_id: sessionId,
      deleted: result.rowCount,
    });

    return result.rowCount;
  }

  // ============================================================
  // PROFILE OPERATIONS
  // ============================================================

  /**
   * Get evaluator's credibility profile.
   * Uses composite key (evaluator_id, head_id).
   * head_id = NULL means global profile (sentinel UUID used in PK).
   *
   * @param {string} evaluatorId - Person UUID
   * @param {string} [headId] - Optional head UUID; null = global profile
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object|null>} Profile row or null
   */
  static async getEvaluatorProfile(evaluatorId, headId = null, client = null) {
    const executor = client || { query: query };

    let sql;
    let params;

    if (headId) {
      sql = `
        SELECT * FROM evaluator_credibility_profiles
        WHERE evaluator_id = $1 AND head_id = $2
      `;
      params = [evaluatorId, headId];
    } else {
      sql = `
        SELECT * FROM evaluator_credibility_profiles
        WHERE evaluator_id = $1 AND head_id IS NULL
      `;
      params = [evaluatorId];
    }

    const result = await executor.query(sql, params);
    return result.rows[0] || null;
  }

  /**
   * Update or create an evaluator's credibility profile.
   * Uses UPSERT pattern with computed composite PK.
   *
   * @param {Object} profile - Profile data
   * @param {string} profile.evaluator_id - Person UUID
   * @param {string|null} profile.head_id - Evaluation head UUID or null (global)
   * @param {number} profile.credibility_score - Current EMA score (0-1)
   * @param {string} profile.credibility_band - HIGH / MEDIUM / LOW
   * @param {Object} profile.signal_components - JSONB signal breakdown
   * @param {Object} profile.longitudinal_metrics - JSONB stability/trend data
   * @param {Object} profile.behavior_patterns - JSONB detected patterns
   * @param {number} profile.sessions_evaluated - Total sessions count
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object>} Upserted profile row
   */
  static async upsertEvaluatorProfile(profile, client = null) {
    const executor = client || { query: query };

    const sql = `
      INSERT INTO evaluator_credibility_profiles (
        evaluator_id, head_id,
        credibility_score, credibility_band,
        alignment_component, stability_component, discipline_component,
        session_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (evaluator_id)
      DO UPDATE SET
        credibility_score = EXCLUDED.credibility_score,
        credibility_band = EXCLUDED.credibility_band,
        alignment_component = EXCLUDED.alignment_component,
        stability_component = EXCLUDED.stability_component,
        discipline_component = EXCLUDED.discipline_component,
        session_count = EXCLUDED.session_count,
        updated_at = NOW()
      RETURNING *
    `;

    const params = [
      profile.evaluator_id,
      profile.head_id || null,
      profile.credibility_score,
      profile.credibility_band,
      profile.alignment_component || profile.signal_components?.alignment || 0,
      profile.stability_component || profile.signal_components?.stability || 0,
      profile.discipline_component ||
        profile.signal_components?.discipline ||
        0,
      profile.sessions_evaluated || profile.session_count || 0,
    ];

    const result = await executor.query(sql, params);

    logger.debug("Upserted evaluator profile", {
      evaluator_id: profile.evaluator_id,
      head_id: profile.head_id,
      score: profile.credibility_score,
      band: profile.credibility_band,
    });

    return result.rows[0];
  }

  /**
   * Get all credibility profiles (for admin dashboard listing).
   * Joins with persons table for display names.
   *
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.band] - Filter by credibility band
   * @param {number} [filters.limit] - Max results (default 100)
   * @param {number} [filters.offset] - Pagination offset
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of profile rows with person info
   */
  static async getAllProfiles(filters = {}, client = null) {
    const executor = client || { query: query };
    const params = [];
    let whereClause = "WHERE 1=1";

    // Optional band filter
    if (filters.band) {
      params.push(filters.band);
      whereClause += ` AND ecp.credibility_band = $${params.length}`;
    }

    // Only global profiles (head_id IS NULL)
    if (filters.globalOnly) {
      whereClause += " AND ecp.head_id IS NULL";
    }

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    params.push(limit, offset);

    const sql = `
      SELECT ecp.*, p.display_name as evaluator_name
      FROM evaluator_credibility_profiles ecp
      LEFT JOIN persons p ON p.person_id = ecp.evaluator_id
      ${whereClause}
      ORDER BY ecp.credibility_score DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await executor.query(sql, params);
    return result.rows;
  }

  // ============================================================
  // CONFIGURATION OPERATIONS
  // ============================================================

  /**
   * Retrieve all credibility configuration as key→value map.
   * Uses an in-memory cache with 1-minute TTL.
   *
   * @param {boolean} [forceRefresh] - Bypass cache
   * @returns {Promise<Object>} Configuration map {config_key: config_value}
   */
  static async getConfiguration(forceRefresh = false) {
    // Return cached config if still fresh
    if (
      !forceRefresh &&
      this._configCache &&
      Date.now() - this._configCacheTime < this.CONFIG_CACHE_TTL
    ) {
      return this._configCache;
    }

    const sql = `SELECT config_key, config_value FROM credibility_configuration`;
    const result = await query(sql);

    // Build key→value map (values are JSONB, returned as objects)
    const config = {};
    for (const row of result.rows) {
      config[row.config_key] = row.config_value;
    }

    // Update cache
    this._configCache = config;
    this._configCacheTime = Date.now();

    logger.debug("Refreshed credibility configuration cache", {
      keys: Object.keys(config).length,
    });

    return config;
  }

  /**
   * Update a single configuration value.
   * Admin-only operation. Invalidates cache.
   *
   * @param {string} key - Configuration key
   * @param {Object} value - New value (will be stored as JSONB)
   * @returns {Promise<Object>} Updated row
   */
  static async updateConfiguration(key, value) {
    const sql = `
      UPDATE credibility_configuration
      SET config_value = $2, updated_at = NOW()
      WHERE config_key = $1
      RETURNING *
    `;

    const result = await query(sql, [key, JSON.stringify(value)]);

    // Invalidate cache
    this._configCache = null;
    this._configCacheTime = null;

    logger.info("Updated credibility configuration", { key });

    return result.rows[0] || null;
  }

  // ============================================================
  // QUEUE OPERATIONS
  // ============================================================

  /**
   * Enqueue a session for credibility processing.
   * Called after session aggregation is complete.
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Queue entry
   */
  static async enqueueSession(sessionId) {
    const sql = `
      INSERT INTO credibility_update_queue (session_id)
      VALUES ($1)
      ON CONFLICT (session_id)
      DO UPDATE SET processed = false, queued_at = NOW()
      RETURNING *
    `;

    const result = await query(sql, [sessionId]);
    return result.rows[0];
  }

  /**
   * Get all unprocessed sessions from the queue.
   *
   * @returns {Promise<Array>} Array of queued session entries
   */
  static async getUnprocessedQueue() {
    const sql = `
      SELECT cuq.*, es.title as session_title, es.status as session_status
      FROM credibility_update_queue cuq
      JOIN evaluation_sessions es ON es.session_id = cuq.session_id
      WHERE cuq.processed = false
      ORDER BY cuq.queued_at ASC
    `;

    const result = await query(sql);
    return result.rows;
  }

  /**
   * Mark a queued session as processed.
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} Updated queue entry
   */
  static async markProcessed(sessionId) {
    const sql = `
      UPDATE credibility_update_queue
      SET processed = true, processed_at = NOW()
      WHERE session_id = $1
      RETURNING *
    `;

    const result = await query(sql, [sessionId]);
    return result.rows[0];
  }

  // ============================================================
  // WEIGHTED AGGREGATION OPERATIONS
  // ============================================================

  /**
   * Store credibility-weighted aggregation result.
   * UPSERT: replaces existing result for same session/head/target.
   *
   * @param {Object} result - Weighted aggregation result
   * @param {string} result.session_id - Session UUID
   * @param {string} result.head_id - Evaluation head UUID
   * @param {string} result.target_id - Target person UUID
   * @param {number} result.weighted_mean - Credibility-weighted mean
   * @param {number} result.raw_mean - Unweighted mean
   * @param {number} result.weighting_effect - Difference (weighted - raw)
   * @param {number} result.effective_evaluator_count - Sum of weights
   * @param {Object} result.evaluator_weights - JSONB weight breakdown
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object>} Stored result row
   */
  static async storeWeightedResult(result, client = null) {
    const executor = client || { query: query };

    const sql = `
      INSERT INTO weighted_aggregation_results (
        session_id, head_id, target_id,
        weighted_mean, raw_mean, weighting_effect,
        effective_evaluator_count, evaluator_weights
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (session_id, head_id, target_id)
      DO UPDATE SET
        weighted_mean = EXCLUDED.weighted_mean,
        raw_mean = EXCLUDED.raw_mean,
        weighting_effect = EXCLUDED.weighting_effect,
        effective_evaluator_count = EXCLUDED.effective_evaluator_count,
        evaluator_weights = EXCLUDED.evaluator_weights,
        computed_at = NOW()
      RETURNING *
    `;

    const params = [
      result.session_id,
      result.head_id,
      result.target_id,
      result.weighted_mean,
      result.raw_mean,
      result.weighting_effect,
      result.effective_evaluator_count,
      JSON.stringify(result.evaluator_weights || {}),
    ];

    const res = await executor.query(sql, params);
    return res.rows[0];
  }

  /**
   * Get weighted results for a session (optionally filtered by head).
   *
   * @param {string} sessionId - Session UUID
   * @param {string} [headId] - Optional head UUID filter
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of weighted result rows
   */
  static async getWeightedResults(sessionId, headId = null, client = null) {
    const executor = client || { query: query };

    let sql;
    let params;

    if (headId) {
      sql = `
        SELECT war.*, p.display_name as target_name
        FROM weighted_aggregation_results war
        LEFT JOIN persons p ON p.person_id = war.target_id
        WHERE war.session_id = $1 AND war.head_id = $2
        ORDER BY war.weighted_mean DESC
      `;
      params = [sessionId, headId];
    } else {
      sql = `
        SELECT war.*, p.display_name as target_name
        FROM weighted_aggregation_results war
        LEFT JOIN persons p ON p.person_id = war.target_id
        WHERE war.session_id = $1
        ORDER BY war.head_id, war.weighted_mean DESC
      `;
      params = [sessionId];
    }

    const result = await executor.query(sql, params);
    return result.rows;
  }

  // ============================================================
  // MATERIALISED VIEW OPERATIONS
  // ============================================================

  /**
   * Refresh the current_credibility_weights materialised view.
   * Should be called after batch profile updates.
   *
   * @returns {Promise<void>}
   */
  static async refreshWeightsView() {
    await query(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY current_credibility_weights",
    );

    logger.info("Refreshed current_credibility_weights materialised view");
  }

  /**
   * Get current credibility weights for all evaluators.
   * Reads from the materialised view for fast access.
   *
   * @returns {Promise<Array>} Array of {evaluator_id, credibility_weight, band}
   */
  static async getCurrentWeights() {
    const sql = `
      SELECT * FROM current_credibility_weights
      ORDER BY credibility_weight DESC
    `;

    const result = await query(sql);
    return result.rows;
  }

  /**
   * Get credibility weight for a specific evaluator.
   * Falls back to default 0.5 if not found (new evaluators).
   *
   * @param {string} evaluatorId - Person UUID
   * @returns {Promise<Object>} Weight record or default
   */
  static async getEvaluatorWeight(evaluatorId) {
    const sql = `
      SELECT * FROM current_credibility_weights
      WHERE evaluator_id = $1
    `;

    const result = await query(sql, [evaluatorId]);

    if (result.rows[0]) {
      return result.rows[0];
    }

    // Default for new evaluators
    return {
      evaluator_id: evaluatorId,
      credibility_weight: 0.5,
      credibility_band: "MEDIUM",
      sessions_evaluated: 0,
    };
  }

  // ============================================================
  // UTILITY OPERATIONS
  // ============================================================

  /**
   * Get evaluator session count (number of distinct sessions
   * for which we have signals).
   *
   * @param {string} evaluatorId - Person UUID
   * @returns {Promise<number>} Session count
   */
  static async getEvaluatorSessionCount(evaluatorId) {
    const sql = `
      SELECT COUNT(DISTINCT session_id) as session_count
      FROM evaluator_session_signals
      WHERE evaluator_id = $1
    `;

    const result = await query(sql, [evaluatorId]);
    return parseInt(result.rows[0]?.session_count || "0", 10);
  }

  /**
   * Get session evaluator data for credibility processing.
   * Fetches allocations and aggregated results needed by analyzers.
   *
   * @param {string} sessionId - Session UUID
   * @returns {Promise<Object>} { evaluators, allocations, aggregatedResults, session }
   */
  static async getSessionDataForProcessing(sessionId) {
    const client = await getClient();
    try {
      // 1. Session metadata
      const sessionResult = await client.query(
        `SELECT session_id, session_type, status, scarcity_pool_size, evaluation_mode, intent
         FROM evaluation_sessions WHERE session_id = $1`,
        [sessionId],
      );
      const session = sessionResult.rows[0];

      if (!session) {
        return null;
      }

      // 2. Evaluators for this session
      const evaluatorsResult = await client.query(
        `SELECT DISTINCT sa.evaluator_id, p.display_name
         FROM scarcity_allocations sa
         LEFT JOIN persons p ON p.person_id = sa.evaluator_id
         WHERE sa.session_id = $1`,
        [sessionId],
      );

      // 3. All allocations for this session
      const allocationsResult = await client.query(
        `SELECT sa.evaluator_id, sa.target_id, sa.head_id, sa.points
         FROM scarcity_allocations sa
         WHERE sa.session_id = $1`,
        [sessionId],
      );

      // 4. Aggregated results for this session (from Step 4)
      const aggregatedResult = await client.query(
        `SELECT war.head_id, war.target_id,
                war.raw_mean as mean_score, war.weighted_mean,
                war.weighting_effect, war.evaluator_count
         FROM weighted_aggregation_results war
         WHERE war.session_id = $1`,
        [sessionId],
      );

      return {
        session,
        evaluators: evaluatorsResult.rows,
        allocations: allocationsResult.rows,
        aggregatedResults: aggregatedResult.rows,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Clear the configuration cache (for testing or admin reset).
   */
  static clearConfigCache() {
    this._configCache = null;
    this._configCacheTime = null;
  }
}

module.exports = CredibilityRepository;
