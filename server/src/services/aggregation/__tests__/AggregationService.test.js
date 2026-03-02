// ============================================================
// AGGREGATION SERVICE TESTS — Unit Tests (with DB mocks)
// ============================================================
// Tests the AggregationService's orchestration logic:
//   - Target grouping
//   - Single-evaluator handling
//   - Full pipeline from allocations → results
//
// The database layer (db.query, db.getClient) is fully mocked
// so these tests run without a live Postgres connection.
//
// Run: npx jest server/src/services/aggregation/__tests__/AggregationService.test.js
// ============================================================

// Mock the database module BEFORE requiring the service
jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock the logger to suppress output during tests
jest.mock("../../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../../../config/database");
const AggregationService = require("../AggregationService");

// ============================================================
// SETUP: Reusable mock helpers
// ============================================================

// Build a fake DB client for transaction tests
const buildMockClient = () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// _groupByTarget (internal but tested via public surface)
// ============================================================
describe("AggregationService: _groupByTarget", () => {
  test("groups allocations by target_id", () => {
    const allocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "7",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "4",
        created_at: new Date(),
      },
      {
        evaluator_id: "J1",
        target_id: "T2",
        points: "3",
        created_at: new Date(),
      },
    ];

    const groups = AggregationService._groupByTarget(allocations);

    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["T1"]).toHaveLength(2);
    expect(groups["T2"]).toHaveLength(1);
  });

  test("returns empty object for empty array", () => {
    expect(AggregationService._groupByTarget([])).toEqual({});
  });
});

// ============================================================
// _computeTargetStats
// ============================================================
describe("AggregationService: _computeTargetStats", () => {
  test("computes correct stats for 3 judges", () => {
    const allocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "7",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "4",
        created_at: new Date(),
      },
      {
        evaluator_id: "J3",
        target_id: "T1",
        points: "2",
        created_at: new Date(),
      },
    ];

    const result = AggregationService._computeTargetStats("T1", allocations);

    expect(result.targetId).toBe("T1");
    expect(result.mean).toBeCloseTo(4.333, 2);
    expect(result.min).toBe(2);
    expect(result.max).toBe(7);
    expect(result.variance).toBeCloseTo(4.222, 2);
    expect(result.judgeCount).toBe(3);
    expect(result.zeroCount).toBe(0);
    expect(result.consensusScore).toBeGreaterThan(0);
    expect(result.consensusScore).toBeLessThanOrEqual(1);
    expect(result.allocations).toHaveLength(3);
  });

  test("detects zero allocations", () => {
    const allocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "0",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "5",
        created_at: new Date(),
      },
      {
        evaluator_id: "J3",
        target_id: "T1",
        points: "0",
        created_at: new Date(),
      },
    ];

    const result = AggregationService._computeTargetStats("T1", allocations);

    expect(result.zeroCount).toBe(2);
  });

  test("handles all-zero allocations", () => {
    const allocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "0",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "0",
        created_at: new Date(),
      },
    ];

    const result = AggregationService._computeTargetStats("T1", allocations);

    expect(result.mean).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.consensusScore).toBe(1.0);
    expect(result.edgeCaseFlag).toBe("UNANIMOUS_ZERO");
  });
});

// ============================================================
// _buildSingleEvaluatorResult
// ============================================================
describe("AggregationService: _buildSingleEvaluatorResult", () => {
  test("handles single evaluator correctly", () => {
    const alloc = { evaluator_id: "J1", points: "8", created_at: new Date() };

    const result = AggregationService._buildSingleEvaluatorResult(
      "T1",
      8,
      alloc,
    );

    expect(result.targetId).toBe("T1");
    expect(result.mean).toBe(8);
    expect(result.variance).toBe(0);
    expect(result.stdDev).toBe(0);
    expect(result.judgeCount).toBe(1);
    expect(result.consensusScore).toBe(1.0);
    expect(result.edgeCaseFlag).toBe("SINGLE_EVALUATOR");
    expect(result.allocations).toHaveLength(1);
  });

  test("flags zero from single evaluator", () => {
    const alloc = { evaluator_id: "J1", points: "0", created_at: new Date() };

    const result = AggregationService._buildSingleEvaluatorResult(
      "T1",
      0,
      alloc,
    );

    expect(result.zeroCount).toBe(1);
    expect(result.mean).toBe(0);
  });
});

