// ============================================================
// REQUEST VALIDATION MIDDLEWARE — Input Sanitization Gate
// ============================================================
// Validates incoming request data (body, params, query) against
// Zod schemas before it reaches the controller.
// Zero-trust principle: ALL frontend input is untrusted garbage
// until validated and sanitized by this middleware.
// ============================================================

// Import logger for validation failure tracking
const logger = require("../utils/logger");

// ============================================================
// Generic validation middleware factory
// Creates middleware that validates a specific request property
// against a provided Zod schema
// ============================================================

/**
 * Create validation middleware for a request property.
 * Returns cleaned, validated data or rejects with 400 error.
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'params'|'query'} property - Request property to validate
 * @returns {Function} Express middleware function
 *
 * @example
 * router.post('/login', validateRequest(googleTokenSchema, 'body'), handler);
 */
const validateRequest = (schema, property = "body") => {
  return (req, res, next) => {
    // Extract the data to validate from the specified request property
    // property can be 'body' (POST data), 'params' (URL params), or 'query' (query string)
    const data = req[property];

    // Use Zod's safeParse for non-throwing validation
    // safeParse returns { success, data, error } without exceptions
    const result = schema.safeParse(data);

    if (!result.success) {
      // Extract readable error messages from Zod validation issues
      // Each issue has a path (field name) and message (description)
      const errors = result.error.issues.map(
        (issue) => `${issue.path.join(".") || property}: ${issue.message}`,
      );

      // Log validation failure for security monitoring
      // Frequent validation failures from an IP may indicate an attack
      logger.warn("Request validation failed", {
        property,
        path: req.path,
        ip: req.ip,
        errors,
      });

      // Return 400 Bad Request with detailed validation errors
      // Clear error messages help legitimate clients fix their requests
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    // Replace the request property with the validated & transformed data
    // Zod transforms (trim, lowercase) are applied during parsing
    // This ensures controllers only receive clean, validated input
    req[property] = result.data;

    // Proceed to the next middleware or controller
    next();
  };
};

// ============================================================
// Export the validation middleware factory
// ============================================================
module.exports = validateRequest;
