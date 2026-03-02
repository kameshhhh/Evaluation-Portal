// ============================================================
// ERROR MAPPER — Maps Identity Errors to HTTP Responses
// ============================================================
// Translates domain-specific identity errors into structured
// HTTP response objects. Works alongside the existing global
// errorHandler middleware — does NOT replace it.
//
// Use this when you need to inspect an identity error and
// decide whether to retry, degrade gracefully, or alert.
// ============================================================

// Import identity error classes for instanceof checking
const {
  IdentityResolutionError,
  UnauthorizedDomainError,
  InvalidEmailError,
  DatabaseUnavailableError,
  RateLimitExceededError,
  IdentityConflictError,
  InputValidationError,
} = require("./IdentityErrors");

// ============================================================
// Map an error to a structured response payload
// The global errorHandler still handles sending the response —
// this utility helps services make decisions based on error type.
// ============================================================

/**
 * Map an identity error to a structured response descriptor.
 * Does NOT send the response — returns a descriptor object.
 *
 * @param {Error} error - The error to map
 * @returns {{ statusCode: number, code: string, message: string,
 *             retryable: boolean, retryAfter?: number, logLevel: string }}
 */
const mapErrorToResponse = (error) => {
  // If it's an identity-specific error, use its built-in properties
  if (error instanceof IdentityResolutionError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      retryable: error.retryable || false,
      retryAfter: error.retryAfter || null,
      logLevel: error.logLevel || "error",
      metadata: error.metadata || {},
    };
  }

  // For unknown errors, return a generic 500 descriptor
  // The global errorHandler will further sanitize for production
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred during identity resolution",
    retryable: true,
    retryAfter: 30,
    logLevel: "error",
    metadata: { originalError: error.message },
  };
};

/**
 * Check if an error is a transient failure that should be retried.
 * Useful for circuit breaker patterns and retry logic.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is transient and retryable
 */
const isTransientError = (error) => {
  // Database errors are transient — the DB might recover
  if (error instanceof DatabaseUnavailableError) return true;

  // Rate limit errors are transient — wait and retry
  if (error instanceof RateLimitExceededError) return true;

  // Check the retryable flag on any IdentityResolutionError
  if (error instanceof IdentityResolutionError) {
    return error.retryable === true;
  }

  // Unknown errors are assumed non-transient
  return false;
};

/**
 * Check if an error represents a security concern that should be alerted.
 * Feeds into monitoring and alerting pipelines.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is a security concern
 */
const isSecurityConcern = (error) => {
  // Unauthorized domain attempts — someone from outside the org
  if (error instanceof UnauthorizedDomainError) return true;

  // Identity conflicts — possible duplicate account attack
  if (error instanceof IdentityConflictError) return true;

  return false;
};

// ============================================================
// Export error mapping utilities
// ============================================================
module.exports = {
  mapErrorToResponse,
  isTransientError,
  isSecurityConcern,
};
