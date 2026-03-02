// ============================================================
// STATISTICAL ANALYZER TESTS — Unit Tests for Pure Math Functions
// ============================================================
// Tests every exported function from StatisticalAnalyzer.js.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/aggregation/__tests__/StatisticalAnalyzer.test.js
// ============================================================

const {
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
} = require("../StatisticalAnalyzer");

// ============================================================
// computeMean
// ============================================================
describe("computeMean", () => {
  test("returns 0 for empty array", () => {
    expect(computeMean([])).toBe(0);
  });

  test("returns 0 for null/undefined", () => {
    expect(computeMean(null)).toBe(0);
    expect(computeMean(undefined)).toBe(0);
  });

  test("handles single value", () => {
    expect(computeMean([7])).toBe(7);
  });

  test("computes correct mean for [7, 4, 2]", () => {
    // (7+4+2) / 3 = 4.333...
    expect(computeMean([7, 4, 2])).toBeCloseTo(4.333, 3);
  });

  test("computes correct mean for equal values", () => {
    expect(computeMean([5, 5, 5, 5])).toBe(5);
  });

  test("handles zero values", () => {
    expect(computeMean([0, 0, 0])).toBe(0);
  });

  test("handles mixed zeros and non-zeros", () => {
    // (0 + 0 + 6) / 3 = 2
    expect(computeMean([0, 0, 6])).toBe(2);
  });
});

// ============================================================
// computeVariance
// ============================================================
describe("computeVariance", () => {
  test("returns 0 for single value", () => {
    expect(computeVariance([5])).toBe(0);
  });

  test("returns 0 for empty array", () => {
    expect(computeVariance([])).toBe(0);
  });

  test("returns 0 for identical values", () => {
    expect(computeVariance([3, 3, 3])).toBe(0);
  });

  test("computes population variance for [1, 3, 5, 7, 9]", () => {
    // Mean = 5, squared diffs = [16, 4, 0, 4, 16], sum = 40, variance = 40/5 = 8
    expect(computeVariance([1, 3, 5, 7, 9])).toBe(8);
  });

  test("accepts pre-computed mean", () => {
    // Same as above but passing mean explicitly
    expect(computeVariance([1, 3, 5, 7, 9], 5)).toBe(8);
  });

  test("computes variance for [7, 4, 2]", () => {
    // Mean = 4.333, diffs² ≈ [7.111, 0.111, 5.444], sum ≈ 12.666, var ≈ 4.222
    const v = computeVariance([7, 4, 2]);
    expect(v).toBeCloseTo(4.222, 2);
  });
});

// ============================================================
// computeStdDev
// ============================================================
describe("computeStdDev", () => {
  test("returns 0 for single value", () => {
    expect(computeStdDev([5])).toBe(0);
  });

  test("computes correct std dev for [1, 3, 5, 7, 9]", () => {
    // variance = 8, stdDev = sqrt(8) ≈ 2.828
    expect(computeStdDev([1, 3, 5, 7, 9])).toBeCloseTo(2.828, 2);
  });

  test("returns 0 for identical values", () => {
    expect(computeStdDev([4, 4, 4])).toBe(0);
  });
});

// ============================================================
// computeMedian
// ============================================================
describe("computeMedian", () => {
  test("returns 0 for empty array", () => {
    expect(computeMedian([])).toBe(0);
  });

  test("handles single element", () => {
    expect(computeMedian([7])).toBe(7);
  });

  test("returns middle element for odd-length sorted array", () => {
    // [1, 3, 5] → median = 3
    expect(computeMedian([1, 3, 5])).toBe(3);
  });

  test("returns average of two middle elements for even-length", () => {
    // [1, 3, 5, 7] → median = (3+5)/2 = 4
    expect(computeMedian([1, 3, 5, 7])).toBe(4);
  });
});

