// ============================================================
// VALIDATION UTILITIES — Input Sanitization & Verification
// ============================================================
// Provides reusable validation functions for the zero-trust system.
// All input from the frontend (untrusted terminal) is validated
// server-side before any processing occurs.
// Uses Zod for schema-based validation with clear error messages.
// ============================================================

// Import Zod for runtime type checking and validation
// Zod provides TypeScript-first schema validation with inference
const { z } = require("zod");

// ============================================================
// Google ID Token validation schema
// Ensures the token string meets basic format requirements
// before sending it to Google's verification endpoint
// ============================================================
const googleTokenSchema = z.object({
  // The Google ID token is a JWT string — must be present and non-empty
  // Google JWTs are typically 800-2000 characters long
  // Min length prevents empty string attacks, max prevents DoS via huge payloads
  credential: z
    .string()
    .min(100, "Invalid Google token — too short")
    .max(5000, "Invalid Google token — too long"),
});

// ============================================================
// Email validation schema
// Used internally to validate email format after Google token decode
// Google provides emails, but we validate to protect against edge cases
// ============================================================
const emailSchema = z
  .string()
  .email("Invalid email format")
  .max(255, "Email exceeds maximum length")
  .transform((email) => email.toLowerCase().trim());

// ============================================================
// UUID validation schema
// Ensures path parameters and query params containing IDs are valid UUIDs
// Prevents SQL injection and invalid lookups through malformed IDs
// ============================================================
const uuidSchema = z.string().uuid("Invalid UUID format");

// ============================================================
// Pagination validation schema
// Validates page and limit parameters for list endpoints
// Prevents abuse through extremely large page sizes
// ============================================================
const paginationSchema = z.object({
  // Page number — must be a positive integer, defaults to 1
  page: z.coerce.number().int().positive().default(1),

  // Items per page — capped at 100 to prevent memory exhaustion
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================================
// Validate function — generic validator that wraps Zod parsing
// Returns a clean result object with either validated data or errors
// Used throughout middleware to validate request bodies/params
// ============================================================

/**
 * Validate data against a Zod schema.
 * Returns { success: true, data } or { success: false, errors }.
 *
 * @param {z.ZodSchema} schema - The Zod schema to validate against
 * @param {any} data - The data to validate
 * @returns {{ success: boolean, data?: any, errors?: string[] }}
 */
const validate = (schema, data) => {
  try {
    // safeParse returns { success, data, error } without throwing
    // This prevents unhandled exceptions from crashing the validation chain
    const result = schema.safeParse(data);

    if (result.success) {
      // Return validated and transformed data (e.g., trimmed, lowercased)
      return { success: true, data: result.data };
    }

    // Extract human-readable error messages from Zod validation issues
    // Each issue contains a path (field name) and message (what's wrong)
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );

    return { success: false, errors };
  } catch (error) {
    // Catch any unexpected schema evaluation errors
    return { success: false, errors: ["Validation failed unexpectedly"] };
  }
};

// ============================================================
// Export schemas and validation utility for use across middleware
// ============================================================
module.exports = {
  googleTokenSchema,
  emailSchema,
  uuidSchema,
  paginationSchema,
  validate,
};
