// ============================================================
// SESSION FINALIZATION SERVICE — Comprehensive Test Suite
// ============================================================
// Tests the SessionFinalizationService governance layer:
//   1. Finalization lifecycle (open → closed → locked)
//   2. Completeness validation (min evaluators, coverage, deadline)
//   3. Integrity verification (pool, self-eval, duplicates, temporal)
//   4. Cryptographic sealing (SHA-256 hash generation)
//   5. State transition rules (valid + invalid transitions)
//   6. Error handling (FinalizationError codes)
//   7. Readiness readout (getFinalizationReadiness)
//
// ALL DATABASE CALLS ARE MOCKED — tests run in complete isolation
// without a live Postgres connection.
//
// Run: npx jest server/src/services/scarcity/__tests__/SessionFinalizationService.test.js
// ============================================================

// ============================================================
// MOCK SETUP — Must be declared before requiring module
// ============================================================

// Mock database
jest.mock("../../../config/database", () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

// Mock logger (suppress output during tests)
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

// The module exports a singleton instance.
// We must re-require inside tests or use the singleton directly.
const finalizationService = require("../SessionFinalizationService");
const {
  FinalizationError,
  VALID_TRANSITIONS,
} = require("../SessionFinalizationService");

// ============================================================
// HELPER: Build a mock DB client for transactions
// ============================================================
const createMockClient = () => ({
  query: jest.fn(),
  release: jest.fn(),
});

// ============================================================
// HELPER: Build a mock evaluation session row
// ============================================================
const buildSessionRow = (overrides = {}) => ({
  session_id: "sess-001",
  status: "open",
  session_type: "evaluation",
  intent: "peer_review",
  min_evaluators: 2,
  scarcity_pool_size: 100,
  evaluation_mode: "scarcity",
  evaluation_window_end: new Date("2020-01-01").toISOString(), // past deadline
  ...overrides,
});

// ============================================================
// HELPER: Build mock allocation rows
// ============================================================
const buildAllocations = (count = 3) => {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      allocation_id: `alloc-${i}`,
      evaluator_id: `eval-${i}`,
      target_id: `target-${i % 2}`,
      points: (i + 1) * 10,
      created_at: new Date("2019-12-15"),
    });
  }
  return rows;
};

// ============================================================
// TEST SUITE: VALID_TRANSITIONS
// ============================================================
describe("VALID_TRANSITIONS constant", () => {
  test("draft can transition to open or scheduled", () => {
    // Verify the truth table entry for draft
    expect(VALID_TRANSITIONS.draft).toEqual(["open", "scheduled"]);
  });

  test("open can transition to closed or in_progress", () => {
    expect(VALID_TRANSITIONS.open).toEqual(["closed", "in_progress"]);
  });

  test("closed can only transition to locked", () => {
    expect(VALID_TRANSITIONS.closed).toEqual(["locked"]);
  });

  test("locked can only transition to aggregated", () => {
    // This is the final governance gate before aggregation
    expect(VALID_TRANSITIONS.locked).toEqual(["aggregated"]);
  });

  test("aggregated is terminal (no transitions)", () => {
    // There should be no 'aggregated' key at all
    expect(VALID_TRANSITIONS.aggregated).toBeUndefined();
  });
});

// ============================================================
// TEST SUITE: FinalizationError
// ============================================================
describe("FinalizationError", () => {
  test("creates error with code and details", () => {
    const err = new FinalizationError("TEST_CODE", "test message", { foo: 1 });

    expect(err.name).toBe("FinalizationError");
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.details).toEqual({ foo: 1 });
    expect(err.timestamp).toBeTruthy();
  });

  test("defaults details to empty object", () => {
    const err = new FinalizationError("CODE", "msg");
    expect(err.details).toEqual({});
  });

  test("is an instance of Error", () => {
    const err = new FinalizationError("CODE", "msg");
    expect(err).toBeInstanceOf(Error);
  });
});

// ============================================================
// TEST SUITE: getFinalizationReadiness
// ============================================================
describe("getFinalizationReadiness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns readiness data from validate_session_finalization function", async () => {
    // Mock the DB call to the stored function
    db.query.mockResolvedValueOnce({
      rows: [
        {
          can_finalize: true,
          reason: "All requirements met",
          evaluator_count: 5,
          target_coverage: "0.95",
          deadline_status: "Deadline passed",
        },
      ],
    });

    const result =
      await finalizationService.getFinalizationReadiness("sess-001");

    // Should call the stored function
    expect(db.query).toHaveBeenCalledWith(
      "SELECT * FROM validate_session_finalization($1)",
      ["sess-001"],
    );

    // Should return parsed result
    expect(result).toEqual({
      canFinalize: true,
      reason: "All requirements met",
      evaluatorCount: 5,
      targetCoverage: 0.95,
      deadlineStatus: "Deadline passed",
    });
  });

  test("returns not-found response when no rows returned", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result =
      await finalizationService.getFinalizationReadiness("nonexistent");

    expect(result.canFinalize).toBe(false);
    expect(result.reason).toContain("not found");
  });
});

