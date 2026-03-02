// ============================================================
// STABILITY ANALYZER — Cross-Session Consistency Measurement
// ============================================================
// Implements SRS 5.1 "Stability over time":
//   How consistent is this evaluator's alignment deviation
//   across multiple sessions? Low variance = stable = trustworthy.
//
// ALGORITHM:
//   1. Collect historical alignment scores (one per session)
//   2. Compute variance, std-dev of alignment scores
//   3. Linear regression for trend detection (slope + r²)
//   4. Convert variance to stability score: 1 − tanh(γ · σ)
//   5. Detect patterns: improvement, degradation, erratic
//
// INPUTS:
//   historicalSignals — Array of past signals sorted by session_date
//     Each entry: { alignment_score, alignment_deviation, session_date }
//
// OUTPUTS:
//   { stability_score, variance, trend_direction, trend_strength,
//     pattern, sessions_analyzed, is_established, ... }
//
// PURE STATIC METHODS — no state, no DB, fully testable.
// ============================================================

"use strict";

class StabilityAnalyzer {
  // ============================================================
  // PUBLIC: analyze
  // ============================================================
  // Main entry point. Computes stability score from historical data.
  //
  // @param {Array}  historicalSignals — [{alignment_score, session_date}]
  // @param {Object} config — Optional overrides
  // @returns {Object} stability analysis result
  // ============================================================
  static analyze({ historicalSignals, config = {} }) {
    // Minimum sessions required to produce a meaningful stability score
    const minSessions = config.minSessions || 3;

    // Guard: not enough data for stability computation
    if (!historicalSignals || historicalSignals.length < minSessions) {
      return this._handleInsufficientData(
        historicalSignals ? historicalSignals.length : 0,
        minSessions,
      );
    }

    // Extract alignment scores in chronological order
    const scores = historicalSignals.map((s) => parseFloat(s.alignment_score));

    // Core statistics
    const mean = this._mean(scores);
    const variance = this._variance(scores, mean);
    const stdDev = Math.sqrt(variance);

    // Linear regression for trend detection (index = time proxy)
    const trend = this._linearRegression(scores);

    // Moving-average deviation (last 3 sessions vs overall)
    const recentWindow = Math.min(3, scores.length);
    const recentScores = scores.slice(-recentWindow);
    const recentMean = this._mean(recentScores);
    const movingAvgDeviation = Math.abs(recentMean - mean);

    // Max consecutive change — largest jump between adjacent sessions
    const maxConsecutiveChange = this._maxConsecutiveChange(scores);

    // Lag-1 autocorrelation — measures serial dependency
    const autocorrelation = this._lag1Autocorrelation(scores, mean);

    // Stability score: 1 − tanh(γ · σ)
    // γ = 3.0 → moderate penalty for high variance
    const gamma = config.gamma || 3.0;
    const stabilityScore = Math.max(0.1, 1 - Math.tanh(gamma * stdDev));

    // Pattern detection
    const pattern = this._detectPattern({
      trend,
      variance,
      recentMean,
      overallMean: mean,
      maxConsecutiveChange,
    });

    // "Established" evaluator: enough sessions AND reasonable stability
    const isEstablished = scores.length >= minSessions && stabilityScore >= 0.4;

    return {
      stability_score: parseFloat(stabilityScore.toFixed(4)),
      variance: parseFloat(variance.toFixed(6)),
      std_dev: parseFloat(stdDev.toFixed(4)),
      trend_direction: trend.direction,
      trend_strength: parseFloat(trend.rSquared.toFixed(4)),
      trend_slope: parseFloat(trend.slope.toFixed(6)),
      moving_avg_deviation: parseFloat(movingAvgDeviation.toFixed(4)),
      max_consecutive_change: parseFloat(maxConsecutiveChange.toFixed(4)),
      autocorrelation: parseFloat(autocorrelation.toFixed(4)),
      pattern: pattern,
      sessions_analyzed: scores.length,
      is_established: isEstablished,
      metadata: {
        recent_mean: parseFloat(recentMean.toFixed(4)),
        overall_mean: parseFloat(mean.toFixed(4)),
        gamma_used: gamma,
      },
    };
  }

