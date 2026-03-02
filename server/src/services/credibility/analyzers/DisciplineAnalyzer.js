// ============================================================
// DISCIPLINE ANALYZER — Scarcity Behavior Assessment
// ============================================================
// Implements SRS 5.1 "Allocation discipline":
//   Does this evaluator use the scarcity mechanism responsibly?
//   Do they actually make trade-offs, or do they spread points
//   evenly / dump everything on one target / give many zeros?
//
// ALGORITHM (multi-factor):
//   1. Pool Usage Ratio — Did they use roughly the right amount?
//      Scoring varies by scarcity mode (strict vs. flexible).
//   2. Zero Allocation Ratio — How many targets got zero?
//      Some zeros are fine; too many means disengagement.
//   3. Gini Coefficient — Inequality of distribution.
//      Very low Gini = egalitarian smearing.
//      Very high Gini = hero worship / single-target dumping.
//   4. Trade-off Awareness — Are there meaningful differentials
//      between allocations? A minimum spread is expected.
//
// OUTPUTS:
//   { discipline_score, pool_usage_score, zero_allocation_score,
//     gini_coefficient, gini_score, tradeoff_score,
//     patterns: [...], ... }
//
// PURE STATIC METHODS — no state, no DB, fully testable.
// ============================================================

"use strict";

class DisciplineAnalyzer {
  // ============================================================
  // PUBLIC: analyze
  // ============================================================
  // Main entry point. Computes discipline score from allocations.
  //
  // @param {Array}  allocations  — [{target_id, points}]
  // @param {number} poolSize     — Total pool budget
  // @param {string} scarcityMode — e.g. "strict", "moderate", "flexible"
  // @param {number} targetCount  — Total evaluable targets
  // @param {Object} config       — Optional overrides
  // @returns {Object} discipline analysis result
  // ============================================================
  static analyze({
    allocations,
    poolSize,
    scarcityMode,
    targetCount,
    config = {},
  }) {
    // Guard: missing or empty allocations
    if (
      !allocations ||
      allocations.length === 0 ||
      !poolSize ||
      poolSize <= 0
    ) {
      return this._handleEmptyData();
    }

    // Parse allocation points into numeric array
    const points = allocations.map((a) => parseFloat(a.points));
    const totalAllocated = points.reduce((sum, p) => sum + p, 0);
    const effectiveTargetCount = targetCount || allocations.length;

    // ---- Sub-scores ----

    // 1. Pool usage ratio — how much of the pool was actually used?
    const poolUsageRatio = totalAllocated / poolSize;
    const poolUsageScore = this._computePoolUsageScore(
      poolUsageRatio,
      scarcityMode,
    );

    // 2. Zero allocation ratio — how many targets got zero?
    const zeroCount = points.filter((p) => p === 0).length;
    const zeroRatio =
      effectiveTargetCount > 0 ? zeroCount / effectiveTargetCount : 0;
    const zeroAllocationScore = this._computeZeroScore(zeroRatio);

    // 3. Gini coefficient — inequality of allocation distribution
    const giniCoefficient = this._computeGini(points);
    const giniScore = this._computeGiniScore(giniCoefficient);

    // 4. Trade-off awareness — range / max spread between allocations
    const tradeoffScore = this._computeTradeoffScore(points, poolSize);

    // ---- Composite Discipline Score ----
    // Weighted average of sub-scores
    const weights = config.subWeights || {
      pool_usage: 0.25,
      zero_allocation: 0.25,
      gini: 0.25,
      tradeoff: 0.25,
    };

    const disciplineScore =
      poolUsageScore * weights.pool_usage +
      zeroAllocationScore * weights.zero_allocation +
      giniScore * weights.gini +
      tradeoffScore * weights.tradeoff;

    // ---- Pattern Detection ----
    const patterns = this._detectPatterns({
      poolUsageRatio,
      zeroRatio,
      giniCoefficient,
      points,
      poolSize,
    });

    return {
      discipline_score: parseFloat(
        Math.max(0.1, Math.min(1.0, disciplineScore)).toFixed(4),
      ),
      pool_usage_ratio: parseFloat(poolUsageRatio.toFixed(4)),
      pool_usage_score: parseFloat(poolUsageScore.toFixed(4)),
      zero_allocation_ratio: parseFloat(zeroRatio.toFixed(4)),
      zero_allocation_score: parseFloat(zeroAllocationScore.toFixed(4)),
      gini_coefficient: parseFloat(giniCoefficient.toFixed(4)),
      gini_score: parseFloat(giniScore.toFixed(4)),
      tradeoff_score: parseFloat(tradeoffScore.toFixed(4)),
      patterns: patterns,
      allocations_analyzed: points.length,
      total_allocated: parseFloat(totalAllocated.toFixed(2)),
      metadata: {
        scarcity_mode: scarcityMode || "unknown",
        target_count: effectiveTargetCount,
        weights_used: weights,
      },
    };
  }

  // ============================================================
  // PRIVATE: _computePoolUsageScore
  // ============================================================
  // Rewards evaluators who use close to 100% of their pool.
  // Scoring adapts to scarcity mode:
  //   • strict:   must use exactly 100% → tight tolerance
  //   • moderate: 80-100% ideal
  //   • flexible: 60-100% acceptable
  // ============================================================
  static _computePoolUsageScore(ratio, mode) {
    // Ideal range by mode
    const idealRanges = {
      strict: { min: 0.95, max: 1.05, penalty: 8.0 },
      moderate: { min: 0.8, max: 1.0, penalty: 4.0 },
      flexible: { min: 0.6, max: 1.0, penalty: 2.0 },
    };

    const range = idealRanges[mode] || idealRanges.moderate;

    // Within ideal range: full score
    if (ratio >= range.min && ratio <= range.max) {
      return 1.0;
    }

    // Outside range: exponential decay based on distance from boundary
    const distance = ratio < range.min ? range.min - ratio : ratio - range.max;
    return Math.max(0.1, Math.exp(-range.penalty * distance));
  }

