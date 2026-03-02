// ============================================================
// CREDIBILITY ENGINE TESTS — Integration Tests (Mocked DB)
// ============================================================
// Tests the CredibilityEngine orchestrator pipeline with
// mocked repository layer. Verifies end-to-end signal flow:
//   session data → analyzers → compositor → smoother → persist
//
// Run: npx jest server/src/services/credibility/__tests__/CredibilityEngine.test.js
// ============================================================

// Mock the repository BEFORE requiring the engine
jest.mock("../storage/CredibilityRepository");
jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  pool: {},
}));
jest.mock("../../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const CredibilityRepository = require("../storage/CredibilityRepository");

// The engine is a singleton — we need to require it fresh
// or clear state between tests
let credibilityEngine;

beforeEach(() => {
  jest.clearAllMocks();

  // Re-require to get fresh singleton
  jest.isolateModules(() => {
    credibilityEngine = require("../CredibilityEngine");
  });
});

// ============================================================
// MOCK DATA FACTORIES
// ============================================================

/**
 * Creates a mock session data object as returned by
 * CredibilityRepository.getSessionDataForProcessing()
 */
function createMockSessionData(overrides = {}) {
  return {
    session: {
      session_id: "session-001",
      title: "Test Session",
      status: "aggregated",
      pool_size: 100,
      scarcity_mode: "moderate",
      evaluation_type: "project_member",
      ...overrides.session,
    },
    evaluators: overrides.evaluators || [
      { evaluator_id: "eval-001", full_name: "Alice" },
      { evaluator_id: "eval-002", full_name: "Bob" },
    ],
    allocations: overrides.allocations || [
      // Alice: allocates to head-1 targets
      {
        evaluator_id: "eval-001",
        target_id: "target-001",
        head_id: "head-001",
        points: 40,
      },
      {
        evaluator_id: "eval-001",
        target_id: "target-002",
        head_id: "head-001",
        points: 35,
      },
      {
        evaluator_id: "eval-001",
        target_id: "target-003",
        head_id: "head-001",
        points: 25,
      },
      // Bob: allocates to same head-1 targets
      {
        evaluator_id: "eval-002",
        target_id: "target-001",
        head_id: "head-001",
        points: 50,
      },
      {
        evaluator_id: "eval-002",
        target_id: "target-002",
        head_id: "head-001",
        points: 30,
      },
      {
        evaluator_id: "eval-002",
        target_id: "target-003",
        head_id: "head-001",
        points: 20,
      },
    ],
    aggregatedResults: overrides.aggregatedResults || [
      {
        head_id: "head-001",
        target_id: "target-001",
        mean_score: 45,
        variance: 25,
        consensus_score: 0.8,
        evaluator_count: 2,
      },
      {
        head_id: "head-001",
        target_id: "target-002",
        mean_score: 32.5,
        variance: 6.25,
        consensus_score: 0.9,
        evaluator_count: 2,
      },
      {
        head_id: "head-001",
        target_id: "target-003",
        mean_score: 22.5,
        variance: 6.25,
        consensus_score: 0.9,
        evaluator_count: 2,
      },
    ],
  };
}

// ============================================================
// PROCESS SESSION — HAPPY PATH
// ============================================================
describe("CredibilityEngine — processSession", () => {
  test("processes a valid aggregated session end-to-end", async () => {
    const mockData = createMockSessionData();

    // Mock repository methods
    CredibilityRepository.getConfiguration.mockResolvedValue({
      signal_weights: { alignment: 0.5, stability: 0.3, discipline: 0.2 },
      ema_parameters: { alpha: 0.2, min_sessions: 3 },
      collusion_safeguards: { max_change: 0.15, start_score: 0.5 },
    });

    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );
    CredibilityRepository.storeEvaluatorSignal.mockResolvedValue({
      id: "signal-1",
    });
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(null);
    CredibilityRepository.getEvaluatorSessionCount.mockResolvedValue(1);
    CredibilityRepository.upsertEvaluatorProfile.mockResolvedValue({
      evaluator_id: "eval-001",
    });
    CredibilityRepository.refreshWeightsView.mockResolvedValue();
    CredibilityRepository.markProcessed.mockResolvedValue({
      session_id: "session-001",
    });

    const result = await credibilityEngine.processSession("session-001");

    // Verify processing summary
    expect(result.session_id).toBe("session-001");
    expect(result.evaluators_processed).toBe(2);
    expect(result.evaluators_failed).toBe(0);
    expect(result.total_signals_stored).toBeGreaterThan(0);
    expect(result.profiles_updated).toBe(2);

    // Verify repository was called correctly
    expect(
      CredibilityRepository.getSessionDataForProcessing,
    ).toHaveBeenCalledWith("session-001");
    expect(CredibilityRepository.storeEvaluatorSignal).toHaveBeenCalled();
    expect(CredibilityRepository.upsertEvaluatorProfile).toHaveBeenCalledTimes(
      2,
    );
    expect(CredibilityRepository.refreshWeightsView).toHaveBeenCalled();
    expect(CredibilityRepository.markProcessed).toHaveBeenCalledWith(
      "session-001",
    );
  });
});

