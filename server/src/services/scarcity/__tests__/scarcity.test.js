// ============================================================
// SCARCITY ENFORCEMENT ENGINE — COMPREHENSIVE TEST SUITE
// ============================================================
// Tests for all scarcity modules:
//   1. PoolComputationService (pool size calculations)
//   2. AllocationValidator (scarcity constraint enforcement)
//   3. ZeroScoreInterpreter (zero-score semantics)
//   4. SessionIsolationService (evaluator independence)
//   5. ScarcityEngine (orchestrator — mocked DB)
//
// Modules 1-4 are PURE FUNCTIONS (no mocks required).
// Module 5 requires database mocks (same pattern as personalization tests).
//
// ZERO DATABASE DEPENDENCIES — every test runs in isolation.
// ============================================================

// ============================================================
// MOCK SETUP — Must be before imports
// ============================================================

// Mock the database module (for ScarcityEngine/Repository tests)
jest.mock("../../../config/database", () => ({
  query: jest.fn(), // Mock query function
  getClient: jest.fn(), // Mock client function
  pool: {}, // Empty pool object
}));

// Mock the ScarcityRepository (for ScarcityEngine orchestrator tests)
jest.mock("../../../repositories/ScarcityRepository", () => ({
  getSession: jest.fn(),
  configureSessionScarcity: jest.fn(),
  assignEvaluators: jest.fn(),
  getSessionEvaluatorIds: jest.fn(),
  storeAllocations: jest.fn(),
  getAllocationsByEvaluator: jest.fn(),
  getSessionTargets: jest.fn(),
  getPoolUsage: jest.fn(),
  getSessionsByEvaluator: jest.fn(),
  storeZeroInterpretations: jest.fn(),
  markEvaluatorSubmitted: jest.fn(),
}));

// Mock the logger to suppress output during tests
jest.mock("../../../utils/logger", () => ({
  debug: jest.fn(), // Suppress debug logs
  info: jest.fn(), // Suppress info logs
  warn: jest.fn(), // Suppress warn logs
  error: jest.fn(), // Suppress error logs
}));

// ============================================================
// IMPORTS — After mocks are set up
// ============================================================

// Pool computation — pure functions
const {
  calculatePoolSize,
  isValidEvaluationMode,
  getEvaluationModeDescription,
  EVALUATION_MODES,
  POINTS_PER_MEMBER,
  MIN_TEAM_SIZE,
  MAX_TEAM_SIZE,
  DEFAULT_CROSS_PROJECT_POOL,
  VALID_FACULTY_POOLS,
  DEFAULT_FACULTY_POOL,
  DEFAULT_RANKING_DEPTH,
  _calculateProjectMemberPool,
  _calculateCrossProjectPool,
  _calculateFacultyPool,
  _calculatePeerPool,
} = require("../PoolComputationService");

// Allocation validator — pure functions
const {
  validateAllocations,
  validateSingleAllocation,
  VALIDATION_CODES,
  _buildFailure,
} = require("../AllocationValidator");

// Zero score interpreter — pure functions
const {
  interpretZeroAllocations,
  interpretSingleZero,
  ZERO_REASONS,
  SCARCITY_UTILIZATION_THRESHOLD,
  SCARCITY_ZERO_RATIO_THRESHOLD,
  CONFIDENCE_SCORES,
  _inferSingleZero,
} = require("../ZeroScoreInterpreter");

// Session isolation — pure functions (except logger)
const {
  checkEvaluatorAccess,
  canSubmitAllocations,
  buildIsolationFilter,
  ISOLATED_STATES,
  RESULTS_VISIBLE_STATES,
} = require("../SessionIsolationService");

// ScarcityEngine — orchestrator (uses mocked repository)
const ScarcityEngine = require("../ScarcityEngine");

// Mocked repository for orchestrator tests
const ScarcityRepository = require("../../../repositories/ScarcityRepository");

