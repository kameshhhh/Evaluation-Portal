// ============================================================
// EMAIL NORMALIZER — Production-Grade Email Canonicalization
// ============================================================
// Transforms raw emails into their canonical lowercase form.
// Matches the college ERP system's format exactly.
//
// DELEGATES to the existing normalizeEmail() in emailService.js
// for the core normalization logic. This class adds:
//   - Structured error types (InvalidEmailError)
//   - Debug logging with before/after transformation
//   - College-specific canonical form validation
//   - Whitespace sanitization (including non-breaking spaces)
//
// The existing emailService.normalizeEmail() continues to work
// independently — this is an ADDITIVE enterprise wrapper.
//
// Business Requirement: Match college ERP system exactly.
// Canonical form: kamesh.mz23@bitsathy.ac.in (always lowercase)
// ============================================================

// Import the EXISTING normalizeEmail function — we delegate to it
// This preserves the original normalization logic without modification
const { normalizeEmail } = require("../../../services/emailService");

// Import domain-specific error for precise error reporting
const { InvalidEmailError } = require("../errors/IdentityErrors");

// ============================================================
// EmailNormalizer class — canonicalizes email addresses
// Wraps existing normalizeEmail() with enterprise observability.
// ============================================================
class EmailNormalizer {
  /**
   * @param {{ logger: Object }} deps - Injected dependencies
   */
  constructor({ logger }) {
    this.logger = logger.child
      ? logger.child({ module: "EmailNormalizer" })
      : logger;
  }

  // ============================================================
  // Transform email to canonical form using existing service
  // Adds: whitespace sanitization, structure validation, logging
  // ============================================================

  /**
   * Canonicalize an email address to the college's standard form.
   *
   * Input examples:
   *   "Kamesh.MZ23@bitsathy.ac.in"     → "kamesh.mz23@bitsathy.ac.in"
   *   "KAMESH.MZ23@BITSATHY.AC.IN"     → "kamesh.mz23@bitsathy.ac.in"
   *   "  kamesh.mz23@bitsathy.ac.in  " → "kamesh.mz23@bitsathy.ac.in"
   *
   * @param {string} rawEmail - The raw email from Google token
   * @returns {string} Canonical lowercase email
   * @throws {InvalidEmailError} If the email cannot be canonicalized
   */
  canonicalize(rawEmail) {
    try {
      // Step 1: Strip ALL whitespace including non-breaking spaces (\u00A0)
      // Google tokens shouldn't have these, but external integrations might
      const sanitized = rawEmail.replace(/[\s\u00A0]+/g, "").trim();

      // Step 2: Delegate to the existing normalizeEmail() function
      // This performs: lowercase + trim + basic structure validation
      // The existing function throws AppError on failure — we catch and remap
      const canonicalEmail = normalizeEmail(sanitized);

      // Step 3: Validate the canonical form has valid email structure
      // Split and verify both parts exist with content
      const atIndex = canonicalEmail.indexOf("@");
      if (atIndex <= 0 || atIndex === canonicalEmail.length - 1) {
        throw new InvalidEmailError(
          rawEmail,
          "Invalid email structure after normalization",
        );
      }

      // Step 4: Log the transformation for audit trail
      this.logger.debug("Email canonicalized", {
        rawEmail,
        canonicalEmail,
        transformation: rawEmail !== canonicalEmail ? "modified" : "unchanged",
      });

      return canonicalEmail;
    } catch (error) {
      // If it's already an InvalidEmailError, re-throw as-is
      if (error.name === "InvalidEmailError") {
        throw error;
      }

      // Remap existing AppError from normalizeEmail() to InvalidEmailError
      // This provides a consistent error type within the identity module
      throw new InvalidEmailError(
        rawEmail,
        error.message || "Email normalization failed",
      );
    }
  }

  // ============================================================
  // Validate that the canonical email matches college patterns
  // Optional strict validation for college-specific formats
  // ============================================================

  /**
   * Check if a canonical email matches known college patterns.
   * This is for informational/logging purposes — NOT a gate.
   * Domain validation is handled separately by DomainValidator.
   *
   * @param {string} canonicalEmail - Already-canonicalized email
   * @returns {{ isCollegeFormat: boolean, localPart: string, domain: string }}
   */
  analyzeFormat(canonicalEmail) {
    const [localPart, domain] = canonicalEmail.split("@");

    // College student pattern: name.admissionCode@bitsathy.ac.in
    // Example: kamesh.mz23@bitsathy.ac.in
    const studentPattern = /^[a-z][a-z0-9]*\.[a-z]{2}\d{2}$/;

    // Faculty/admin pattern: more flexible local part
    const facultyPattern = /^[a-z][a-z0-9.]*[a-z0-9]$/;

    return {
      isCollegeFormat:
        studentPattern.test(localPart) || facultyPattern.test(localPart),
      localPart,
      domain,
    };
  }
}

// ============================================================
// Export EmailNormalizer class
// ============================================================
module.exports = EmailNormalizer;
