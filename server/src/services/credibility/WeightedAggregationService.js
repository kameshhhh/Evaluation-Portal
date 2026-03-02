// ============================================================
// WEIGHTED AGGREGATION SERVICE — Credibility-Weighted Means
// ============================================================
// Implements SRS 5.2 "Credibility-Weighted Aggregation":
//   Computes adjusted group means where each evaluator's score
//   is multiplied by their credibility weight before averaging.
//
// FORMULA:
//   weighted_mean = Σ(weight_i × score_i) / Σ(weight_i)
//
//   Where weight_i comes from the evaluator's credibility profile
//   (0.1 to 0.95, default 0.5 for new evaluators).
//
// ANTI-COLLUSION STATISTICAL DILUTION:
//   Even the lowest-credibility evaluator retains 10% influence.
//   No single evaluator can be fully silenced by the engine.
//
// OUTPUTS PER TARGET:
//   { weighted_mean, raw_mean, weighting_effect, evaluator_weights }
//   weighting_effect = weighted_mean − raw_mean (shows the shift)
//
// SINGLETON — module.exports = new WeightedAggregationService()
// ============================================================

"use strict";

// Data access
const CredibilityRepository = require("./storage/CredibilityRepository");

// Logger
const logger = require("../../utils/logger");

class WeightedAggregationService {
  // ============================================================
  // PUBLIC: computeWeightedResults
  // ============================================================
  // Compute credibility-weighted aggregation for an entire session.
  //
  // @param {string} sessionId - Session UUID
  // @returns {Promise<Object>} { results: [...], summary: {...} }
  // ============================================================
  async computeWeightedResults(sessionId) {
    logger.info("WeightedAggregation: Computing for session", { sessionId });

    // 1. Fetch session data (allocations + aggregated results)
    const sessionData =
      await CredibilityRepository.getSessionDataForProcessing(sessionId);

    if (!sessionData) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 2. Fetch current credibility weights for all evaluators
    const weights = await CredibilityRepository.getCurrentWeights();
    const weightMap = this._buildWeightMap(weights, sessionData.evaluators);

    // 3. Group allocations by head → target
    const allocationsByHeadTarget = this._groupAllocations(
      sessionData.allocations,
    );

    // 4. Compute weighted means for each head × target
    const results = [];
    let totalWeightingEffect = 0;

    for (const [headId, targets] of Object.entries(allocationsByHeadTarget)) {
      for (const [targetId, allocations] of Object.entries(targets)) {
        const computed = this._computeWeightedMean(allocations, weightMap);

        const resultRow = {
          session_id: sessionId,
          head_id: headId,
          target_id: targetId,
          weighted_mean: computed.weightedMean,
          raw_mean: computed.rawMean,
          weighting_effect: computed.weightingEffect,
          effective_evaluator_count: computed.effectiveCount,
          evaluator_weights: computed.evaluatorWeights,
        };

        // Persist to DB
        await CredibilityRepository.storeWeightedResult(resultRow);

        results.push(resultRow);
        totalWeightingEffect += Math.abs(computed.weightingEffect);
      }
    }

    const summary = {
      session_id: sessionId,
      results_computed: results.length,
      avg_weighting_effect:
        results.length > 0
          ? parseFloat((totalWeightingEffect / results.length).toFixed(4))
          : 0,
      evaluator_count: sessionData.evaluators.length,
    };

    logger.info("WeightedAggregation: Complete", summary);

    return { results, summary };
  }

  // ============================================================
  // PUBLIC: getSessionWeightedResults
  // ============================================================
  // Retrieve previously computed weighted results for a session.
  //
  // @param {string} sessionId - Session UUID
  // @param {string} [headId] - Optional head filter
  // @returns {Promise<Array>} Array of weighted result rows
  // ============================================================
  async getSessionWeightedResults(sessionId, headId = null) {
    return CredibilityRepository.getWeightedResults(sessionId, headId);
  }

  // ============================================================
  // PRIVATE: _computeWeightedMean
  // ============================================================
  // Computes both weighted and raw means for a single target.
  //
  // @param {Array} allocations - [{evaluator_id, points}]
  // @param {Object} weightMap - {evaluator_id → weight}
  // @returns {Object} {weightedMean, rawMean, weightingEffect, evaluatorWeights}
  // ============================================================
  _computeWeightedMean(allocations, weightMap) {
    if (allocations.length === 0) {
      return {
        weightedMean: 0,
        rawMean: 0,
        weightingEffect: 0,
        effectiveCount: 0,
        evaluatorWeights: {},
      };
    }

    let weightedSum = 0;
    let totalWeight = 0;
    let rawSum = 0;
    const evaluatorWeights = {};

    for (const alloc of allocations) {
      const points = parseFloat(alloc.points);
      const weight = weightMap[alloc.evaluator_id] || 0.5; // Default for unknowns

      weightedSum += weight * points;
      totalWeight += weight;
      rawSum += points;

      evaluatorWeights[alloc.evaluator_id] = parseFloat(weight.toFixed(4));
    }

    const weightedMean =
      totalWeight > 0 ? parseFloat((weightedSum / totalWeight).toFixed(4)) : 0;

    const rawMean =
      allocations.length > 0
        ? parseFloat((rawSum / allocations.length).toFixed(4))
        : 0;

    return {
      weightedMean,
      rawMean,
      weightingEffect: parseFloat((weightedMean - rawMean).toFixed(4)),
      effectiveCount: parseFloat(totalWeight.toFixed(4)),
      evaluatorWeights,
    };
  }

  // ============================================================
  // PRIVATE: _buildWeightMap
  // ============================================================
  // Creates a fast lookup: {evaluator_id → credibility_weight}.
  // Evaluators without profiles get the default weight of 0.5.
  // ============================================================
  _buildWeightMap(weights, evaluators) {
    const map = {};

    // Populate from existing weights (materialised view)
    for (const w of weights) {
      map[w.evaluator_id] = parseFloat(w.credibility_weight);
    }

    // Ensure every evaluator in this session has an entry
    for (const e of evaluators) {
      if (!map[e.evaluator_id]) {
        map[e.evaluator_id] = 0.5; // Default for new evaluators
      }
    }

    return map;
  }

  // ============================================================
  // PRIVATE: _groupAllocations
  // ============================================================
  // Transforms flat allocations into:
  //   { head_id → { target_id → [{evaluator_id, points}] } }
  // ============================================================
  _groupAllocations(allocations) {
    const map = {};

    for (const alloc of allocations) {
      if (!map[alloc.head_id]) {
        map[alloc.head_id] = {};
      }
      if (!map[alloc.head_id][alloc.target_id]) {
        map[alloc.head_id][alloc.target_id] = [];
      }

      map[alloc.head_id][alloc.target_id].push({
        evaluator_id: alloc.evaluator_id,
        points: alloc.points,
      });
    }

    return map;
  }
}

module.exports = new WeightedAggregationService();
module.exports.WeightedAggregationService = WeightedAggregationService;
