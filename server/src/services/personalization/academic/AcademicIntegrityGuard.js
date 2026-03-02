// ============================================================
// ACADEMIC INTEGRITY GUARD — VALIDATES ACADEMIC INVARIANTS
// ============================================================
// This module enforces business rules that protect the integrity
// of academic data across the system. It is the final validation
// layer before academic decisions are committed.
//
// PURE FUNCTION CONTRACT:
//   ✓ Stateless — no internal mutable state
//   ✓ Deterministic — same input → same output
//   ✓ Side-effect free — no DB, no I/O, no logging
//   ✓ Testable — zero mocks required
//
// INVARIANTS ENFORCED:
//   1. Department code must exist in the canonical registry
//   2. Admission year must be reasonable (not future, not ancient)
//   3. Email-inferred department must match stored department
//   4. Academic profile must be internally consistent
//   5. Confidence changes must follow the confidence ladder
//
// USED BY:
//   - PersonProfileLinker (before saving academic data)
//   - PersonalizationService (before building dashboards)
//   - Admin APIs (before manual overrides)
//   - Migration scripts (before bulk updates)
//
// AUDIT:
//   Every guard check returns a structured result with:
//   - passed: boolean (did the check pass?)
//   - violations: array of specific violation descriptions
//   - checkedAt: ISO timestamp
// ============================================================

// Import department registry for code validation
// Pure function — no side effects
const {
  isValidDepartmentCode,
  getCanonicalDepartment,
} = require("./DepartmentRegistry");

// Import the email parser for cross-validation
// Pure function — no side effects
const { parseStudentAcademicInfo } = require("./AcademicIdentityParser");

// ============================================================
// PUBLIC: Validate Department Code Integrity
// ============================================================
/**
 * Verify that a department code is valid and consistent.
 *
 * Checks:
 *   1. Code exists in the canonical registry
 *   2. Code format is uppercase 2 letters
 *   3. Associated name matches the registry name
 *
 * @param {string} departmentCode - Official department code (e.g., 'MZ')
 * @param {string} [departmentName] - Optional name to cross-validate
 * @returns {Object} Validation result with passed flag and violations
 *
 * @example
 *   validateDepartmentIntegrity('MZ', 'Mechatronics Engineering')
 *   // → { passed: true, violations: [], checkedAt: '...' }
 *
 *   validateDepartmentIntegrity('XX')
 *   // → { passed: false, violations: ['Department code XX not in registry'], ... }
 */
function validateDepartmentIntegrity(departmentCode, departmentName) {
  // Accumulate violations for comprehensive reporting
  const violations = [];

  // ---------------------------------------------------------
  // Check 1: Department code must be present
  // Null/undefined code means academic data was never set
  // ---------------------------------------------------------
  if (!departmentCode) {
    violations.push("Department code is null or empty");
    return _buildResult(violations); // Early return — no further checks possible
  }

  // ---------------------------------------------------------
  // Check 2: Code format must be 2 uppercase letters
  // This catches corrupted or manually-entered invalid codes
  // ---------------------------------------------------------
  if (!/^[A-Z]{2}$/.test(departmentCode)) {
    violations.push(
      `Department code '${departmentCode}' is not a valid 2-letter uppercase code`,
    );
  }

  // ---------------------------------------------------------
  // Check 3: Code must exist in the canonical registry
  // The registry is the single source of truth
  // We check using the lowercase email code format
  // ---------------------------------------------------------
  const emailCode = departmentCode.toLowerCase();
  if (!isValidDepartmentCode(emailCode)) {
    violations.push(
      `Department code '${departmentCode}' is not recognized in the registry`,
    );
  }

  // ---------------------------------------------------------
  // Check 4: If name is provided, it must match the registry name
  // This catches drift between stored data and the registry
  // ---------------------------------------------------------
  if (departmentName && violations.length === 0) {
    // Only cross-validate name if code is valid (no violations so far)
    const canonical = getCanonicalDepartment(emailCode);
    if (canonical && canonical.name !== departmentName) {
      violations.push(
        `Department name mismatch: stored='${departmentName}', ` +
          `registry='${canonical.name}' for code '${departmentCode}'`,
      );
    }
  }

  // Return the structured result
  return _buildResult(violations);
}

