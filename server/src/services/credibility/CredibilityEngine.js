// ============================================================
// CREDIBILITY ENGINE — Master Orchestrator
// ============================================================
// Implements SRS 5.1 "Credibility Engine Pipeline":
//   The brain of the trust layer. Coordinates the full pipeline:
//   1. Validate session eligibility (must be aggregated/locked)
//   2. Fetch all session data from repository
//   3. Group allocations by evaluation head
//   4. For each evaluator × head: run three analyzers
//   5. Composite signal fusion via CredibilityCompositor
//   6. EMA smoothing via TemporalSmoother
//   7. Persist signals + updated profiles
//   8. Refresh materialised weight view
//
// ENTRY POINTS:
//   • processSession(sessionId)   — single session (post-aggregation)
//   • batchRecalculate()          — admin-triggered full recalc
//   • processQueue()              — process all unprocessed queue items
//
// SINGLETON — module.exports = new CredibilityEngine()
// ============================================================

"use strict";

// Analyzers (pure-logic, no DB)
const AlignmentAnalyzer = require("./analyzers/AlignmentAnalyzer");
const StabilityAnalyzer = require("./analyzers/StabilityAnalyzer");
const DisciplineAnalyzer = require("./analyzers/DisciplineAnalyzer");

// Compositors (pure-logic, no DB)
const CredibilityCompositor = require("./compositors/CredibilityCompositor");
const TemporalSmoother = require("./compositors/TemporalSmoother");

// Data access
const CredibilityRepository = require("./storage/CredibilityRepository");

// Logger
const logger = require("../../utils/logger");

// ============================================================
// Custom error class for credibility engine failures
// ============================================================
class CredibilityEngineError extends Error {
  constructor(message, code = "CREDIBILITY_ENGINE_ERROR", details = {}) {
    super(message);
    this.name = "CredibilityEngineError";
    this.code = code;
    this.details = details;
  }
}

class CredibilityEngine {
  constructor() {
    // Configuration will be loaded from DB on first use
    this._config = null;
  }

  // ============================================================
  // PUBLIC: processSession
  // ============================================================
  // Main pipeline for a single session. Called after session
  // aggregation is complete (status = aggregated or locked).
  //
  // @param {string} sessionId - UUID of the session to process
  // @returns {Promise<Object>} Processing summary
  // ============================================================
  async processSession(sessionId) {
    logger.info("CredibilityEngine: Starting session processing", {
      sessionId,
    });

    // 1. Load configuration from DB (cached)
    const config = await this._loadConfig();

    // 2. Fetch all session data from DB
    const sessionData =
      await CredibilityRepository.getSessionDataForProcessing(sessionId);

    if (!sessionData) {
      throw new CredibilityEngineError(
        `Session not found: ${sessionId}`,
        "SESSION_NOT_FOUND",
      );
    }

    // 3. Validate session status — must be aggregated or locked
    const validStatuses = ["aggregated", "locked"];
    if (!validStatuses.includes(sessionData.session.status)) {
      throw new CredibilityEngineError(
        `Session ${sessionId} is not eligible for credibility processing (status: ${sessionData.session.status})`,
        "INVALID_SESSION_STATUS",
        { status: sessionData.session.status, required: validStatuses },
      );
    }

    // 4. Build aggregated means lookup {head_id → {target_id → {mean, variance, ...}}}
    const aggregatedMeansMap = this._buildAggregatedMeansMap(
      sessionData.aggregatedResults,
    );

    // 5. Group allocations by evaluator → head → targets
    const allocationsByEvaluator = this._groupAllocationsByEvaluator(
      sessionData.allocations,
    );

    // 6. Process each evaluator
    const results = [];
    const errors = [];

    for (const evaluator of sessionData.evaluators) {
      try {
        const evaluatorResult = await this._processEvaluator({
          evaluatorId: evaluator.evaluator_id,
          evaluatorName: evaluator.full_name,
          session: sessionData.session,
          allocations: allocationsByEvaluator[evaluator.evaluator_id] || {},
          aggregatedMeansMap,
          config,
        });

        results.push(evaluatorResult);
      } catch (err) {
        logger.error("CredibilityEngine: Error processing evaluator", {
          evaluatorId: evaluator.evaluator_id,
          sessionId,
          error: err.message,
        });
        errors.push({
          evaluator_id: evaluator.evaluator_id,
          error: err.message,
        });
      }
    }

    // 7. Refresh materialised view after all updates
    try {
      await CredibilityRepository.refreshWeightsView();
    } catch (err) {
      // Non-fatal — view refresh can fail if no data yet
      logger.warn("CredibilityEngine: Failed to refresh weights view", {
        error: err.message,
      });
    }

    // 8. Mark session as processed in queue
    await CredibilityRepository.markProcessed(sessionId);

    const summary = {
      session_id: sessionId,
      evaluators_processed: results.length,
      evaluators_failed: errors.length,
      total_signals_stored: results.reduce(
        (sum, r) => sum + r.signals_stored,
        0,
      ),
      profiles_updated: results.reduce(
        (sum, r) => sum + (r.profile_updated ? 1 : 0),
        0,
      ),
      errors: errors.length > 0 ? errors : undefined,
    };

    logger.info("CredibilityEngine: Session processing complete", summary);

    return summary;
  }

