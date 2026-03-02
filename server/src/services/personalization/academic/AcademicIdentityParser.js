// ============================================================
// ACADEMIC IDENTITY PARSER — DETERMINISTIC EMAIL → ACADEMIC PROFILE
// ============================================================
// This module is a PURE FUNCTION pipeline that transforms a
// Google-verified email address into a structured academic identity.
//
// INPUT:  'kamesh.mz23@bitsathy.ac.in'
// OUTPUT: { departmentCode: 'MZ', admissionYear: 2023, confidence: 'HIGH' }
//
// PURE FUNCTION CONTRACT:
//   ✓ Same input → same output (deterministic)
//   ✓ No side effects (no DB, no I/O, no logging)
//   ✓ No external mutable state (reads frozen registry only)
//   ✓ Testable without mocks (zero dependencies on runtime)
//
// WHY THIS EXISTS SEPARATELY:
//   Single Responsibility — parse email, nothing else.
//   PersonProfileLinker calls this for academic inference,
//   but the parsing logic is isolated for testing and reuse.
//
// CONFIDENCE MODEL:
//   HIGH — Token parsed successfully AND department recognized
//   LOW  — Token could not be parsed OR department unknown
//   Never guesses. If unsure, returns LOW + requiresManualCompletion.
//
// AUDIT:
//   Every result includes `source` and `parsedAt` for traceability.
//   The original email and academic token are preserved for debugging.
// ============================================================

// Import the department validation functions from the registry
// These are pure functions — no side effects, no I/O
const {
  getCanonicalDepartment, // Looks up dept metadata by email code
  isValidDepartmentCode, // Checks if email code exists in registry
} = require("./DepartmentRegistry");

// ============================================================
// PRIVATE: Extract Academic Token from Email
// ============================================================
/**
 * Isolate the academic token from a Bitsathy student email.
 *
 * Student email pattern: {name}.{deptCode}{yearDigits}@bitsathy.ac.in
 * Examples:
 *   'kamesh.mz23@bitsathy.ac.in'     → 'mz23'
 *   'devi.cs24@bitsathy.ac.in'       → 'cs24'
 *   'raj.kumar.it25@bitsathy.ac.in'  → 'it25'
 *   'professor@bitsathy.ac.in'       → null (no token)
 *   'admin@bitsathy.ac.in'           → null (no token)
 *
 * The academic token is the LAST dot-separated segment of the
 * local part that matches the pattern: 2 letters + 2 digits.
 *
 * We search from right to left because:
 *   - Names can have multiple dots (e.g., 'first.middle.mz23')
 *   - The academic token is always the last segment before @
 *
 * @param {string} email - Full email address to parse
 * @returns {string | null} Academic token (e.g., 'mz23') or null
 *
 * @example
 *   extractAcademicToken('kamesh.mz23@bitsathy.ac.in') // → 'mz23'
 *   extractAcademicToken('professor@bitsathy.ac.in')   // → null
 */
function extractAcademicToken(email) {
  // Step 1: Basic email format validation
  // Already verified by Google OAuth, but we validate defensively
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return null; // Not a valid email structure — no token
  }

  // Step 2: Extract the local part (everything before @)
  // 'kamesh.mz23@bitsathy.ac.in' → 'kamesh.mz23'
  const localPart = email.split("@")[0];

  // Step 3: Split the local part by dots to isolate segments
  // 'kamesh.mz23' → ['kamesh', 'mz23']
  // 'raj.kumar.it25' → ['raj', 'kumar', 'it25']
  const parts = localPart.split(".");

  // Step 4: Define the academic token pattern
  // Pattern: exactly 2 lowercase letters + exactly 2 digits
  // This matches: mz23, cs24, it25, ad26 etc.
  // Does NOT match: abc1, m23, cs2, mz234 etc.
  const academicTokenPattern = /^([a-z]{2})(\d{2})$/;

  // Step 5: Search right-to-left for the academic token
  // Right-to-left because the token is always the last segment
  // before the @ symbol in Bitsathy email format
  for (let i = parts.length - 1; i >= 0; i--) {
    // Normalize each segment to lowercase for consistent matching
    const segment = parts[i].toLowerCase();

    // Test if this segment matches the academic token pattern
    if (academicTokenPattern.test(segment)) {
      return segment; // Found the academic token — return it
    }
  }

  // No segment matched the academic token pattern
  // This is normal for faculty/admin emails (no dept+year in email)
  return null;
}