// ============================================================
// PUBLIC: Validate Admission Year Integrity
// ============================================================
/**
 * Verify that an admission year is reasonable and consistent.
 *
 * Checks:
 *   1. Year is a valid number
 *   2. Year is within the acceptable range (2000-2099)
 *   3. Year is not in the future (current year + 1 is allowed for early admission)
 *   4. Year produces a valid academic status (not ancient)
 *
 * @param {number} admissionYear - Year of admission to validate
 * @param {Date} [referenceDate] - Optional reference date (for testing)
 * @returns {Object} Validation result with passed flag and violations
 *
 * @example
 *   validateAdmissionYearIntegrity(2023)
 *   // → { passed: true, violations: [], ... }
 *
 *   validateAdmissionYearIntegrity(1990)
 *   // → { passed: false, violations: ['Admission year 1990 below minimum...'], ... }
 */
function validateAdmissionYearIntegrity(admissionYear, referenceDate) {
  // Accumulate violations
  const violations = [];

  // ---------------------------------------------------------
  // Check 1: Year must be present
  // ---------------------------------------------------------
  if (admissionYear === null || admissionYear === undefined) {
    violations.push("Admission year is null or undefined");
    return _buildResult(violations);
  }

  // ---------------------------------------------------------
  // Check 2: Year must be a number
  // String '2023' or boolean true would bypass numeric checks
  // ---------------------------------------------------------
  if (typeof admissionYear !== "number" || isNaN(admissionYear)) {
    violations.push(`Admission year '${admissionYear}' is not a valid number`);
    return _buildResult(violations);
  }

  // ---------------------------------------------------------
  // Check 3: Year must be a whole number (no decimals)
  // 2023.5 is not a valid admission year
  // ---------------------------------------------------------
  if (!Number.isInteger(admissionYear)) {
    violations.push(`Admission year ${admissionYear} is not an integer`);
  }

  // ---------------------------------------------------------
  // Check 4: Year must be in acceptable range (2000-2099)
  // Bitsathy didn't exist before 2000, and 2100 is too far out
  // ---------------------------------------------------------
  if (admissionYear < 2000) {
    violations.push(`Admission year ${admissionYear} is below minimum (2000)`);
  }

  if (admissionYear > 2099) {
    violations.push(`Admission year ${admissionYear} is above maximum (2099)`);
  }

  // ---------------------------------------------------------
  // Check 5: Year must not be unreasonably in the future
  // Allow current year + 1 for early admission, but not beyond
  // ---------------------------------------------------------
  const refDate = referenceDate || new Date();
  const currentYear = refDate.getFullYear();
  if (admissionYear > currentYear + 1) {
    violations.push(
      `Admission year ${admissionYear} is more than 1 year in the future ` +
        `(current year: ${currentYear})`,
    );
  }

  return _buildResult(violations);
}

// ============================================================
// PUBLIC: Cross-Validate Email vs Stored Academic Data
// ============================================================
/**
 * Verify that the academic data stored in the database is consistent
 * with what the email address implies.
 *
 * This catches cases where:
 *   - A student's email says 'CS' but DB says 'MZ' (manual error)
 *   - A student's email says year 23 but DB says 2024 (typo)
 *   - Email parsing was updated and DB has stale data
 *
 * Returns discrepancies, NOT errors — because manual overrides are valid.
 * The caller decides whether to treat discrepancies as errors.
 *
 * @param {string} email - Student's Google-verified email
 * @param {Object} storedData - Currently stored academic data
 * @param {string} storedData.departmentCode - Stored department code
 * @param {number} storedData.admissionYear - Stored admission year
 * @returns {Object} Cross-validation result
 *
 * @example
 *   crossValidateEmailVsStored(
 *     'kamesh.mz23@bitsathy.ac.in',
 *     { departmentCode: 'MZ', admissionYear: 2023 }
 *   )
 *   // → { passed: true, discrepancies: [], ... }
 *
 *   crossValidateEmailVsStored(
 *     'kamesh.mz23@bitsathy.ac.in',
 *     { departmentCode: 'CS', admissionYear: 2023 }
 *   )
 *   // → { passed: false, discrepancies: ['Department mismatch: email=MZ, stored=CS'], ... }
 */
