// ============================================================
// ALIGNMENT ANALYZER — Consensus Deviation Measurement
// ============================================================
// Implements SRS 5.1 "Alignment with consensus":
//   How far does this evaluator's judgment deviate from
//   the group's aggregated mean per target?
//
// ALGORITHM:
//   1. For each target, compute |evaluator_points − mean| / poolSize
//   2. Average these normalised deviations across targets
//   3. Convert to score via exponential decay: e^(−k·deviation)
//
// DESIGN DECISIONS:
//   • Pool-size normalization prevents scale bias across modes
//   • Exponential decay rewards moderate alignment, not slavish copying
//   • minScore floor (0.1) prevents total zeroing of weight
//
// OUTPUTS:
//   { deviation, score, variance, is_consistent, matched_targets, ... }
//
// PURE STATIC METHODS — no state, no DB, fully testable.
// ============================================================

"use strict";

class AlignmentAnalyzer {
  // ============================================================
  // PUBLIC: analyze
  // ============================================================
  // Core entry point. Computes alignment deviation & score.
  //
  // @param {Array}  evaluatorAllocations — [{target_id, points}]
  // @param {Object} aggregatedMeans — {target_id: {mean, variance, consensus_score}}
  // @param {number} poolSize  — Session scarcity pool size (for normalisation)
  // @param {number} targetCount — Total targets in the session
  // @returns {Object} alignment analysis result
  // ============================================================
  static analyze({
    evaluatorAllocations,
    aggregatedMeans,
    poolSize,
    targetCount,
  }) {
    // Guard: empty / missing allocations
    if (!evaluatorAllocations || evaluatorAllocations.length === 0) {
      return this._handleEmptyAllocations();
    }

    // Guard: pool size must be positive for normalisation
    if (!poolSize || poolSize <= 0) {
      return this._handleEmptyAllocations();
    }

    // Build O(1) lookup from evaluator allocations
    const allocationMap = {};
    for (const alloc of evaluatorAllocations) {
      allocationMap[alloc.target_id] = parseFloat(alloc.points);
    }

    // Compute per-target normalised deviations
    const deviations = [];
    let matchedTargets = 0;

    for (const [targetId, aggregated] of Object.entries(aggregatedMeans)) {
      const evaluatorPoints = allocationMap[targetId];

      // Only compare targets that both the evaluator AND the group addressed
      if (evaluatorPoints !== undefined && aggregated.mean !== undefined) {
        // Normalised absolute deviation (0 = perfect match, 1 = full pool apart)
        const deviation =
          Math.abs(evaluatorPoints - parseFloat(aggregated.mean)) / poolSize;
        deviations.push(deviation);
        matchedTargets++;
      }
    }

    // Guard: no overlapping targets between evaluator and consensus
    if (matchedTargets === 0) {
      return this._handleNoMatches();
    }

    // Mean deviation across all matched targets
    const meanDeviation =
      deviations.reduce((sum, d) => sum + d, 0) / matchedTargets;

    // Alignment score (0-1, higher = better aligned)
    const alignmentScore = this._computeAlignmentScore(meanDeviation);

    // Deviation variance — measures consistency of the evaluator's deviations
    const deviationVariance = this._computeVariance(deviations);

    // Low variance = the evaluator deviates by roughly the same amount everywhere
    const isConsistent = deviationVariance < 0.05;

    return {
      deviation: parseFloat(meanDeviation.toFixed(4)),
      score: parseFloat(alignmentScore.toFixed(4)),
      variance: parseFloat(deviationVariance.toFixed(4)),
      is_consistent: isConsistent,
      matched_targets: matchedTargets,
      total_targets: targetCount || matchedTargets,
      coverage_ratio: parseFloat(
        (matchedTargets / (targetCount || matchedTargets)).toFixed(4),
      ),
      metadata: {
        pool_normalization_applied: true,
      },
    };
  }

  // ============================================================
  // PRIVATE: _computeAlignmentScore
  // ============================================================
  // Exponential decay: score = max(minScore, e^(-k * deviation))
  // • k = 5.0 → moderate decay
  // • minScore = 0.1 → nobody gets zeroed out entirely
  // ============================================================
  static _computeAlignmentScore(deviation) {
    const k = 5.0; // Decay rate (configurable in future)
    const minScore = 0.1; // Floor to prevent total elimination
    const rawScore = Math.exp(-k * deviation);
    return Math.max(minScore, Math.min(1.0, rawScore));
  }

  // ============================================================
  // PRIVATE: edge-case handlers
  // ============================================================
  static _handleEmptyAllocations() {
    return {
      deviation: 1.0,
      score: 0.1,
      variance: 0.0,
      is_consistent: false,
      matched_targets: 0,
      total_targets: 0,
      coverage_ratio: 0,
      metadata: { empty_allocation: true },
    };
  }

  static _handleNoMatches() {
    return {
      deviation: 1.0,
      score: 0.1,
      variance: 0.0,
      is_consistent: false,
      matched_targets: 0,
      total_targets: 0,
      coverage_ratio: 0,
      metadata: { no_matches: true },
    };
  }

  // ============================================================
  // PRIVATE: _computeVariance (population variance)
  // ============================================================
  static _computeVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return (
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
  }
}

module.exports = AlignmentAnalyzer;