// ============================================================
// computePercentile
// ============================================================
describe("computePercentile", () => {
  test("returns 0 for empty array", () => {
    expect(computePercentile([], 50)).toBe(0);
  });

  test("returns first element for p=0", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  test("returns last element for p=100", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  test("returns correct Q1 (25th percentile)", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
    const q1 = computePercentile(sorted, 25);
    // ceil(0.25 * 8) - 1 = 1 → sorted[1] = 2
    expect(q1).toBe(2);
  });

  test("returns correct Q3 (75th percentile)", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
    const q3 = computePercentile(sorted, 75);
    // ceil(0.75 * 8) - 1 = 5 → sorted[5] = 6
    expect(q3).toBe(6);
  });
});

// ============================================================
// computeSkewness
// ============================================================
describe("computeSkewness", () => {
  test("returns 0 for fewer than 3 values", () => {
    expect(computeSkewness([1, 2])).toBe(0);
    expect(computeSkewness([5])).toBe(0);
    expect(computeSkewness([])).toBe(0);
  });

  test("returns 0 for perfectly symmetric distribution", () => {
    // [1, 5, 9] is symmetric around mean 5
    expect(computeSkewness([1, 5, 9])).toBeCloseTo(0, 5);
  });

  test("returns 0 for all identical values", () => {
    expect(computeSkewness([3, 3, 3])).toBe(0);
  });

  test("returns positive for right-skewed data", () => {
    // [1, 1, 1, 10] — tail on the right
    const s = computeSkewness([1, 1, 1, 10]);
    expect(s).toBeGreaterThan(0);
  });

  test("returns negative for left-skewed data", () => {
    // [1, 10, 10, 10] — tail on the left
    const s = computeSkewness([1, 10, 10, 10]);
    expect(s).toBeLessThan(0);
  });
});

// ============================================================
// computeKurtosis
// ============================================================
describe("computeKurtosis", () => {
  test("returns 0 for fewer than 4 values", () => {
    expect(computeKurtosis([1, 2, 3])).toBe(0);
  });

  test("returns 0 for identical values", () => {
    expect(computeKurtosis([5, 5, 5, 5])).toBe(0);
  });

  test("returns a number for varied data", () => {
    // Just verify it's a finite number
    const k = computeKurtosis([1, 2, 5, 10, 15]);
    expect(Number.isFinite(k)).toBe(true);
  });
});