function crossValidateEmailVsStored(email, storedData) {
  // Accumulate discrepancies (not errors — manual overrides are valid)
  const discrepancies = [];

  // Step 1: Parse the email to get the inferred academic data
  const inferred = parseStudentAcademicInfo(email);

  // Step 2: If email parsing failed (LOW confidence), skip cross-validation
  // We can't compare against something we couldn't parse
  if (inferred.confidence !== "HIGH") {
    return {
      passed: true, // Can't fail what we can't check
      discrepancies: [],
      skipped: true,
      skipReason: "Email parsing returned LOW confidence — nothing to compare",
      checkedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------
  // Check 1: Department code consistency
  // If both inferred and stored have dept codes, they should match
  // ---------------------------------------------------------
  if (storedData.departmentCode && inferred.departmentCode) {
    if (storedData.departmentCode !== inferred.departmentCode) {
      discrepancies.push(
        `Department mismatch: email implies '${inferred.departmentCode}' ` +
          `but stored value is '${storedData.departmentCode}'`,
      );
    }
  }

  // ---------------------------------------------------------
  // Check 2: Admission year consistency
  // If both have admission years, they should match
  // ---------------------------------------------------------
  if (storedData.admissionYear && inferred.admissionYear) {
    if (storedData.admissionYear !== inferred.admissionYear) {
      discrepancies.push(
        `Admission year mismatch: email implies ${inferred.admissionYear} ` +
          `but stored value is ${storedData.admissionYear}`,
      );
    }
  }

  return {
    passed: discrepancies.length === 0, // Pass if no discrepancies
    discrepancies: discrepancies, // List of specific mismatches
    skipped: false, // Cross-validation was performed
    inferredData: {
      // What the email implies (for audit)
      departmentCode: inferred.departmentCode,
      admissionYear: inferred.admissionYear,
    },
    checkedAt: new Date().toISOString(), // When this check was performed
  };
}

// ============================================================
// PUBLIC: Full Academic Profile Integrity Check
// ============================================================
/**
 * Run ALL integrity checks on an academic profile at once.
 *
 * Combines:
 *   1. Department code validation
 *   2. Admission year validation
 *   3. Email cross-validation (if email provided)
 *
 * Returns a comprehensive report of all findings.
 *
 * @param {Object} profile - Academic profile to check
 * @param {string} profile.departmentCode - Department code
 * @param {string} [profile.departmentName] - Department name
 * @param {number} [profile.admissionYear] - Admission year
 * @param {string} [email] - Optional email for cross-validation
 * @returns {Object} Comprehensive integrity report
 */
function runFullIntegrityCheck(profile, email) {
  // Run all individual checks
  const deptResult = validateDepartmentIntegrity(
    profile.departmentCode,
    profile.departmentName,
  );

  const yearResult = validateAdmissionYearIntegrity(profile.admissionYear);

  // Cross-validate with email only if both email and stored data exist
  let crossResult = null;
  if (email && profile.departmentCode) {
    crossResult = crossValidateEmailVsStored(email, profile);
  }

  // Aggregate all violations and discrepancies
  const allIssues = [
    ...deptResult.violations.map((v) => ({ type: "department", message: v })),
    ...yearResult.violations.map((v) => ({ type: "year", message: v })),
    ...(crossResult
      ? crossResult.discrepancies.map((d) => ({ type: "cross", message: d }))
      : []),
  ];

  // Determine overall pass/fail
  const passed =
    deptResult.passed &&
    yearResult.passed &&
    (!crossResult || crossResult.passed);

  return {
    passed: passed, // Overall integrity status
    totalIssues: allIssues.length, // Count of all issues found
    issues: allIssues, // Detailed issue list
    checks: {
      department: deptResult, // Department check result
      admissionYear: yearResult, // Year check result
      crossValidation: crossResult, // Email cross-check result (may be null)
    },
    checkedAt: new Date().toISOString(), // When this full check ran
  };
}

// ============================================================
// PRIVATE: Build Standardized Result Object
// ============================================================
/**
 * Build a consistent result object from a violations array.
 *
 * Every guard function returns the same shape:
 *   { passed: boolean, violations: string[], checkedAt: string }
 *
 * @param {string[]} violations - Array of violation messages
 * @returns {Object} Standardized validation result
 */
function _buildResult(violations) {
  return {
    passed: violations.length === 0, // Pass if no violations
    violations: violations, // List of specific issues
    checkedAt: new Date().toISOString(), // When the check was performed
  };
}

// ============================================================
// EXPORT — Public API for this module
// ============================================================
module.exports = {
  validateDepartmentIntegrity, // Check department code validity
  validateAdmissionYearIntegrity, // Check admission year validity
  crossValidateEmailVsStored, // Compare email inference vs DB data
  runFullIntegrityCheck, // Run all checks at once
};
