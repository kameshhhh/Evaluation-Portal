// ============================================================
// ACADEMIC PROFILE BUILDER — ENRICH PERSON WITH ACADEMIC CONTEXT
// ============================================================
// Takes basic person data + email, produces a complete academic
// profile enriched with:
//   - Parsed department and admission year (from email)
//   - Academic context (current semester, year of study, graduation)
//   - Confidence scoring and source attribution
//   - Completion status flag
//
// PURE FUNCTION CONTRACT:
//   ✓ Deterministic (same input → same output*)
//   ✓ No side effects (no DB, no I/O, no logging)
//   ✓ No mutable external state
//   * Note: parsedAt/calculatedAt timestamps vary, but all other
//     fields are deterministic for the same input date.
//
// SITS BETWEEN:
//   AcademicIdentityParser → THIS → PersonProfileLinker
//   (Parse email)          (Enrich) (Save to DB)
//
// SECURITY:
//   All returned objects are frozen — downstream cannot mutate them.
//   No raw database rows are exposed.
//   identityId is the only PII field transferred.
// ============================================================

// Import the email parser for academic token extraction
// Pure function — no side effects
const {
  parseStudentAcademicInfo, // Main email → academic profile parser
  isAcademicProfileComplete, // Check if profile is fully populated
} = require("./AcademicIdentityParser");

// ============================================================
// PUBLIC: Build Complete Academic Profile
// ============================================================
/**
 * Build a complete academic profile by combining person data
 * with email-based academic inference.
 *
 * This is the main bridge between authentication identity and
 * academic identity. It enriches basic person data with:
 *   - Department code and name (from email parsing)
 *   - Current academic context (year of study, semester)
 *   - Expected graduation year
 *   - Confidence scoring for all inferences
 *
 * @param {Object} personData - Basic person data from PEMM or auth
 * @param {string} personData.identity_id - Auth identity UUID
 * @param {string} personData.person_type - student/faculty/admin
 * @param {string} email - Google-verified email address
 * @param {Date} [referenceDate] - Optional date for context calculation (for testing)
 * @returns {Object} Frozen complete academic profile
 *
 * @example
 *   buildAcademicProfile(
 *     { identity_id: 'abc-123', person_type: 'student' },
 *     'kamesh.mz23@bitsathy.ac.in'
 *   )
 *   // → {
 *   //   identityId: 'abc-123',
 *   //   personType: 'student',
 *   //   departmentCode: 'MZ',
 *   //   departmentName: 'Mechatronics Engineering',
 *   //   currentAcademicYear: 3,
 *   //   currentSemester: 'EVEN',
 *   //   expectedGraduationYear: 2027,
 *   //   academicStatus: 'YEAR_3',
 *   //   academicConfidence: 'HIGH',
 *   //   isComplete: true,
 *   //   ...
 *   // }
 */
function buildAcademicProfile(personData, email, referenceDate) {
  // Step 1: Parse academic info from the email address
  // This extracts department code, admission year, confidence
  const academicInfo = parseStudentAcademicInfo(email);

  // Step 2: Calculate the current academic context
  // This determines year of study, semester, graduation year, status
  // Uses the parsed admission year as the baseline
  const academicContext = calculateAcademicContext(
    academicInfo.admissionYear, // May be null if parse failed
    referenceDate, // Optional override for testing
  );

  // Step 3: Assemble the complete academic profile object
  const profile = {
    // ---------------------------------------------------------
    // Core identity fields (from person data)
    // These are passed through unchanged
    // ---------------------------------------------------------
    identityId: personData.identity_id, // Auth identity UUID (FK to users)
    personType: personData.person_type, // student/faculty/admin

    // ---------------------------------------------------------
    // Academic inference fields (from email parser)
    // These are the primary output of the parsing pipeline
    // ---------------------------------------------------------
    departmentCode: academicInfo.departmentCode, // Official code: 'MZ'
    departmentName: academicInfo.departmentName, // Full name: 'Mechatronics...'
    departmentCategory: academicInfo.departmentCategory, // Category: 'engineering'
    admissionYear: academicInfo.admissionYear, // Full year: 2023
    emailDepartmentCode: academicInfo.emailDepartmentCode, // Raw: 'mz' (for audit)

    // ---------------------------------------------------------
    // Academic context fields (calculated from admission year)
    // These change based on the current date
    // ---------------------------------------------------------
    currentAcademicYear: academicContext.currentYear, // Year of study: 1-4
    currentSemester: academicContext.currentSemester, // ODD or EVEN
    expectedGraduationYear: academicContext.graduationYear, // admission + 4
    academicStatus: academicContext.status, // YEAR_1..YEAR_4, ALUMNI

    // ---------------------------------------------------------
    // Confidence and source tracking (for audit trail)
    // Every inference must be traceable to its source
    // ---------------------------------------------------------
    academicConfidence: academicInfo.confidence, // HIGH or LOW
    academicSource: academicInfo.source, // EMAIL_PARSER or EMAIL_PARSE_FAILED
    requiresManualCompletion: academicInfo.requiresManualCompletion, // true if LOW

    // ---------------------------------------------------------
    // Audit metadata
    // When was this profile built, which version of the builder
    // ---------------------------------------------------------
    profileBuiltAt: new Date().toISOString(), // Timestamp of profile construction
    profileVersion: "1.0", // Schema version for migrations

    // ---------------------------------------------------------
    // Completion status (derived from all above)
    // A single boolean that answers: "Is this profile ready?"
    // ---------------------------------------------------------
    isComplete: isAcademicProfileComplete(academicInfo),
  };

  // Step 4: Freeze and return — prevent any downstream mutation
  return Object.freeze(profile);
}

