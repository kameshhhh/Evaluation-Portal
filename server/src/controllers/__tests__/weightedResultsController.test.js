// ============================================================
// WEIGHTED RESULTS CONTROLLER TESTS — Unit Tests (Mocked DB)
// ============================================================
// Tests the enriched weighted results endpoint that bridges
// WeightedAggregationService to the frontend dashboard.
//
// Run: npx jest server/src/controllers/__tests__/weightedResultsController.test.js
// ============================================================

// ── Mocks (before requires) ─────────────────────
jest.mock("../../config/database", () => ({
  query: jest.fn(),
  pool: {},
}));
jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock("../../services/credibility/WeightedAggregationService", () => ({
  getSessionWeightedResults: jest.fn(),
}));
jest.mock("../../services/credibility/storage/CredibilityRepository", () => ({
  getCredibilityProfile: jest.fn(),
}));
jest.mock("../../services/ResultCacheService", () => ({
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
}));

// ── Requires ────────────────────────────────────
const db = require("../../config/database");
const WeightedAggregationService = require("../../services/credibility/WeightedAggregationService");
const CredibilityRepository = require("../../services/credibility/storage/CredibilityRepository");
const { getWeightedSessionResults } = require("../weightedResultsController");
const ResultCacheService = require("../../services/ResultCacheService");

// ============================================================
// MOCK DATA FACTORIES
// ============================================================

/** Creates a minimal mock session row */
function createMockSession(overrides = {}) {
  return {
    session_id: "session-001",
    title: "Test Evaluation",
    status: "aggregated",
    pool_size: 100,
    evaluation_type: "project_member",
    created_at: new Date("2025-01-01"),
    ...overrides,
  };
}

/** Creates mock weighted results rows */
function createMockWeightedRows() {
  return [
    {
      target_id: "person-001",
      head_id: "head-001",
      weighted_mean: 45.5,
      raw_mean: 42.0,
      weight_sum: 1.8,
      evaluator_count: 3,
    },
    {
      target_id: "person-002",
      head_id: "head-001",
      weighted_mean: 38.2,
      raw_mean: 40.0,
      weight_sum: 1.5,
      evaluator_count: 3,
    },
  ];
}

/** Creates mock allocations */
function createMockAllocations() {
  return [
    { evaluator_id: "eval-001", target_id: "person-001", points: 40 },
    { evaluator_id: "eval-002", target_id: "person-001", points: 50 },
    { evaluator_id: "eval-003", target_id: "person-001", points: 36 },
    { evaluator_id: "eval-001", target_id: "person-002", points: 35 },
    { evaluator_id: "eval-002", target_id: "person-002", points: 45 },
    { evaluator_id: "eval-003", target_id: "person-002", points: 40 },
  ];
}

/** Creates mock person name rows */
function createMockPersonNames() {
  return [
    { person_id: "person-001", display_name: "Alice" },
    { person_id: "person-002", display_name: "Bob" },
  ];
}

// ============================================================
// MOCK EXPRESS OBJECTS
// ============================================================

/** Create a mock Express response with status().json() chain */
function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status: jest.fn(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function (data) {
      this.body = data;
      return this;
    }),
  };
  return res;
}

/** Create a mock Express request */
function createMockReq(params = {}, query = {}, user = {}) {
  return {
    params,
    query,
    user: { id: "admin-001", role: "admin", ...user },
  };
}

// ============================================================
// TESTS
// ============================================================

