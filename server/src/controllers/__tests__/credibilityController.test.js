// ============================================================
// CREDIBILITY CONTROLLER TESTS — Unit Tests (Mocked DB)
// ============================================================
// Tests the credibility profile endpoint that provides evaluator
// credibility scores to the faculty dashboard.
//
// Run: npx jest server/src/controllers/__tests__/credibilityController.test.js
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
jest.mock("../../services/credibility/CredibilityEngine", () => ({
  processSession: jest.fn(),
  batchRecalculate: jest.fn(),
}));
jest.mock("../../services/credibility/storage/CredibilityRepository", () => ({
  getEvaluatorProfile: jest.fn(),
  getHistoricalSignals: jest.fn(),
  getEvaluatorWeight: jest.fn(),
  getAllProfiles: jest.fn(),
}));
jest.mock("../../services/credibility/WeightedAggregationService", () => ({
  computeWeightedResults: jest.fn(),
  getSessionWeightedResults: jest.fn(),
}));

// ── Requires ────────────────────────────────────
const CredibilityRepository = require("../../services/credibility/storage/CredibilityRepository");
const CredibilityEngine = require("../../services/credibility/CredibilityEngine");
const {
  getEvaluatorProfile,
  getCredibilityProfiles,
} = require("../credibilityController");

// ============================================================
// MOCK DATA FACTORIES
// ============================================================

/** Creates a mock evaluator credibility profile */
function createMockProfile(overrides = {}) {
  return {
    evaluator_id: "eval-001",
    credibility_score: 78,
    credibility_band: "MEDIUM",
    alignment_score: 0.82,
    stability_score: 0.75,
    discipline_score: 0.71,
    total_sessions_evaluated: 12,
    updated_at: new Date("2026-02-01"),
    ...overrides,
  };
}

/** Creates mock historical signals */
function createMockHistory(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    composite_score: 0.75 + i * 0.02,
    session_id: `session-${i + 1}`,
    created_at: new Date(Date.now() - (count - i) * 7 * 24 * 60 * 60 * 1000),
  }));
}

/** Creates mock request object */
function createMockRequest(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: {
      userId: "user-001",
      role: "faculty",
    },
    ...overrides,
  };
}

/** Creates mock response object */
function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

// ============================================================
// TEST SUITE: getEvaluatorProfile
// ============================================================
describe("getEvaluatorProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── TC-CRED-01: Successful profile retrieval ──
  it("should return credibility profile for valid evaluator", async () => {
    // Arrange
    const mockProfile = createMockProfile();
    const mockHistory = createMockHistory(5);
    const mockWeight = 1.15;

    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(mockProfile);
    CredibilityRepository.getHistoricalSignals.mockResolvedValue(mockHistory);
    CredibilityRepository.getEvaluatorWeight.mockResolvedValue(mockWeight);

    const req = createMockRequest({
      params: { evaluatorId: "eval-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        evaluator_id: "eval-001",
        profile: mockProfile,
        current_weight: mockWeight,
        history: {
          signals: mockHistory,
          session_count: 5,
        },
      },
    });
  });

  // ── TC-CRED-02: New evaluator with no profile ──
  it("should return null profile for new evaluator", async () => {
    // Arrange
    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(null);
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorWeight.mockResolvedValue(1.0);

    const req = createMockRequest({
      params: { evaluatorId: "new-eval-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        evaluator_id: "new-eval-001",
        profile: null,
        message: "No credibility profile found — evaluator may be new",
        current_weight: 1.0,
      },
    });
  });

  // ── TC-CRED-03: HIGH band evaluator ──
  it("should return HIGH band for excellent evaluator", async () => {
    // Arrange
    const mockProfile = createMockProfile({
      credibility_score: 92,
      credibility_band: "HIGH",
    });

    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(mockProfile);
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorWeight.mockResolvedValue(1.25);

    const req = createMockRequest({
      params: { evaluatorId: "eval-high-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          profile: expect.objectContaining({
            credibility_band: "HIGH",
            credibility_score: 92,
          }),
          current_weight: 1.25,
        }),
      }),
    );
  });

  // ── TC-CRED-04: LOW band evaluator ──
  it("should return LOW band for inconsistent evaluator", async () => {
    // Arrange
    const mockProfile = createMockProfile({
      credibility_score: 42,
      credibility_band: "LOW",
    });

    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(mockProfile);
    CredibilityRepository.getHistoricalSignals.mockResolvedValue([]);
    CredibilityRepository.getEvaluatorWeight.mockResolvedValue(0.75);

    const req = createMockRequest({
      params: { evaluatorId: "eval-low-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          profile: expect.objectContaining({
            credibility_band: "LOW",
            credibility_score: 42,
          }),
          current_weight: 0.75,
        }),
      }),
    );
  });

  // ── TC-CRED-05: Database error handling ──
  it("should return 500 on database error", async () => {
    // Arrange
    CredibilityRepository.getEvaluatorProfile.mockRejectedValue(
      new Error("Database connection failed"),
    );

    const req = createMockRequest({
      params: { evaluatorId: "eval-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Database connection failed",
    });
  });

  // ── TC-CRED-06: History signals included ──
  it("should include historical signals for trend calculation", async () => {
    // Arrange
    const mockProfile = createMockProfile();
    const mockHistory = createMockHistory(10);

    CredibilityRepository.getEvaluatorProfile.mockResolvedValue(mockProfile);
    CredibilityRepository.getHistoricalSignals.mockResolvedValue(mockHistory);
    CredibilityRepository.getEvaluatorWeight.mockResolvedValue(1.1);

    const req = createMockRequest({
      params: { evaluatorId: "eval-001" },
    });
    const res = createMockResponse();

    // Act
    await getEvaluatorProfile(req, res);

    // Assert
    expect(CredibilityRepository.getHistoricalSignals).toHaveBeenCalledWith(
      "eval-001",
      null,
      20,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          history: expect.objectContaining({
            session_count: 10,
          }),
        }),
      }),
    );
  });
});

