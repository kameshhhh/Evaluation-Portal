// ============================================================
// INPUT SANITIZER — Security Layer for Google Token Payloads
// ============================================================
// First line of defense in the identity resolution pipeline.
// Validates the structure and completeness of the Google payload
// BEFORE any business logic touches the data.
//
// This is a WRAPPER around existing validateTokenClaims logic.
// It adds structured error types and metrics without changing
// the original validation behavior in authService.js.
//
// Defense-in-depth: Even though Google tokens are cryptographically
// verified, we validate the payload structure explicitly because
// zero-trust means NEVER assuming data integrity.
// ============================================================

// Import domain-specific error classes for precise error reporting
const { InputValidationError } = require("../errors/IdentityErrors");

// ============================================================
// InputSanitizer class — validates Google token payload structure
// Stateless: All methods are pure — no side effects, no DB calls.
// ============================================================
class InputSanitizer {
  /**
   * @param {{ logger: Object }} deps - Injected dependencies
   */
  constructor({ logger }) {
    // Child logger with module context for log filtering
    this.logger = logger.child
      ? logger.child({ module: "InputSanitizer" })
      : logger;
  }

  // ============================================================
  // Validate the Google payload has all required fields
  // Checks: email (string, non-empty), email_verified (true), sub (string)
  // Throws InputValidationError with specific field context on failure
  // ============================================================

  /**
   * Validate a Google token payload structure.
   * This runs BEFORE any business logic — pure security gate.
   *
   * @param {Object} googlePayload - The verified Google token payload
   * @throws {InputValidationError} If any required field is missing or invalid
   */
  sanitize(googlePayload) {
    // Guard: payload must be a non-null object
    if (!googlePayload || typeof googlePayload !== "object") {
      throw new InputValidationError(
        "googlePayload",
        "Payload must be a non-null object",
      );
    }

    // Validate email field — must be a non-empty string
    if (!googlePayload.email || typeof googlePayload.email !== "string") {
      throw new InputValidationError(
        "email",
        "Google token missing email claim",
      );
    }

    // Validate email_verified — must be explicitly true
    // false or undefined means Google hasn't confirmed email ownership
    if (googlePayload.email_verified !== true) {
      throw new InputValidationError(
        "email_verified",
        "Email not verified by Google",
      );
    }

    // Validate sub — Google's stable unique user identifier
    // Must be present for identity correlation across sessions
    if (!googlePayload.sub || typeof googlePayload.sub !== "string") {
      throw new InputValidationError(
        "sub",
        "Google token missing subject identifier",
      );
    }

    // Validate email doesn't contain dangerous characters
    // Belt-and-suspenders: Google shouldn't send these, but zero-trust
    const dangerousPatterns = /[<>'";\\/\x00-\x1f]/;
    if (dangerousPatterns.test(googlePayload.email)) {
      this.logger.warn("Suspicious characters detected in email", {
        email: googlePayload.email.substring(0, 20) + "***",
      });
      throw new InputValidationError(
        "email",
        "Email contains invalid characters",
      );
    }

    // Validate email length — RFC 5321 limit is 254 characters
    if (googlePayload.email.length > 254) {
      throw new InputValidationError(
        "email",
        "Email exceeds maximum length (254)",
      );
    }

    this.logger.debug("Input sanitization passed", {
      hasEmail: true,
      emailVerified: true,
      hasSub: true,
    });
  }
}

// ============================================================
// Export InputSanitizer class
// ============================================================
module.exports = InputSanitizer;
