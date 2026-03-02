// ============================================================
// FREEZE GUARD MIDDLEWARE — Unit Tests
// ============================================================
// Tests the freeze guard middleware for:
//   - Passes GET/HEAD requests through (read-only)
//   - Blocks PUT/PATCH/DELETE on frozen entities via next(error)
//   - Passes mutation requests on unfrozen entities
//   - Factory function creates guards for different entities
//   - Error handling for DB failures
//
// Run: npx jest server/src/middleware/__tests__/freezeGuard.test.js
// ============================================================

// Mock the database module before any requires
jest.mock("../../config/database", () => ({
  query: jest.fn(), // Mock query function
}));

// Mock the logger to suppress output during tests
jest.mock("../../utils/logger", () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Import the module under test
const {
  createFreezeGuard,
  projectFreezeGuard,
  workLogFreezeGuard,
} = require("../freezeGuard");

// Import FreezeViolationError for assertion checks
const { FreezeViolationError } = require("../../entities/EntityErrors");

// Import the mocked database
const db = require("../../config/database");

// ============================================================
// Describe block: freezeGuard middleware
// ============================================================
describe("freezeGuard middleware", () => {
  // ----------------------------------------------------------
  // Helpers: mock req, res, next
  // ----------------------------------------------------------
  // Helper to create a mock request object
  const mockReq = (method = "PATCH", params = { projectId: "proj-001" }) => ({
    method, // HTTP method string
    params, // Route params
    path: `/api/projects/${params.projectId || params.id || "unknown"}`, // Request path
    ip: "127.0.0.1", // Client IP
  });

  // Helper to create a mock response object
  const mockRes = () => {
    const res = {}; // Empty response object
    res.status = jest.fn().mockReturnValue(res); // Chainable status
    res.json = jest.fn().mockReturnValue(res); // Chainable json
    return res; // Return the mock
  };

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mock call history
  });

  // ============================================================
  // GET/HEAD Passthrough Tests
  // ============================================================
  describe("read-only methods", () => {
    // Test: GET requests always pass through without DB check
    test("passes GET requests without checking freeze status", async () => {
      // Arrange — create guard for 'project' entity type (string)
      const guard = createFreezeGuard("project");
      const req = mockReq("GET"); // GET request
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act — invoke the middleware
      await guard(req, res, next);

      // Assert — next() called with no args, no DB query made
      expect(next).toHaveBeenCalledWith();
      expect(db.query).not.toHaveBeenCalled();
    });

    // Test: HEAD requests also pass through without DB check
    test("passes HEAD requests without checking", async () => {
      // Arrange — guard for project
      const guard = createFreezeGuard("project");
      const req = mockReq("HEAD"); // HEAD request
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — next() called, no DB query
      expect(next).toHaveBeenCalledWith();
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Frozen Entity Blocking Tests
  // ============================================================
  describe("frozen entities", () => {
    // Test: PATCH on frozen entity calls next(FreezeViolationError)
    test("blocks PATCH on frozen entity via next(error)", async () => {
      // Arrange — DB returns a frozen entity (frozen_at is set)
      db.query.mockResolvedValueOnce({
        rows: [{ frozen_at: new Date("2024-10-01") }],
      });

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("PATCH", { projectId: "proj-frozen" }); // projectId in params
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — next was called with a FreezeViolationError
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(FreezeViolationError));
      // Assert — res.status was NOT called (error handler handles that)
      expect(res.status).not.toHaveBeenCalled();
    });

    // Test: DELETE on frozen entity also blocked
    test("blocks DELETE on frozen entity", async () => {
      // Arrange — DB returns frozen entity
      db.query.mockResolvedValueOnce({
        rows: [{ frozen_at: new Date() }],
      });

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("DELETE", { projectId: "proj-frozen" }); // DELETE method
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — next called with FreezeViolationError
      expect(next).toHaveBeenCalledWith(expect.any(FreezeViolationError));
      // Assert — res.status never called
      expect(res.status).not.toHaveBeenCalled();
    });

    // Test: PUT on frozen entity is blocked
    test("blocks PUT on frozen entity", async () => {
      // Arrange — DB returns frozen entity
      db.query.mockResolvedValueOnce({
        rows: [{ frozen_at: new Date() }],
      });

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("PUT", { projectId: "proj-frozen" }); // PUT method
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — blocked with FreezeViolationError
      expect(next).toHaveBeenCalledWith(expect.any(FreezeViolationError));
    });
  });

  // ============================================================
  // Unfrozen Entity Passthrough Tests
  // ============================================================
  describe("unfrozen entities", () => {
    // Test: PATCH on unfrozen entity passes through
    test("allows PATCH on unfrozen entity", async () => {
      // Arrange — DB returns entity with null frozen_at
      db.query.mockResolvedValueOnce({
        rows: [{ frozen_at: null }],
      });

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("PATCH", { projectId: "proj-active" }); // Active project
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — next() called with no error args
      expect(next).toHaveBeenCalledWith();
      expect(res.status).not.toHaveBeenCalled();
    });

    // Test: entity not found in DB — still passes through
    test("passes through when entity not found in DB", async () => {
      // Arrange — DB returns empty rows
      db.query.mockResolvedValueOnce({ rows: [] });

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("PATCH", { projectId: "nonexistent" }); // Missing entity
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — let the controller handle 404
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ============================================================
  // Pre-built Guard Tests
  // ============================================================
  describe("pre-built guards", () => {
    // Test: projectFreezeGuard is a function
    test("projectFreezeGuard is a middleware function", () => {
      expect(typeof projectFreezeGuard).toBe("function");
    });

    // Test: workLogFreezeGuard is a function
    test("workLogFreezeGuard is a middleware function", () => {
      expect(typeof workLogFreezeGuard).toBe("function");
    });
  });

  // ============================================================
  // Error Handling Tests
  // ============================================================
  describe("error handling", () => {
    // Test: DB error is forwarded to next()
    test("passes DB errors to next() error handler", async () => {
      // Arrange — DB throws an error
      const dbError = new Error("Connection lost");
      db.query.mockRejectedValueOnce(dbError);

      const guard = createFreezeGuard("project"); // String entity type
      const req = mockReq("PATCH", { projectId: "proj-001" }); // Mutation request
      const res = mockRes(); // Mock response
      const next = jest.fn(); // Mock next

      // Act
      await guard(req, res, next);

      // Assert — error forwarded to Express error handler
      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
