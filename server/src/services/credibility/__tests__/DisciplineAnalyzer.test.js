// ============================================================
// DISCIPLINE ANALYZER TESTS — Unit Tests for Scarcity Behavior
// ============================================================
// Tests the DisciplineAnalyzer's ability to assess evaluator
// allocation quality: pool usage, zero ratios, Gini, trade-offs.
// All tests are pure math (no DB, no mocking needed).
//
// Run: npx jest server/src/services/credibility/__tests__/DisciplineAnalyzer.test.js
// ============================================================

const DisciplineAnalyzer = require("../analyzers/DisciplineAnalyzer");

// ============================================================
// EMPTY / EDGE CASES
// ============================================================
describe("DisciplineAnalyzer — Edge Cases", () => {
  test("returns default for empty allocations", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 5,
    });

    expect(result.discipline_score).toBe(0.1);
    expect(result.patterns).toContain("no_data");
    expect(result.metadata.empty_data).toBe(true);
  });

  test("returns default for null allocations", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: null,
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 5,
    });

    expect(result.discipline_score).toBe(0.1);
  });

  test("returns default for zero pool size", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [{ target_id: "t1", points: 50 }],
      poolSize: 0,
      scarcityMode: "moderate",
      targetCount: 1,
    });

    expect(result.discipline_score).toBe(0.1);
  });
});

// ============================================================
// IDEAL ALLOCATION BEHAVIOR
// ============================================================
describe("DisciplineAnalyzer — Ideal Behavior", () => {
  test("healthy allocation with differentiation → high score", () => {
    // Uses 95% of pool, some differentiation, no excessive zeros
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 35 },
        { target_id: "t2", points: 25 },
        { target_id: "t3", points: 20 },
        { target_id: "t4", points: 15 },
        { target_id: "t5", points: 0 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 5,
    });

    // Should score well: good pool usage, moderate Gini, trade-offs present
    expect(result.discipline_score).toBeGreaterThan(0.6);
    expect(result.pool_usage_ratio).toBe(0.95);
    expect(result.zero_allocation_ratio).toBe(0.2); // 1/5
    expect(result.gini_coefficient).toBeGreaterThan(0.15);
    expect(result.allocations_analyzed).toBe(5);
  });

  test("perfect pool usage (exactly 100%) → high pool score", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 50 },
        { target_id: "t2", points: 30 },
        { target_id: "t3", points: 20 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 3,
    });

    expect(result.pool_usage_score).toBe(1.0);
    expect(result.pool_usage_ratio).toBe(1.0);
  });
});

// ============================================================
// POOL USAGE SCORING BY MODE
// ============================================================
describe("DisciplineAnalyzer — Pool Usage Modes", () => {
  test("strict mode penalizes under-usage harshly", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 40 },
        { target_id: "t2", points: 20 },
      ],
      poolSize: 100, // Only used 60%
      scarcityMode: "strict",
      targetCount: 2,
    });

    // 60% usage in strict mode: heavily penalized
    expect(result.pool_usage_score).toBeLessThan(0.3);
  });

  test("flexible mode tolerates lower usage", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 40 },
        { target_id: "t2", points: 30 },
      ],
      poolSize: 100, // Used 70%
      scarcityMode: "flexible",
      targetCount: 2,
    });

    // 70% in flexible mode: tolerable
    expect(result.pool_usage_score).toBeGreaterThan(0.5);
  });
});

// ============================================================
// ZERO ALLOCATION SCORING
// ============================================================
describe("DisciplineAnalyzer — Zero Allocations", () => {
  test("no zeros → perfect zero score", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 40 },
        { target_id: "t2", points: 30 },
        { target_id: "t3", points: 30 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 3,
    });

    expect(result.zero_allocation_ratio).toBe(0);
    expect(result.zero_allocation_score).toBe(1.0);
  });

  test("too many zeros → low score + disengagement pattern", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 100 },
        { target_id: "t2", points: 0 },
        { target_id: "t3", points: 0 },
        { target_id: "t4", points: 0 },
        { target_id: "t5", points: 0 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 5,
    });

    expect(result.zero_allocation_ratio).toBe(0.8);
    expect(result.zero_allocation_score).toBeLessThan(0.3);
    expect(result.patterns).toContain("disengagement");
  });
});