// ============================================================
// PRIVATE: Calculate Academic Context Based on Admission Year
// ============================================================
/**
 * Determine a student's current academic position based on their
 * admission year and the current date.
 *
 * Bitsathy College Academic Calendar:
 *   - Academic year: June to May
 *   - Odd semester:  June to November
 *   - Even semester: December to May
 *   - B.Tech program: 4 years (admission + 4 = graduation)
 *
 * @param {number | null} admissionYear - Year of admission (e.g., 2023)
 * @param {Date} [referenceDate] - Optional reference date (default: now)
 * @returns {Object} Academic context with year, semester, graduation
 *
 * @example
 *   // If current date is Feb 2026, admission year is 2023:
 *   calculateAcademicContext(2023)
 *   // → {
 *   //   currentYear: 3,           (2025 academic year - 2023 + 1)
 *   //   currentSemester: 'EVEN',  (Feb is in Even semester)
 *   //   graduationYear: 2027,     (2023 + 4)
 *   //   status: 'YEAR_3'
 *   // }
 */
function calculateAcademicContext(admissionYear, referenceDate) {
  // Handle null admission year — can't calculate without it
  if (!admissionYear) {
    return {
      currentYear: null, // Unknown year of study
      currentSemester: null, // Unknown semester
      graduationYear: null, // Can't calculate graduation
      status: "UNKNOWN", // Status is indeterminate
      calculatedAt: new Date().toISOString(), // When we attempted
    };
  }

  // Use the reference date or current date
  // Reference date parameter enables deterministic testing
  const currentDate = referenceDate || new Date();
  const calendarYear = currentDate.getFullYear(); // e.g., 2026
  const currentMonth = currentDate.getMonth() + 1; // 1-12 (Jan=1)

  // ---------------------------------------------------------
  // Calculate academic year (June-May cycle)
  // If we're in June-December → academic year = calendar year
  // If we're in January-May → academic year = previous calendar year
  // This aligns with Bitsathy's academic calendar
  // ---------------------------------------------------------
  let academicYear;
  if (currentMonth >= 6) {
    // June-December: Current calendar year IS the academic year
    academicYear = calendarYear;
  } else {
    // January-May: Previous calendar year IS the academic year
    academicYear = calendarYear - 1;
  }

  // ---------------------------------------------------------
  // Calculate year of study (1st, 2nd, 3rd, 4th)
  // Formula: academic_year - admission_year + 1
  // Example: 2025 academic year - 2023 admission + 1 = 3rd year
  // ---------------------------------------------------------
  const yearOfStudy = academicYear - admissionYear + 1;

  // ---------------------------------------------------------
  // Determine current semester based on month
  // June-November: ODD semester (semester 1, 3, 5, 7)
  // December-May: EVEN semester (semester 2, 4, 6, 8)
  // ---------------------------------------------------------
  const currentSemester =
    currentMonth >= 6 && currentMonth <= 11 ? "ODD" : "EVEN";

  // ---------------------------------------------------------
  // Expected graduation year (4-year B.Tech program)
  // Graduation happens in May of (admissionYear + 4)
  // Example: Admitted 2023 → Graduates May 2027
  // ---------------------------------------------------------
  const graduationYear = admissionYear + 4;

  // ---------------------------------------------------------
  // Determine academic status based on year of study
  // NOT_STARTED: Future admission (yearOfStudy < 1)
  // YEAR_1..YEAR_4: Currently enrolled
  // ALUMNI: Past expected graduation
  // ---------------------------------------------------------
  let status;
  if (yearOfStudy < 1) {
    status = "NOT_STARTED"; // Haven't begun studies yet
  } else if (yearOfStudy > 4) {
    status = "ALUMNI"; // Past expected graduation date
  } else {
    status = `YEAR_${yearOfStudy}`; // Currently YEAR_1 through YEAR_4
  }

  // Return the complete academic context
  return {
    currentYear: yearOfStudy, // 1-4 (or out of range)
    currentSemester: currentSemester, // ODD or EVEN
    graduationYear: graduationYear, // Admission + 4
    status: status, // YEAR_N, ALUMNI, NOT_STARTED
    calculatedAt: currentDate.toISOString(), // When this was calculated
  };
}

