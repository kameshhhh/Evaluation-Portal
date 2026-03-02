// ============================================================
// ALIGNMENT ANALYZER TESTS — Unit Tests for Consensus Deviation
// ============================================================
// Tests the AlignmentAnalyzer's ability to measure how far an
// evaluator's allocations deviate from the group consensus.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/credibility/__tests__/AlignmentAnalyzer.test.js
// ============================================================

const AlignmentAnalyzer = require("../analyzers/AlignmentAnalyzer");

// ============================================================
// EMPTY / EDGE CASES
// ============================================================
describe("AlignmentAnalyzer — Edge Cases", () => {
  test("returns default for empty allocations", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [],
      aggregatedMeans: {},
      poolSize: 100,
      targetCount: 5,
    });

    expect(result.deviation).toBe(1.0);
    expect(result.score).toBe(0.1);
    expect(result.matched_targets).toBe(0);
    expect(result.metadata.empty_allocation).toBe(true);
  });

  test("returns default for null allocations", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: null,
      aggregatedMeans: {},
      poolSize: 100,
      targetCount: 5,
    });

    expect(result.score).toBe(0.1);
    expect(result.metadata.empty_allocation).toBe(true);
  });

  test("returns default for zero pool size", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [{ target_id: "t1", points: 50 }],
      aggregatedMeans: { t1: { mean: 50 } },
      poolSize: 0,
      targetCount: 1,
    });

    expect(result.score).toBe(0.1);
  });

  test("returns no-match result when targets don't overlap", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [{ target_id: "t1", points: 50 }],
      aggregatedMeans: { t99: { mean: 50 } }, // Different target
      poolSize: 100,
      targetCount: 1,
    });

    expect(result.matched_targets).toBe(0);
    expect(result.metadata.no_matches).toBe(true);
  });
});

// ============================================================
// PERFECT ALIGNMENT
// ============================================================
describe("AlignmentAnalyzer — Perfect Alignment", () => {
  test("evaluator matches consensus exactly → deviation ≈ 0, score ≈ 1", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [
        { target_id: "t1", points: 40 },
        { target_id: "t2", points: 30 },
        { target_id: "t3", points: 30 },
      ],
      aggregatedMeans: {
        t1: { mean: 40 },
        t2: { mean: 30 },
        t3: { mean: 30 },
      },
      poolSize: 100,
      targetCount: 3,
    });

    // Exact match: deviation = 0, score = e^(0) = 1.0
    expect(result.deviation).toBe(0);
    expect(result.score).toBeCloseTo(1.0, 2);
    expect(result.matched_targets).toBe(3);
    expect(result.is_consistent).toBe(true);
    expect(result.coverage_ratio).toBe(1.0);
  });
});

// ============================================================
// MODERATE DEVIATION
// ============================================================
describe("AlignmentAnalyzer — Moderate Deviation", () => {
  test("evaluator deviates moderately → mid-range score", () => {
    // Pool = 100. Evaluator gives [50, 30, 20], consensus is [40, 30, 30]
    // Deviations: |50-40|/100=0.1, |30-30|/100=0, |20-30|/100=0.1
    // Mean deviation = (0.1 + 0 + 0.1) / 3 = 0.0667
    // Score = e^(-5*0.0667) = e^(-0.333) ≈ 0.7165
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [
        { target_id: "t1", points: 50 },
        { target_id: "t2", points: 30 },
        { target_id: "t3", points: 20 },
      ],
      aggregatedMeans: {
        t1: { mean: 40 },
        t2: { mean: 30 },
        t3: { mean: 30 },
      },
      poolSize: 100,
      targetCount: 3,
    });

    expect(result.deviation).toBeCloseTo(0.0667, 3);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.score).toBeLessThan(0.9);
    expect(result.matched_targets).toBe(3);
  });
});

// ============================================================
// HIGH DEVIATION
// ============================================================
describe("AlignmentAnalyzer — High Deviation", () => {
  test("evaluator wildly diverges → low score (but not below floor)", () => {
    // Pool = 100. Evaluator gives [90, 5, 5], consensus is [33, 33, 34]
    // Deviations: |90-33|/100=0.57, |5-33|/100=0.28, |5-34|/100=0.29
    // Mean deviation = (0.57 + 0.28 + 0.29) / 3 = 0.38
    // Score = e^(-5*0.38) = e^(-1.9) ≈ 0.1496
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [
        { target_id: "t1", points: 90 },
        { target_id: "t2", points: 5 },
        { target_id: "t3", points: 5 },
      ],
      aggregatedMeans: {
        t1: { mean: 33 },
        t2: { mean: 33 },
        t3: { mean: 34 },
      },
      poolSize: 100,
      targetCount: 3,
    });

    expect(result.deviation).toBeGreaterThan(0.3);
    expect(result.score).toBeLessThan(0.3);
    expect(result.score).toBeGreaterThanOrEqual(0.1); // Floor enforced
  });
});

// ============================================================
// CONSISTENCY (deviation variance)
// ============================================================
describe("AlignmentAnalyzer — Consistency Check", () => {
  test("uniform deviations → is_consistent = true", () => {
    // All targets deviate by the same amount (10/100 = 0.1)
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [
        { target_id: "t1", points: 30 },
        { target_id: "t2", points: 40 },
      ],
      aggregatedMeans: {
        t1: { mean: 20 },
        t2: { mean: 30 },
      },
      poolSize: 100,
      targetCount: 2,
    });

    // Both deviations are 0.1, variance = 0 → is_consistent = true
    expect(result.is_consistent).toBe(true);
    expect(result.variance).toBe(0);
  });

  test("wildly different deviations → is_consistent = false", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [
        { target_id: "t1", points: 90 }, // Deviates by 57
        { target_id: "t2", points: 33 }, // Deviates by 0
      ],
      aggregatedMeans: {
        t1: { mean: 33 },
        t2: { mean: 33 },
      },
      poolSize: 100,
      targetCount: 2,
    });

    expect(result.is_consistent).toBe(false);
    expect(result.variance).toBeGreaterThan(0.05);
  });
});

// ============================================================
// COVERAGE RATIO
// ============================================================
describe("AlignmentAnalyzer — Coverage Ratio", () => {
  test("partial coverage: evaluator only allocates to some targets", () => {
    const result = AlignmentAnalyzer.analyze({
      evaluatorAllocations: [{ target_id: "t1", points: 50 }],
      aggregatedMeans: {
        t1: { mean: 50 },
        t2: { mean: 25 },
        t3: { mean: 25 },
      },
      poolSize: 100,
      targetCount: 3,
    });

    expect(result.matched_targets).toBe(1);
    expect(result.total_targets).toBe(3);
    expect(result.coverage_ratio).toBeCloseTo(0.3333, 3);
  });
});