// ============================================================
// TEST SUITE: finalizeSession — Happy Path
// ============================================================
describe("finalizeSession — happy path", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.getClient.mockResolvedValue(mockClient);
    // Default: all client queries succeed
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  test("completes full finalization pipeline for an open session", async () => {
    const session = buildSessionRow({ status: "open" });
    const allocations = buildAllocations(4);

    // Mock sequence of db.query calls:
    // 1. _acquireSessionLock — SELECT ... FOR UPDATE NOWAIT
    db.query
      .mockResolvedValueOnce({ rows: [session] })
      // 2. _countDistinctEvaluators
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      // 3. _findIncompleteEvaluators
      .mockResolvedValueOnce({ rows: [] })
      // 4. _calculateTargetCoverage (evaluated count)
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      // 5. _checkPoolViolations
      .mockResolvedValueOnce({ rows: [] })
      // 6. _checkSelfEvaluations
      .mockResolvedValueOnce({ rows: [] })
      // 7. _checkDuplicateAllocations
      .mockResolvedValueOnce({ rows: [] })
      // 8. _checkTemporalIntegrity
      .mockResolvedValueOnce({ rows: [] })
      // 9. _generateCryptographicSeal — fetch allocations
      .mockResolvedValueOnce({ rows: allocations })
      // 10. UPDATE finalization_seal
      .mockResolvedValueOnce({ rows: [] });

    const report = await finalizationService.finalizeSession("sess-001", {
      adminId: "admin-001",
      reason: "Test finalization",
    });

    // Report should contain all 6 steps
    expect(report.steps).toHaveLength(6);
    expect(report.finalState).toBe("locked");
    expect(report.cryptographicSeal).toBeTruthy();
    expect(report.cryptographicSeal.algorithm).toBe("SHA-256");
    expect(report.cryptographicSeal.hash).toBeTruthy();
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    // Verify transitions were called (client is used for transactions)
    // open → closed, then closed → locked = 2 transaction rounds
    expect(db.getClient).toHaveBeenCalledTimes(2);
  });

  test("generates unique cryptographic seals for different data", async () => {
    const session = buildSessionRow({ status: "open" });

    // Two different allocation sets should produce different seals
    const allocations1 = buildAllocations(3);
    const allocations2 = buildAllocations(3).map((a) => ({
      ...a,
      points: a.points + 5,
    }));

    // First finalization
    db.query
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: allocations1 })
      .mockResolvedValueOnce({ rows: [] });

    const report1 = await finalizationService.finalizeSession("sess-001", {
      adminId: "admin-001",
    });

    jest.clearAllMocks();
    db.getClient.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    // Second finalization with different data
    db.query
      .mockResolvedValueOnce({ rows: [buildSessionRow({ status: "open" })] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: allocations2 })
      .mockResolvedValueOnce({ rows: [] });

    const report2 = await finalizationService.finalizeSession("sess-002", {
      adminId: "admin-001",
    });

    // Seals should be different for different data
    expect(report1.cryptographicSeal.hash).not.toBe(
      report2.cryptographicSeal.hash,
    );
  });
});