  // ============================================================
  // PRIVATE: _computeZeroScore
  // ============================================================
  // Penalizes excessive zero allocations.
  // Some zeros are normal (you can't fund everything);
  // too many zeros suggest disengagement.
  // ============================================================
  static _computeZeroScore(zeroRatio) {
    // Up to 30% zeros is acceptable (trade-off behavior)
    if (zeroRatio <= 0.3) {
      return 1.0;
    }
    // 30-70%: gradual penalty
    if (zeroRatio <= 0.7) {
      return 1.0 - (zeroRatio - 0.3) * 1.5; // Linear decay
    }
    // >70%: severe penalty — mostly zeros indicates disengagement
    return Math.max(0.1, 0.4 - (zeroRatio - 0.7) * 1.3);
  }

  // ============================================================
  // PRIVATE: _computeGini — Gini coefficient of distribution
  // ============================================================
  // 0 = perfect equality (everyone gets the same)
  // 1 = perfect inequality (one person gets everything)
  //
  // Moderate Gini (0.3-0.6) indicates healthy trade-off behavior.
  // ============================================================
  static _computeGini(values) {
    if (values.length < 2) return 0;

    // Filter non-negative values only
    const sorted = [...values].filter((v) => v >= 0).sort((a, b) => a - b);
    const n = sorted.length;

    if (n < 2) return 0;

    const sum = sorted.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0; // All zeros

    // Standard Gini formula: G = (2 * Σ(i * x_i)) / (n * Σx_i) - (n+1)/n
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
      weightedSum += (i + 1) * sorted[i];
    }

    return (2 * weightedSum) / (n * sum) - (n + 1) / n;
  }

  // ============================================================
  // PRIVATE: _computeGiniScore
  // ============================================================
  // Converts Gini coefficient to a quality score.
  // Optimal range: 0.25 - 0.55 (healthy trade-off differentiation).
  // ============================================================
  static _computeGiniScore(gini) {
    // Sweet spot: moderate inequality = deliberate differentiation
    if (gini >= 0.25 && gini <= 0.55) {
      return 1.0;
    }

    // Too equal (Gini < 0.25): egalitarian smearing
    if (gini < 0.25) {
      return Math.max(0.3, 0.3 + (gini / 0.25) * 0.7);
    }

    // Too unequal (Gini > 0.55): hero worship
    return Math.max(0.2, 1.0 - (gini - 0.55) * 2.0);
  }

  // ============================================================
  // PRIVATE: _computeTradeoffScore
  // ============================================================
  // Measures whether the evaluator demonstrates meaningful
  // differentiation between targets, rather than flat spreading.
  // ============================================================
  static _computeTradeoffScore(points, poolSize) {
    if (points.length < 2) return 0.5;

    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min;

    // Normalised spread (0-1)
    const normalisedSpread = poolSize > 0 ? range / poolSize : 0;

    // We want some spread — at least 10% of pool between highest and lowest
    if (normalisedSpread >= 0.1 && normalisedSpread <= 0.8) {
      return 1.0; // Healthy trade-off range
    }

    // Too flat: everyone gets roughly the same (no trade-off)
    if (normalisedSpread < 0.1) {
      return Math.max(0.3, normalisedSpread * 10);
    }

    // Too extreme: basically all-or-nothing
    return Math.max(0.2, 1.0 - (normalisedSpread - 0.8) * 2.5);
  }

  // ============================================================
  // PRIVATE: _detectPatterns
  // ============================================================
  // Identifies notable behavior patterns in the allocation.
  // ============================================================
  static _detectPatterns({
    poolUsageRatio,
    zeroRatio,
    giniCoefficient,
    points,
    poolSize,
  }) {
    const patterns = [];

    // Inflation tendency: allocated significantly more than the pool
    if (poolUsageRatio > 1.1) {
      patterns.push("inflation_tendency");
    }

    // Under-utilization: barely used the pool
    if (poolUsageRatio < 0.5) {
      patterns.push("under_utilization");
    }

    // Disengagement: Most allocations are zero
    if (zeroRatio > 0.6) {
      patterns.push("disengagement");
    }

    // Egalitarianism: Very equal distribution (low Gini)
    if (giniCoefficient < 0.15) {
      patterns.push("egalitarian_spreading");
    }

    // Hero worship: Very unequal distribution (high Gini)
    if (giniCoefficient > 0.7) {
      patterns.push("hero_worship");
    }

    // Single-target concentration: >60% of pool to one target
    if (points.length > 0 && poolSize > 0) {
      const maxPoints = Math.max(...points);
      if (maxPoints / poolSize > 0.6) {
        patterns.push("single_target_concentration");
      }
    }

    return patterns;
  }

  // ============================================================
  // PRIVATE: edge-case handler for empty data
  // ============================================================
  static _handleEmptyData() {
    return {
      discipline_score: 0.1,
      pool_usage_ratio: 0,
      pool_usage_score: 0.1,
      zero_allocation_ratio: 0,
      zero_allocation_score: 0.1,
      gini_coefficient: 0,
      gini_score: 0.1,
      tradeoff_score: 0.1,
      patterns: ["no_data"],
      allocations_analyzed: 0,
      total_allocated: 0,
      metadata: { empty_data: true },
    };
  }
}

module.exports = DisciplineAnalyzer;
