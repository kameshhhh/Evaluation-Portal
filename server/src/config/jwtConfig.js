// ============================================================
// JWT CONFIGURATION — Token Generation & Verification Settings
// ============================================================
// Centralizes all JWT-related configuration in one place.
// JWT tokens are the session identity issued by the backend after
// successful Google token verification and domain validation.
// Tokens are signed with HS256 using a 256-bit secret.
// ============================================================

// Load environment variables for JWT secret and expiry settings
require("dotenv").config();

// Import logger to validate configuration at startup
const logger = require("../utils/logger");

// ============================================================
// JWT signing secret — the most sensitive configuration value
// Used for both signing (creating) and verifying JWT tokens
// Must be at least 32 characters for HS256 cryptographic security
// NEVER expose this value in logs, responses, or frontend code
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;

// Validate JWT_SECRET exists and meets minimum length requirement
// Fail fast if missing or weak — prevents issuing insecure tokens
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  logger.error("FATAL: JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

// ============================================================
// Token expiry configurations
// Short-lived access tokens minimize the damage window if compromised
// Refresh tokens allow seamless re-authentication without Google re-prompt
// ============================================================

// Access token expiry — 1 hour by default (hardened from 2h)
// Shorter expiry reduces attack window if token is stolen
// Frontend should detect 401 TOKEN_EXPIRED and redirect to login
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

// Refresh token expiry — 7 days by default
// Longer-lived to reduce login friction for returning users
// Stored server-side in user_sessions table for revocation capability
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

// ============================================================
// JWT algorithm configuration
// HS256 (HMAC-SHA256) is used for symmetric signing
// The same secret is used for both signing and verification
// Suitable for single-server or trusted-backend architectures
// ============================================================
const JWT_ALGORITHM = "HS256";

// ============================================================
// Token issuer and audience claims for additional validation
// These claims are embedded in the JWT payload and verified on each request
// Prevents tokens from one system being accepted by another
// ============================================================
const JWT_ISSUER = "bitsathy-auth-server";
const JWT_AUDIENCE = "bitsathy-auth-client";

// ============================================================
// Export all JWT configuration as a frozen object
// Object.freeze prevents accidental modification of security settings
// All values come from environment variables for deployment flexibility
// ============================================================
module.exports = Object.freeze({
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_AUDIENCE,
});
