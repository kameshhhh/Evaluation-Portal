// ============================================================
// ENHANCED AGGREGATION SERVICE — Comprehensive Test Suite
// ============================================================
// Tests the governance-aware aggregation pipeline:
//   1. Session lock verification (only LOCKED sessions aggregate)
//   2. Allocation grouping (multi-head support)
//   3. Statistical computation (mean, variance, consensus, etc.)
//   4. Zero semantic classification (SRS 4.1.5)
//   5. Consensus categorization (PERFECT → SPLIT)
//   6. Result storage (immutable writes to aggregated_results)
//   7. Session state transition (locked → aggregated)
//   8. Edge cases (single evaluator, empty session, all zeros)
//   9. Error handling (AggregationError codes)
//
// ALL DATABASE CALLS ARE MOCKED — tests run in complete isolation.
//
// Run: npx jest server/src/services/scarcity/__tests__/EnhancedAggregationService.test.js
// ============================================================

// ============================================================
// MOCK SETUP
// ============================================================

// Mock database module
jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock logger
jest.mock("../../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ============================================================
// IMPORTS
// ============================================================
const db = require("../../../config/database");
const aggregationService = require("../EnhancedAggregationService");
const { AggregationError } = require("../EnhancedAggregationService");

// ============================================================
// HELPER: Mock transaction client
// ============================================================
const createMockClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

// ============================================================
// HELPER: Build mock session row
// ============================================================
const buildSession = (overrides = {}) => ({
  session_id: "sess-001",
  status: "locked",
  scarcity_pool_size: 100,
  evaluation_mode: "scarcity",
  intent: "peer_review",
  ...overrides,
});

// ============================================================
// HELPER: Build mock allocation rows
// ============================================================
const buildAllocations = (specs) => {
  // specs: Array of { evaluator, target, head, points }
  return specs.map((s, i) => ({
    evaluator_id: s.evaluator || `eval-${i}`,
    target_id: s.target || `target-0`,
    head_id: s.head || null,
    points: s.points,
    created_at: new Date("2024-01-01"),
  }));
};

// ============================================================
// TEST SUITE: AggregationError
// ============================================================
describe("AggregationError", () => {
  test("creates error with code and details", () => {
    const err = new AggregationError("TEST", "test msg", { x: 1 });

    expect(err.name).toBe("AggregationError");
    expect(err.code).toBe("TEST");
    expect(err.message).toBe("test msg");
    expect(err.details).toEqual({ x: 1 });
    expect(err.timestamp).toBeTruthy();
  });

  test("is an instance of Error", () => {
    const err = new AggregationError("CODE", "msg");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================
// TEST SUITE: _groupAllocations (pure function)
// ============================================================
describe("_groupAllocations", () => {
  test("groups by head_id then target_id", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", head: "h1", points: 10 },
      { evaluator: "e2", target: "t1", head: "h1", points: 20 },
      { evaluator: "e1", target: "t2", head: "h1", points: 30 },
      { evaluator: "e1", target: "t1", head: "h2", points: 15 },
    ]);

    const groups = aggregationService._groupAllocations(allocations);

    // Head h1 should have 2 targets
    expect(Object.keys(groups["h1"])).toHaveLength(2);
    expect(groups["h1"]["t1"]).toHaveLength(2);
    expect(groups["h1"]["t2"]).toHaveLength(1);

    // Head h2 should have 1 target
    expect(Object.keys(groups["h2"])).toHaveLength(1);
    expect(groups["h2"]["t1"]).toHaveLength(1);
  });

  test("uses 'null' string key for allocations without head_id", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", head: null, points: 10 },
      { evaluator: "e2", target: "t1", head: null, points: 20 },
    ]);

    const groups = aggregationService._groupAllocations(allocations);

    expect(groups["null"]).toBeDefined();
    expect(groups["null"]["t1"]).toHaveLength(2);
  });
});

