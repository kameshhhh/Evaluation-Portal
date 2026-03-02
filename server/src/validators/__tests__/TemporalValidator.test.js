// ============================================================
// TEMPORAL VALIDATOR — Unit Tests
// ============================================================
// Tests the TemporalValidator for:
//   - validateNotFuture: rejects future dates
//   - validateNotFrozen: rejects operations on frozen entities
//   - validateProjectDates: max 18-month project span
//   - validateWorkHours: 0 ≤ hours ≤ 200
//   - validateAcademicYear: format YYYY-YYYY
//   - validateSemester: must be 'odd' or 'even'
//
// Run: npx jest server/src/validators/__tests__/TemporalValidator.test.js
// ============================================================

// Import the validator (destructure from named export)
const { TemporalValidator } = require("../TemporalValidator");

// Import error for instanceof checks
const { TemporalValidationError } = require("../../entities/EntityErrors");

// ============================================================
// Describe block: TemporalValidator
// ============================================================
describe("TemporalValidator", () => {
  // ============================================================
  // validateNotFuture
  // ============================================================
  describe("validateNotFuture()", () => {
    // Test: past date is valid
    test("accepts a past date", () => {
      const pastDate = new Date("2023-01-01");
      expect(() => {
        TemporalValidator.validateNotFuture(pastDate);
      }).not.toThrow();
    });

    // Test: current date is valid (approximately now)
    test("accepts the current date", () => {
      const now = new Date();
      expect(() => {
        TemporalValidator.validateNotFuture(now);
      }).not.toThrow();
    });

    // Test: future date is rejected
    test("rejects a future date", () => {
      // Create a date 1 year in the future
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      expect(() => {
        TemporalValidator.validateNotFuture(future);
      }).toThrow(TemporalValidationError);
    });
  });

  // ============================================================
  // validateNotFrozen
  // ============================================================
  describe("validateNotFrozen()", () => {
    // Test: unfrozen work log (is_frozen is falsy) passes
    test("accepts entity that is not frozen", () => {
      const entity = { is_frozen: false };
      expect(() => {
        TemporalValidator.validateNotFrozen(entity);
      }).not.toThrow();
    });

    // Test: frozen work log is rejected
    // NOTE: validateNotFrozen checks workLog.is_frozen (snake_case boolean)
    test("rejects entity that is frozen", () => {
      const entity = {
        is_frozen: true,
        project_id: "proj-001",
        period_id: "period-001",
      };
      expect(() => {
        TemporalValidator.validateNotFrozen(entity);
      }).toThrow();
    });
  });

  // ============================================================
  // validateWorkHours
  // ============================================================
  describe("validateWorkHours()", () => {
    // Test: 0 hours is valid (start of range)
    test("accepts 0 hours", () => {
      expect(() => {
        TemporalValidator.validateWorkHours(0);
      }).not.toThrow();
    });

    // Test: 100 hours is valid (mid-range)
    test("accepts 100 hours", () => {
      expect(() => {
        TemporalValidator.validateWorkHours(100);
      }).not.toThrow();
    });

    // Test: 200 hours is valid (max)
    test("accepts 200 hours (maximum)", () => {
      expect(() => {
        TemporalValidator.validateWorkHours(200);
      }).not.toThrow();
    });

    // Test: negative hours are rejected
    test("rejects negative hours", () => {
      expect(() => {
        TemporalValidator.validateWorkHours(-1);
      }).toThrow(TemporalValidationError);
    });

    // Test: 201 hours is rejected (over max)
    test("rejects hours over 200", () => {
      expect(() => {
        TemporalValidator.validateWorkHours(201);
      }).toThrow(TemporalValidationError);
    });
  });

  // ============================================================
  // validateAcademicYear
  // NOTE: Takes an INTEGER (e.g. 2024), NOT a string like '2024-2025'
  // ============================================================
  describe("validateAcademicYear()", () => {
    // Test: valid integer year 2024
    test("accepts valid academic year 2024", () => {
      expect(() => {
        TemporalValidator.validateAcademicYear(2024);
      }).not.toThrow();
    });

    // Test: valid integer year 2023
    test("accepts valid academic year 2023", () => {
      expect(() => {
        TemporalValidator.validateAcademicYear(2023);
      }).not.toThrow();
    });

    // Test: string is rejected (not an integer)
    test("rejects string academic year", () => {
      expect(() => {
        TemporalValidator.validateAcademicYear("2024-2025");
      }).toThrow(TemporalValidationError);
    });

    // Test: year below 2000 is rejected
    test("rejects year below minimum (2000)", () => {
      expect(() => {
        TemporalValidator.validateAcademicYear(1999);
      }).toThrow(TemporalValidationError);
    });

    // Test: year above 2100 is rejected
    test("rejects year above maximum (2100)", () => {
      expect(() => {
        TemporalValidator.validateAcademicYear(2101);
      }).toThrow(TemporalValidationError);
    });
  });

  // ============================================================
  // validateSemester
  // NOTE: Expects 1 (Odd) or 2 (Even), NOT strings 'odd'/'even'
  // ============================================================
  describe("validateSemester()", () => {
    // Test: 1 (odd) is valid
    test("accepts semester 1 (odd)", () => {
      expect(() => {
        TemporalValidator.validateSemester(1);
      }).not.toThrow();
    });

    // Test: 2 (even) is valid
    test("accepts semester 2 (even)", () => {
      expect(() => {
        TemporalValidator.validateSemester(2);
      }).not.toThrow();
    });

    // Test: 'odd' string is rejected (must be a number)
    test("rejects string semester name", () => {
      expect(() => {
        TemporalValidator.validateSemester("odd");
      }).toThrow(TemporalValidationError);
    });

    // Test: 3 is rejected (only 1 and 2 valid)
    test("rejects number other than 1 or 2", () => {
      expect(() => {
        TemporalValidator.validateSemester(3);
      }).toThrow(TemporalValidationError);
    });
  });
});
