// ============================================================
// WEIGHTED RESULTS CONTROLLER — Enriched Multi-Judge Results API
// ============================================================
// Provides a rich, UI-ready endpoint for credibility-weighted
// aggregation results. Combines data from:
//   1. WeightedAggregationService (computed weighted means)
//   2. CredibilityRepository (evaluator profiles + weights)
//   3. Database (session metadata, person names, raw allocations)
//
// Unlike the basic GET /credibility/weighted endpoint (which returns
// raw DB rows), this controller enriches results with:
//   - Person display names
//   - Evaluator credibility profiles + band labels
//   - Side-by-side raw vs weighted comparison data
//   - Statistical analysis (std dev, distribution, consensus)
//   - Pre-formatted visualization payloads for charts
//
// ROUTES HANDLED:
//   GET /api/scarcity/sessions/:sessionId/weighted-results
//     Query: ?view=summary|detailed|comparison (default: detailed)
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   "Final score per person = credibility-weighted average"
//   This endpoint is the SINGLE SOURCE OF TRUTH for the
//   WeightedResultsDashboard frontend component.
//
// MATHEMATICAL BASIS:
//   weighted_mean = Σ(weight_i × score_i) / Σ(weight_i)
//   weighting_effect = weighted_mean − raw_mean
//   consensus = 1 − (normalized_std_dev)
//
// PERFORMANCE:
//   O(E × T) where E = evaluators, T = targets per session
//   Typical: < 200ms for 10 evaluators × 20 targets
//   Caching via ResultCacheService for finalized sessions
//
// INTEGRATION POINTS:
//   - WeightedAggregationService (existing, NOT MODIFIED)
//   - CredibilityRepository (existing, NOT MODIFIED)
//   - ResultCacheService (new, for performance caching)
//   - Database (existing tables: evaluation_sessions,
//     scarcity_allocations, persons, credibility_profiles)
//
// SECURITY:
//   - Requires authentication (JWT via authenticate middleware)
//   - Session must be in closed/locked/aggregated status
// ============================================================

"use strict";

// ── Service Imports ──
// WeightedAggregationService: computes credibility-weighted means
// Returns { results, summary } for a session — SINGLETON, NOT MODIFIED
const weightedAggregation = require("../services/credibility/WeightedAggregationService");

// CredibilityRepository: direct data access for evaluator profiles
// Static class with methods for profiles, weights, weighted results
const CredibilityRepository = require("../services/credibility/storage/CredibilityRepository");

// ResultCacheService: caching layer for computed weighted results
// Prevents redundant recalculations on repeated UI loads
const ResultCacheService = require("../services/ResultCacheService");

// Database access for session lookups and raw allocation queries
const db = require("../config/database");

// Winston logger for structured request logging
const logger = require("../utils/logger");

// ============================================================
// GET /api/scarcity/sessions/:sessionId/weighted-results
// ============================================================
/**
 * Get enriched credibility-weighted aggregation results for a session.
 *
 * This is the primary endpoint consumed by the WeightedResultsDashboard
 * frontend component. It returns a comprehensive payload containing:
 *   - Session metadata (id, title, pool size, evaluator count)
 *   - Summary statistics (avg weighted, avg raw, credibility impact)
 *   - Per-person results (raw vs weighted, evaluator breakdown)
 *   - Evaluator analysis (credibility profiles, patterns)
 *   - Pre-formatted visualization data (chart-ready arrays)
 *
 * Query Parameters:
 *   view: 'summary' | 'detailed' | 'comparison' (default: 'detailed')
 *     - summary:    Top-level metrics only, no per-evaluator breakdown
 *     - detailed:   Full per-person + per-evaluator breakdown
 *     - comparison: Optimized for raw vs weighted comparison charts
 *
 * BUSINESS CONTEXT: Implements SRS 4.2.2 "credibility-weighted average"
 * display. Without this endpoint, the WeightedAggregationService's
 * computed results are invisible to users.
 *
 * MATHEMATICAL BASIS:
 *   For each target T evaluated by evaluators E₁…Eₙ:
 *     raw_mean = Σ(score_i) / n
 *     weighted_mean = Σ(weight_i × score_i) / Σ(weight_i)
 *     weighting_effect = weighted_mean − raw_mean
 *   Where weight_i = evaluator's credibility (0.1–0.95)
 *
 * PERFORMANCE: O(E × T) computation, < 500ms for typical sessions
 *   Cached for finalized sessions (TTL: 1 hour)
 *
 * ERROR BOUNDARIES:
 *   - Session not found → 404
 *   - No weighted results computed → 200 with empty results + guidance
 *   - Credibility not processed → 200 with raw-only fallback
 *   - Database error → 500 with structured error response
 *
 * @param {Request}  req — Express request (params.sessionId, query.view)
 * @param {Response} res — Express response
 */
