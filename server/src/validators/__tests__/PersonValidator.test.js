// ============================================================
// PERSON VALIDATOR — Unit Tests
// ============================================================
// Tests the Zod-based PersonValidator for:
//   - validateCreate: returns validated data OR throws BusinessRuleViolationError
//   - validateUpdate: returns validated data OR throws BusinessRuleViolationError
//   - Cross-field validation: students must have admissionYear
//   - Graduation year >= admission year
//   - Optimistic concurrency: version required on updates
//   - Invalid inputs: missing fields, wrong types
//
// NOTE: Both validateCreate() and validateUpdate() THROW on invalid input.
//       On success they return the validated data object directly.
//       They do NOT return { success: true/false }.
//
// Run: npx jest server/src/validators/__tests__/PersonValidator.test.js
// ============================================================

// Import the validator (destructure from named export)
const { PersonValidator } = require("../PersonValidator");

// Import error type for assertions
const { BusinessRuleViolationError } = require("../../entities/EntityErrors");

// ============================================================
// Describe block: PersonValidator
// ============================================================
describe("PersonValidator", () => {
  // ----------------------------------------------------------
  // Helper: valid student creation input (proper UUIDs required)
  // ----------------------------------------------------------
  const validStudentInput = () => ({
    identityId: "550e8400-e29b-41d4-a716-446655440001", // Valid UUID format
    personType: "student", // Type of person
    displayName: "Kamesh", // Display name
    admissionYear: 2023, // Required for students
    departmentCode: "CSE", // Department
    graduationYear: 2027, // Must be >= admissionYear
  });

  // ----------------------------------------------------------
  // Helper: valid faculty creation input
  // ----------------------------------------------------------
  const validFacultyInput = () => ({
    identityId: "550e8400-e29b-41d4-a716-446655440002", // Valid UUID format
    personType: "faculty", // Faculty type
    displayName: "Dr. Ramesh", // Display name
    departmentCode: "ECE", // Department
  });

  // ============================================================
  // Create Person Schema Tests
  // NOTE: validateCreate() returns validated data on success, THROWS on failure
  // ============================================================
  describe("validateCreate()", () => {
    // Test: valid student passes — returns validated data
    test("accepts valid student input", () => {
      const result = PersonValidator.validateCreate(validStudentInput());
      // Returns validated data directly (not { success: true })
      expect(result.personType).toBe("student");
      expect(result.displayName).toBe("Kamesh");
    });

    // Test: valid faculty passes — returns validated data
    test("accepts valid faculty input", () => {
      const result = PersonValidator.validateCreate(validFacultyInput());
      expect(result.personType).toBe("faculty");
      expect(result.displayName).toBe("Dr. Ramesh");
    });

    // Test: missing identityId THROWS
    test("rejects input without identityId", () => {
      const input = validStudentInput();
      delete input.identityId;
      expect(() => PersonValidator.validateCreate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });

    // Test: missing personType THROWS
    test("rejects input without personType", () => {
      const input = validStudentInput();
      delete input.personType;
      expect(() => PersonValidator.validateCreate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });

    // Test: invalid personType THROWS
    test("rejects invalid personType value", () => {
      const input = { ...validStudentInput(), personType: "alien" };
      expect(() => PersonValidator.validateCreate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });

    // Test: student without admissionYear THROWS (cross-field rule)
    test("rejects student without admissionYear", () => {
      const input = validStudentInput();
      delete input.admissionYear;
      expect(() => PersonValidator.validateCreate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });

    // Test: graduation year < admission year THROWS
    test("rejects graduationYear before admissionYear", () => {
      const input = { ...validStudentInput(), graduationYear: 2020 };
      expect(() => PersonValidator.validateCreate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });
  });

  // ============================================================
  // Update Person Schema Tests
  // NOTE: validateUpdate() returns validated data on success, THROWS on failure
  // ============================================================
  describe("validateUpdate()", () => {
    // Test: valid update with version — returns validated data
    test("accepts valid update input with version", () => {
      const input = {
        displayName: "New Name",
        version: 1, // Required for optimistic locking
      };
      const result = PersonValidator.validateUpdate(input);
      expect(result.displayName).toBe("New Name");
      expect(result.version).toBe(1);
    });

    // Test: update without version THROWS (optimistic lock)
    test("rejects update without version", () => {
      const input = { displayName: "Without Version" };
      expect(() => PersonValidator.validateUpdate(input)).toThrow(
        BusinessRuleViolationError,
      );
    });

    // Test: partial update is allowed — returns validated data
    test("accepts partial update (only displayName)", () => {
      const input = {
        displayName: "Updated",
        version: 2,
      };
      const result = PersonValidator.validateUpdate(input);
      expect(result.displayName).toBe("Updated");
      expect(result.version).toBe(2);
    });
  });
});