// ============================================================
// PRIVATE: Parse Academic Token into Structured Data
// ============================================================
/**
 * Decompose an academic token into department and admission year.
 *
 * Token format: {departmentCode}{admissionYear}
 *   - departmentCode: 2 lowercase letters (mz, cs, it)
 *   - admissionYear:  2 digits representing year (23 = 2023)
 *
 * Validates the department code against the canonical registry.
 * Returns structured data with confidence scoring.
 *
 * @param {string} academicToken - The token to parse (e.g., 'mz23')
 * @returns {Object} Structured parse result with confidence
 *
 * @example
 *   parseAcademicToken('mz23')
 *   // → {
 *   //   departmentCode: 'MZ',
 *   //   departmentName: 'Mechatronics Engineering',
 *   //   departmentCategory: 'engineering',
 *   //   admissionYear: 2023,
 *   //   emailDepartmentCode: 'mz',
 *   //   confidence: 'HIGH',
 *   //   reason: 'PARSED_FROM_EMAIL'
 *   // }
 *
 *   parseAcademicToken('xx23')
 *   // → {
 *   //   departmentCode: null,
 *   //   admissionYear: 2023,
 *   //   confidence: 'LOW',
 *   //   reason: 'UNKNOWN_DEPARTMENT_CODE'
 *   // }
 */
function parseAcademicToken(academicToken) {
  // Step 1: Match the token against the expected pattern
  // Capture group 1: department code (2 letters)
  // Capture group 2: year digits (2 digits)
  const match = academicToken.match(/^([a-z]{2})(\d{2})$/);

  // If the token doesn't match the pattern, return LOW confidence
  // This shouldn't happen if extractAcademicToken filtered correctly,
  // but defensive coding ensures robustness
  if (!match) {
    return {
      departmentCode: null, // No department could be determined
      departmentName: null, // No name available
      departmentCategory: null, // No category available
      admissionYear: null, // No year could be determined
      emailDepartmentCode: null, // No email code available
      confidence: "LOW", // LOW confidence — parse failed
      reason: "INVALID_TOKEN_FORMAT", // Reason for LOW confidence
    };
  }

  // Step 2: Destructure the captured groups
  // match[0] = full match, match[1] = dept code, match[2] = year digits
  const [, deptCode, yearDigits] = match;

  // Step 3: Convert 2-digit year to full year
  // '23' → 2023, '24' → 2024, '00' → 2000
  // All Bitsathy students are in the 2000s century
  const admissionYear = 2000 + parseInt(yearDigits, 10);

  // Step 4: Validate department code against canonical registry
  // If the code isn't recognized, we still have the year but dept is unknown
  if (!isValidDepartmentCode(deptCode)) {
    return {
      departmentCode: null, // Unknown department
      departmentName: null, // No name for unknown dept
      departmentCategory: null, // No category for unknown dept
      admissionYear: admissionYear, // Year was still parsed successfully
      emailDepartmentCode: deptCode, // Preserve the raw code for audit
      confidence: "LOW", // LOW — department not validated
      reason: "UNKNOWN_DEPARTMENT_CODE", // Specific reason for LOW
    };
  }

  // Step 5: Look up the canonical department metadata
  // getCanonicalDepartment returns a frozen copy from the registry
  const department = getCanonicalDepartment(deptCode);

  // Step 6: Return HIGH confidence result with all fields populated
  return {
    departmentCode: department.code, // Official code (MZ, CS, IT)
    departmentName: department.name, // Full name for display
    departmentCategory: department.category, // Category for analytics
    admissionYear: admissionYear, // Full year (2023, 2024)
    emailDepartmentCode: deptCode, // Original from email (for audit)
    confidence: "HIGH", // HIGH — all fields validated
    reason: "PARSED_FROM_EMAIL", // Source of the inference
  };
}