// ============================================================
// computeConsensus
// ============================================================
describe("computeConsensus", () => {
  test("returns 1.0 for single value", () => {
    expect(computeConsensus([5])).toBe(1.0);
  });

  test("returns 1.0 for all identical values", () => {
    expect(computeConsensus([5, 5, 5])).toBe(1.0);
  });

  test("returns value between 0 and 1", () => {
    const c = computeConsensus([1, 5, 9]);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  test("higher consensus for lower spread", () => {
    const tight = computeConsensus([4, 5, 6]); // symmetric → consensus ≈ 0.592
    const wide = computeConsensus([1, 1, 9]); // skewed → consensus ≈ 0.529
    expect(tight).toBeGreaterThan(wide);
  });

  test("returns 1.0 for empty/null", () => {
    expect(computeConsensus([])).toBe(1.0);
    expect(computeConsensus(null)).toBe(1.0);
  });
});

// ============================================================
// analyzeDistribution
// ============================================================
describe("analyzeDistribution", () => {
  test("returns default object for empty input", () => {
    const d = analyzeDistribution([]);
    expect(d.median).toBe(0);
    expect(d.consensus).toBe(1.0);
    expect(d.skewness).toBe(0);
  });

  test("returns correct median for [1, 2, 3, 4, 5]", () => {
    const d = analyzeDistribution([1, 2, 3, 4, 5]);
    expect(d.median).toBe(3);
  });

  test("computes IQR correctly", () => {
    const d = analyzeDistribution([1, 2, 3, 4, 5, 6, 7, 8]);
    // q3 - q1
    expect(d.iqr).toBeGreaterThan(0);
  });

  test("returns all expected keys", () => {
    const d = analyzeDistribution([1, 3, 5, 7]);
    expect(d).toHaveProperty("median");
    expect(d).toHaveProperty("q1");
    expect(d).toHaveProperty("q3");
    expect(d).toHaveProperty("iqr");
    expect(d).toHaveProperty("skewness");
    expect(d).toHaveProperty("kurtosis");
    expect(d).toHaveProperty("consensus");
  });
});

// ============================================================
// classifyEdgeCase
// ============================================================
describe("classifyEdgeCase", () => {
  test("returns SINGLE_EVALUATOR for length 1", () => {
    expect(classifyEdgeCase([5])).toBe("SINGLE_EVALUATOR");
  });

  test("returns UNANIMOUS_ZERO when all zeros", () => {
    expect(classifyEdgeCase([0, 0, 0])).toBe("UNANIMOUS_ZERO");
  });

  test("returns HIGH_DISAGREEMENT for high variance", () => {
    // [0, 20] → variance = 100, threshold default = 10
    expect(classifyEdgeCase([0, 20])).toBe("HIGH_DISAGREEMENT");
  });

  test("returns null for normal case", () => {
    expect(classifyEdgeCase([3, 4, 5])).toBeNull();
  });

  test("respects custom variance threshold", () => {
    // Variance of [1, 9] with mean 5 = 16
    expect(classifyEdgeCase([1, 9], { varianceThreshold: 20 })).toBeNull();
    expect(classifyEdgeCase([1, 9], { varianceThreshold: 5 })).toBe(
      "HIGH_DISAGREEMENT",
    );
  });
});

// ============================================================
// Integration: Full Pipeline Simulation
// ============================================================
describe("Full Aggregation Pipeline (unit-level)", () => {
  test("simulates 3-judge evaluation of 2 targets", () => {
    // Target A: judges gave [7, 4, 2]
    // Target B: judges gave [3, 6, 6]
    const pointsA = [7, 4, 2];
    const pointsB = [3, 6, 6];

    // Target A
    const meanA = computeMean(pointsA);
    const varA = computeVariance(pointsA, meanA);
    const consA = computeConsensus(pointsA);
    expect(meanA).toBeCloseTo(4.333, 2);
    expect(varA).toBeCloseTo(4.222, 2);
    // Range = 5, stdDev ≈ 2.055, consensus ≈ 1 - (2.055/5) ≈ 0.589
    expect(consA).toBeLessThan(0.7);
    expect(consA).toBeGreaterThan(0.4);

    // Target B
    const meanB = computeMean(pointsB);
    const varB = computeVariance(pointsB, meanB);
    const consB = computeConsensus(pointsB);
    expect(meanB).toBe(5);
    expect(varB).toBeCloseTo(2, 1);
    // Range = 3, stdDev ≈ 1.414, consensus ≈ 1 - (1.414/3) ≈ 0.529
    expect(consB).toBeGreaterThan(0.4);

    // Edge cases: neither should be flagged
    expect(classifyEdgeCase(pointsA)).toBeNull();
    expect(classifyEdgeCase(pointsB)).toBeNull();
  });

  test("single evaluator edge case", () => {
    const points = [8];
    expect(computeMean(points)).toBe(8);
    expect(computeVariance(points)).toBe(0);
    expect(computeConsensus(points)).toBe(1.0);
    expect(classifyEdgeCase(points)).toBe("SINGLE_EVALUATOR");
  });

  test("all-zero unanimous case", () => {
    const points = [0, 0, 0, 0];
    expect(computeMean(points)).toBe(0);
    expect(computeVariance(points)).toBe(0);
    expect(computeConsensus(points)).toBe(1.0);
    expect(classifyEdgeCase(points)).toBe("UNANIMOUS_ZERO");
  });
});