// ============================================================
// PROCESS SESSION — INVALID STATUS
// ============================================================
describe("CredibilityEngine — Invalid Session Status", () => {
  test("rejects session with status 'open'", async () => {
    const mockData = createMockSessionData({
      session: { status: "open" },
    });

    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );

    await expect(
      credibilityEngine.processSession("session-001"),
    ).rejects.toThrow("not eligible for credibility processing");
  });

  test("rejects session with status 'draft'", async () => {
    const mockData = createMockSessionData({
      session: { status: "draft" },
    });

    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );

    await expect(
      credibilityEngine.processSession("session-001"),
    ).rejects.toThrow("not eligible");
  });
});

// ============================================================
// PROCESS SESSION — NOT FOUND
// ============================================================
describe("CredibilityEngine — Session Not Found", () => {
  test("throws for non-existent session", async () => {
    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(null);

    await expect(
      credibilityEngine.processSession("nonexistent"),
    ).rejects.toThrow("Session not found");
  });
});

// ============================================================
// PROCESS SESSION — LOCKED STATUS (allowed)
// ============================================================
describe("CredibilityEngine — Locked Session", () => {
  test("accepts session with status 'locked'", async () => {
    const mockData = createMockSessionData({
      session: { status: "locked" },
    });

    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );
    CredibilityRepository.storeEvaluatorSignal.mockResolvedValue({});
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(null);
    CredibilityRepository.getEvaluatorSessionCount.mockResolvedValue(1);
    CredibilityRepository.upsertEvaluatorProfile.mockResolvedValue({});
    CredibilityRepository.refreshWeightsView.mockResolvedValue();
    CredibilityRepository.markProcessed.mockResolvedValue({});

    const result = await credibilityEngine.processSession("session-001");
    expect(result.evaluators_processed).toBe(2);
  });
});