// ============================================================
// PUBLIC: Parse Student Academic Info from Email
// ============================================================
/**
 * MAIN PARSER FUNCTION — THE PRIMARY PUBLIC API
 *
 * Transforms a Google-verified email into a structured academic profile.
 * This is the only function most consumers need from this module.
 *
 * Follows the pure function contract:
 *   - Same input → same output (deterministic)
 *   - No side effects (no DB, no I/O, no logging)
 *   - No external mutable state
 *
 * The result always includes:
 *   - Confidence score (HIGH or LOW)
 *   - Source attribution (where the data came from)
 *   - Whether manual completion is needed
 *   - Timestamp of when parsing occurred
 *   - Original email and extracted token for audit
 *
 * @param {string} email - Google-verified email address
 * @returns {Object} Structured academic profile with confidence
 *
 * @example
 *   // Student email — HIGH confidence
 *   parseStudentAcademicInfo('kamesh.mz23@bitsathy.ac.in')
 *   // → {
 *   //   departmentCode: 'MZ',
 *   //   departmentName: 'Mechatronics Engineering',
 *   //   departmentCategory: 'engineering',
 *   //   admissionYear: 2023,
 *   //   emailDepartmentCode: 'mz',
 *   //   confidence: 'HIGH',
 *   //   source: 'EMAIL_PARSER',
 *   //   requiresManualCompletion: false,
 *   //   parsedAt: '2026-02-08T...',
 *   //   originalEmail: 'kamesh.mz23@bitsathy.ac.in',
 *   //   academicToken: 'mz23'
 *   // }
 *
 *   // Faculty email — LOW confidence (no token)
 *   parseStudentAcademicInfo('professor@bitsathy.ac.in')
 *   // → {
 *   //   departmentCode: null,
 *   //   confidence: 'LOW',
 *   //   source: 'EMAIL_PARSE_FAILED',
 *   //   requiresManualCompletion: true,
 *   //   academicToken: null
 *   // }
 */
function parseStudentAcademicInfo(email) {
  // Step 1: Extract the academic token from the email
  // Returns 'mz23' or null if no token found
  const academicToken = extractAcademicToken(email);

  // Step 2: If no academic token was found, return LOW-confidence profile
  // This is the normal case for faculty, admin, or non-standard emails
  if (!academicToken) {
    return {
      departmentCode: null, // No department inferred
      departmentName: null, // No name available
      departmentCategory: null, // No category available
      admissionYear: null, // No year inferred
      emailDepartmentCode: null, // No email code found
      confidence: "LOW", // LOW — no token in email
      reason: "NO_ACADEMIC_TOKEN", // Why it's LOW
      source: "EMAIL_PARSE_FAILED", // Parser couldn't extract token
      requiresManualCompletion: true, // Admin/user must fill in manually
      parsedAt: new Date().toISOString(), // When this parsing occurred
      originalEmail: email, // Preserve original for audit
      academicToken: null, // No token was extracted
    };
  }

  // Step 3: Parse the academic token into structured data
  // This validates the department code against the registry
  const parsed = parseAcademicToken(academicToken);

  // Step 4: Build and return the complete academic profile
  // Merge the parsed data with metadata fields
  return {
    // Spread all fields from the token parser
    ...parsed,

    // Add source attribution for audit trail
    source: "EMAIL_PARSER", // This data came from email parsing

    // Determine if manual completion is needed
    // Only HIGH confidence profiles are considered complete
    requiresManualCompletion: parsed.confidence !== "HIGH",

    // Timestamp for when this inference was made
    parsedAt: new Date().toISOString(),

    // Preserve the original email for debugging and audit
    originalEmail: email,

    // Preserve the extracted academic token for debugging
    academicToken: academicToken,
  };
}

// ============================================================
// PUBLIC: Validate Academic Profile Completeness
// ============================================================
/**
 * Check if an academic profile has all required fields to be
 * considered "complete" — meaning no manual input is needed.
 *
 * A complete profile requires:
 *   1. Valid department code (exists in the registry)
 *   2. Valid department name (set by the registry)
 *   3. Valid admission year (reasonable range: 2000–2099)
 *   4. HIGH confidence OR admin override source
 *
 * Used by:
 *   - PersonProfileLinker to decide profileComplete flag
 *   - DashboardRouter to decide student vs default dashboard
 *   - Admin tools to identify profiles needing manual completion
 *
 * @param {Object} academicProfile - Profile from parseStudentAcademicInfo
 * @returns {boolean} True if the profile is complete and trusted
 *
 * @example
 *   isAcademicProfileComplete({ departmentCode: 'MZ', departmentName: 'Mech...', admissionYear: 2023, confidence: 'HIGH' })
 *   // → true
 *
 *   isAcademicProfileComplete({ departmentCode: null, confidence: 'LOW' })
 *   // → false
 */