// ============================================================
// aggregateSession (full pipeline with mocked DB)
// ============================================================
describe("AggregationService: aggregateSession", () => {
  test("returns empty array when no allocations exist", async () => {
    // Mock: no allocations found
    db.query.mockResolvedValueOnce({ rows: [] });

    const results = await AggregationService.aggregateSession("session-123");

    expect(results).toEqual([]);
  });

  test("aggregates 3 judges × 2 targets correctly", async () => {
    const mockAllocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "7",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "4",
        created_at: new Date(),
      },
      {
        evaluator_id: "J3",
        target_id: "T1",
        points: "2",
        created_at: new Date(),
      },
      {
        evaluator_id: "J1",
        target_id: "T2",
        points: "3",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T2",
        points: "6",
        created_at: new Date(),
      },
      {
        evaluator_id: "J3",
        target_id: "T2",
        points: "8",
        created_at: new Date(),
      },
    ];

    // Mock: fetch allocations
    db.query.mockResolvedValueOnce({ rows: mockAllocations });

    // Mock: getClient for transaction
    const mockClient = buildMockClient();
    db.getClient.mockResolvedValueOnce(mockClient);

    // Mock: mark queue processed (UPDATE aggregation_queue)
    db.query.mockResolvedValueOnce({ rows: [] });

    const results = await AggregationService.aggregateSession("session-456");

    // Should produce 2 target results
    expect(results).toHaveLength(2);

    // Find target T1
    const t1 = results.find((r) => r.targetId === "T1");
    expect(t1).toBeDefined();
    expect(t1.mean).toBeCloseTo(4.333, 2);
    expect(t1.judgeCount).toBe(3);

    // Find target T2
    const t2 = results.find((r) => r.targetId === "T2");
    expect(t2).toBeDefined();
    expect(t2.mean).toBeCloseTo(5.667, 2);
    expect(t2.judgeCount).toBe(3);

    // Verify transaction was used for storage
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  test("handles single evaluator within multi-target session", async () => {
    const mockAllocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "10",
        created_at: new Date(),
      },
      {
        evaluator_id: "J1",
        target_id: "T2",
        points: "5",
        created_at: new Date(),
      },
    ];

    db.query.mockResolvedValueOnce({ rows: mockAllocations });
    const mockClient = buildMockClient();
    db.getClient.mockResolvedValueOnce(mockClient);
    db.query.mockResolvedValueOnce({ rows: [] });

    const results = await AggregationService.aggregateSession("session-single");

    expect(results).toHaveLength(2);

    // Both targets should be flagged as single evaluator
    results.forEach((r) => {
      expect(r.judgeCount).toBe(1);
      expect(r.variance).toBe(0);
      expect(r.edgeCaseFlag).toBe("SINGLE_EVALUATOR");
    });
  });

  test("rolls back transaction on storage failure", async () => {
    const mockAllocations = [
      {
        evaluator_id: "J1",
        target_id: "T1",
        points: "5",
        created_at: new Date(),
      },
      {
        evaluator_id: "J2",
        target_id: "T1",
        points: "3",
        created_at: new Date(),
      },
    ];

    db.query.mockResolvedValueOnce({ rows: mockAllocations });

    // Mock: client that fails on INSERT
    const mockClient = buildMockClient();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // DELETE
      .mockRejectedValueOnce(new Error("INSERT failed")); // INSERT fails
    db.getClient.mockResolvedValueOnce(mockClient);

    await expect(
      AggregationService.aggregateSession("session-fail"),
    ).rejects.toThrow("Aggregation failed");

    // Verify ROLLBACK was called
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});

// ============================================================
// getSessionResults (cache layer)
// ============================================================
describe("AggregationService: getSessionResults", () => {
  test("returns cached results when available", async () => {
    // Mock: cached results exist in DB
    db.query.mockResolvedValueOnce({
      rows: [
        {
          target_id: "T1",
          mean_score: "5.000",
          min_score: "3.000",
          max_score: "7.000",
          variance: "2.667",
          std_dev: "1.633",
          judge_count: 3,
          zero_count: 0,
          median_score: "5.000",
          skewness: "0.000",
          kurtosis: "-1.500",
          consensus_score: "0.750",
          computed_at: new Date(),
          version: 1,
        },
      ],
    });

    const results =
      await AggregationService.getSessionResults("cached-session");

    expect(results).toHaveLength(1);
    expect(results[0].targetId).toBe("T1");
    expect(results[0].mean).toBe(5);
  });

  test("falls back to live aggregation when cache is empty", async () => {
    // Mock: cache miss (no rows)
    db.query.mockResolvedValueOnce({ rows: [] });

    // Mock: live aggregation — fetch allocations
    db.query.mockResolvedValueOnce({
      rows: [
        {
          evaluator_id: "J1",
          target_id: "T1",
          points: "4",
          created_at: new Date(),
        },
      ],
    });

    // Mock: getClient for transaction
    const mockClient = buildMockClient();
    db.getClient.mockResolvedValueOnce(mockClient);

    // Mock: mark queue processed
    db.query.mockResolvedValueOnce({ rows: [] });

    const results =
      await AggregationService.getSessionResults("no-cache-session");

    // Should still return results (computed live)
    expect(results).toHaveLength(1);
    expect(results[0].edgeCaseFlag).toBe("SINGLE_EVALUATOR");
  });
});

// ============================================================
// clearSessionCache
// ============================================================
describe("AggregationService: clearSessionCache", () => {
  test("deletes cached results for session", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await AggregationService.clearSessionCache("session-to-clear");

    expect(db.query).toHaveBeenCalledWith(
      "DELETE FROM session_aggregation_results WHERE session_id = $1",
      ["session-to-clear"],
    );
  });
});