// ============================================================
// EVALUATOR WITH HISTORY (stability matters)
// ============================================================
describe("CredibilityEngine — Evaluator With History", () => {
  test("historical signals feed into stability analysis", async () => {
    const mockData = createMockSessionData({
      evaluators: [{ evaluator_id: "eval-001", full_name: "Alice" }],
      allocations: [
        {
          evaluator_id: "eval-001",
          target_id: "target-001",
          head_id: "head-001",
          points: 40,
        },
        {
          evaluator_id: "eval-001",
          target_id: "target-002",
          head_id: "head-001",
          points: 35,
        },
        {
          evaluator_id: "eval-001",
          target_id: "target-003",
          head_id: "head-001",
          points: 25,
        },
      ],
    });

    // 5 previous sessions with consistent alignment
    const historicalSignals = [
      { alignment_score: 0.75, session_date: "2024-01-01" },
      { alignment_score: 0.78, session_date: "2024-02-01" },
      { alignment_score: 0.76, session_date: "2024-03-01" },
      { alignment_score: 0.77, session_date: "2024-04-01" },
      { alignment_score: 0.79, session_date: "2024-05-01" },
    ];

    CredibilityRepository.getConfiguration.mockResolvedValue({
      signal_weights: { alignment: 0.5, stability: 0.3, discipline: 0.2 },
      ema_parameters: { alpha: 0.2, min_sessions: 3 },
    });
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );
    CredibilityRepository.storeEvaluatorSignal.mockResolvedValue({});
    CredibilityRepository.getHistoricalSignals.mockResolvedValue(
      historicalSignals,
    );
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue({
      credibility_score: 0.7,
    });
    CredibilityRepository.getEvaluatorSessionCount.mockResolvedValue(6);
    CredibilityRepository.upsertEvaluatorProfile.mockResolvedValue({});
    CredibilityRepository.refreshWeightsView.mockResolvedValue();
    CredibilityRepository.markProcessed.mockResolvedValue({});

    const result = await credibilityEngine.processSession("session-001");

    expect(result.evaluators_processed).toBe(1);

    // Verify the profile was upserted with stability data
    const profileCall =
      CredibilityRepository.upsertEvaluatorProfile.mock.calls[0][0];
    expect(profileCall.evaluator_id).toBe("eval-001");
    expect(profileCall.credibility_band).toBeDefined();
    expect(profileCall.longitudinal_metrics).toBeDefined();
    expect(profileCall.longitudinal_metrics.stability_score).toBeDefined();
  });
});

// ============================================================
// EVALUATOR ERROR HANDLING
// ============================================================
describe("CredibilityEngine — Error Handling", () => {
  test("continues processing other evaluators if one fails", async () => {
    const mockData = createMockSessionData();

    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );

    // First evaluator succeeds, second fails
    let callCount = 0;
    CredibilityRepository.storeEvaluatorSignal.mockImplementation(() => {
      callCount++;
      if (callCount > 1) {
        // Fail on second evaluator's signal storage
        throw new Error("DB connection lost");
      }
      return Promise.resolve({});
    });

    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(null);
    CredibilityRepository.getEvaluatorSessionCount.mockResolvedValue(1);
    CredibilityRepository.upsertEvaluatorProfile.mockResolvedValue({});
    CredibilityRepository.refreshWeightsView.mockResolvedValue();
    CredibilityRepository.markProcessed.mockResolvedValue({});

    const result = await credibilityEngine.processSession("session-001");

    // One succeeded, one failed
    expect(result.evaluators_processed).toBe(1);
    expect(result.evaluators_failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("DB connection lost");
  });
});

// ============================================================
// PROCESS QUEUE
// ============================================================
describe("CredibilityEngine — processQueue", () => {
  test("processes all unprocessed queue items", async () => {
    const mockData = createMockSessionData();

    CredibilityRepository.getUnprocessedQueue.mockResolvedValue([
      { session_id: "session-001" },
      { session_id: "session-002" },
    ]);

    CredibilityRepository.getConfiguration.mockResolvedValue({});
    CredibilityRepository.getSessionDataForProcessing.mockResolvedValue(
      mockData,
    );
    CredibilityRepository.storeEvaluatorSignal.mockResolvedValue({});
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(null);
    CredibilityRepository.getEvaluatorSessionCount.mockResolvedValue(1);
    CredibilityRepository.upsertEvaluatorProfile.mockResolvedValue({});
    CredibilityRepository.refreshWeightsView.mockResolvedValue();
    CredibilityRepository.markProcessed.mockResolvedValue({});

    const result = await credibilityEngine.processQueue();

    expect(result.sessions_processed).toBe(2);
    expect(result.sessions_failed).toBe(0);
  });

  test("returns zero when queue is empty", async () => {
    CredibilityRepository.getUnprocessedQueue.mockResolvedValue([]);

    const result = await credibilityEngine.processQueue();

    expect(result.sessions_processed).toBe(0);
  });
});