// ============================================================
// TEST SUITE: getCredibilityProfiles (Admin)
// ============================================================
describe("getCredibilityProfiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── TC-CRED-07: List all profiles ──
  it("should return list of all evaluator profiles", async () => {
    // Arrange
    const mockProfiles = [
      createMockProfile({ evaluator_id: "eval-001", credibility_score: 85 }),
      createMockProfile({ evaluator_id: "eval-002", credibility_score: 72 }),
      createMockProfile({ evaluator_id: "eval-003", credibility_score: 91 }),
    ];

    CredibilityRepository.getAllProfiles.mockResolvedValue(mockProfiles);

    const req = createMockRequest({
      query: {},
      user: { role: "admin" },
    });
    const res = createMockResponse();

    // Act
    await getCredibilityProfiles(req, res);

    // Assert
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        profiles: mockProfiles,
        count: 3,
        filters: { band: "all" },
      },
    });
  });

  // ── TC-CRED-08: Filter by band ──
  it("should filter profiles by credibility band", async () => {
    // Arrange
    const mockProfiles = [
      createMockProfile({ evaluator_id: "eval-001", credibility_band: "HIGH" }),
    ];

    CredibilityRepository.getAllProfiles.mockResolvedValue(mockProfiles);

    const req = createMockRequest({
      query: { band: "HIGH" },
      user: { role: "admin" },
    });
    const res = createMockResponse();

    // Act
    await getCredibilityProfiles(req, res);

    // Assert
    expect(CredibilityRepository.getAllProfiles).toHaveBeenCalledWith({
      band: "HIGH",
      globalOnly: true,
      limit: 100,
      offset: 0,
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filters: { band: "HIGH" },
        }),
      }),
    );
  });

  // ── TC-CRED-09: Pagination support ──
  it("should support pagination with limit and offset", async () => {
    // Arrange
    CredibilityRepository.getAllProfiles.mockResolvedValue([]);

    const req = createMockRequest({
      query: { limit: "50", offset: "100" },
      user: { role: "admin" },
    });
    const res = createMockResponse();

    // Act
    await getCredibilityProfiles(req, res);

    // Assert
    expect(CredibilityRepository.getAllProfiles).toHaveBeenCalledWith({
      band: undefined,
      globalOnly: true,
      limit: 50,
      offset: 100,
    });
  });
});