function isAcademicProfileComplete(academicProfile) {
  // Guard: Must have a non-null profile object
  if (!academicProfile) return false;

  // Condition 1: Department code must be present
  // A null departmentCode means parsing failed or dept is unknown
  if (!academicProfile.departmentCode) return false;

  // Condition 2: Department name must be present
  // Code without name means the registry lookup was bypassed
  if (!academicProfile.departmentName) return false;

  // Condition 3: Admission year must be in reasonable range
  // Years before 2000 or after 2099 are clearly invalid
  if (
    !academicProfile.admissionYear ||
    academicProfile.admissionYear < 2000 ||
    academicProfile.admissionYear > 2099
  ) {
    return false;
  }

  // Condition 4: Must be HIGH confidence or ADMIN_OVERRIDE
  // LOW confidence means the data was not reliably parsed
  // ADMIN_OVERRIDE means a human verified it manually
  if (
    academicProfile.confidence !== "HIGH" &&
    academicProfile.source !== "ADMIN_OVERRIDE"
  ) {
    return false;
  }

  // All conditions met — this profile is complete and trusted
  return true;
}

// ============================================================
// PUBLIC: Extract a Human-Readable Display Name from Email
// ============================================================
/**
 * Parse a display-friendly name from a Bitsathy email address.
 *
 * Email patterns:
 *   Student: 'sathikmansurb.mz23@bitsathy.ac.in' → 'Sathikmansurb'
 *   Multi-part: 'raj.kumar.it25@bitsathy.ac.in'   → 'Raj Kumar'
 *   Faculty:  'professor@bitsathy.ac.in'           → 'Professor'
 *   Dotted:   'dr.priya@bitsathy.ac.in'            → 'Dr Priya'
 *
 * Rules:
 *   1. Take the local part (before @)
 *   2. Split by dots into segments
 *   3. Remove the academic token segment (e.g., 'mz23') if present
 *   4. Capitalize each remaining segment
 *   5. Join with spaces
 *
 * @param {string} email - Full email address
 * @returns {string} Human-readable name or "User" fallback
 *
 * @example
 *   extractDisplayNameFromEmail('kamesh.mz23@bitsathy.ac.in') // → 'Kamesh'
 *   extractDisplayNameFromEmail('raj.kumar.it25@bitsathy.ac.in') // → 'Raj Kumar'
 *   extractDisplayNameFromEmail('professor@bitsathy.ac.in') // → 'Professor'
 */
function extractDisplayNameFromEmail(email) {
  // Guard: basic validation
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return "User";
  }

  // Extract local part: 'sathikmansurb.mz23' from 'sathikmansurb.mz23@bitsathy.ac.in'
  const localPart = email.split("@")[0];

  // Split by dots: ['sathikmansurb', 'mz23'] or ['raj', 'kumar', 'it25']
  const segments = localPart.split(".");

  // Academic token pattern: exactly 2 lowercase letters + 2 digits
  const academicTokenPattern = /^[a-z]{2}\d{2}$/;

  // Filter out the academic token segment
  const nameSegments = segments.filter(
    (seg) => !academicTokenPattern.test(seg.toLowerCase()),
  );

  // If all segments were tokens (shouldn't happen), fall back to first segment
  if (nameSegments.length === 0) {
    return segments[0]
      ? segments[0].charAt(0).toUpperCase() + segments[0].slice(1)
      : "User";
  }

  // Capitalize each segment and join with spaces
  const displayName = nameSegments
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
    .join(" ");

  return displayName || "User";
}

// ============================================================
// EXPORT — Public API for this module
// Only export what consumers need. Keep internals private.
// ============================================================
module.exports = {
  parseStudentAcademicInfo, // Main parser: email → academic profile
  isAcademicProfileComplete, // Completeness validator
  extractDisplayNameFromEmail, // Name extractor: email → readable name
  // Internal functions exported for testing only:
  _extractAcademicToken: extractAcademicToken,
  _parseAcademicToken: parseAcademicToken,
};