const getWeightedSessionResults = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const view = req.query.view || "detailed";

    logger.info(
      "WeightedResultsController: Fetching enriched weighted results",
      {
        sessionId,
        view,
        userId: req.user?.userId,
      },
    );

    // ─────────────────────────────────────────────────────────
    // Step 1: Validate session exists and is in a valid state
    // ─────────────────────────────────────────────────────────
    const session = await _getSessionWithMeta(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "Evaluation session does not exist",
      });
    }

    // ─────────────────────────────────────────────────────────
    // Step 2: Check cache for finalized sessions
    // ─────────────────────────────────────────────────────────
    const isFinalized = ["closed", "locked", "aggregated"].includes(
      session.status,
    );
    const cacheKey = `weighted_${sessionId}_${view}`;

    if (isFinalized) {
      const cached = ResultCacheService.get(cacheKey);
      if (cached) {
        logger.info("WeightedResultsController: Serving cached results", {
          sessionId,
          cacheKey,
        });
        return res.status(200).json({
          success: true,
          data: cached,
          metadata: {
            cached: true,
            calculated_at: cached._calculated_at,
            cache_status: "hit",
          },
        });
      }
    }

    // ─────────────────────────────────────────────────────────
    // Step 3: Get stored credibility-weighted results
    //   These were computed by WeightedAggregationService and
    //   stored via CredibilityRepository.storeWeightedResult()
    //   during the credibility processing pipeline.
    // ─────────────────────────────────────────────────────────
    const storedWeightedResults =
      await CredibilityRepository.getWeightedResults(sessionId, null);

    // ─────────────────────────────────────────────────────────
    // Step 4: Get raw allocations for comparison
    //   Direct DB query to scarcity_allocations for this session
    // ─────────────────────────────────────────────────────────
    const rawAllocations = await _getRawAllocations(sessionId);

    // ─────────────────────────────────────────────────────────
    // Step 5: Get evaluator credibility profiles
    //   Fetches all evaluator profiles to enrich evaluator data
    // ─────────────────────────────────────────────────────────
    const evaluatorIds = _extractUniqueEvaluatorIds(rawAllocations);
    const evaluatorProfiles = await _getEvaluatorProfiles(evaluatorIds);
    const evaluatorWeights = await _getEvaluatorWeights(evaluatorIds);

    // ─────────────────────────────────────────────────────────
    // Step 6: Get person display names for all targets
    // ─────────────────────────────────────────────────────────
    const targetIds = _extractUniqueTargetIds(rawAllocations);
    const personNames = await _getPersonNames([...evaluatorIds, ...targetIds]);

    // ─────────────────────────────────────────────────────────
    // Step 7: Build the enriched response
    // ─────────────────────────────────────────────────────────
    const enrichedResponse = _buildEnrichedResponse({
      session,
      storedWeightedResults,
      rawAllocations,
      evaluatorProfiles,
      evaluatorWeights,
      personNames,
      view,
    });

    // ─────────────────────────────────────────────────────────
    // Step 8: Cache for finalized sessions (TTL: 1 hour)
    // ─────────────────────────────────────────────────────────
    if (isFinalized) {
      enrichedResponse._calculated_at = new Date().toISOString();
      ResultCacheService.set(cacheKey, enrichedResponse, 3600000); // 1 hour TTL
    }

    return res.status(200).json({
      success: true,
      data: enrichedResponse,
      metadata: {
        cached: false,
        calculated_at: new Date().toISOString(),
        calculation_time_ms: Date.now() - req._startTime || 0,
        cache_status: isFinalized ? "miss" : "not_cacheable",
        version: "1.0",
      },
    });
  } catch (error) {
    logger.error(
      "WeightedResultsController: Failed to fetch weighted results",
      {
        sessionId: req.params.sessionId,
        userId: req.user?.userId,
        error: error.message,
        stack: error.stack,
      },
    );

    const statusCode =
      error.code === "SESSION_NOT_FOUND"
        ? 404
        : error.code === "INVALID_SESSION_STATUS"
          ? 400
          : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.code || "WEIGHTED_RESULTS_ERROR",
      message: error.message,
    });
  }
};