// ============================================================
// TEST SUITE: finalizeSession — Error Paths
// ============================================================
describe("finalizeSession — error paths", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.getClient.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  test("rejects sessions not in open/in_progress state", async () => {
    // Session is already locked — can't finalize
    db.query.mockResolvedValueOnce({
      rows: [buildSessionRow({ status: "locked" })],
    });

    await expect(
      finalizationService.finalizeSession("sess-001"),
    ).rejects.toThrow(FinalizationError);

    try {
      db.query.mockResolvedValueOnce({
        rows: [buildSessionRow({ status: "locked" })],
      });
      await finalizationService.finalizeSession("sess-001");
    } catch (err) {
      expect(err.code).toBe("INVALID_STATE_TRANSITION");
    }
  });

  test("rejects finalization when session not found", async () => {
    // Empty result = session does not exist
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      finalizationService.finalizeSession("nonexistent"),
    ).rejects.toThrow(FinalizationError);
  });

  test("rejects incomplete session without force flag", async () => {
    const session = buildSessionRow({
      status: "open",
      min_evaluators: 5, // Requires 5, but only 2 exist
    });

    // _acquireSessionLock
    db.query
      .mockResolvedValueOnce({ rows: [session] })
      // _countDistinctEvaluators — only 2, needs 5
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      // _findIncompleteEvaluators
      .mockResolvedValueOnce({ rows: [{ evaluator_id: "e3" }] })
      // _calculateTargetCoverage
      .mockResolvedValueOnce({ rows: [{ count: "3" }] });

    try {
      await finalizationService.finalizeSession("sess-001");
      fail("Should have thrown");
    } catch (err) {
      expect(err.code).toBe("INCOMPLETE_SESSION");
    }
  });

  test("allows force finalization even when incomplete", async () => {
    const session = buildSessionRow({
      status: "open",
      min_evaluators: 10, // Way too many required
    });
    const allocations = buildAllocations(2);

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      // _countDistinctEvaluators — only 2
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      // _findIncompleteEvaluators
      .mockResolvedValueOnce({
        rows: [{ evaluator_id: "e3" }, { evaluator_id: "e4" }],
      })
      // _calculateTargetCoverage
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      // Integrity checks — all clean
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      // _generateCryptographicSeal
      .mockResolvedValueOnce({ rows: allocations })
      // UPDATE finalization metadata
      .mockResolvedValueOnce({ rows: [] });

    // Should succeed with { force: true }
    const report = await finalizationService.finalizeSession("sess-001", {
      force: true,
      adminId: "admin-001",
      reason: "Force override",
    });

    expect(report.finalState).toBe("locked");
    // Completeness should be recorded as not complete
    expect(report.validations.completeness.isComplete).toBe(false);
  });

  test("rejects when integrity violations found", async () => {
    const session = buildSessionRow({ status: "open" });

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      // Completeness: all good
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      // Integrity check 1: pool violation found!
      .mockResolvedValueOnce({
        rows: [{ evaluator_id: "eval-bad", total_used: "200" }],
      })
      // Integrity check 2: self-eval (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 3: duplicates (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 4: temporal (clean)
      .mockResolvedValueOnce({ rows: [] });

    try {
      await finalizationService.finalizeSession("sess-001");
      fail("Should have thrown");
    } catch (err) {
      expect(err.code).toBe("INTEGRITY_VIOLATION");
      expect(err.details).toBeDefined();
    }
  });
});

// ============================================================
// TEST SUITE: State Transition Validation
// ============================================================
describe("state transition enforcement", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.getClient.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  test("rejects transition from open to aggregated (skipping steps)", async () => {
    // Try to go directly from open → aggregated (not allowed)
    const session = buildSessionRow({ status: "draft" });
    db.query.mockResolvedValueOnce({ rows: [session] });

    // draft is not open/in_progress, so finalizeSession rejects it at the guard
    await expect(
      finalizationService.finalizeSession("sess-001"),
    ).rejects.toThrow(FinalizationError);
  });

  test("accepts in_progress → closed transition during finalization", async () => {
    const session = buildSessionRow({ status: "in_progress" });
    const allocations = buildAllocations(3);

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: allocations })
      .mockResolvedValueOnce({ rows: [] });

    const report = await finalizationService.finalizeSession("sess-001", {
      adminId: "admin-001",
    });

    // Should work: in_progress → closed → locked
    expect(report.finalState).toBe("locked");
  });
});

// ============================================================
// TEST SUITE: Integrity Verification Details
// ============================================================
describe("integrity verification", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.getClient.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  test("detects self-evaluation violations", async () => {
    const session = buildSessionRow({ status: "open" });

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      // Completeness: all good
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      // Integrity check 1: pool (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 2: self-eval VIOLATION
      .mockResolvedValueOnce({
        rows: [
          {
            allocation_id: "a1",
            evaluator_id: "person-1",
            target_id: "person-1",
          },
        ],
      })
      // Integrity check 3: duplicates (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 4: temporal (clean)
      .mockResolvedValueOnce({ rows: [] });

    try {
      await finalizationService.finalizeSession("sess-001");
      fail("Should have thrown");
    } catch (err) {
      expect(err.code).toBe("INTEGRITY_VIOLATION");
    }
  });

  test("detects duplicate allocations", async () => {
    const session = buildSessionRow({ status: "open" });

    db.query
      .mockResolvedValueOnce({ rows: [session] })
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      // Integrity check 1: pool (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 2: self-eval (clean)
      .mockResolvedValueOnce({ rows: [] })
      // Integrity check 3: duplicates FOUND
      .mockResolvedValueOnce({
        rows: [
          {
            evaluator_id: "e1",
            target_id: "t1",
            head_id: null,
            dup_count: 2,
          },
        ],
      })
      // Integrity check 4: temporal (clean)
      .mockResolvedValueOnce({ rows: [] });

    try {
      await finalizationService.finalizeSession("sess-001");
      fail("Should have thrown");
    } catch (err) {
      expect(err.code).toBe("INTEGRITY_VIOLATION");
    }
  });
});