  // ============================================================
  // PRIVATE: _linearRegression
  // ============================================================
  // Simple OLS on (index, score) pairs.
  // Returns { slope, intercept, rSquared, direction }.
  // ============================================================
  static _linearRegression(values) {
    const n = values.length;

    // Edge case: single point or empty array
    if (n < 2) {
      return {
        slope: 0,
        intercept: values[0] || 0,
        rSquared: 0,
        direction: "stable",
      };
    }

    // x-values: 0, 1, 2, ..., n-1 (session index)
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
      sumY2 += values[i] * values[i];
    }

    // Slope and intercept via least-squares formula
    const denominator = n * sumX2 - sumX * sumX;
    const slope =
      denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
    const intercept = (sumY - slope * sumX) / n;

    // R² (coefficient of determination)
    const ssTot = sumY2 - (sumY * sumY) / n;
    const ssRes = values.reduce((sum, y, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const rSquared = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    // Direction classification
    let direction;
    if (Math.abs(slope) < 0.005) {
      direction = "stable"; // Near-zero slope
    } else if (slope > 0) {
      direction = "improving"; // Alignment scores rising over time
    } else {
      direction = "degrading"; // Alignment scores falling over time
    }

    return { slope, intercept, rSquared, direction };
  }

  // ============================================================
  // PRIVATE: _maxConsecutiveChange
  // ============================================================
  // Largest absolute difference between adjacent sessions.
  // High values suggest erratic evaluation behavior.
  // ============================================================
  static _maxConsecutiveChange(values) {
    let maxChange = 0;
    for (let i = 1; i < values.length; i++) {
      const change = Math.abs(values[i] - values[i - 1]);
      if (change > maxChange) maxChange = change;
    }
    return maxChange;
  }

  // ============================================================
  // PRIVATE: _lag1Autocorrelation
  // ============================================================
  // Pearson correlation between score[i] and score[i-1].
  // Positive autocorrelation means evaluator behavior is persistent.
  // Negative means oscillating.
  // ============================================================
  static _lag1Autocorrelation(values, mean) {
    if (values.length < 3) return 0;

    let numerator = 0;
    let denominator = 0;

    for (let i = 1; i < values.length; i++) {
      numerator += (values[i] - mean) * (values[i - 1] - mean);
    }

    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }

    return denominator !== 0 ? numerator / denominator : 0;
  }

  // ============================================================
  // PRIVATE: _detectPattern
  // ============================================================
  // Classifies evaluator behavior trajectory.
  // ============================================================
  static _detectPattern({
    trend,
    variance,
    recentMean,
    overallMean,
    maxConsecutiveChange,
  }) {
    // Erratic: high variance + large jumps
    if (variance > 0.04 && maxConsecutiveChange > 0.3) {
      return "erratic";
    }

    // Strong trend detection (R² > 0.5 indicates meaningful trend)
    if (trend.rSquared > 0.5) {
      if (trend.direction === "improving") return "improving";
      if (trend.direction === "degrading") return "degrading";
    }

    // Recent divergence: recent scores differ significantly from overall
    if (Math.abs(recentMean - overallMean) > 0.15) {
      return recentMean > overallMean ? "recent_improvement" : "recent_decline";
    }

    // Default: consistent and stable
    return "consistent";
  }

  // ============================================================
  // PRIVATE: edge-case handling for insufficient data
  // ============================================================
  static _handleInsufficientData(sessionCount, minRequired) {
    return {
      stability_score: 0.5, // Neutral default for new evaluators
      variance: 0,
      std_dev: 0,
      trend_direction: "unknown",
      trend_strength: 0,
      trend_slope: 0,
      moving_avg_deviation: 0,
      max_consecutive_change: 0,
      autocorrelation: 0,
      pattern: "insufficient_data",
      sessions_analyzed: sessionCount,
      is_established: false,
      metadata: {
        min_sessions_required: minRequired,
        sessions_available: sessionCount,
      },
    };
  }

  // ============================================================
  // PRIVATE: statistical helper — mean
  // ============================================================
  static _mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  // ============================================================
  // PRIVATE: statistical helper — population variance
  // ============================================================
  static _variance(values, mean) {
    if (values.length < 2) return 0;
    return (
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
  }
}

module.exports = StabilityAnalyzer;
