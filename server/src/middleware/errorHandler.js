// ============================================================
// GLOBAL ERROR HANDLER MIDDLEWARE — Centralized Error Processing
// ============================================================
// Catches all unhandled errors from controllers and middleware.
// Ensures consistent error response format across all endpoints.
// CRITICAL: Never leaks stack traces, internal paths, or sensitive
// data to the client in production environments.
// ============================================================

// Import logger for error tracking and alerting
const logger = require("../utils/logger");

// ============================================================
// Error handler middleware — Express 4-argument error handler
// Express automatically routes errors here when next(error) is called
// or when a middleware/controller throws an unhandled exception
// ============================================================

/**
 * Global error handling middleware.
 * Must be registered LAST in the middleware chain.
 * Normalizes errors into consistent JSON responses.
 *
 * @param {Error} err - The error object thrown or passed via next(err)
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next function (required for error handler signature)
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // ============================================================
  // Determine the appropriate HTTP status code
  // Use the error's statusCode if explicitly set, otherwise 500
  // Custom error classes set statusCode for known error types
  // ============================================================
  const statusCode = err.statusCode || err.status || 500;

  // ============================================================
  // Determine the error message to send to the client
  // In production: generic message for 500 errors (prevents info leak)
  // In development: full error message for debugging convenience
  // ============================================================
  const isProduction = process.env.NODE_ENV === "production";
  const message =
    statusCode === 500 && isProduction
      ? "Internal server error — please try again later"
      : err.message || "An unexpected error occurred";

  // ============================================================
  // Log the error with full details for server-side debugging
  // Always log the complete error — logs are server-side only
  // Include request context for correlating errors with users
  // ============================================================
  logger.error("Unhandled error", {
    statusCode,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    // Include user ID if authenticated — helps trace user-specific errors
    userId: req.user?.userId || "unauthenticated",
  });

  // ============================================================
  // Send the error response to the client
  // Consistent format: { success: false, error: string }
  // Stack trace is NEVER sent in production — info leak prevention
  // ============================================================
  res.status(statusCode).json({
    success: false,
    error: message,
    // Include error code if the error has one for client-side handling
    ...(err.code && { code: err.code }),
    // Include stack trace ONLY in development for debugging
    ...(!isProduction && { stack: err.stack }),
  });
};

// ============================================================
// Custom application error class
// Used to throw errors with specific status codes and error codes
// Controllers use this to signal known error conditions
// ============================================================

/**
 * Custom application error with HTTP status code.
 * Throw this in controllers/services for handled error conditions.
 *
 * @example
 * throw new AppError('Email domain not allowed', 403, 'DOMAIN_REJECTED');
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code
   * @param {string} [code] - Machine-readable error code for client handling
   */
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    // Preserve the class name in the error for instanceof checks
    this.name = "AppError";
  }
}

// ============================================================
// Export the error handler middleware and custom error class
// ============================================================
module.exports = {
  errorHandler,
  AppError,
};