// ============================================================
// TEST SUITE: _classifyZeroSemantic (pure function)
// ============================================================
describe("_classifyZeroSemantic", () => {
  test("returns NO_ZEROS when zero ratio is 0", () => {
    expect(aggregationService._classifyZeroSemantic(0)).toBe("NO_ZEROS");
  });

  test("returns MINORITY_ZERO when ratio <= 0.3", () => {
    expect(aggregationService._classifyZeroSemantic(0.1)).toBe("MINORITY_ZERO");
    expect(aggregationService._classifyZeroSemantic(0.25)).toBe(
      "MINORITY_ZERO",
    );
  });

  test("returns PLURALITY_ZERO when 0.3 < ratio <= 0.5", () => {
    expect(aggregationService._classifyZeroSemantic(0.4)).toBe(
      "PLURALITY_ZERO",
    );
    expect(aggregationService._classifyZeroSemantic(0.5)).toBe(
      "PLURALITY_ZERO",
    );
  });

  test("returns MAJORITY_ZERO when 0.5 < ratio < 1", () => {
    expect(aggregationService._classifyZeroSemantic(0.6)).toBe("MAJORITY_ZERO");
    expect(aggregationService._classifyZeroSemantic(0.8)).toBe("MAJORITY_ZERO");
  });

  test("returns UNANIMOUS_ZERO when ratio is 1", () => {
    expect(aggregationService._classifyZeroSemantic(1)).toBe("UNANIMOUS_ZERO");
  });
});

// ============================================================
// TEST SUITE: _categorizeConsensus (pure function)
// ============================================================
describe("_categorizeConsensus", () => {
  test("PERFECT for score >= 0.95", () => {
    expect(aggregationService._categorizeConsensus(1.0)).toBe("PERFECT");
    expect(aggregationService._categorizeConsensus(0.95)).toBe("PERFECT");
  });

  test("HIGH for score >= 0.75", () => {
    expect(aggregationService._categorizeConsensus(0.9)).toBe("HIGH");
    expect(aggregationService._categorizeConsensus(0.75)).toBe("HIGH");
  });

  test("MODERATE for score >= 0.5", () => {
    expect(aggregationService._categorizeConsensus(0.6)).toBe("MODERATE");
    expect(aggregationService._categorizeConsensus(0.5)).toBe("MODERATE");
  });

  test("LOW for score >= 0.25", () => {
    expect(aggregationService._categorizeConsensus(0.3)).toBe("LOW");
    expect(aggregationService._categorizeConsensus(0.25)).toBe("LOW");
  });

  test("SPLIT for score < 0.25", () => {
    expect(aggregationService._categorizeConsensus(0.1)).toBe("SPLIT");
    expect(aggregationService._categorizeConsensus(0)).toBe("SPLIT");
  });
});

