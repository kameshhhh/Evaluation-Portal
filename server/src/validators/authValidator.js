// ============================================================
// AUTH VALIDATOR — Request Body Schemas for Auth Endpoints
// ============================================================
// Zod schemas that validate ALL input hitting auth endpoints.
// Zero-trust: every field from the frontend is untrusted garbage
// until it passes through these schemas.
// ============================================================

const { z } = require("zod");

// ============================================================
// Google Login Schema — POST /api/auth/google/login
// Validates the Google credential token from One-Tap
// The credential is a JWT string from Google — we validate format
// but content verification happens in googleVerify.js
// ============================================================
const googleLoginSchema = z
  .object({
    // Google ID token — must be a non-empty string
    // Typical Google JWT is 800-1500 chars — reject absurdly long strings
    credential: z
      .string({
        required_error: "Google credential token is required",
        invalid_type_error: "Credential must be a string",
      })
      .min(100, "Credential token is too short to be valid")
      .max(4096, "Credential token exceeds maximum length")
      .regex(
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
        "Credential must be a valid JWT format (header.payload.signature)",
      ),
  })
  .strict(); // Reject any extra fields — no payload stuffing

// ============================================================
// Export all auth validation schemas
// ============================================================
module.exports = {
  googleLoginSchema,
};
