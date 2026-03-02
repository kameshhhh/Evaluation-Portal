// ============================================================
// STATISTICAL ANALYZER — Pure Math Functions for Aggregation
// ============================================================
// Zero-dependency statistical computation module.
// Every function is PURE — no database calls, no side effects.
// Used by AggregationService to compute per-target metrics.
//
// Exported helpers:
//   computeMean(points)             → arithmetic mean
//   computeVariance(points, mean?)  → population variance
//   computeStdDev(points, mean?)    → population standard deviation
//   computeMedian(sorted)           → 50th percentile
//   computePercentile(sorted, p)    → arbitrary percentile
//   computeSkewness(points, mean?)  → Fisher–Pearson skewness
//   computeKurtosis(points, mean?)  → excess kurtosis
//   computeConsensus(points)        → normalised agreement [0,1]
//   analyzeDistribution(points)     → full distribution object
//   classifyEdgeCase(points)        → edge-case label or null
//
// SRS 4.2.2: Foundation statistics for aggregation
// ============================================================

"use strict";

// ============================================================
// 1. ARITHMETIC MEAN
// ============================================================
/**
 * Compute the arithmetic mean of a numeric array.
 *
 * @param {number[]} points — array of allocation scores
 * @returns {number} mean value, or 0 for empty input
 */
function computeMean(points) {
  // Guard: empty array → 0 (no data to average)
  if (!points || points.length === 0) return 0;

  // Sum all values using a running total
  const sum = points.reduce((total, p) => total + p, 0);

  // Divide by count to get the arithmetic mean
  return sum / points.length;
}

// ============================================================
// 2. POPULATION VARIANCE
// ============================================================
/**
 * Compute population variance (σ²).
 * Uses N denominator (not N-1) because we have the full
 * population of evaluator scores, not a sample.
 *
 * @param {number[]} points — array of allocation scores
 * @param {number}   [mean] — pre-computed mean (avoids recalc)
 * @returns {number} variance, or 0 for fewer than 2 values
 */
function computeVariance(points, mean) {
  // Need at least 2 data points for meaningful variance
  if (!points || points.length < 2) return 0;

  // Compute mean if not provided
  const mu = mean !== undefined ? mean : computeMean(points);

  // Sum of squared differences from mean
  const sumSquared = points.reduce((acc, p) => acc + Math.pow(p - mu, 2), 0);

  // Population variance: divide by N
  return sumSquared / points.length;
}

// ============================================================
// 3. STANDARD DEVIATION
// ============================================================
/**
 * Compute population standard deviation (σ).
 *
 * @param {number[]} points — array of allocation scores
 * @param {number}   [mean] — pre-computed mean
 * @returns {number} standard deviation
 */
function computeStdDev(points, mean) {
  // Standard deviation is the square root of variance
  return Math.sqrt(computeVariance(points, mean));
}

// ============================================================
// 4. MEDIAN (50th Percentile)
// ============================================================
/**
 * Compute the median of a sorted numeric array.
 *
 * @param {number[]} sorted — array sorted ascending
 * @returns {number} median value
 */