// ============================================================
// 1. POOL COMPUTATION SERVICE TESTS
// ============================================================
describe("PoolComputationService", () => {
  // ----------------------------------------------------------
  // Constants validation
  // ----------------------------------------------------------
  describe("Constants", () => {
    test("POINTS_PER_MEMBER is 5 (SRS 4.1.3)", () => {
      // SRS: 3 members → 15 points = 5 per member
      expect(POINTS_PER_MEMBER).toBe(5);
    });

    test("Team size range is 2-4 (SRS 4.1.1)", () => {
      expect(MIN_TEAM_SIZE).toBe(2);
      expect(MAX_TEAM_SIZE).toBe(4);
    });

    test("Default cross-project pool is 10 (SRS 4.3.1)", () => {
      expect(DEFAULT_CROSS_PROJECT_POOL).toBe(10);
    });

    test("Valid faculty pools are 1, 3, 10 (SRS 4.4.2)", () => {
      expect(VALID_FACULTY_POOLS).toEqual([1, 3, 10]);
    });

    test("Default faculty pool is 3", () => {
      expect(DEFAULT_FACULTY_POOL).toBe(3);
    });

    test("Default ranking depth is 3 (SRS 4.5.2)", () => {
      expect(DEFAULT_RANKING_DEPTH).toBe(3);
    });

    test("EVALUATION_MODES is frozen", () => {
      expect(Object.isFrozen(EVALUATION_MODES)).toBe(true);
    });

    test("EVALUATION_MODES has all four modes", () => {
      expect(EVALUATION_MODES).toEqual({
        PROJECT_MEMBER: "project_member",
        CROSS_PROJECT: "cross_project",
        FACULTY: "faculty",
        PEER: "peer",
      });
    });
  });

  // ----------------------------------------------------------
  // calculatePoolSize — project_member mode
  // ----------------------------------------------------------
  describe("calculatePoolSize — project_member", () => {
    test("3-member team → 15 points (SRS 4.1.3)", () => {
      const pool = calculatePoolSize("project_member", { teamSize: 3 });
      expect(pool).toBe(15);
    });

    test("4-member team → 20 points (SRS 4.1.3)", () => {
      const pool = calculatePoolSize("project_member", { teamSize: 4 });
      expect(pool).toBe(20);
    });

    test("2-member team → 10 points", () => {
      const pool = calculatePoolSize("project_member", { teamSize: 2 });
      expect(pool).toBe(10);
    });

    test("Throws for team size 1 (below minimum)", () => {
      expect(() => {
        calculatePoolSize("project_member", { teamSize: 1 });
      }).toThrow("Invalid team size: 1");
    });

    test("Throws for team size 5 (above maximum)", () => {
      expect(() => {
        calculatePoolSize("project_member", { teamSize: 5 });
      }).toThrow("Invalid team size: 5");
    });

    test("Throws when teamSize is missing", () => {
      expect(() => {
        calculatePoolSize("project_member", {});
      }).toThrow("teamSize is required");
    });

    test("Handles string teamSize by parsing to int", () => {
      const pool = calculatePoolSize("project_member", { teamSize: "3" });
      expect(pool).toBe(15);
    });
  });

  // ----------------------------------------------------------
  // calculatePoolSize — cross_project mode
  // ----------------------------------------------------------
  describe("calculatePoolSize — cross_project", () => {
    test("Returns default pool of 10 when no config", () => {
      const pool = calculatePoolSize("cross_project");
      expect(pool).toBe(10);
    });

    test("Uses custom pool size when provided", () => {
      const pool = calculatePoolSize("cross_project", { poolSize: 25 });
      expect(pool).toBe(25);
    });

    test("Throws for zero pool size", () => {
      expect(() => {
        calculatePoolSize("cross_project", { poolSize: 0 });
      }).toThrow("Pool size must be positive");
    });

    test("Throws for negative pool size", () => {
      expect(() => {
        calculatePoolSize("cross_project", { poolSize: -5 });
      }).toThrow("Pool size must be positive");
    });
  });

  // ----------------------------------------------------------
  // calculatePoolSize — faculty mode
  // ----------------------------------------------------------
  describe("calculatePoolSize — faculty", () => {
    test("Returns default pool of 3 when no config", () => {
      const pool = calculatePoolSize("faculty");
      expect(pool).toBe(3);
    });

    test("Accepts pool size 1 (binary mode)", () => {
      const pool = calculatePoolSize("faculty", { poolSize: 1 });
      expect(pool).toBe(1);
    });

    test("Accepts pool size 3 (small pool)", () => {
      const pool = calculatePoolSize("faculty", { poolSize: 3 });
      expect(pool).toBe(3);
    });

    test("Accepts pool size 10 (larger pool)", () => {
      const pool = calculatePoolSize("faculty", { poolSize: 10 });
      expect(pool).toBe(10);
    });

    test("Throws for invalid pool size 5", () => {
      expect(() => {
        calculatePoolSize("faculty", { poolSize: 5 });
      }).toThrow("Invalid faculty pool size: 5");
    });

    test("Throws for invalid pool size 0", () => {
      expect(() => {
        calculatePoolSize("faculty", { poolSize: 0 });
      }).toThrow("Invalid faculty pool size: 0");
    });
  });

  // ----------------------------------------------------------
  // calculatePoolSize — peer mode
  // ----------------------------------------------------------
  describe("calculatePoolSize — peer", () => {
    test("Default depth 3 → 6 points (triangular: 3+2+1)", () => {
      const pool = calculatePoolSize("peer");
      expect(pool).toBe(6);
    });

    test("Depth 5 → 15 points (5+4+3+2+1)", () => {
      const pool = calculatePoolSize("peer", { rankingDepth: 5 });
      expect(pool).toBe(15);
    });

    test("Depth 1 → 1 point", () => {
      const pool = calculatePoolSize("peer", { rankingDepth: 1 });
      expect(pool).toBe(1);
    });

    test("Throws for depth 0", () => {
      expect(() => {
        calculatePoolSize("peer", { rankingDepth: 0 });
      }).toThrow("Ranking depth must be at least 1");
    });
  });

  // ----------------------------------------------------------
  // Unknown mode
  // ----------------------------------------------------------
  describe("calculatePoolSize — unknown mode", () => {
    test("Throws for unknown mode", () => {
      expect(() => {
        calculatePoolSize("invalid_mode");
      }).toThrow("Unknown evaluation mode: 'invalid_mode'");
    });

    test("Throws for empty string mode", () => {
      expect(() => {
        calculatePoolSize("");
      }).toThrow("Unknown evaluation mode");
    });
  });

  // ----------------------------------------------------------
  // isValidEvaluationMode
  // ----------------------------------------------------------
  describe("isValidEvaluationMode", () => {
    test("Returns true for all valid modes", () => {
      expect(isValidEvaluationMode("project_member")).toBe(true);
      expect(isValidEvaluationMode("cross_project")).toBe(true);
      expect(isValidEvaluationMode("faculty")).toBe(true);
      expect(isValidEvaluationMode("peer")).toBe(true);
    });

    test("Returns false for invalid modes", () => {
      expect(isValidEvaluationMode("unknown")).toBe(false);
      expect(isValidEvaluationMode("")).toBe(false);
      expect(isValidEvaluationMode(null)).toBe(false);
      expect(isValidEvaluationMode(undefined)).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // getEvaluationModeDescription
  // ----------------------------------------------------------
  describe("getEvaluationModeDescription", () => {
    test("Returns description for each mode", () => {
      expect(getEvaluationModeDescription("project_member")).toContain(
        "team members",
      );
      expect(getEvaluationModeDescription("cross_project")).toContain(
        "projects",
      );
      expect(getEvaluationModeDescription("faculty")).toContain("faculty");
      expect(getEvaluationModeDescription("peer")).toContain("peers");
    });

    test("Returns fallback for unknown mode", () => {
      expect(getEvaluationModeDescription("unknown")).toBe(
        "Unknown evaluation mode",
      );
    });
  });
});

// ============================================================
// 2. ALLOCATION VALIDATOR TESTS
// ============================================================
describe("AllocationValidator", () => {
  // ----------------------------------------------------------
  // validateAllocations — Valid allocations
  // ----------------------------------------------------------
  describe("validateAllocations — Valid cases", () => {
    test("Accepts allocations within pool size", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 8 },
          { targetId: "t2", points: 5 },
          { targetId: "t3", points: 2 },
        ],
        15, // Pool size
      );

      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
      expect(result.totalAllocated).toBe(15);
      expect(result.remainingPool).toBe(0);
      expect(result.utilizationPercentage).toBe(100);
    });

    test("Accepts partial pool usage (SRS: distribute all or part)", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 3 },
          { targetId: "t2", points: 2 },
        ],
        15,
      );

      expect(result.valid).toBe(true);
      expect(result.totalAllocated).toBe(5);
      expect(result.remainingPool).toBe(10);
    });

    test("Accepts zero allocations (SRS 4.1.5)", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 15 },
          { targetId: "t2", points: 0 },
          { targetId: "t3", points: 0 },
        ],
        15,
      );

      expect(result.valid).toBe(true);
      expect(result.zeroCount).toBe(2);
    });

    test("No per-member upper cap (SRS 4.1.3)", () => {
      // One person gets ALL the points — this is valid
      const result = validateAllocations(
        [
          { targetId: "t1", points: 15 },
          { targetId: "t2", points: 0 },
          { targetId: "t3", points: 0 },
        ],
        15,
      );

      expect(result.valid).toBe(true);
      expect(result.totalAllocated).toBe(15);
    });

    test("Accounts for existing allocations", () => {
      const result = validateAllocations(
        [{ targetId: "t1", points: 5 }],
        15,
        8, // Already allocated 8
      );

      expect(result.valid).toBe(true);
      expect(result.totalAllocated).toBe(13); // 8 + 5
      expect(result.existingTotal).toBe(8);
      expect(result.newTotal).toBe(5);
    });
  });

  // ----------------------------------------------------------
  // validateAllocations — Pool exceeded (THE scarcity rule)
  // ----------------------------------------------------------
  describe("validateAllocations — Pool exceeded", () => {
    test("Rejects allocations exceeding pool (SRS 4.1.3)", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 10 },
          { targetId: "t2", points: 8 },
        ],
        15,
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe("POOL_EXCEEDED");
      expect(result.details.excess).toBe(3); // 18 - 15
    });

    test("Rejects when existing + new exceeds pool", () => {
      const result = validateAllocations(
        [{ targetId: "t1", points: 5 }],
        15,
        12, // Already 12 allocated
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe("POOL_EXCEEDED");
      expect(result.details.finalTotal).toBe(17);
      expect(result.details.excess).toBe(2);
    });

    test("Rejects even 0.01 over the pool", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 10 },
          { targetId: "t2", points: 5.01 },
        ],
        15,
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe("POOL_EXCEEDED");
    });
  });

  // ----------------------------------------------------------
  // validateAllocations — Format validation
  // ----------------------------------------------------------
  describe("validateAllocations — Format validation", () => {
    test("Rejects non-array input", () => {
      const result = validateAllocations("not-an-array", 15);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_FORMAT");
    });

    test("Rejects empty array", () => {
      const result = validateAllocations([], 15);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("EMPTY_ALLOCATIONS");
    });

    test("Rejects allocation without targetId", () => {
      const result = validateAllocations([{ points: 5 }], 15);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_FORMAT");
    });

    test("Rejects allocation with string points", () => {
      const result = validateAllocations(
        [{ targetId: "t1", points: "five" }],
        15,
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_FORMAT");
    });

    test("Rejects allocation with NaN points", () => {
      const result = validateAllocations([{ targetId: "t1", points: NaN }], 15);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("INVALID_FORMAT");
    });

    test("Rejects negative points", () => {
      const result = validateAllocations([{ targetId: "t1", points: -3 }], 15);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("NEGATIVE_POINTS");
    });
  });

  // ----------------------------------------------------------
  // validateAllocations — Duplicate targets
  // ----------------------------------------------------------
  describe("validateAllocations — Duplicate targets", () => {
    test("Rejects duplicate targetIds", () => {
      const result = validateAllocations(
        [
          { targetId: "t1", points: 5 },
          { targetId: "t1", points: 3 },
        ],
        15,
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe("DUPLICATE_TARGETS");
      expect(result.details.duplicateTargetIds).toContain("t1");
    });
  });

  // ----------------------------------------------------------
  // validateAllocations — Self allocation
  // ----------------------------------------------------------
  describe("validateAllocations — Self allocation", () => {
    test("Rejects self allocation", () => {
      const result = validateAllocations(
        [
          { targetId: "eval-1", points: 5 },
          { targetId: "t2", points: 3 },
        ],
        15,
        0,
        "eval-1", // evaluator is eval-1
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe("SELF_ALLOCATION");
    });

    test("Allows when evaluatorId is null (no self-check)", () => {
      const result = validateAllocations(
        [{ targetId: "t1", points: 5 }],
        15,
        0,
        null,
      );

      expect(result.valid).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // validateSingleAllocation
  // ----------------------------------------------------------
  describe("validateSingleAllocation", () => {
    test("Valid allocation within pool", () => {
      const result = validateSingleAllocation(5, 15, 8);
      expect(result.valid).toBe(true);
      expect(result.remainingAfter).toBe(2); // 15 - 8 - 5
    });

    test("Rejects when exceeds pool", () => {
      const result = validateSingleAllocation(10, 15, 8);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("Exceeds pool");
    });

    test("Rejects negative points", () => {
      const result = validateSingleAllocation(-1, 15, 0);
      expect(result.valid).toBe(false);
    });

    test("Zero allocation is valid with message", () => {
      const result = validateSingleAllocation(0, 15, 5);
      expect(result.valid).toBe(true);
      expect(result.message).toContain("Zero allocation");
    });
  });

  // ----------------------------------------------------------
  // _buildFailure helper
  // ----------------------------------------------------------
  describe("_buildFailure", () => {
    test("Builds failure object correctly", () => {
      const result = _buildFailure("TEST_CODE", "test message", { key: "val" });
      expect(result).toEqual({
        valid: false,
        code: "TEST_CODE",
        message: "test message",
        details: { key: "val" },
      });
    });

    test("Defaults details to empty object", () => {
      const result = _buildFailure("CODE", "msg");
      expect(result.details).toEqual({});
    });
  });
});

// ============================================================
// 3. ZERO SCORE INTERPRETER TESTS
// ============================================================
describe("ZeroScoreInterpreter", () => {
  // ----------------------------------------------------------
  // Constants
  // ----------------------------------------------------------
  describe("Constants", () => {
    test("ZERO_REASONS has all three SRS 4.1.5 reasons", () => {
      expect(ZERO_REASONS).toEqual({
        SCARCITY_DRIVEN: "scarcity_driven",
        BELOW_EXPECTATION: "below_expectation",
        INSUFFICIENT_OBSERVATION: "insufficient_observation",
      });
    });

    test("ZERO_REASONS is frozen", () => {
      expect(Object.isFrozen(ZERO_REASONS)).toBe(true);
    });

    test("Scarcity thresholds are correct", () => {
      expect(SCARCITY_UTILIZATION_THRESHOLD).toBe(0.9);
      expect(SCARCITY_ZERO_RATIO_THRESHOLD).toBe(0.3);
    });

    test("Confidence scores decrease with uncertainty", () => {
      expect(CONFIDENCE_SCORES.SCARCITY_DRIVEN).toBeGreaterThan(
        CONFIDENCE_SCORES.BELOW_EXPECTATION,
      );
      expect(CONFIDENCE_SCORES.BELOW_EXPECTATION).toBeGreaterThan(
        CONFIDENCE_SCORES.INSUFFICIENT_OBSERVATION,
      );
    });
  });

  // ----------------------------------------------------------
  // interpretZeroAllocations — Bulk interpretation
  // ----------------------------------------------------------
  describe("interpretZeroAllocations", () => {
    test("Returns empty array when no zero allocations", () => {
      const result = interpretZeroAllocations(
        [
          { targetId: "t1", points: 8 },
          { targetId: "t2", points: 7 },
        ],
        15,
      );

      expect(result).toEqual([]);
    });

    test("Interprets scarcity-driven zeros (high utilization + many zeros)", () => {
      // Pool: 15, Used: 14 (93% utilization), 2 of 3 targets got zero
      const result = interpretZeroAllocations(
        [
          { targetId: "t1", points: 14 },
          { targetId: "t2", points: 0 },
          { targetId: "t3", points: 0 },
        ],
        15,
      );

      expect(result).toHaveLength(2);
      expect(result[0].inferredReason).toBe("scarcity_driven");
      expect(result[0].confidence).toBe(0.85);
    });

    test("Interprets below-expectation zeros (others got points)", () => {
      // Pool: 20, Used: 10 (50% util), only 1 of 3 got zero
      const result = interpretZeroAllocations(
        [
          { targetId: "t1", points: 7 },
          { targetId: "t2", points: 3 },
          { targetId: "t3", points: 0 },
        ],
        20,
      );

      expect(result).toHaveLength(1);
      expect(result[0].inferredReason).toBe("below_expectation");
      expect(result[0].confidence).toBe(0.75);
      expect(result[0].context.maxAllocation).toBe(7);
    });

    test("Interprets insufficient-observation zeros (all zeros)", () => {
      const result = interpretZeroAllocations(
        [
          { targetId: "t1", points: 0 },
          { targetId: "t2", points: 0 },
          { targetId: "t3", points: 0 },
        ],
        15,
      );

      expect(result).toHaveLength(3);
      result.forEach((interp) => {
        expect(interp.inferredReason).toBe("insufficient_observation");
        expect(interp.confidence).toBe(0.6);
        expect(interp.context.allZero).toBe(true);
      });
    });
  });

  // ----------------------------------------------------------
  // interpretSingleZero — Public single interpretation
  // ----------------------------------------------------------
  describe("interpretSingleZero", () => {
    test("Classifies scarcity-driven zero correctly", () => {
      const allAllocations = [
        { targetId: "t1", points: 0 },
        { targetId: "t2", points: 8 },
        { targetId: "t3", points: 7 },
      ];

      const result = interpretSingleZero(
        allAllocations[0], // The zero allocation
        allAllocations,
        15, // Pool size
      );

      expect(result.inferredReason).toBe("scarcity_driven");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test("Classifies below-expectation zero correctly", () => {
      const allAllocations = [
        { targetId: "t1", points: 0 },
        { targetId: "t2", points: 10 },
        { targetId: "t3", points: 5 },
      ];

      const result = interpretSingleZero(
        allAllocations[0],
        allAllocations,
        20, // Large pool — not scarcity-driven
      );

      expect(result.inferredReason).toBe("below_expectation");
    });

    test("Classifies insufficient-observation zero correctly", () => {
      const allAllocations = [
        { targetId: "t1", points: 0 },
        { targetId: "t2", points: 0 },
      ];

      const result = interpretSingleZero(allAllocations[0], allAllocations, 15);

      expect(result.inferredReason).toBe("insufficient_observation");
    });
  });

  // ----------------------------------------------------------
  // _inferSingleZero — Internal inference logic
  // ----------------------------------------------------------
  describe("_inferSingleZero", () => {
    test("Returns context data with all interpretations", () => {
      const result = _inferSingleZero(
        { targetId: "t1", points: 0 },
        [
          { targetId: "t1", points: 0 },
          { targetId: "t2", points: 14 },
          { targetId: "t3", points: 0 },
        ],
        15,
        14 / 15, // poolUtilization ~0.93
        2 / 3, // zeroRatio ~0.67
      );

      expect(result.inferredReason).toBe("scarcity_driven");
      expect(result.context).toHaveProperty("poolUtilization");
      expect(result.context).toHaveProperty("zeroPercentage");
      expect(result.context).toHaveProperty("poolSize");
      expect(result.context.poolSize).toBe(15);
    });

    test("Below-expectation context includes max and average", () => {
      const result = _inferSingleZero(
        { targetId: "t1", points: 0 },
        [
          { targetId: "t1", points: 0 },
          { targetId: "t2", points: 10 },
          { targetId: "t3", points: 5 },
        ],
        20,
        0.75,
        1 / 3,
      );

      expect(result.inferredReason).toBe("below_expectation");
      expect(result.context.maxAllocation).toBe(10);
      expect(result.context.averageNonZero).toBe(7.5);
    });
  });
});

// ============================================================
// 4. SESSION ISOLATION SERVICE TESTS
// ============================================================
describe("SessionIsolationService", () => {
  // ----------------------------------------------------------
  // Constants
  // ----------------------------------------------------------
  describe("Constants", () => {
    test("ISOLATED_STATES contains open and in_progress", () => {
      expect(ISOLATED_STATES).toContain("open");
      expect(ISOLATED_STATES).toContain("in_progress");
    });

    test("RESULTS_VISIBLE_STATES contains closed and locked", () => {
      expect(RESULTS_VISIBLE_STATES).toContain("closed");
      expect(RESULTS_VISIBLE_STATES).toContain("locked");
    });
  });

  // ----------------------------------------------------------
  // checkEvaluatorAccess
  // ----------------------------------------------------------
  describe("checkEvaluatorAccess", () => {
    test("Denies access to unassigned evaluator", () => {
      const session = { session_id: "s1", status: "open" };
      const result = checkEvaluatorAccess(session, "eval-3", [
        "eval-1",
        "eval-2",
      ]);

      expect(result.allowed).toBe(false);
      expect(result.scope).toBe("none");
      expect(result.reason).toContain("not assigned");
    });

    test("Denies access to draft session", () => {
      const session = { session_id: "s1", status: "draft" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("draft");
    });

    test("Denies access to scheduled session", () => {
      const session = { session_id: "s1", status: "scheduled" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(false);
    });

    test("Grants own_only access for open session (SRS 4.2.1)", () => {
      const session = { session_id: "s1", status: "open" };
      const result = checkEvaluatorAccess(session, "eval-1", [
        "eval-1",
        "eval-2",
      ]);

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe("own_only");
    });

    test("Grants own_only access for in_progress session", () => {
      const session = { session_id: "s1", status: "in_progress" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe("own_only");
    });

    test("Grants aggregated access for closed session", () => {
      const session = { session_id: "s1", status: "closed" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe("aggregated");
    });

    test("Grants aggregated access for locked session", () => {
      const session = { session_id: "s1", status: "locked" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(true);
      expect(result.scope).toBe("aggregated");
    });

    test("Denies access for unknown session status", () => {
      const session = { session_id: "s1", status: "unknown_state" };
      const result = checkEvaluatorAccess(session, "eval-1", ["eval-1"]);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Unknown session status");
    });
  });

  // ----------------------------------------------------------
  // canSubmitAllocations
  // ----------------------------------------------------------
  describe("canSubmitAllocations", () => {
    test("Allows submission for open sessions", () => {
      const result = canSubmitAllocations({ status: "open" });
      expect(result.allowed).toBe(true);
    });

    test("Allows submission for in_progress sessions", () => {
      const result = canSubmitAllocations({ status: "in_progress" });
      expect(result.allowed).toBe(true);
    });

    test("Denies submission for closed sessions", () => {
      const result = canSubmitAllocations({ status: "closed" });
      expect(result.allowed).toBe(false);
    });

    test("Denies submission for locked sessions", () => {
      const result = canSubmitAllocations({ status: "locked" });
      expect(result.allowed).toBe(false);
    });

    test("Denies submission for draft sessions", () => {
      const result = canSubmitAllocations({ status: "draft" });
      expect(result.allowed).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // buildIsolationFilter
  // ----------------------------------------------------------
  describe("buildIsolationFilter", () => {
    test("own_only scope filters by evaluator ID", () => {
      const filter = buildIsolationFilter("own_only", "eval-1");
      expect(filter.whereClause).toContain("evaluator_id");
      expect(filter.evaluatorFilter).toBe("eval-1");
    });

    test("aggregated scope has no filter", () => {
      const filter = buildIsolationFilter("aggregated", "eval-1");
      expect(filter.whereClause).toBe("");
      expect(filter.evaluatorFilter).toBeNull();
    });

    test("none scope blocks all results", () => {
      const filter = buildIsolationFilter("none", "eval-1");
      expect(filter.whereClause).toContain("1 = 0");
    });
  });
});

// ============================================================
// 5. SCARCITY ENGINE TESTS (Orchestrator — mocked repository)
// ============================================================
describe("ScarcityEngine", () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------
  // createSession
  // ----------------------------------------------------------
  describe("createSession", () => {
    test("Creates session with correct pool size for 3-member team", async () => {
      // Mock repository responses
      ScarcityRepository.configureSessionScarcity.mockResolvedValue({
        session_id: "session-1",
        status: "draft",
        scarcity_pool_size: 15,
        evaluation_mode: "project_member",
      });
      ScarcityRepository.assignEvaluators.mockResolvedValue(2);

      const result = await ScarcityEngine.createSession({
        sessionId: "session-1",
        mode: "project_member",
        poolConfig: { teamSize: 3 },
        evaluatorIds: ["eval-1", "eval-2"],
        createdBy: "admin-1",
      });

      expect(result.poolSize).toBe(15);
      expect(result.evaluationMode).toBe("project_member");
      expect(result.evaluatorCount).toBe(2);

      // Verify repository was called correctly
      expect(ScarcityRepository.configureSessionScarcity).toHaveBeenCalledWith(
        "session-1",
        "project_member",
        15,
      );
      expect(ScarcityRepository.assignEvaluators).toHaveBeenCalledWith(
        "session-1",
        ["eval-1", "eval-2"],
      );
    });

    test("Throws for invalid mode", async () => {
      await expect(
        ScarcityEngine.createSession({
          sessionId: "session-1",
          mode: "invalid",
          evaluatorIds: [],
        }),
      ).rejects.toThrow("Invalid evaluation mode");
    });

    test("Skips evaluator assignment when none provided", async () => {
      ScarcityRepository.configureSessionScarcity.mockResolvedValue({
        session_id: "session-1",
        status: "draft",
      });

      await ScarcityEngine.createSession({
        sessionId: "session-1",
        mode: "faculty",
        poolConfig: { poolSize: 3 },
        evaluatorIds: [],
      });

      expect(ScarcityRepository.assignEvaluators).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // submitAllocations
  // ----------------------------------------------------------
  describe("submitAllocations", () => {
    // Common mock setup for submission tests
    const mockSession = {
      session_id: "session-1",
      status: "in_progress",
      scarcity_pool_size: 15,
      evaluation_mode: "project_member",
    };

    beforeEach(() => {
      ScarcityRepository.getSession.mockResolvedValue(mockSession);
      ScarcityRepository.getSessionEvaluatorIds.mockResolvedValue([
        "eval-1",
        "eval-2",
      ]);
      ScarcityRepository.storeAllocations.mockResolvedValue({
        allocationCount: 3,
        totalPoints: 15,
      });
      ScarcityRepository.storeZeroInterpretations.mockResolvedValue(0);
    });

    test("Submits valid allocations successfully", async () => {
      const result = await ScarcityEngine.submitAllocations(
        "session-1",
        "eval-1",
        [
          { targetId: "t1", points: 8 },
          { targetId: "t2", points: 5 },
          { targetId: "t3", points: 2 },
        ],
      );

      expect(result.success).toBe(true);
      expect(result.poolInfo.poolSize).toBe(15);
      expect(result.poolInfo.allocatedTotal).toBe(15);
      expect(result.poolInfo.remainingPool).toBe(0);
    });

    test("Rejects allocations exceeding pool", async () => {
      const result = await ScarcityEngine.submitAllocations(
        "session-1",
        "eval-1",
        [
          { targetId: "t1", points: 10 },
          { targetId: "t2", points: 8 },
        ],
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("POOL_EXCEEDED");

      // storeAllocations should NOT have been called
      expect(ScarcityRepository.storeAllocations).not.toHaveBeenCalled();
    });

    test("Throws when session not found", async () => {
      ScarcityRepository.getSession.mockResolvedValue(null);

      await expect(
        ScarcityEngine.submitAllocations("nonexistent", "eval-1", []),
      ).rejects.toThrow("session not found");
    });

    test("Throws when session is closed (not accepting)", async () => {
      ScarcityRepository.getSession.mockResolvedValue({
        ...mockSession,
        status: "closed",
      });

      await expect(
        ScarcityEngine.submitAllocations("session-1", "eval-1", [
          { targetId: "t1", points: 5 },
        ]),
      ).rejects.toThrow("no longer accepted");
    });

    test("Throws when evaluator is not assigned", async () => {
      ScarcityRepository.getSessionEvaluatorIds.mockResolvedValue(["eval-2"]);

      await expect(
        ScarcityEngine.submitAllocations("session-1", "eval-1", [
          { targetId: "t1", points: 5 },
        ]),
      ).rejects.toThrow("not assigned");
    });

    test("Interprets zero allocations after successful submission", async () => {
      await ScarcityEngine.submitAllocations("session-1", "eval-1", [
        { targetId: "t1", points: 15 },
        { targetId: "t2", points: 0 },
        { targetId: "t3", points: 0 },
      ]);

      // Zero interpretations should have been stored
      expect(ScarcityRepository.storeZeroInterpretations).toHaveBeenCalled();
    });

    test("Submission succeeds even if zero interpretation fails", async () => {
      // Make interpretation storage fail
      ScarcityRepository.storeZeroInterpretations.mockRejectedValue(
        new Error("DB error"),
      );

      // Submission should still succeed
      const result = await ScarcityEngine.submitAllocations(
        "session-1",
        "eval-1",
        [
          { targetId: "t1", points: 15 },
          { targetId: "t2", points: 0 },
        ],
      );

      expect(result.success).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // getSessionForEvaluator
  // ----------------------------------------------------------
  describe("getSessionForEvaluator", () => {
    test("Returns null for nonexistent session", async () => {
      ScarcityRepository.getSession.mockResolvedValue(null);

      const result = await ScarcityEngine.getSessionForEvaluator(
        "nonexistent",
        "eval-1",
      );

      expect(result).toBeNull();
    });

    test("Returns null for unauthorized evaluator", async () => {
      ScarcityRepository.getSession.mockResolvedValue({
        session_id: "s1",
        status: "open",
        scarcity_pool_size: 15,
      });
      ScarcityRepository.getSessionEvaluatorIds.mockResolvedValue(["eval-2"]);

      const result = await ScarcityEngine.getSessionForEvaluator(
        "s1",
        "eval-1",
      );

      expect(result).toBeNull();
    });

    test("Returns session with own allocations for authorized evaluator", async () => {
      ScarcityRepository.getSession.mockResolvedValue({
        session_id: "s1",
        session_type: "project_review",
        evaluation_mode: "project_member",
        intent: "excellence",
        status: "open",
        scarcity_pool_size: 15,
      });
      ScarcityRepository.getSessionEvaluatorIds.mockResolvedValue(["eval-1"]);
      ScarcityRepository.getAllocationsByEvaluator.mockResolvedValue([
        { target_id: "t1", points: 8, head_id: null },
      ]);
      ScarcityRepository.getSessionTargets.mockResolvedValue([
        { target_id: "t1", name: "Student A" },
      ]);

      const result = await ScarcityEngine.getSessionForEvaluator(
        "s1",
        "eval-1",
      );

      expect(result).not.toBeNull();
      expect(result.sessionId).toBe("s1");
      expect(result.poolSize).toBe(15);
      expect(result.myAllocations).toHaveLength(1);
      expect(result.myAllocations[0].points).toBe(8);
      expect(result.accessScope).toBe("own_only");
    });
  });

  // ----------------------------------------------------------
  // getPoolStatus
  // ----------------------------------------------------------
  describe("getPoolStatus", () => {
    test("Returns pool status with utilization percentage", async () => {
      ScarcityRepository.getPoolUsage.mockResolvedValue({
        scarcity_pool_size: 15,
        allocated_total: 10,
        remaining_pool: 5,
      });

      const result = await ScarcityEngine.getPoolStatus("s1", "eval-1");

      expect(result.poolSize).toBe(15);
      expect(result.allocatedTotal).toBe(10);
      expect(result.remainingPool).toBe(5);
      expect(result.utilizationPercentage).toBeCloseTo(66.67, 0);
    });

    test("Returns null when not found", async () => {
      ScarcityRepository.getPoolUsage.mockResolvedValue(null);

      const result = await ScarcityEngine.getPoolStatus("s1", "eval-1");
      expect(result).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // getEvaluatorSessions
  // ----------------------------------------------------------
  describe("getEvaluatorSessions", () => {
    test("Delegates to repository", async () => {
      const mockSessions = [
        { session_id: "s1", status: "open" },
        { session_id: "s2", status: "closed" },
      ];
      ScarcityRepository.getSessionsByEvaluator.mockResolvedValue(mockSessions);

      const result = await ScarcityEngine.getEvaluatorSessions("eval-1");

      expect(result).toEqual(mockSessions);
      expect(ScarcityRepository.getSessionsByEvaluator).toHaveBeenCalledWith(
        "eval-1",
      );
    });
  });
});

// ============================================================
// 6. SCARCITY VALIDATION MIDDLEWARE TESTS
// ============================================================
describe("ScarcityValidation Middleware", () => {
  // Import middleware (doesn't need mocks — just validation logic)
  const {
    validateCreateSession,
    validateSubmitAllocations,
  } = require("../../../middleware/scarcityValidation");

  // Helper to create mock Express req/res/next
  const createMockReqRes = (body = {}, params = {}) => {
    const req = { body, params, query: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  };

  // ----------------------------------------------------------
  // validateCreateSession middleware
  // ----------------------------------------------------------
  describe("validateCreateSession", () => {
    test("Passes valid request to next", () => {
      const { req, res, next } = createMockReqRes({
        mode: "project_member",
        evaluatorIds: ["eval-1"],
        poolConfig: { teamSize: 3 },
      });

      validateCreateSession(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test("Rejects missing mode", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorIds: ["eval-1"],
      });

      validateCreateSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test("Rejects invalid mode", () => {
      const { req, res, next } = createMockReqRes({
        mode: "invalid_mode",
        evaluatorIds: ["eval-1"],
      });

      validateCreateSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects empty evaluatorIds", () => {
      const { req, res, next } = createMockReqRes({
        mode: "project_member",
        evaluatorIds: [],
      });

      validateCreateSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects non-array evaluatorIds", () => {
      const { req, res, next } = createMockReqRes({
        mode: "project_member",
        evaluatorIds: "not-an-array",
      });

      validateCreateSession(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ----------------------------------------------------------
  // validateSubmitAllocations middleware
  // ----------------------------------------------------------
  describe("validateSubmitAllocations", () => {
    test("Passes valid request to next", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorId: "eval-1",
        allocations: [
          { targetId: "t1", points: 5 },
          { targetId: "t2", points: 3 },
        ],
      });

      validateSubmitAllocations(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test("Rejects missing evaluatorId", () => {
      const { req, res, next } = createMockReqRes({
        allocations: [{ targetId: "t1", points: 5 }],
      });

      validateSubmitAllocations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects empty allocations array", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorId: "eval-1",
        allocations: [],
      });

      validateSubmitAllocations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects allocation with missing targetId", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorId: "eval-1",
        allocations: [{ points: 5 }],
      });

      validateSubmitAllocations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects allocation with negative points", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorId: "eval-1",
        allocations: [{ targetId: "t1", points: -3 }],
      });

      validateSubmitAllocations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("Rejects duplicate targetIds", () => {
      const { req, res, next } = createMockReqRes({
        evaluatorId: "eval-1",
        allocations: [
          { targetId: "t1", points: 5 },
          { targetId: "t1", points: 3 },
        ],
      });

      validateSubmitAllocations(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

// ============================================================
// 7. END-TO-END SCARCITY PIPELINE TESTS
// ============================================================
describe("End-to-End Scarcity Pipeline", () => {
  test("Complete 3-member project evaluation flow", () => {
    // Step 1: Calculate pool for 3-member team
    const poolSize = calculatePoolSize("project_member", { teamSize: 3 });
    expect(poolSize).toBe(15);

    // Step 2: Validate allocations
    const allocations = [
      { targetId: "student-A", points: 8 },
      { targetId: "student-B", points: 5 },
      { targetId: "student-C", points: 2 },
    ];

    const validation = validateAllocations(allocations, poolSize);
    expect(validation.valid).toBe(true);
    expect(validation.totalAllocated).toBe(15);
    expect(validation.remainingPool).toBe(0);

    // Step 3: Interpret zeros (none in this case)
    const interpretations = interpretZeroAllocations(allocations, poolSize);
    expect(interpretations).toHaveLength(0);
  });

  test("Complete 4-member project with zero allocations", () => {
    // Step 1: Pool for 4-member team = 20
    const poolSize = calculatePoolSize("project_member", { teamSize: 4 });
    expect(poolSize).toBe(20);

    // Step 2: Allocate with zeros (scarcity forces trade-offs)
    const allocations = [
      { targetId: "s1", points: 12 },
      { targetId: "s2", points: 8 },
      { targetId: "s3", points: 0 },
      { targetId: "s4", points: 0 },
    ];

    const validation = validateAllocations(allocations, poolSize);
    expect(validation.valid).toBe(true);
    expect(validation.zeroCount).toBe(2);

    // Step 3: Interpret zeros
    const interpretations = interpretZeroAllocations(allocations, poolSize);
    expect(interpretations).toHaveLength(2);
    // Pool utilization = 100%, zero ratio = 50% → scarcity-driven
    expect(interpretations[0].inferredReason).toBe("scarcity_driven");
  });

  test("Faculty evaluation with binary mode", () => {
    // Pool = 1 (binary mode — can only pick ONE faculty)
    const poolSize = calculatePoolSize("faculty", { poolSize: 1 });
    expect(poolSize).toBe(1);

    // Give 1 point to one faculty, 0 to others
    const allocations = [
      { targetId: "faculty-A", points: 1 },
      { targetId: "faculty-B", points: 0 },
      { targetId: "faculty-C", points: 0 },
    ];

    const validation = validateAllocations(allocations, poolSize);
    expect(validation.valid).toBe(true);

    // Trying to give 1 to two faculty should fail
    const tooMany = [
      { targetId: "faculty-A", points: 1 },
      { targetId: "faculty-B", points: 1 },
    ];
    const overValidation = validateAllocations(tooMany, poolSize);
    expect(overValidation.valid).toBe(false);
    expect(overValidation.code).toBe("POOL_EXCEEDED");
  });

  test("Cross-project comparison with 10-point pool", () => {
    const poolSize = calculatePoolSize("cross_project", { poolSize: 10 });
    expect(poolSize).toBe(10);

    const allocations = [
      { targetId: "project-1", points: 4 },
      { targetId: "project-2", points: 3 },
      { targetId: "project-3", points: 2 },
      { targetId: "project-4", points: 1 },
    ];

    const validation = validateAllocations(allocations, poolSize);
    expect(validation.valid).toBe(true);
    expect(validation.totalAllocated).toBe(10);
  });

  test("Peer ranking with depth 3", () => {
    // Pool = 6 (triangular: 3+2+1)
    const poolSize = calculatePoolSize("peer", { rankingDepth: 3 });
    expect(poolSize).toBe(6);

    // Rank 1 = 3 points, Rank 2 = 2 points, Rank 3 = 1 point
    const allocations = [
      { targetId: "peer-best", points: 3 },
      { targetId: "peer-good", points: 2 },
      { targetId: "peer-ok", points: 1 },
      { targetId: "peer-other", points: 0 },
    ];

    const validation = validateAllocations(allocations, poolSize);
    expect(validation.valid).toBe(true);
    expect(validation.totalAllocated).toBe(6);
  });

  test("Session isolation lifecycle", () => {
    const evaluators = ["eval-1", "eval-2", "eval-3"];

    // Draft → no access
    let access = checkEvaluatorAccess(
      { session_id: "s1", status: "draft" },
      "eval-1",
      evaluators,
    );
    expect(access.allowed).toBe(false);

    // Open → own_only (isolated)
    access = checkEvaluatorAccess(
      { session_id: "s1", status: "open" },
      "eval-1",
      evaluators,
    );
    expect(access.scope).toBe("own_only");

    // In progress → own_only (still isolated)
    access = checkEvaluatorAccess(
      { session_id: "s1", status: "in_progress" },
      "eval-1",
      evaluators,
    );
    expect(access.scope).toBe("own_only");

    // Closed → aggregated (results visible)
    access = checkEvaluatorAccess(
      { session_id: "s1", status: "closed" },
      "eval-1",
      evaluators,
    );
    expect(access.scope).toBe("aggregated");

    // Locked → aggregated (results finalized)
    access = checkEvaluatorAccess(
      { session_id: "s1", status: "locked" },
      "eval-1",
      evaluators,
    );
    expect(access.scope).toBe("aggregated");
  });
});