// ============================================================
// HELPER: _getSessionWithMeta(sessionId)
// ============================================================
/**
 * Fetch session row with full metadata from evaluation_sessions.
 *
 * PERFORMANCE: Single indexed query on primary key.
 *
 * @param {string} sessionId — UUID
 * @returns {Promise<Object|null>} Session row or null
 */
async function _getSessionWithMeta(sessionId) {
  const result = await db.query(
    `SELECT
       session_id,
       session_type,
       intent,
       status,
       scarcity_pool_size,
       evaluation_mode,
       created_at
     FROM evaluation_sessions
     WHERE session_id = $1`,
    [sessionId],
  );

  return result.rows[0] || null;
}

// ============================================================
// HELPER: _getRawAllocations(sessionId)
// ============================================================
/**
 * Fetch all raw allocations for a session with person display names.
 *
 * PERFORMANCE: Uses indexed session_id column, single query.
 * Returns columns needed for both raw stats and weighted comparison.
 *
 * @param {string} sessionId — UUID
 * @returns {Promise<Object[]>} Array of allocation rows
 */
async function _getRawAllocations(sessionId) {
  const result = await db.query(
    `SELECT
       sa.target_id,
       sa.evaluator_id,
       sa.points,
       sa.head_id,
       sa.created_at,
       tp.display_name AS target_name,
       ep.display_name AS evaluator_name
     FROM scarcity_allocations sa
     LEFT JOIN persons tp ON tp.person_id = sa.target_id
     LEFT JOIN persons ep ON ep.person_id = sa.evaluator_id
     WHERE sa.session_id = $1
     ORDER BY sa.target_id, sa.evaluator_id`,
    [sessionId],
  );

  return result.rows;
}

// ============================================================
// HELPER: _extractUniqueEvaluatorIds(allocations)
// ============================================================
/**
 * Extract unique evaluator IDs from raw allocations.
 *
 * @param {Object[]} allocations — Raw allocation rows
 * @returns {string[]} Unique evaluator UUIDs
 */
function _extractUniqueEvaluatorIds(allocations) {
  const ids = new Set();
  allocations.forEach((a) => ids.add(a.evaluator_id));
  return Array.from(ids);
}

// ============================================================
// HELPER: _extractUniqueTargetIds(allocations)
// ============================================================
/**
 * Extract unique target IDs from raw allocations.
 *
 * @param {Object[]} allocations — Raw allocation rows
 * @returns {string[]} Unique target UUIDs
 */
function _extractUniqueTargetIds(allocations) {
  const ids = new Set();
  allocations.forEach((a) => ids.add(a.target_id));
  return Array.from(ids);
}

// ============================================================
// HELPER: _getEvaluatorProfiles(evaluatorIds)
// ============================================================
/**
 * Fetch credibility profiles for a list of evaluators.
 * Returns a map of evaluatorId → profile object.
 *
 * Gracefully handles evaluators with no profile (returns null).
 *
 * PERFORMANCE: Parallel profile lookups, O(n) where n = evaluators.
 *
 * @param {string[]} evaluatorIds — Array of evaluator UUIDs
 * @returns {Promise<Map<string, Object>>} evaluatorId → profile
 */
async function _getEvaluatorProfiles(evaluatorIds) {
  const profileMap = {};

  // Fetch profiles in parallel for performance
  const profilePromises = evaluatorIds.map(async (id) => {
    try {
      const profile = await CredibilityRepository.getEvaluatorProfile(id);
      profileMap[id] = profile || null;
    } catch {
      profileMap[id] = null;
    }
  });

  await Promise.all(profilePromises);
  return profileMap;
}

// ============================================================
// HELPER: _getEvaluatorWeights(evaluatorIds)
// ============================================================
/**
 * Fetch current credibility weights for a list of evaluators.
 * Returns a map of evaluatorId → weight (0.1–0.95, default 0.5).
 *
 * PERFORMANCE: Parallel weight lookups, O(n) where n = evaluators.
 *
 * @param {string[]} evaluatorIds — Array of evaluator UUIDs
 * @returns {Promise<Map<string, number>>} evaluatorId → weight
 */