  // ============================================================
  // PUBLIC: processQueue
  // ============================================================
  // Process all unprocessed sessions in the queue.
  // Used by a scheduled job or admin-triggered batch.
  //
  // @returns {Promise<Object>} Queue processing summary
  // ============================================================
  async processQueue() {
    logger.info("CredibilityEngine: Processing queue");

    const queueItems = await CredibilityRepository.getUnprocessedQueue();

    if (queueItems.length === 0) {
      logger.info("CredibilityEngine: Queue is empty");
      return { sessions_processed: 0, errors: [] };
    }

    const results = [];
    const errors = [];

    for (const item of queueItems) {
      try {
        const result = await this.processSession(item.session_id);
        results.push(result);
      } catch (err) {
        logger.error("CredibilityEngine: Queue item failed", {
          sessionId: item.session_id,
          error: err.message,
        });
        errors.push({
          session_id: item.session_id,
          error: err.message,
        });
      }
    }

    return {
      sessions_processed: results.length,
      sessions_failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ============================================================
  // PUBLIC: batchRecalculate
  // ============================================================
  // Admin-only: Recalculate credibility for all evaluators
  // by re-processing all historical sessions in chronological order.
  //
  // WARNING: This is an expensive operation. Should be used rarely.
  //
  // @returns {Promise<Object>} Recalculation summary
  // ============================================================
  async batchRecalculate() {
    logger.info("CredibilityEngine: Starting batch recalculation");

    const { query: dbQuery } = require("../../config/database");

    // Get all aggregated sessions in chronological order
    const sessionsResult = await dbQuery(
      `SELECT session_id FROM evaluation_sessions
       WHERE status IN ('aggregated', 'locked')
       ORDER BY created_at ASC`,
    );

    const sessions = sessionsResult.rows;

    if (sessions.length === 0) {
      return {
        sessions_recalculated: 0,
        message: "No eligible sessions found",
      };
    }

    // Clear all existing signals and profiles for a clean recalculation
    await dbQuery("TRUNCATE evaluator_session_signals CASCADE");
    await dbQuery("TRUNCATE evaluator_credibility_profiles CASCADE");
    await dbQuery("TRUNCATE weighted_aggregation_results CASCADE");

    logger.info("CredibilityEngine: Cleared existing data for fresh recalc", {
      sessions_to_process: sessions.length,
    });

    // Re-process each session in order
    const results = [];
    const errors = [];

    for (const session of sessions) {
      try {
        const result = await this.processSession(session.session_id);
        results.push(result);
      } catch (err) {
        logger.error("CredibilityEngine: Batch recalc session failed", {
          sessionId: session.session_id,
          error: err.message,
        });
        errors.push({
          session_id: session.session_id,
          error: err.message,
        });
      }
    }

    return {
      sessions_recalculated: results.length,
      sessions_failed: errors.length,
      total_evaluators_updated: results.reduce(
        (sum, r) => sum + r.evaluators_processed,
        0,
      ),
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ============================================================
  // PRIVATE: _processEvaluator
  // ============================================================
  // Full pipeline for a single evaluator in a single session:
  //   1. Compute alignment signal per head
  //   2. Compute discipline signal per head
  //   3. Fetch historical signals for stability analysis
  //   4. Composite signals
  //   5. EMA-smooth the profile
  //   6. Persist signals + updated profile
  // ============================================================
  async _processEvaluator({
    evaluatorId,
    evaluatorName,
    session,
    allocations,
    aggregatedMeansMap,
    config,
  }) {
    const signalWeights = config.signal_weights || {
      alignment: 0.5,
      stability: 0.3,
      discipline: 0.2,
    };
    const emaParams = config.ema_parameters || { alpha: 0.2, min_sessions: 3 };

    let signalsStored = 0;
    const headSignals = {};

    // Process each evaluation head separately
    const headIds = new Set([
      ...Object.keys(allocations),
      ...Object.keys(aggregatedMeansMap),
    ]);

    for (const headId of headIds) {
      // Evaluator's allocations for this head
      const evaluatorAllocations = allocations[headId] || [];
      // Aggregated means for this head
      const aggregatedMeans = aggregatedMeansMap[headId] || {};

      // Skip heads where evaluator made no allocations
      if (evaluatorAllocations.length === 0) continue;

      // ---- ALIGNMENT ANALYSIS ----
      const alignmentResult = AlignmentAnalyzer.analyze({
        evaluatorAllocations,
        aggregatedMeans,
        poolSize: parseFloat(session.pool_size),
        targetCount: Object.keys(aggregatedMeans).length,
      });

      // ---- DISCIPLINE ANALYSIS ----
      const disciplineResult = DisciplineAnalyzer.analyze({
        allocations: evaluatorAllocations,
        poolSize: parseFloat(session.pool_size),
        scarcityMode: session.scarcity_mode || "moderate",
        targetCount: Object.keys(aggregatedMeans).length,
      });

      // ---- STORE PER-HEAD SIGNAL ----
      const signalData = {
        session_id: session.session_id,
        evaluator_id: evaluatorId,
        head_id: headId,
        alignment_deviation: alignmentResult.deviation,
        alignment_score: alignmentResult.score,
        pool_usage_ratio: disciplineResult.pool_usage_ratio,
        zero_allocation_ratio: disciplineResult.zero_allocation_ratio,
        discipline_score: disciplineResult.discipline_score,
        allocation_variance: alignmentResult.variance,
        allocation_skewness: 0, // Computed if needed later
        session_context: {
          pool_size: session.pool_size,
          scarcity_mode: session.scarcity_mode,
          target_count: Object.keys(aggregatedMeans).length,
          alignment_metadata: alignmentResult.metadata,
          discipline_patterns: disciplineResult.patterns,
        },
      };

      await CredibilityRepository.storeEvaluatorSignal(signalData);
      signalsStored++;

      headSignals[headId] = {
        alignment: alignmentResult,
        discipline: disciplineResult,
      };
    }

    // ---- STABILITY ANALYSIS (cross-session) ----
    // Fetch historical signals for this evaluator
    const historicalSignals =
      await CredibilityRepository.getHistoricalSignals(evaluatorId);

    const stabilityResult = StabilityAnalyzer.analyze({
      historicalSignals,
      config: { minSessions: emaParams.min_sessions || 3 },
    });

    // ---- COMPOSITE SCORE (aggregate across heads) ----
    // Average alignment and discipline scores across all heads
    const headEntries = Object.values(headSignals);
    let avgAlignment = 0.5;
    let avgDiscipline = 0.5;

    if (headEntries.length > 0) {
      avgAlignment =
        headEntries.reduce((sum, h) => sum + h.alignment.score, 0) /
        headEntries.length;
      avgDiscipline =
        headEntries.reduce((sum, h) => sum + h.discipline.discipline_score, 0) /
        headEntries.length;
    }

    const compositeResult = CredibilityCompositor.compose({
      signals: {
        alignment_score: avgAlignment,
        stability_score: stabilityResult.stability_score,
        discipline_score: avgDiscipline,
      },
      weights: signalWeights,
    });

    // ---- EMA SMOOTHING ----
    // Get existing profile for this evaluator
    const existingProfile =
      await CredibilityRepository.getEvaluatorProfile(evaluatorId);
    const sessionCount =
      await CredibilityRepository.getEvaluatorSessionCount(evaluatorId);

    const smoothedResult = TemporalSmoother.smooth({
      currentProfile: existingProfile?.credibility_score ?? null,
      newComposite: compositeResult.composite_score,
      sessionCount,
      config: {
        alpha: emaParams.alpha || 0.2,
        minSessions: emaParams.min_sessions || 3,
        maxChange: config.collusion_safeguards?.max_change || 0.15,
        startScore: config.collusion_safeguards?.start_score || 0.5,
      },
    });

    // ---- PERSIST UPDATED PROFILE ----
    await CredibilityRepository.upsertEvaluatorProfile({
      evaluator_id: evaluatorId,
      head_id: null, // Global profile
      credibility_score: smoothedResult.smoothed_score,
      credibility_band: smoothedResult.band,
      signal_components: compositeResult.signal_components,
      longitudinal_metrics: {
        stability_score: stabilityResult.stability_score,
        trend_direction: stabilityResult.trend_direction,
        trend_strength: stabilityResult.trend_strength,
        pattern: stabilityResult.pattern,
        sessions_analyzed: stabilityResult.sessions_analyzed,
      },
      behavior_patterns: {
        composite_flags: compositeResult.flags,
        stability_pattern: stabilityResult.pattern,
        is_established: stabilityResult.is_established,
      },
      sessions_evaluated: sessionCount,
    });

    logger.debug("CredibilityEngine: Evaluator processed", {
      evaluatorId,
      evaluatorName,
      score: smoothedResult.smoothed_score,
      band: smoothedResult.band,
      signalsStored,
    });

    return {
      evaluator_id: evaluatorId,
      signals_stored: signalsStored,
      profile_updated: true,
      credibility_score: smoothedResult.smoothed_score,
      credibility_band: smoothedResult.band,
      composite: compositeResult.composite_score,
      alignment_avg: avgAlignment,
      stability: stabilityResult.stability_score,
      discipline_avg: avgDiscipline,
    };
  }

  // ============================================================
  // PRIVATE: _buildAggregatedMeansMap
  // ============================================================
  // Transforms flat aggregated_results array into nested lookup:
  //   { head_id → { target_id → { mean, variance, consensus } } }
  // ============================================================
  _buildAggregatedMeansMap(aggregatedResults) {
    const map = {};

    for (const row of aggregatedResults) {
      if (!map[row.head_id]) {
        map[row.head_id] = {};
      }

      map[row.head_id][row.target_id] = {
        mean: parseFloat(row.mean_score),
        variance: parseFloat(row.variance || 0),
        consensus_score: parseFloat(row.consensus_score || 0),
      };
    }

    return map;
  }

  // ============================================================
  // PRIVATE: _groupAllocationsByEvaluator
  // ============================================================
  // Transforms flat allocations array into nested lookup:
  //   { evaluator_id → { head_id → [{target_id, points}] } }
  // ============================================================
  _groupAllocationsByEvaluator(allocations) {
    const map = {};

    for (const alloc of allocations) {
      if (!map[alloc.evaluator_id]) {
        map[alloc.evaluator_id] = {};
      }

      if (!map[alloc.evaluator_id][alloc.head_id]) {
        map[alloc.evaluator_id][alloc.head_id] = [];
      }

      map[alloc.evaluator_id][alloc.head_id].push({
        target_id: alloc.target_id,
        points: parseFloat(alloc.points),
      });
    }

    return map;
  }

  // ============================================================
  // PRIVATE: _loadConfig
  // ============================================================
  // Loads credibility configuration from DB (cached by repository).
  // Returns a flattened config object with sensible defaults.
  // ============================================================
  async _loadConfig() {
    try {
      const rawConfig = await CredibilityRepository.getConfiguration();

      return {
        signal_weights: rawConfig.signal_weights || {
          alignment: 0.5,
          stability: 0.3,
          discipline: 0.2,
        },
        ema_parameters: rawConfig.ema_parameters || {
          alpha: 0.2,
          min_sessions: 3,
        },
        band_thresholds: rawConfig.band_thresholds || {
          high: 0.75,
          medium: 0.45,
        },
        alignment_config: rawConfig.alignment_config || {
          decay_rate: 5.0,
          min_score: 0.1,
        },
        discipline_config: rawConfig.discipline_config || {
          pool_usage_weight: 0.25,
          zero_weight: 0.25,
          gini_weight: 0.25,
          tradeoff_weight: 0.25,
        },
        stability_config: rawConfig.stability_config || {
          gamma: 3.0,
          min_sessions: 3,
        },
        collusion_safeguards: rawConfig.collusion_safeguards || {
          max_change: 0.15,
          start_score: 0.5,
          grace_sessions: 2,
        },
      };
    } catch (err) {
      logger.warn("CredibilityEngine: Failed to load config, using defaults", {
        error: err.message,
      });

      // Return defaults if DB config unavailable
      return {
        signal_weights: { alignment: 0.5, stability: 0.3, discipline: 0.2 },
        ema_parameters: { alpha: 0.2, min_sessions: 3 },
        band_thresholds: { high: 0.75, medium: 0.45 },
        alignment_config: { decay_rate: 5.0, min_score: 0.1 },
        discipline_config: {
          pool_usage_weight: 0.25,
          zero_weight: 0.25,
          gini_weight: 0.25,
          tradeoff_weight: 0.25,
        },
        stability_config: { gamma: 3.0, min_sessions: 3 },
        collusion_safeguards: {
          max_change: 0.15,
          start_score: 0.5,
          grace_sessions: 2,
        },
      };
    }
  }
}

module.exports = new CredibilityEngine();
module.exports.CredibilityEngineError = CredibilityEngineError;
module.exports.CredibilityEngine = CredibilityEngine;