// ============================================================
// PUBLIC: Validate Academic Profile for Storage
// ============================================================
/**
 * Validate an academic profile before it's saved to the database.
 *
 * Ensures all required fields meet database constraints.
 * Throws AcademicProfileValidationError with details on failure.
 *
 * Called by PersonProfileLinker BEFORE any database writes.
 * This is the LAST safety gate before data enters the DB.
 *
 * @param {Object} academicProfile - The profile to validate
 * @returns {boolean} True if validation passes
 * @throws {AcademicProfileValidationError} If validation fails
 *
 * @example
 *   validateAcademicProfileForStorage({ identityId: 'abc', personType: 'student', ... })
 *   // → true (or throws with detailed error list)
 */
function validateAcademicProfileForStorage(academicProfile) {
  // Accumulate all validation errors before throwing
  // This provides a complete list of issues, not just the first one
  const errors = [];

  // ---------------------------------------------------------
  // Required field: identityId (FK to users table)
  // Without this, the profile can't be linked to an auth user
  // ---------------------------------------------------------
  if (!academicProfile.identityId) {
    errors.push("Missing identityId — cannot link to auth user");
  }

  // ---------------------------------------------------------
  // Required field: personType
  // Must be one of: student, faculty, admin
  // ---------------------------------------------------------
  if (!academicProfile.personType) {
    errors.push("Missing personType — cannot determine role");
  }

  // ---------------------------------------------------------
  // Consistency: departmentCode requires departmentName
  // If code is set but name is not, the registry was bypassed
  // ---------------------------------------------------------
  if (academicProfile.departmentCode && !academicProfile.departmentName) {
    errors.push("Department code set without name — registry bypass detected");
  }

  // ---------------------------------------------------------
  // Range check: admissionYear (if present)
  // Must be in the 2000-2099 range for Bitsathy students
  // ---------------------------------------------------------
  if (academicProfile.admissionYear) {
    const year = academicProfile.admissionYear;
    if (year < 2000 || year > 2099) {
      errors.push(`Admission year ${year} out of valid range (2000-2099)`);
    }
  }

  // ---------------------------------------------------------
  // Confidence field validation
  // Must be one of the recognized confidence levels
  // ---------------------------------------------------------
  const validConfidences = ["HIGH", "LOW"];
  const validSources = ["EMAIL_PARSER", "EMAIL_PARSE_FAILED", "ADMIN_OVERRIDE"];
  if (
    academicProfile.academicConfidence &&
    !validConfidences.includes(academicProfile.academicConfidence)
  ) {
    errors.push(
      `Invalid confidence level: '${academicProfile.academicConfidence}'. ` +
        `Must be one of: ${validConfidences.join(", ")}`,
    );
  }

  // ---------------------------------------------------------
  // Source field validation
  // Must be a recognized source type
  // ---------------------------------------------------------
  if (
    academicProfile.academicSource &&
    !validSources.includes(academicProfile.academicSource)
  ) {
    errors.push(
      `Invalid source: '${academicProfile.academicSource}'. ` +
        `Must be one of: ${validSources.join(", ")}`,
    );
  }

  // ---------------------------------------------------------
  // If any errors accumulated, throw with full details
  // The error includes both the error list and the profile for debugging
  // ---------------------------------------------------------
  if (errors.length > 0) {
    throw new AcademicProfileValidationError(
      `Academic profile validation failed with ${errors.length} error(s)`,
      { errors, profile: academicProfile },
    );
  }

  // All validations passed
  return true;
}

// ============================================================
// CUSTOM ERROR: AcademicProfileValidationError
// ============================================================
/**
 * Custom error class for academic profile validation failures.
 *
 * Contains metadata about what went wrong, including:
 *   - List of specific validation errors
 *   - The profile that failed validation
 *   - Timestamp of the validation attempt
 *
 * This error is caught by PersonProfileLinker and converted
 * to an appropriate HTTP response.
 */
class AcademicProfileValidationError extends Error {
  /**
   * @param {string} message - Human-readable error summary
   * @param {Object} metadata - Validation details
   * @param {string[]} metadata.errors - List of specific errors
   * @param {Object} metadata.profile - The failing profile
   */
  constructor(message, metadata = {}) {
    super(message);
    this.name = "AcademicProfileValidationError"; // Error class name
    this.metadata = metadata; // Detailed error info
    this.timestamp = new Date().toISOString(); // When error occurred
    this.status = 422; // HTTP status: Unprocessable Entity
  }
}

// ============================================================
// EXPORT — Public API for this module
// ============================================================
module.exports = {
  buildAcademicProfile, // Main builder: person + email → profile
  validateAcademicProfileForStorage, // Pre-storage validation
  AcademicProfileValidationError, // Custom error class (for instanceof checks)
  // Internal function exported for testing:
  _calculateAcademicContext: calculateAcademicContext,
};
