// ============================================================
// STABILITY ANALYZER TESTS — Unit Tests for Cross-Session Consistency
// ============================================================
// Tests the StabilityAnalyzer's ability to detect evaluator
// consistency over time, trend direction, and patterns.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/credibility/__tests__/StabilityAnalyzer.test.js
// ============================================================

const StabilityAnalyzer = require("../analyzers/StabilityAnalyzer");

// ============================================================
// INSUFFICIENT DATA
// ============================================================
describe("StabilityAnalyzer — Insufficient Data", () => {
  test("returns neutral default for empty history", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [],
    });

    expect(result.stability_score).toBe(0.5);
    expect(result.pattern).toBe("insufficient_data");
    expect(result.is_established).toBe(false);
    expect(result.sessions_analyzed).toBe(0);
  });

  test("returns neutral default for null history", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: null,
    });

    expect(result.stability_score).toBe(0.5);
    expect(result.pattern).toBe("insufficient_data");
  });

  test("returns neutral default for fewer than minSessions signals", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [{ alignment_score: 0.8 }, { alignment_score: 0.7 }],
      config: { minSessions: 3 },
    });

    expect(result.stability_score).toBe(0.5);
    expect(result.pattern).toBe("insufficient_data");
    expect(result.metadata.min_sessions_required).toBe(3);
  });
});

// ============================================================
// PERFECTLY STABLE EVALUATOR
// ============================================================
describe("StabilityAnalyzer — Perfectly Stable", () => {
  test("identical scores across sessions → high stability", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.8 },
        { alignment_score: 0.8 },
        { alignment_score: 0.8 },
        { alignment_score: 0.8 },
        { alignment_score: 0.8 },
      ],
    });

    // Zero variance → stability_score = 1 - tanh(3*0) = 1.0
    expect(result.stability_score).toBeCloseTo(1.0, 2);
    expect(result.variance).toBe(0);
    expect(result.trend_direction).toBe("stable");
    expect(result.is_established).toBe(true);
    expect(result.pattern).toBe("consistent");
  });
});

// ============================================================
// MODERATELY STABLE EVALUATOR
// ============================================================
describe("StabilityAnalyzer — Moderate Stability", () => {
  test("slight variation → good but not perfect stability", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.75 },
        { alignment_score: 0.8 },
        { alignment_score: 0.78 },
        { alignment_score: 0.77 },
        { alignment_score: 0.79 },
      ],
    });

    // Low variance → high stability score
    expect(result.stability_score).toBeGreaterThan(0.8);
    expect(result.std_dev).toBeLessThan(0.05);
    expect(result.is_established).toBe(true);
  });
});

// ============================================================
// ERRATIC EVALUATOR
// ============================================================
describe("StabilityAnalyzer — Erratic Behavior", () => {
  test("wildly varying scores → low stability", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.9 },
        { alignment_score: 0.2 },
        { alignment_score: 0.8 },
        { alignment_score: 0.1 },
        { alignment_score: 0.7 },
      ],
    });

    // High variance → low stability score
    expect(result.stability_score).toBeLessThan(0.5);
    expect(result.variance).toBeGreaterThan(0.05);
    expect(result.max_consecutive_change).toBeGreaterThan(0.3);
    expect(result.pattern).toBe("erratic");
  });
});

// ============================================================
// TREND DETECTION
// ============================================================
describe("StabilityAnalyzer — Trend Detection", () => {
  test("steadily improving scores → 'improving' trend", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.3 },
        { alignment_score: 0.4 },
        { alignment_score: 0.5 },
        { alignment_score: 0.6 },
        { alignment_score: 0.7 },
      ],
    });

    expect(result.trend_direction).toBe("improving");
    expect(result.trend_strength).toBeGreaterThan(0.9); // Strong R²
    expect(result.trend_slope).toBeGreaterThan(0);
  });

  test("steadily degrading scores → 'degrading' trend", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.8 },
        { alignment_score: 0.7 },
        { alignment_score: 0.6 },
        { alignment_score: 0.5 },
        { alignment_score: 0.4 },
      ],
    });

    expect(result.trend_direction).toBe("degrading");
    expect(result.trend_strength).toBeGreaterThan(0.9);
    expect(result.trend_slope).toBeLessThan(0);
  });

  test("flat scores → 'stable' trend", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.7 },
        { alignment_score: 0.72 },
        { alignment_score: 0.69 },
        { alignment_score: 0.71 },
        { alignment_score: 0.7 },
      ],
    });

    expect(result.trend_direction).toBe("stable");
  });
});

// ============================================================
// PATTERN DETECTION
// ============================================================
describe("StabilityAnalyzer — Pattern Detection", () => {
  test("strong improving trend → 'improving' pattern", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.2 },
        { alignment_score: 0.3 },
        { alignment_score: 0.4 },
        { alignment_score: 0.5 },
        { alignment_score: 0.6 },
      ],
    });

    expect(result.pattern).toBe("improving");
  });

  test("stable with low variance → 'consistent' pattern", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.6 },
        { alignment_score: 0.62 },
        { alignment_score: 0.61 },
        { alignment_score: 0.6 },
        { alignment_score: 0.61 },
      ],
    });

    expect(result.pattern).toBe("consistent");
  });
});

// ============================================================
// AUTOCORRELATION
// ============================================================
describe("StabilityAnalyzer — Autocorrelation", () => {
  test("increasing sequence has positive autocorrelation", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.3 },
        { alignment_score: 0.4 },
        { alignment_score: 0.5 },
        { alignment_score: 0.6 },
        { alignment_score: 0.7 },
      ],
    });

    // Monotonic increase → positive autocorrelation
    expect(result.autocorrelation).toBeGreaterThan(0);
  });
});

// ============================================================
// SESSION COUNT
// ============================================================
describe("StabilityAnalyzer — Session Count", () => {
  test("reports correct sessions_analyzed count", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.5 },
        { alignment_score: 0.6 },
        { alignment_score: 0.55 },
        { alignment_score: 0.58 },
      ],
    });

    expect(result.sessions_analyzed).toBe(4);
  });

  test("custom minSessions increases threshold", () => {
    const result = StabilityAnalyzer.analyze({
      historicalSignals: [
        { alignment_score: 0.5 },
        { alignment_score: 0.6 },
        { alignment_score: 0.55 },
        { alignment_score: 0.58 },
      ],
      config: { minSessions: 5 },
    });

    // 4 sessions < minSessions 5 → insufficient data
    expect(result.pattern).toBe("insufficient_data");
  });
});