// ============================================================
// TEST SUITE: _computeTargetStatistics (uses StatisticalAnalyzer)
// ============================================================
describe("_computeTargetStatistics", () => {
  const session = buildSession();

  test("computes correct statistics for multiple evaluators", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", points: 10 },
      { evaluator: "e2", target: "t1", points: 20 },
      { evaluator: "e3", target: "t1", points: 30 },
    ]);

    const stats = aggregationService._computeTargetStatistics(
      "t1",
      "null",
      allocations,
      session,
    );

    // Mean should be 20
    expect(stats.mean_score).toBe(20);
    // Min = 10, Max = 30
    expect(stats.min_score).toBe(10);
    expect(stats.max_score).toBe(30);
    expect(stats.range).toBe(20);
    // Variance > 0
    expect(stats.variance).toBeGreaterThan(0);
    // 3 evaluators
    expect(stats.evaluator_count).toBe(3);
    // No zeros
    expect(stats.zero_count).toBe(0);
    expect(stats.zero_semantic).toBe("NO_ZEROS");
    // Session context captured
    expect(stats.pool_size).toBe(100);
    expect(stats.evaluation_mode).toBe("scarcity");
  });

  test("handles single evaluator edge case", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", points: 42 },
    ]);

    const stats = aggregationService._computeTargetStatistics(
      "t1",
      "null",
      allocations,
      session,
    );

    // Single evaluator: mean == the value, variance == 0
    expect(stats.mean_score).toBe(42);
    expect(stats.variance).toBe(0);
    expect(stats.std_dev).toBe(0);
    expect(stats.evaluator_count).toBe(1);
    expect(stats.consensus_score).toBe(1.0);
    expect(stats.consensus_category).toBe("PERFECT");
    expect(stats.metadata.single_evaluator).toBe(true);
  });

  test("correctly classifies zero allocations", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", points: 0 },
      { evaluator: "e2", target: "t1", points: 0 },
      { evaluator: "e3", target: "t1", points: 10 },
    ]);

    const stats = aggregationService._computeTargetStatistics(
      "t1",
      "null",
      allocations,
      session,
    );

    // 2/3 evaluators gave zero
    expect(stats.zero_count).toBe(2);
    // 2/3 ≈ 0.667 → MAJORITY_ZERO
    expect(stats.zero_semantic).toBe("MAJORITY_ZERO");
  });

  test("handles all-zero allocations (UNANIMOUS_ZERO)", () => {
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", points: 0 },
      { evaluator: "e2", target: "t1", points: 0 },
    ]);

    const stats = aggregationService._computeTargetStatistics(
      "t1",
      "null",
      allocations,
      session,
    );

    expect(stats.zero_count).toBe(2);
    expect(stats.zero_ratio).toBe(1);
    expect(stats.zero_semantic).toBe("UNANIMOUS_ZERO");
    expect(stats.mean_score).toBe(0);
  });

  test("preserves distribution quartiles", () => {
    // 5 scores for meaningful quartiles
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", points: 5 },
      { evaluator: "e2", target: "t1", points: 10 },
      { evaluator: "e3", target: "t1", points: 15 },
      { evaluator: "e4", target: "t1", points: 20 },
      { evaluator: "e5", target: "t1", points: 25 },
    ]);

    const stats = aggregationService._computeTargetStatistics(
      "t1",
      "null",
      allocations,
      session,
    );

    expect(stats.median).toBe(15);
    // Q1 and Q3 should be reasonable
    expect(stats.q1).toBeLessThan(stats.median);
    expect(stats.q3).toBeGreaterThan(stats.median);
    expect(stats.iqr).toBe(stats.q3 - stats.q1);
  });
});

// ============================================================
// TEST SUITE: _computeSessionInsights (pure function)
// ============================================================
describe("_computeSessionInsights", () => {
  test("computes averages across target results", () => {
    const targetResults = [
      { mean_score: 10, variance: 2, consensus_score: 0.8, zero_count: 1 },
      { mean_score: 20, variance: 4, consensus_score: 0.6, zero_count: 3 },
    ];

    const insights = aggregationService._computeSessionInsights(targetResults);

    expect(insights.avgMean).toBe(15);
    expect(insights.avgVariance).toBe(3);
    expect(insights.avgConsensus).toBe(0.7);
    expect(insights.totalZeros).toBe(4);
    expect(insights.targetCount).toBe(2);
  });

  test("handles empty results", () => {
    const insights = aggregationService._computeSessionInsights([]);

    expect(insights.avgMean).toBe(0);
    expect(insights.totalZeros).toBe(0);
  });
});

// ============================================================
// TEST SUITE: aggregateSession — Happy Path
// ============================================================
describe("aggregateSession — happy path", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.getClient.mockResolvedValue(mockClient);
  });

  test("completes full aggregation pipeline for a locked session", async () => {
    const session = buildSession();
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", head: null, points: 10 },
      { evaluator: "e2", target: "t1", head: null, points: 20 },
      { evaluator: "e1", target: "t2", head: null, points: 30 },
      { evaluator: "e2", target: "t2", head: null, points: 40 },
    ]);

    // Mock db.query calls in sequence:
    db.query
      // 1. _verifySessionLocked
      .mockResolvedValueOnce({ rows: [session] })
      // 2. _fetchAllocations
      .mockResolvedValueOnce({ rows: allocations });

    const report = await aggregationService.aggregateSession("sess-001");

    // Report should be complete
    expect(report.status).toBe("COMPLETED");
    expect(report.statistics.totalAllocations).toBe(4);
    expect(report.targets).toHaveLength(2); // 2 targets
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    // Verify _storeResults was called (uses getClient)
    expect(db.getClient).toHaveBeenCalled();
  });

  test("handles multi-head allocations correctly", async () => {
    const session = buildSession();
    const allocations = buildAllocations([
      { evaluator: "e1", target: "t1", head: "h1", points: 10 },
      { evaluator: "e2", target: "t1", head: "h1", points: 20 },
      { evaluator: "e1", target: "t1", head: "h2", points: 15 },
      { evaluator: "e2", target: "t1", head: "h2", points: 25 },
    ]);

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: allocations });

    const report = await aggregationService.aggregateSession("sess-001");

    // Should produce 2 results: t1 under h1, t1 under h2
    expect(report.targets).toHaveLength(2);
    expect(report.statistics.headCount).toBe(2);
  });

  test("handles empty allocations gracefully", async () => {
    const session = buildSession();

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: [] }); // No allocations

    const report = await aggregationService.aggregateSession("sess-001");

    expect(report.status).toBe("EMPTY");
    expect(report.targets).toHaveLength(0);
  });
});

