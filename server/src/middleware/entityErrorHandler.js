// ============================================================
// ENTITY ERROR HANDLER — Maps PEMM Errors to HTTP Responses
// ============================================================
// Express error-handling middleware that catches all custom
// errors thrown by the PEMM module and converts them to
// appropriate HTTP responses.
//
// Error → HTTP Status Code mapping:
//   PersonNotFoundError      → 404 Not Found
//   ProjectNotFoundError     → 404 Not Found
//   TeamSizeError            → 422 Unprocessable Entity
//   BusinessRuleViolationError → 422 Unprocessable Entity
//   StateTransitionError     → 409 Conflict
//   GuardConditionFailedError → 409 Conflict
//   FreezeViolationError     → 423 Locked
//   PeriodFrozenError        → 423 Locked
//   TemporalValidationError  → 422 Unprocessable Entity
//   ImmutableDataError       → 403 Forbidden
//   IntegrityViolationError  → 500 Internal Server Error
//   DuplicateMemberError     → 409 Conflict
//
// If the error is NOT a PEMM custom error, pass it to the
// next error handler (the existing global one).
// ============================================================

// Import all custom error classes for instanceof checks
const {
  EntityModelingError,
  PersonNotFoundError,
  ProjectNotFoundError,
  ProjectCreationError,
  TeamSizeError,
  BusinessRuleViolationError,
  StateTransitionError,
  GuardConditionFailedError,
  FreezeViolationError,
  PeriodFrozenError,
  TemporalValidationError,
  ImmutableDataError,
  IntegrityViolationError,
  DuplicateMemberError,
  InvalidMembershipError,
} = require("../entities/EntityErrors");

// Import logger for error tracking
const logger = require("../utils/logger");

// ============================================================
// Error → HTTP status code mapping
// ============================================================
const ERROR_STATUS_MAP = new Map([
  [PersonNotFoundError, 404], // Resource not found
  [ProjectNotFoundError, 404], // Resource not found
  [ProjectCreationError, 422], // Invalid input
  [TeamSizeError, 422], // Business rule violation
  [BusinessRuleViolationError, 422], // Business rule violation
  [StateTransitionError, 409], // Conflict
  [GuardConditionFailedError, 409], // Precondition failed
  [FreezeViolationError, 423], // Locked
  [PeriodFrozenError, 423], // Locked
  [TemporalValidationError, 422], // Invalid temporal data
  [ImmutableDataError, 403], // Forbidden modification
  [IntegrityViolationError, 500], // Server integrity issue
  [DuplicateMemberError, 409], // Conflict
  [InvalidMembershipError, 422], // Invalid membership
]);

// ============================================================
// entityErrorHandler — Express error middleware
// ============================================================
/**
 * Express error-handling middleware for PEMM errors.
 * Must have 4 parameters (err, req, res, next) to be recognized
 * as an error handler by Express.
 *
 * @param {Error} err - The thrown error
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next (to pass to other handlers)
 */
function entityErrorHandler(err, req, res, next) {
  // Check if this is a PEMM custom error
  if (err instanceof EntityModelingError) {
    // Look up the HTTP status code for this error type
    let statusCode = 500; // Default to 500

    // Walk through the map to find the most specific match
    for (const [ErrorClass, code] of ERROR_STATUS_MAP) {
      if (err instanceof ErrorClass) {
        statusCode = code;
        break; // Use the first (most specific) match
      }
    }

    // Log the error with appropriate level
    if (statusCode >= 500) {
      // 500-level errors are serious — log as error
      logger.error("PEMM entity error (server)", {
        errorType: err.constructor.name,
        message: err.message,
        statusCode,
        path: req.path,
        method: req.method,
      });
    } else {
      // 400-level errors are client issues — log as warn
      logger.warn("PEMM entity error (client)", {
        errorType: err.constructor.name,
        message: err.message,
        statusCode,
        path: req.path,
      });
    }

    // Send the JSON error response
    return res.status(statusCode).json({
      success: false,
      error: {
        type: err.constructor.name,
        message: err.message,
        details: err.details || undefined,
      },
    });
  }

  // Not a PEMM error — pass to the next error handler
  // This preserves the existing error handling chain
  next(err);
}

// ============================================================
// Export the error handler middleware
// ============================================================
module.exports = entityErrorHandler;
