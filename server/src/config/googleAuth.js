// ============================================================
// GOOGLE OAUTH CONFIGURATION — Server-Side Token Verification
// ============================================================
// Configures the google-auth-library OAuth2Client for verifying
// Google ID tokens received from the frontend's One-Tap flow.
// This is a CRITICAL zero-trust boundary — the backend NEVER
// trusts the frontend's claims about user identity. Instead,
// it verifies the cryptographic token directly with Google.
// ============================================================

// Load environment variables before accessing GOOGLE_CLIENT_ID
// This ensures the client ID is available for OAuth2Client initialization
require("dotenv").config();

// Import OAuth2Client from google-auth-library
// This class handles ID token verification against Google's public keys
// It caches Google's signing keys for performance (auto-refreshes them)
const { OAuth2Client } = require("google-auth-library");

// Import logger for structured logging of auth events
// All Google verification events are logged for security audit trails
const logger = require("../utils/logger");

// ============================================================
// Read the Google Client ID from environment variables
// This MUST match the client_id used in the frontend's Google One-Tap
// Mismatch causes token verification to fail with 'audience mismatch'
// ============================================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Validate that GOOGLE_CLIENT_ID is configured at startup
// Fail fast if missing — the app cannot function without it
if (!GOOGLE_CLIENT_ID) {
  // Log critical error and halt — no silent failures in zero-trust
  logger.error("FATAL: GOOGLE_CLIENT_ID is not set in environment variables");
  process.exit(1);
}

// ============================================================
// Create the OAuth2Client instance for token verification
// The client ID is passed to the constructor to set the expected audience
// This ensures tokens are only accepted if issued for THIS application
// ============================================================
const oAuth2Client = new OAuth2Client(GOOGLE_CLIENT_ID);

// ============================================================
// Export the client and client ID for use in verification service
// googleClient: Used in googleVerify.js to call verifyIdToken()
// GOOGLE_CLIENT_ID: Passed as audience parameter during verification
// ============================================================
module.exports = {
  googleClient: oAuth2Client,
  GOOGLE_CLIENT_ID,
};