function computeMedian(sorted) {
  // Guard: empty array → 0
  if (!sorted || sorted.length === 0) return 0;

  const n = sorted.length;

  // Odd count: middle element
  if (n % 2 !== 0) return sorted[Math.floor(n / 2)];

  // Even count: average of the two middle elements
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

// ============================================================
// 5. ARBITRARY PERCENTILE
// ============================================================
/**
 * Compute the p-th percentile using nearest-rank method.
 *
 * @param {number[]} sorted — array sorted ascending
 * @param {number}   p      — percentile (0–100)
 * @returns {number} percentile value
 */
function computePercentile(sorted, p) {
  // Guard: empty or invalid input
  if (!sorted || sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  // Nearest rank index
  const index = Math.ceil((p / 100) * sorted.length) - 1;

  // Clamp to array bounds
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// ============================================================
// 6. SKEWNESS (Fisher–Pearson coefficient)
// ============================================================
/**
 * Compute the skewness of a distribution.
 * Negative → left-skewed (harsh cluster)
 * Positive → right-skewed (generous cluster)
 * ~0 → symmetric
 *
 * @param {number[]} points — raw scores
 * @param {number}   [mean] — pre-computed mean
 * @returns {number} skewness, or 0 for < 3 values
 */
function computeSkewness(points, mean) {
  // Need at least 3 data points for skewness
  if (!points || points.length < 3) return 0;

  const mu = mean !== undefined ? mean : computeMean(points);
  const n = points.length;

  // Compute variance for the denominator
  const variance = computeVariance(points, mu);

  // Guard: zero variance → perfectly symmetric → skewness = 0
  if (variance === 0) return 0;

  // Sum of cubed deviations
  const sumCubed = points.reduce((acc, p) => acc + Math.pow(p - mu, 3), 0);

  // Fisher–Pearson: (1/N) * Σ((xi - μ)³) / σ³
  const sigma3 = Math.pow(variance, 1.5);

  return sumCubed / (n * sigma3);
}

// ============================================================
// 7. KURTOSIS (Excess kurtosis, Fisher definition)
// ============================================================
/**
 * Compute excess kurtosis.
 * > 0 → leptokurtic (peaked / heavy tails)
 * < 0 → platykurtic (flat / thin tails)
 * ~0 → mesokurtic (normal-like)
 *
 * @param {number[]} points — raw scores
 * @param {number}   [mean] — pre-computed mean
 * @returns {number} excess kurtosis, or 0 for < 4 values
 */
function computeKurtosis(points, mean) {
  // Need at least 4 data points for kurtosis
  if (!points || points.length < 4) return 0;

  const mu = mean !== undefined ? mean : computeMean(points);
  const n = points.length;

  // Compute variance for the denominator
  const variance = computeVariance(points, mu);

  // Guard: zero variance → undefined kurtosis → return 0
  if (variance === 0) return 0;

  // Sum of fourth-power deviations
  const sumFourth = points.reduce((acc, p) => acc + Math.pow(p - mu, 4), 0);

  // Excess kurtosis: (1/N) * Σ((xi - μ)⁴) / σ⁴ - 3
  const sigma4 = Math.pow(variance, 2);

  return sumFourth / (n * sigma4) - 3;
}

// ============================================================
// 8. CONSENSUS SCORE [0, 1]
// ============================================================
/**
 * Compute a normalised consensus score.
 * 1.0 = all evaluators gave the same score (perfect agreement).
 * 0.0 = maximum possible disagreement given the score range.
 *
 * Method: 1 - (stdDev / range).  If range is 0, consensus is 1.
 *
 * @param {number[]} points — raw scores
 * @returns {number} consensus in [0, 1]
 */
function computeConsensus(points) {
  // Fewer than 2 evaluators → trivially perfect consensus
  if (!points || points.length < 2) return 1.0;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;

  // All identical scores → perfect consensus
  if (range === 0) return 1.0;

  // Normalised stdDev ∈ [0, 1], then invert
  const stdDev = computeStdDev(points);
  const normalised = stdDev / range;

  // Clamp to [0, 1] and invert: high stdDev → low consensus
  return parseFloat(Math.max(0, Math.min(1, 1 - normalised)).toFixed(3));
}

// ============================================================
// 9. FULL DISTRIBUTION ANALYSIS
// ============================================================
/**
 * Produce a complete distribution summary object.
 * Combines all statistical helpers into one call.
 *
 * @param {number[]} points — raw scores (unsorted is fine)
 * @returns {Object} distribution summary
 */
function analyzeDistribution(points) {
  // Guard: empty input
  if (!points || points.length === 0) {
    return {
      median: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      skewness: 0,
      kurtosis: 0,
      consensus: 1.0,
    };
  }

  // Sort ascending for percentile/median calculations
  const sorted = [...points].sort((a, b) => a - b);

  // Pre-compute mean once for all dependent calculations
  const mean = computeMean(points);

  // Build the full distribution object
  const median = computeMedian(sorted);
  const q1 = computePercentile(sorted, 25);
  const q3 = computePercentile(sorted, 75);
  const skewness = computeSkewness(points, mean);
  const kurtosis = computeKurtosis(points, mean);
  const consensus = computeConsensus(points);

  return {
    // Positional statistics
    median: parseFloat(median.toFixed(3)),
    q1: parseFloat(q1.toFixed(3)),
    q3: parseFloat(q3.toFixed(3)),
    iqr: parseFloat((q3 - q1).toFixed(3)),

    // Shape statistics
    skewness: parseFloat(skewness.toFixed(6)),
    kurtosis: parseFloat(kurtosis.toFixed(6)),

    // Agreement metric
    consensus,
  };
}

// ============================================================
// 10. EDGE-CASE CLASSIFIER
// ============================================================
/**
 * Detect and label known edge cases.
 * Returns null when no special case applies.
 *
 * Known cases:
 *   SINGLE_EVALUATOR   — only 1 judge submitted
 *   UNANIMOUS_ZERO     — all judges gave 0
 *   HIGH_DISAGREEMENT  — variance exceeds configurable threshold
 *
 * @param {number[]} points            — raw scores
 * @param {Object}   [opts]            — options
 * @param {number}   [opts.varianceThreshold=10] — threshold for disagreement flag
 * @returns {string|null} edge-case label or null
 */
function classifyEdgeCase(points, opts = {}) {
  // Default variance threshold for "high disagreement" flag
  const varianceThreshold = opts.varianceThreshold ?? 10;

  // Case 1: Single evaluator
  if (points.length === 1) return "SINGLE_EVALUATOR";

  // Case 2: Every evaluator gave 0
  if (points.every((p) => p === 0)) return "UNANIMOUS_ZERO";

  // Case 3: Extreme variance (high disagreement)
  const variance = computeVariance(points);
  if (variance > varianceThreshold) return "HIGH_DISAGREEMENT";

  // No special case
  return null;
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  computeMean,
  computeVariance,
  computeStdDev,
  computeMedian,
  computePercentile,
  computeSkewness,
  computeKurtosis,
  computeConsensus,
  analyzeDistribution,
  classifyEdgeCase,
};
