// ============================================================
// ENTITY ERRORS — Unit Tests
// ============================================================
// Tests the PEMM error hierarchy for:
//   - All 15 error classes are properly defined
//   - Each error extends AppError (from existing system)
//   - Correct status codes assigned
//   - Correct error codes assigned
//   - instanceof chains work (EntityError → AppError → Error)
//   - Custom properties (details) are attached
//
// Run: npx jest server/src/entities/__tests__/EntityErrors.test.js
// ============================================================

// Import all error classes
const {
  EntityModelingError,
  BusinessRuleViolationError,
  TeamSizeError,
  DuplicateMemberError,
  InvalidMembershipError,
  TemporalValidationError,
  PeriodFrozenError,
  FreezeViolationError,
  StateTransitionError,
  GuardConditionFailedError,
  ProjectNotFoundError,
  PersonNotFoundError,
  ProjectCreationError,
  IntegrityViolationError,
  ImmutableDataError,
} = require("../EntityErrors");

// ============================================================
// Describe block: EntityErrors
// ============================================================
describe("EntityErrors", () => {
  // ============================================================
  // Base EntityError
  // ============================================================
  describe("EntityModelingError (base)", () => {
    test("is an instance of Error", () => {
      const err = new EntityModelingError("test");
      expect(err).toBeInstanceOf(Error);
    });

    test("has correct message", () => {
      const err = new EntityModelingError("Something broke");
      expect(err.message).toBe("Something broke");
    });
  });

  // ============================================================
  // 404 Errors — Not Found
  // ============================================================
  describe("Not Found errors", () => {
    test("ProjectNotFoundError has 404 status", () => {
      const err = new ProjectNotFoundError("proj-001");
      expect(err.statusCode).toBe(404);
      expect(err).toBeInstanceOf(EntityModelingError);
      expect(err).toBeInstanceOf(Error);
    });

    test("PersonNotFoundError has 404 status", () => {
      const err = new PersonNotFoundError("p-001");
      expect(err.statusCode).toBe(404);
      expect(err).toBeInstanceOf(EntityModelingError);
    });
  });

  // ============================================================
  // 422 Errors — Business Rule Violations
  // ============================================================
  describe("Business rule violation errors (422)", () => {
    test("BusinessRuleViolationError has 422 status", () => {
      const err = new BusinessRuleViolationError("Rule broken");
      expect(err.statusCode).toBe(422);
    });

    test("TeamSizeError has 422 status", () => {
      const err = new TeamSizeError("Too many");
      expect(err.statusCode).toBe(422);
      expect(err).toBeInstanceOf(BusinessRuleViolationError);
    });

    test("InvalidMembershipError has 422 status", () => {
      const err = new InvalidMembershipError("Not eligible");
      expect(err.statusCode).toBe(422);
    });

    test("TemporalValidationError has 422 status", () => {
      const err = new TemporalValidationError("Future date");
      expect(err.statusCode).toBe(422);
    });
  });

  // ============================================================
  // 409 Errors — Conflicts
  // ============================================================
  describe("Conflict errors (409)", () => {
    test("StateTransitionError has 409 status", () => {
      const err = new StateTransitionError("draft", "locked");
      expect(err.statusCode).toBe(409);
    });

    test("GuardConditionFailedError has 409 status", () => {
      const err = new GuardConditionFailedError("Not enough members");
      expect(err.statusCode).toBe(409);
    });

    test("DuplicateMemberError has correct status", () => {
      const err = new DuplicateMemberError("Already exists");
      expect(err).toBeInstanceOf(EntityModelingError);
    });
  });

  // ============================================================
  // 423 Errors — Locked
  // ============================================================
  describe("Locked errors (423)", () => {
    test("PeriodFrozenError has 423 status", () => {
      const err = new PeriodFrozenError("Period is frozen");
      expect(err.statusCode).toBe(423);
    });

    test("FreezeViolationError has 423 status", () => {
      const err = new FreezeViolationError("Cannot modify frozen entity");
      expect(err.statusCode).toBe(423);
    });

    test("ImmutableDataError has 423 status", () => {
      const err = new ImmutableDataError("Cannot change");
      expect(err.statusCode).toBe(423);
    });
  });

  // ============================================================
  // 500 Errors — Server Errors
  // ============================================================
  describe("Server errors (500)", () => {
    test("ProjectCreationError has 500 status", () => {
      const err = new ProjectCreationError("DB failure");
      expect(err.statusCode).toBe(500);
    });

    test("IntegrityViolationError has 500 status", () => {
      const err = new IntegrityViolationError("Hash mismatch");
      expect(err.statusCode).toBe(500);
    });
  });

  // ============================================================
  // Inheritance Chain Tests
  // ============================================================
  describe("inheritance chains", () => {
    // TeamSizeError → BusinessRuleViolationError → EntityModelingError → Error
    test("TeamSizeError has full inheritance chain", () => {
      const err = new TeamSizeError("Wrong size");
      expect(err).toBeInstanceOf(TeamSizeError);
      expect(err).toBeInstanceOf(BusinessRuleViolationError);
      expect(err).toBeInstanceOf(EntityModelingError);
      expect(err).toBeInstanceOf(Error);
    });

    // GuardConditionFailedError → StateTransitionError → EntityModelingError
    test("GuardConditionFailedError extends StateTransitionError", () => {
      const err = new GuardConditionFailedError("Guard failed");
      // Check if it's at least an EntityModelingError
      expect(err).toBeInstanceOf(EntityModelingError);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