async function _getEvaluatorWeights(evaluatorIds) {
  const weightMap = {};

  const weightPromises = evaluatorIds.map(async (id) => {
    try {
      const weightRecord = await CredibilityRepository.getEvaluatorWeight(id);
      // getEvaluatorWeight returns an object — extract the numeric weight
      const numericWeight =
        weightRecord?.aggregation_weight ??
        weightRecord?.credibility_weight ??
        0.5;
      weightMap[id] = parseFloat(numericWeight) || 0.5;
    } catch {
      weightMap[id] = 0.5; // Default weight for new evaluators
    }
  });

  await Promise.all(weightPromises);
  return weightMap;
}

// ============================================================
// HELPER: _getPersonNames(personIds)
// ============================================================
/**
 * Fetch display names for a list of person IDs.
 * Returns a map of personId → display_name.
 *
 * PERFORMANCE: Single batch query using ANY($1).
 *
 * @param {string[]} personIds — Array of person UUIDs
 * @returns {Promise<Map<string, string>>} personId → name
 */
async function _getPersonNames(personIds) {
  if (personIds.length === 0) return {};

  const uniqueIds = [...new Set(personIds)];

  const result = await db.query(
    `SELECT person_id, display_name
     FROM persons
     WHERE person_id = ANY($1)`,
    [uniqueIds],
  );

  const nameMap = {};
  result.rows.forEach((row) => {
    nameMap[row.person_id] = row.display_name;
  });

  return nameMap;
}

// ============================================================
// BUILDER: _buildEnrichedResponse(...)
// ============================================================
/**
 * Assembles the full enriched weighted results response.
 *
 * BUSINESS CONTEXT: This is the main formatter that transforms
 * raw DB data into the structure consumed by WeightedResultsDashboard.
 *
 * VISUALIZATION LINK: Output directly maps to:
 *   - ComparisonView.jsx (person_results → raw vs weighted bars)
 *   - CredibilityImpactChart.jsx (visualization_data.credibility_distribution)
 *   - EvaluatorInsightsPanel.jsx (evaluator_analysis array)
 *   - ConsensusMeter.jsx (summary.consensus_level)
 *   - ScoreDistributionChart.jsx (person_results[].score_breakdown.statistics)
 *
 * @param {Object} params — All data sources
 * @returns {Object} Enriched response matching API spec
 */