// ============================================================
// TEST SUITE: aggregateSession — Error Paths
// ============================================================
describe("aggregateSession — error paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects session that is not LOCKED", async () => {
    // Session is still 'open'
    db.query.mockResolvedValueOnce({
      rows: [buildSession({ status: "open" })],
    });

    await expect(
      aggregationService.aggregateSession("sess-001"),
    ).rejects.toThrow("LOCKED");
  });

  test("rejects nonexistent session", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      aggregationService.aggregateSession("nonexistent"),
    ).rejects.toThrow();
  });

  test("rejects already aggregated session", async () => {
    db.query.mockResolvedValueOnce({
      rows: [buildSession({ status: "aggregated" })],
    });

    await expect(
      aggregationService.aggregateSession("sess-001"),
    ).rejects.toThrow("LOCKED");
  });
});

// ============================================================
// TEST SUITE: getSessionResults
// ============================================================
describe("getSessionResults", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns null when no results exist", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await aggregationService.getSessionResults("sess-001");
    expect(result).toBeNull();
  });

  test("returns formatted target results without raw data", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          target_id: "t1",
          head_id: null,
          mean_score: "15.000",
          min_score: "10.000",
          max_score: "20.000",
          range: "10.000",
          variance: "25.000",
          std_dev: "5.000",
          median: "15.000",
          q1: "12.500",
          q3: "17.500",
          iqr: "5.000",
          skewness: "0.000",
          kurtosis: "-1.500",
          zero_count: 0,
          zero_ratio: "0.000",
          zero_semantic: "NO_ZEROS",
          consensus_score: "0.850",
          consensus_category: "HIGH",
          evaluator_count: 2,
          computed_at: "2024-01-01",
          aggregation_version: 1,
        },
      ],
    });

    const targets = await aggregationService.getSessionResults(
      "sess-001",
      false,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0].statistics.mean).toBe(15);
    expect(targets[0].consensus.category).toBe("HIGH");
    expect(targets[0].zeroAnalysis.semantic).toBe("NO_ZEROS");
    // No raw allocations when includeRaw is false
    expect(targets[0].rawAllocations).toBeUndefined();
  });

  test("includes raw allocations when requested", async () => {
    db.query
      // Main results query
      .mockResolvedValueOnce({
        rows: [
          {
            target_id: "t1",
            head_id: null,
            mean_score: "15.000",
            min_score: "10.000",
            max_score: "20.000",
            range: "10.000",
            variance: "25.000",
            std_dev: "5.000",
            median: "15.000",
            q1: "12.500",
            q3: "17.500",
            iqr: "5.000",
            skewness: "0.000",
            kurtosis: "-1.500",
            zero_count: 0,
            zero_ratio: "0.000",
            zero_semantic: "NO_ZEROS",
            consensus_score: "0.850",
            consensus_category: "HIGH",
            evaluator_count: 2,
            computed_at: "2024-01-01",
            aggregation_version: 1,
          },
        ],
      })
      // Raw allocations query for target t1
      .mockResolvedValueOnce({
        rows: [
          {
            evaluator_id: "e1",
            points: "10.000",
            created_at: "2024-01-01",
          },
          {
            evaluator_id: "e2",
            points: "20.000",
            created_at: "2024-01-01",
          },
        ],
      });

    const targets = await aggregationService.getSessionResults(
      "sess-001",
      true,
    );

    expect(targets[0].rawAllocations).toHaveLength(2);
    expect(targets[0].rawAllocations[0].points).toBe(10);
  });
});