// ============================================================
// GINI COEFFICIENT
// ============================================================
describe("DisciplineAnalyzer — Gini Coefficient", () => {
  test("perfectly equal distribution → low Gini", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 25 },
        { target_id: "t2", points: 25 },
        { target_id: "t3", points: 25 },
        { target_id: "t4", points: 25 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 4,
    });

    expect(result.gini_coefficient).toBeCloseTo(0, 1);
    expect(result.patterns).toContain("egalitarian_spreading");
  });

  test("extreme inequality → high Gini + hero worship pattern", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 95 },
        { target_id: "t2", points: 2 },
        { target_id: "t3", points: 2 },
        { target_id: "t4", points: 1 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 4,
    });

    expect(result.gini_coefficient).toBeGreaterThan(0.5);
    expect(result.patterns).toContain("hero_worship");
  });
});

// ============================================================
// TRADE-OFF AWARENESS
// ============================================================
describe("DisciplineAnalyzer — Trade-off Score", () => {
  test("meaningful spread → good trade-off score", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 40 },
        { target_id: "t2", points: 30 },
        { target_id: "t3", points: 20 },
        { target_id: "t4", points: 10 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 4,
    });

    // Range = 40-10 = 30; normalised = 0.3 → within healthy range
    expect(result.tradeoff_score).toBe(1.0);
  });

  test("flat distribution → poor trade-off score", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 25 },
        { target_id: "t2", points: 25 },
        { target_id: "t3", points: 26 },
        { target_id: "t4", points: 24 },
      ],
      poolSize: 100,
      scarcityMode: "moderate",
      targetCount: 4,
    });

    // Range = 26-24 = 2; normalised = 0.02 → too flat
    expect(result.tradeoff_score).toBeLessThan(0.5);
  });
});

// ============================================================
// PATTERN DETECTION
// ============================================================
describe("DisciplineAnalyzer — Pattern Detection", () => {
  test("detects inflation tendency when over-allocating", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 50 },
        { target_id: "t2", points: 40 },
        { target_id: "t3", points: 30 },
      ],
      poolSize: 100, // Allocated 120 out of 100
      scarcityMode: "moderate",
      targetCount: 3,
    });

    expect(result.pool_usage_ratio).toBe(1.2);
    expect(result.patterns).toContain("inflation_tendency");
  });

  test("detects under_utilization when barely using pool", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 20 },
        { target_id: "t2", points: 10 },
        { target_id: "t3", points: 5 },
      ],
      poolSize: 100, // Only used 35%
      scarcityMode: "moderate",
      targetCount: 3,
    });

    expect(result.pool_usage_ratio).toBe(0.35);
    expect(result.patterns).toContain("under_utilization");
  });

  test("detects single_target_concentration", () => {
    const result = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 70 },
        { target_id: "t2", points: 20 },
        { target_id: "t3", points: 10 },
      ],
      poolSize: 100, // t1 gets 70%
      scarcityMode: "moderate",
      targetCount: 3,
    });

    expect(result.patterns).toContain("single_target_concentration");
  });
});

// ============================================================
// COMPOSITE SCORE BOUNDS
// ============================================================
describe("DisciplineAnalyzer — Score Bounds", () => {
  test("discipline score is always between 0.1 and 1.0", () => {
    // Test with extreme inputs
    const worstCase = DisciplineAnalyzer.analyze({
      allocations: [
        { target_id: "t1", points: 100 },
        { target_id: "t2", points: 0 },
        { target_id: "t3", points: 0 },
        { target_id: "t4", points: 0 },
        { target_id: "t5", points: 0 },
      ],
      poolSize: 50, // Over-allocated
      scarcityMode: "strict",
      targetCount: 5,
    });

    expect(worstCase.discipline_score).toBeGreaterThanOrEqual(0.1);
    expect(worstCase.discipline_score).toBeLessThanOrEqual(1.0);
  });
});
