// ============================================================
// PERSON VALIDATOR — Input Validation for Person Operations
// ============================================================
// Validates all input data for creating and updating persons.
// Uses Zod for schema validation (already installed in the project).
//
// Validation happens BEFORE any database operation.
// If validation fails, a clear error is thrown with details
// about which fields are invalid and why.
//
// This validator checks:
//   - Required fields are present
//   - Data types are correct
//   - Enum values are valid
//   - Year ranges are reasonable
//   - Department codes are non-empty strings
// ============================================================

// Import Zod for schema-based validation (already installed)
const { z } = require("zod");

// Import person type and status enums for validation
const { PersonType, PersonStatus } = require("../entities/Person");

// Import custom error for validation failures
const { BusinessRuleViolationError } = require("../entities/EntityErrors");

// ============================================================
// ZOD SCHEMAS — Define validation rules declaratively
// ============================================================

// Schema for creating a new person
const createPersonSchema = z.object({
  // identity_id links to the users table — required UUID
  identityId: z
    .string()
    .uuid("identity_id must be a valid UUID")
    .describe("FK reference to existing auth user"),

  // Person type must be one of the valid enum values
  personType: z.enum(
    [
      PersonType.STUDENT,
      PersonType.FACULTY,
      PersonType.STAFF,
      PersonType.EXTERNAL,
    ],
    {
      errorMap: () => ({
        message: "personType must be student, faculty, staff, or external",
      }),
    },
  ),

  // Display name — required, 1-200 characters
  displayName: z
    .string()
    .min(1, "displayName is required")
    .max(200, "displayName must be 200 characters or less")
    .trim(),

  // Admission year — required for students, optional for others
  // Must be between 2000 and 2100 (reasonable range)
  admissionYear: z
    .number()
    .int("admissionYear must be an integer")
    .min(2000, "admissionYear must be 2000 or later")
    .max(2100, "admissionYear must be 2100 or earlier")
    .optional()
    .nullable(),

  // Department code — optional, 2-10 characters
  departmentCode: z
    .string()
    .min(2, "departmentCode must be at least 2 characters")
    .max(10, "departmentCode must be 10 characters or less")
    .toUpperCase()
    .optional()
    .nullable(),

  // Graduation year — optional, must be >= admission year
  graduationYear: z
    .number()
    .int("graduationYear must be an integer")
    .min(2000, "graduationYear must be 2000 or later")
    .max(2110, "graduationYear must be 2110 or earlier")
    .optional()
    .nullable(),
});

// Schema for updating an existing person
const updatePersonSchema = z.object({
  // Display name — optional on update
  displayName: z
    .string()
    .min(1, "displayName cannot be empty")
    .max(200, "displayName must be 200 characters or less")
    .trim()
    .optional(),

  // Status — can be changed to any valid status
  status: z
    .enum(
      [
        PersonStatus.ACTIVE,
        PersonStatus.INACTIVE,
        PersonStatus.GRADUATED,
        PersonStatus.SUSPENDED,
      ],
      {
        errorMap: () => ({
          message: "status must be active, inactive, graduated, or suspended",
        }),
      },
    )
    .optional(),

  // Department code — can be updated
  departmentCode: z
    .string()
    .min(2, "departmentCode must be at least 2 characters")
    .max(10, "departmentCode must be 10 characters or less")
    .toUpperCase()
    .optional()
    .nullable(),

  // Graduation year — can be updated
  graduationYear: z
    .number()
    .int("graduationYear must be an integer")
    .min(2000, "graduationYear must be 2000 or later")
    .max(2110, "graduationYear must be 2110 or earlier")
    .optional()
    .nullable(),

  // Version — REQUIRED for optimistic concurrency control
  // Must match the current version in the database
  version: z
    .number()
    .int("version must be an integer")
    .min(1, "version must be a positive integer"),
});

// ============================================================
// PersonValidator class — wraps Zod schemas with business logic
// ============================================================
class PersonValidator {
  /**
   * Validate data for creating a new person.
   * Includes cross-field validation (e.g., students must have admission year).
   *
   * @param {Object} data - Raw input data to validate
   * @returns {Object} Validated and sanitized data
   * @throws {BusinessRuleViolationError} If validation fails
   */
  static validateCreate(data) {
    // Run Zod schema validation
    const result = createPersonSchema.safeParse(data);

    // If schema validation fails, throw a business rule error
    if (!result.success) {
      // Extract the error messages from Zod
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );

      throw new BusinessRuleViolationError(
        `Person creation validation failed: ${issues.join("; ")}`,
        { issues: result.error.issues },
      );
    }

    // Get the validated data
    const validated = result.data;

    // Cross-field validation: students MUST have an admission year
    if (
      validated.personType === PersonType.STUDENT &&
      !validated.admissionYear
    ) {
      throw new BusinessRuleViolationError(
        "Students must have an admissionYear",
        { field: "admissionYear", personType: validated.personType },
      );
    }

    // Cross-field validation: graduationYear must be >= admissionYear
    if (validated.admissionYear && validated.graduationYear) {
      if (validated.graduationYear < validated.admissionYear) {
        throw new BusinessRuleViolationError(
          "graduationYear cannot be before admissionYear",
          {
            admissionYear: validated.admissionYear,
            graduationYear: validated.graduationYear,
          },
        );
      }
    }

    // Return the validated and sanitized data
    return validated;
  }

  /**
   * Validate data for updating an existing person.
   * At least one updatable field must be present.
   *
   * @param {Object} data - Raw update data to validate
   * @returns {Object} Validated and sanitized update data
   * @throws {BusinessRuleViolationError} If validation fails
   */
  static validateUpdate(data) {
    // Run Zod schema validation
    const result = updatePersonSchema.safeParse(data);

    // If schema validation fails, throw a business rule error
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );

      throw new BusinessRuleViolationError(
        `Person update validation failed: ${issues.join("; ")}`,
        { issues: result.error.issues },
      );
    }

    // Get the validated data
    const validated = result.data;

    // Ensure at least one field besides 'version' is being updated
    const updateFields = Object.keys(validated).filter((k) => k !== "version");
    if (updateFields.length === 0) {
      throw new BusinessRuleViolationError(
        "At least one field must be provided for update",
        { providedFields: Object.keys(data) },
      );
    }

    // Return validated data
    return validated;
  }
}

// ============================================================
// Export PersonValidator and schemas
// ============================================================
module.exports = { PersonValidator, createPersonSchema, updatePersonSchema };
