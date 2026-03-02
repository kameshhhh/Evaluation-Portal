// ============================================================
// IDENTITY ERROR HIERARCHY — Domain-Specific Error Classes
// ============================================================
// Production-grade error types for the identity resolution system.
// Each error class carries:
//   - HTTP status code for automatic response mapping
//   - Machine-readable error code for frontend error handling
//   - Log level recommendation for observability filtering
//   - Metadata object for structured logging context
//
// Extends the existing AppError class to stay compatible with
// the global errorHandler middleware already in the system.
// ============================================================

// Import the existing AppError class — our system's base error type
// All identity errors extend AppError so the global error handler
// can process them identically to existing errors — ZERO breaking changes
const { AppError } = require("../../../middleware/errorHandler");

// ============================================================
// BASE CLASS: IdentityResolutionError
// All identity-specific errors extend this for instanceof checks.
// Adds metadata, timestamp, and log level to the existing AppError.
// Compatible with the global errorHandler middleware.
// ============================================================
class IdentityResolutionError extends AppError {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} statusCode - HTTP status code (4xx or 5xx)
   * @param {string} code - Machine-readable error code
   * @param {Object} metadata - Structured context for logging
   */
  constructor(message, statusCode, code, metadata = {}) {
    // Call AppError constructor — keeps errorHandler compatibility
    super(message, statusCode, code);

    // Override the error name for clear stack traces
    this.name = "IdentityResolutionError";

    // Attach structured metadata for observability pipelines
    // Metadata flows into Winston logs as extra JSON fields
    this.metadata = metadata;

    // ISO timestamp of when the error was created — audit trail
    this.timestamp = new Date().toISOString();

    // Recommended log level — controls how this error is logged
    // error = PagerDuty alert, warn = Slack notification, info = dashboard
    this.logLevel = "error";
  }
}

// ============================================================
// UnauthorizedDomainError — email domain not in allowed list
// Triggered when a user from an unauthorized organization tries to log in.
// HTTP 403 Forbidden — the identity is valid but not authorized.
// Log level: warn — may indicate a legitimate user from a partner org.
// ============================================================
class UnauthorizedDomainError extends IdentityResolutionError {
  /**
   * @param {string} domain - The unauthorized domain that was attempted
   * @param {Object} metadata - Additional context (IP, user-agent, etc.)
   */
  constructor(domain, metadata = {}) {
    super(
      `Domain '${domain}' is not authorized for this system`,
      403, // Forbidden — valid identity, unauthorized organization
      "UNAUTHORIZED_DOMAIN",
      { ...metadata, attemptedDomain: domain },
    );
    this.name = "UnauthorizedDomainError";
    this.logLevel = "warn"; // Not critical but worth monitoring
  }
}

// ============================================================
// InvalidEmailError — email fails structural or canonical validation
// Triggered by malformed emails, missing @ signs, or normalization failures.
// HTTP 400 Bad Request — the input is syntactically wrong.
// Log level: info — usually a benign input error.
// ============================================================
class InvalidEmailError extends IdentityResolutionError {
  /**
   * @param {string} email - The invalid email that was submitted
   * @param {string} reason - Why the email was rejected
   */
  constructor(email, reason = "Invalid email format") {
    super(
      `${reason}: ${email}`,
      400, // Bad Request — malformed input
      "INVALID_EMAIL_FORMAT",
      { email, reason },
    );
    this.name = "InvalidEmailError";
    this.logLevel = "info"; // Benign — user typo or client bug
  }
}

// ============================================================
// DatabaseUnavailableError — PostgreSQL connection or query failure
// Triggered when the database is unreachable, overloaded, or erroring.
// HTTP 503 Service Unavailable — temporary infrastructure failure.
// Log level: error — requires immediate SRE attention.
// Retryable: true — client should retry after retryAfter seconds.
// ============================================================
class DatabaseUnavailableError extends IdentityResolutionError {
  /**
   * @param {string} message - Description of the database failure
   * @param {Object} metadata - DB error details for debugging
   */
  constructor(
    message = "Identity lookup failed due to database unavailability",
    metadata = {},
  ) {
    super(
      message,
      503, // Service Unavailable — infrastructure issue
      "DATABASE_UNAVAILABLE",
      metadata,
    );
    this.name = "DatabaseUnavailableError";
    this.logLevel = "error"; // Critical — page the on-call engineer
    this.retryable = true; // Client should retry
    this.retryAfter = 30; // Suggest retry after 30 seconds
  }
}

// ============================================================
// RateLimitExceededError — too many identity resolution attempts
// Triggered when an IP or user exceeds the resolution rate limit.
// HTTP 429 Too Many Requests — abuse prevention.
// Log level: warn — may indicate an attack or a buggy client.
// ============================================================
class RateLimitExceededError extends IdentityResolutionError {
  /**
   * @param {string} identifier - The rate-limited identifier (IP, email)
   */
  constructor(identifier) {
    super(
      `Rate limit exceeded for: ${identifier}`,
      429, // Too Many Requests
      "RATE_LIMIT_EXCEEDED",
      { identifier },
    );
    this.name = "RateLimitExceededError";
    this.logLevel = "warn"; // Suspicious but not necessarily critical
    this.retryAfter = 60; // Suggest retry after 60 seconds
  }
}

// ============================================================
// IdentityConflictError — duplicate identity detected
// Triggered when a race condition creates two users for the same email.
// HTTP 409 Conflict — data integrity violation.
// Log level: error — requires manual investigation.
// ============================================================
class IdentityConflictError extends IdentityResolutionError {
  /**
   * @param {string} email - The conflicting email address
   */
  constructor(email) {
    super(
      `Identity conflict detected — duplicate identity for email`,
      409, // Conflict — data integrity issue
      "IDENTITY_CONFLICT",
      { email },
    );
    this.name = "IdentityConflictError";
    this.logLevel = "error"; // Requires manual investigation
  }
}

// ============================================================
// InputValidationError — Google payload missing required fields
// Triggered when the Google token payload lacks email, sub, etc.
// HTTP 401 Unauthorized — the identity proof is incomplete.
// ============================================================
class InputValidationError extends IdentityResolutionError {
  /**
   * @param {string} field - The missing or invalid field name
   * @param {string} reason - Why the validation failed
   */
  constructor(field, reason = "Missing required field") {
    super(
      `${reason}: ${field}`,
      401, // Unauthorized — identity proof is incomplete
      "INPUT_VALIDATION_FAILED",
      { field, reason },
    );
    this.name = "InputValidationError";
    this.logLevel = "info"; // Usually a client-side issue
  }
}

// ============================================================
// Export all error classes for use across the identity module
// ============================================================
module.exports = {
  IdentityResolutionError,
  UnauthorizedDomainError,
  InvalidEmailError,
  DatabaseUnavailableError,
  RateLimitExceededError,
  IdentityConflictError,
  InputValidationError,
};