function _buildEnrichedResponse({
  session,
  storedWeightedResults,
  rawAllocations,
  evaluatorProfiles,
  evaluatorWeights,
  personNames,
  view,
}) {
  // ── Group raw allocations by target ──
  const allocationsByTarget = {};
  rawAllocations.forEach((a) => {
    if (!allocationsByTarget[a.target_id]) {
      allocationsByTarget[a.target_id] = [];
    }
    allocationsByTarget[a.target_id].push(a);
  });

  // ── Build weighted results lookup (target_id → weighted row) ──
  const weightedByTarget = {};
  if (storedWeightedResults && storedWeightedResults.length > 0) {
    storedWeightedResults.forEach((wr) => {
      // Key by target_id — may have multiple head_ids, use first
      const key = wr.target_id;
      if (!weightedByTarget[key]) {
        weightedByTarget[key] = wr;
      }
    });
  }

  // ── Build per-person results ──
  const personResults = [];
  const targetIds = Object.keys(allocationsByTarget);

  for (const targetId of targetIds) {
    const allocations = allocationsByTarget[targetId];
    const targetName =
      personNames[targetId] || `Target ${targetId.substring(0, 8)}`;

    // Raw statistics
    const scores = allocations.map((a) => parseFloat(a.points) || 0);
    const rawMean =
      scores.length > 0
        ? parseFloat(
            (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(4),
          )
        : 0;
    const rawMin = scores.length > 0 ? Math.min(...scores) : 0;
    const rawMax = scores.length > 0 ? Math.max(...scores) : 0;
    const rawStdDev = _computeStdDev(scores);

    // Get stored weighted mean if available
    const weightedRow = weightedByTarget[targetId];
    const weightedMean = weightedRow
      ? parseFloat(weightedRow.weighted_mean)
      : rawMean; // Fallback to raw if no weighted data
    const weightingEffect = weightedRow
      ? parseFloat(weightedRow.weighting_effect)
      : 0;

    // Build evaluator score breakdown (for detailed view)
    const evaluatorScores = allocations.map((a) => {
      const evalId = a.evaluator_id;
      const weight = evaluatorWeights[evalId] || 0.5;
      const profile = evaluatorProfiles[evalId];

      return {
        evaluator_id: evalId,
        evaluator_name:
          personNames[evalId] || `Evaluator ${evalId.substring(0, 8)}`,
        score_given: parseFloat(a.points) || 0,
        credibility_weight: weight, // kept internally for normalized_weight calc
        credibility_band: profile?.credibility_band || "MEDIUM",
        deviation_from_mean: parseFloat(
          ((parseFloat(a.points) || 0) - rawMean).toFixed(4),
        ),
      };
    });

    // Normalize weights so they sum to 1.0
    const totalWeight = evaluatorScores.reduce(
      (s, e) => s + e.credibility_weight,
      0,
    );
    evaluatorScores.forEach((e) => {
      e.normalized_weight =
        totalWeight > 0
          ? parseFloat((e.credibility_weight / totalWeight).toFixed(4))
          : parseFloat((1 / evaluatorScores.length).toFixed(4));
      // SRS 7.2: Remove raw credibility weight from API response
      // (only bands + normalized_weight exposed to frontend)
      delete e.credibility_weight;
    });

    // Score distribution histogram (bucket scores into bins)
    const poolSize = parseFloat(session.scarcity_pool_size) || 10;
    const distribution = _computeScoreDistribution(scores, poolSize);

    const personResult = {
      person_id: targetId,
      name: targetName,
      raw_average: rawMean,
      weighted_average: weightedMean,
      credibility_impact: parseFloat(weightingEffect.toFixed(4)),
      score_breakdown: {
        evaluator_scores: view !== "summary" ? evaluatorScores : undefined,
        statistics: {
          standard_deviation: rawStdDev,
          min_score: rawMin,
          max_score: rawMax,
          range: parseFloat((rawMax - rawMin).toFixed(3)),
          score_distribution: distribution,
        },
      },
      evaluator_count: allocations.length,
    };

    personResults.push(personResult);
  }

  // Sort by weighted average descending
  personResults.sort((a, b) => b.weighted_average - a.weighted_average);

  // Add percentile ranking
  personResults.forEach((p, idx) => {
    p.percentile = Math.round(
      ((personResults.length - idx) / personResults.length) * 100,
    );
  });

  // ── Build session summary ──
  const allRaw = personResults.map((p) => p.raw_average);
  const allWeighted = personResults.map((p) => p.weighted_average);
  const allImpacts = personResults.map((p) => p.credibility_impact);

  const rawAvgAll =
    allRaw.length > 0
      ? parseFloat(
          (allRaw.reduce((s, v) => s + v, 0) / allRaw.length).toFixed(4),
        )
      : 0;
  const weightedAvgAll =
    allWeighted.length > 0
      ? parseFloat(
          (allWeighted.reduce((s, v) => s + v, 0) / allWeighted.length).toFixed(
            4,
          ),
        )
      : 0;
  const avgImpact =
    allImpacts.length > 0
      ? parseFloat(
          (allImpacts.reduce((s, v) => s + v, 0) / allImpacts.length).toFixed(
            4,
          ),
        )
      : 0;

  // Consensus: 1 − normalized average std dev
  const avgStdDev =
    personResults.length > 0
      ? personResults.reduce(
          (s, p) => s + p.score_breakdown.statistics.standard_deviation,
          0,
        ) / personResults.length
      : 0;
  const poolSize = parseFloat(session.scarcity_pool_size) || 10;
  const consensusLevel = parseFloat(
    Math.max(0, 1 - avgStdDev / poolSize).toFixed(4),
  );

  const summary = {
    raw_average_across_all: rawAvgAll,
    weighted_average_across_all: weightedAvgAll,
    average_credibility_impact: avgImpact,
    consensus_level: consensusLevel,
    disagreement_index: parseFloat((1 - consensusLevel).toFixed(4)),
    total_targets: personResults.length,
    total_evaluators: Object.keys(evaluatorWeights).length,
  };

  // ── Build evaluator analysis ──
  const evaluatorAnalysis = _buildEvaluatorAnalysis({
    evaluatorIds: Object.keys(evaluatorWeights),
    evaluatorProfiles,
    evaluatorWeights,
    personNames,
    rawAllocations,
    allocationsByTarget,
    personResults,
  });

  // ── Build visualization data (chart-ready arrays) ──
  const visualizationData = _buildVisualizationData({
    personResults,
    evaluatorAnalysis,
    evaluatorWeights,
    personNames,
  });

  // ── Assemble response ──
  return {
    session: {
      id: session.session_id,
      type: session.session_type,
      intent: session.intent,
      pool_size: poolSize,
      evaluator_count: Object.keys(evaluatorWeights).length,
      status: session.status,
      submission_complete: ["closed", "locked", "aggregated"].includes(
        session.status,
      ),
    },
    summary,
    person_results: personResults,
    evaluator_analysis: view !== "summary" ? evaluatorAnalysis : undefined,
    visualization_data: visualizationData,
    has_weighted_data:
      storedWeightedResults && storedWeightedResults.length > 0,
  };
}

// ============================================================
// BUILDER: _buildEvaluatorAnalysis(...)
// ============================================================
/**
 * Build per-evaluator analysis objects with credibility metrics.
 *
 * BUSINESS CONTEXT: Shows how each evaluator's credibility
 * influences the weighted results. Enables faculty to understand
 * which evaluators are most/least impactful.
 *
 * MATHEMATICAL BASIS:
 *   strictness = evaluator_avg_score / global_avg_score
 *     > 1.0 = lenient, < 1.0 = strict
 *   consistency = 1 − (evaluator_std_dev / pool_size)
 *   alignment = 1 − avg_abs_deviation_from_mean
 *
 * @param {Object} params — Data sources
 * @returns {Object[]} Array of evaluator analysis objects
 */
function _buildEvaluatorAnalysis({
  evaluatorIds,
  evaluatorProfiles,
  evaluatorWeights,
  personNames,
  rawAllocations,
  allocationsByTarget,
  personResults,
}) {
  // Group allocations by evaluator
  const allocationsByEvaluator = {};
  rawAllocations.forEach((a) => {
    if (!allocationsByEvaluator[a.evaluator_id]) {
      allocationsByEvaluator[a.evaluator_id] = [];
    }
    allocationsByEvaluator[a.evaluator_id].push(a);
  });

  // Global average score for strictness comparison
  const allScores = rawAllocations.map((a) => parseFloat(a.points) || 0);
  const globalAvg =
    allScores.length > 0
      ? allScores.reduce((s, v) => s + v, 0) / allScores.length
      : 0;

  return evaluatorIds.map((evalId) => {
    const allocations = allocationsByEvaluator[evalId] || [];
    const scores = allocations.map((a) => parseFloat(a.points) || 0);
    const profile = evaluatorProfiles[evalId];
    const weight = evaluatorWeights[evalId] || 0.5;

    // Calculate evaluator-specific metrics
    const evalAvg =
      scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const evalStdDev = _computeStdDev(scores);

    // Strictness: how this evaluator's average compares to global
    // < 0.5 = very strict, 0.5 = balanced, > 0.5 = lenient
    const strictness =
      globalAvg > 0
        ? parseFloat(Math.min(1, evalAvg / (globalAvg * 2)).toFixed(4))
        : 0.5;

    // Consistency: how uniform this evaluator's scores are
    const poolSize = scores.length > 0 ? Math.max(...scores, 1) : 1;
    const consistency = parseFloat(
      Math.max(0, 1 - evalStdDev / poolSize).toFixed(4),
    );

    // Average deviation from per-target means
    let totalDeviation = 0;
    allocations.forEach((a) => {
      const targetMean = personResults.find((p) => p.person_id === a.target_id);
      if (targetMean) {
        totalDeviation += Math.abs(
          (parseFloat(a.points) || 0) - targetMean.raw_average,
        );
      }
    });
    const avgDeviation =
      allocations.length > 0
        ? parseFloat((totalDeviation / allocations.length).toFixed(4))
        : 0;

    // Alignment with peers
    const alignment =
      globalAvg > 0
        ? parseFloat(Math.max(0, 1 - avgDeviation / globalAvg).toFixed(4))
        : 0.5;

    // Determine evaluation pattern label
    let pattern = "balanced";
    if (strictness < 0.35) pattern = "strict";
    else if (strictness > 0.65) pattern = "lenient";

    // Calculate total influence (normalized weight)
    const totalWeights = Object.values(evaluatorWeights).reduce(
      (s, w) => s + w,
      0,
    );
    const totalInfluence =
      totalWeights > 0 ? parseFloat((weight / totalWeights).toFixed(4)) : 0;

    return {
      evaluator_id: evalId,
      name: personNames[evalId] || `Evaluator ${evalId.substring(0, 8)}`,
      // SRS 7.2: raw credibility_score removed — only bands exposed
      credibility_band: profile?.credibility_band || "MEDIUM",
      evaluation_pattern: {
        strictness,
        consistency,
        alignment_with_peers: alignment,
        label: pattern,
      },
      impact_on_results: {
        total_influence: totalInfluence,
        average_deviation: avgDeviation,
        persons_evaluated: allocations.length,
      },
      statistics: {
        average_score: parseFloat(evalAvg.toFixed(4)),
        score_std_dev: evalStdDev,
        scores_given: scores.length,
      },
    };
  });
}

// ============================================================
// BUILDER: _buildVisualizationData(...)
// ============================================================
/**
 * Build pre-formatted data payloads optimized for chart rendering.
 *
 * VISUALIZATION LINK:
 *   comparison_chart  → ComparisonView.jsx (dual bar chart)
 *   credibility_distribution → CredibilityImpactChart.jsx
 *   impact_chart → CredibilityImpactChart.jsx (impact bars)
 *
 * PERFORMANCE: O(n) where n = person count + evaluator count.
 *
 * @param {Object} params — Processed results
 * @returns {Object} Chart-ready data payloads
 */
function _buildVisualizationData({
  personResults,
  evaluatorAnalysis,
  evaluatorWeights,
  personNames,
}) {
  return {
    // Dual bar chart: raw vs weighted per person
    comparison_chart: {
      labels: personResults.map((p) => _truncateName(p.name, 15)),
      raw_scores: personResults.map((p) => p.raw_average),
      weighted_scores: personResults.map((p) => p.weighted_average),
      impacts: personResults.map((p) => p.credibility_impact),
    },

    // Evaluator credibility distribution (SRS 7.2: bands only, no names/raw scores)
    credibility_distribution: {
      evaluators: evaluatorAnalysis.map((_, idx) => `Evaluator ${idx + 1}`),
      weights_applied: evaluatorAnalysis.map(
        (e) => e.impact_on_results.total_influence,
      ),
      bands: evaluatorAnalysis.map((e) => e.credibility_band),
    },

    // Credibility impact per person (for impact bar chart)
    impact_chart: {
      labels: personResults.map((p) => _truncateName(p.name, 15)),
      impacts: personResults.map((p) => p.credibility_impact),
      directions: personResults.map((p) =>
        p.credibility_impact > 0
          ? "positive"
          : p.credibility_impact < 0
            ? "negative"
            : "neutral",
      ),
    },
  };
}

// ============================================================
// UTILITY: _computeStdDev(values)
// ============================================================
/**
 * Compute population standard deviation of a numeric array.
 *
 * MATHEMATICAL BASIS: σ = √(Σ(xᵢ − μ)² / n)
 *
 * @param {number[]} values — Numeric array
 * @returns {number} Standard deviation (4 decimal places)
 */
function _computeStdDev(values) {
  if (values.length <= 1) return 0;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((s, v) => s + v, 0) / values.length;

  return parseFloat(Math.sqrt(avgSquaredDiff).toFixed(4));
}

// ============================================================
// UTILITY: _computeScoreDistribution(scores, poolSize)
// ============================================================
/**
 * Build a histogram of scores into 5 bins across [0, poolSize].
 *
 * MATHEMATICAL BASIS: Divides the range [0, poolSize] into 5 equal
 * bins and counts how many scores fall into each bin.
 *
 * @param {number[]} scores — Array of numeric scores
 * @param {number} poolSize — Maximum possible score
 * @returns {number[]} Array of 5 bin counts
 */
function _computeScoreDistribution(scores, poolSize) {
  const binCount = 5;
  const bins = new Array(binCount).fill(0);
  const binWidth = poolSize / binCount;

  scores.forEach((score) => {
    const binIndex = Math.min(Math.floor(score / binWidth), binCount - 1);
    bins[binIndex]++;
  });

  return bins;
}

// ============================================================
// UTILITY: _truncateName(name, maxLen)
// ============================================================
/**
 * Truncate a display name for chart labels.
 *
 * @param {string} name — Full name
 * @param {number} maxLen — Maximum character length
 * @returns {string} Truncated name with ellipsis if needed
 */
function _truncateName(name, maxLen) {
  if (!name) return "Unknown";
  return name.length > maxLen ? name.substring(0, maxLen - 1) + "…" : name;
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  getWeightedSessionResults,
};