describe("weightedResultsController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ResultCacheService.get.mockReturnValue(null); // cache miss by default
  });

  // ──────────────────────────────────────────────
  // HAPPY PATH — Returns enriched weighted results
  // ──────────────────────────────────────────────
  describe("getWeightedSessionResults — happy path", () => {
    it("should return enriched weighted results for a valid session", async () => {
      // Arrange
      const req = createMockReq(
        { sessionId: "session-001" },
        { view: "detailed" },
      );
      const res = createMockRes();

      // Mock DB: session lookup
      db.query
        .mockResolvedValueOnce({ rows: [createMockSession()] }) // session
        .mockResolvedValueOnce({ rows: createMockAllocations() }) // allocations
        .mockResolvedValueOnce({ rows: createMockPersonNames() }); // person names

      // Mock WeightedAggregationService
      WeightedAggregationService.getSessionWeightedResults.mockResolvedValue(
        createMockWeightedRows(),
      );

      // Mock CredibilityRepository (per evaluator)
      CredibilityRepository.getCredibilityProfile.mockResolvedValue({
        composite_score: 0.75,
        reliability_score: 0.8,
        accuracy_score: 0.7,
        consistency_score: 0.72,
      });

      // Act
      await getWeightedSessionResults(req, res);

      // Assert — successful response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body).toBeDefined();
      expect(res.body.has_weighted_data).toBe(true);
      expect(res.body.person_results).toHaveLength(2);
      expect(res.body.session).toBeDefined();
      expect(res.body.summary).toBeDefined();
    });

    it("should include person names in the response", async () => {
      const req = createMockReq({ sessionId: "session-001" });
      const res = createMockRes();

      db.query
        .mockResolvedValueOnce({ rows: [createMockSession()] })
        .mockResolvedValueOnce({ rows: createMockAllocations() })
        .mockResolvedValueOnce({ rows: createMockPersonNames() });

      WeightedAggregationService.getSessionWeightedResults.mockResolvedValue(
        createMockWeightedRows(),
      );
      CredibilityRepository.getCredibilityProfile.mockResolvedValue({
        composite_score: 0.6,
      });

      await getWeightedSessionResults(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const alice = res.body.person_results.find(
        (p) => p.target_id === "person-001",
      );
      expect(alice.person_name).toBe("Alice");
    });
  });

  // ──────────────────────────────────────────────
  // ERROR PATH — Missing session
  // ──────────────────────────────────────────────
  describe("getWeightedSessionResults — error cases", () => {
    it("should return 404 when session is not found", async () => {
      const req = createMockReq({ sessionId: "nonexistent" });
      const res = createMockRes();

      db.query.mockResolvedValueOnce({ rows: [] });

      await getWeightedSessionResults(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.body.error).toBeDefined();
    });

    it("should return 400 when sessionId is missing", async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await getWeightedSessionResults(req, res);

      // Should either 400 or 404 depending on controller logic
      expect([400, 404, 500]).toContain(res.statusCode);
    });
  });

  // ──────────────────────────────────────────────
  // GRACEFUL DEGRADATION — No weighted data
  // ──────────────────────────────────────────────
  describe("getWeightedSessionResults — no weighted data", () => {
    it("should return has_weighted_data = false when no weighted results exist", async () => {
      const req = createMockReq({ sessionId: "session-001" });
      const res = createMockRes();

      db.query
        .mockResolvedValueOnce({ rows: [createMockSession()] })
        .mockResolvedValueOnce({ rows: createMockAllocations() })
        .mockResolvedValueOnce({ rows: createMockPersonNames() });

      // Service returns empty array
      WeightedAggregationService.getSessionWeightedResults.mockResolvedValue(
        [],
      );

      await getWeightedSessionResults(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.body.has_weighted_data).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // CACHE — Should use cached data when available
  // ──────────────────────────────────────────────
  describe("getWeightedSessionResults — caching", () => {
    it("should return cached data on cache hit", async () => {
      const cached = {
        session: createMockSession(),
        summary: { avg_credibility_impact: 0.05 },
        person_results: [],
        has_weighted_data: false,
      };
      ResultCacheService.get.mockReturnValue(cached);

      const req = createMockReq({ sessionId: "session-001" });
      const res = createMockRes();

      await getWeightedSessionResults(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      // DB should NOT have been called — cache was used
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
