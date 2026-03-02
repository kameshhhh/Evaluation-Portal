// ============================================================
// GOOGLE TOKEN VERIFICATION SERVICE — Cryptographic Identity Proof
// ============================================================
// Verifies Google ID tokens received from the frontend's One-Tap flow.
// This is the FIRST and MOST CRITICAL step in the zero-trust pipeline.
// The token is verified against Google's public keys — not decoded locally.
// If verification fails, the entire login pipeline is aborted.
// ============================================================

// Import the configured Google OAuth2 client and client ID
// The client ID must match the audience claim in the Google ID token
const { googleClient, GOOGLE_CLIENT_ID } = require("../config/googleAuth");

// Import custom error class for structured error handling
const { AppError } = require("../middleware/errorHandler");

// Import logger for security event tracking
const logger = require("../utils/logger");

// ============================================================
// Verify a Google ID token — the foundational trust operation
// This function contacts Google's token verification endpoint
// to validate the token's signature, expiry, and audience claim.
// ============================================================

/**
 * Verify a Google ID token and extract the payload.
 * Uses google-auth-library to verify against Google's public keys.
 * Caches Google's keys for performance — auto-refreshes when expired.
 *
 * @param {string} idToken - The Google ID token string from One-Tap
 * @returns {Promise<Object>} Verified token payload with user claims
 * @throws {AppError} If token verification fails for any reason
 *
 * The payload contains:
 * - sub: Google's unique user ID (stable across devices)
 * - email: User's email address
 * - email_verified: Boolean — whether Google has verified the email
 * - name: User's display name
 * - picture: URL to profile picture
 * - aud: Audience (should match our client ID)
 * - iss: Issuer (accounts.google.com)
 * - exp: Expiration timestamp
 */
const verifyGoogleToken = async (idToken) => {
  try {
    // ============================================================
    // Call Google's verification endpoint via the OAuth2Client
    // verifyIdToken() checks:
    // 1. Token signature against Google's RSA public keys
    // 2. Token has not expired (exp claim)
    // 3. Audience matches our GOOGLE_CLIENT_ID
    // 4. Issuer is accounts.google.com or https://accounts.google.com
    // ============================================================
    const ticket = await googleClient.verifyIdToken({
      // The raw ID token string from the frontend
      idToken: idToken,

      // Required audience — must match our Google OAuth client ID
      // This prevents tokens meant for other applications from being accepted
      audience: GOOGLE_CLIENT_ID,
    });

    // Extract the verified payload from the ticket
    // This payload is TRUSTED because it was cryptographically verified
    const payload = ticket.getPayload();

    // ============================================================
    // Validate that the token contains all required claims
    // Google tokens should always have these, but defense-in-depth
    // requires explicit verification of every assumption
    // ============================================================

    // Verify email is present — it's our primary identity attribute
    if (!payload.email) {
      throw new AppError(
        "Google token missing email claim — cannot establish identity",
        401,
        "MISSING_EMAIL_CLAIM",
      );
    }

    // Verify email is verified by Google — prevents unverified email attacks
    // Google's email_verified claim confirms the user owns this email
    if (!payload.email_verified) {
      throw new AppError(
        "Google email not verified — email ownership unconfirmed",
        401,
        "EMAIL_NOT_VERIFIED",
      );
    }

    // Verify Google's subject ID is present — the stable user identifier
    // sub is Google's permanent user ID — never changes even if email changes
    if (!payload.sub) {
      throw new AppError(
        "Google token missing subject claim — cannot identify user",
        401,
        "MISSING_SUB_CLAIM",
      );
    }

    // Log successful verification — never log the actual token or email
    logger.info("Google token verified successfully", {
      googleSub: payload.sub,
      emailVerified: payload.email_verified,
    });

    // ============================================================
    // Return the verified payload for use in the login pipeline
    // The caller (authService.js) uses this to extract identity data
    // ============================================================
    return payload;
  } catch (error) {
    // ============================================================
    // Handle verification failures with specific error messages
    // AppError instances are re-thrown as-is (already formatted)
    // Google library errors are wrapped in AppError for consistency
    // ============================================================

    // If it's already an AppError, re-throw as-is
    if (error instanceof AppError) {
      throw error;
    }

    // Log the Google verification failure with error details
    logger.error("Google token verification failed", {
      error: error.message,
    });

    // Wrap the Google library error in an AppError
    // Generic message prevents leaking verification internals to the client
    throw new AppError(
      "Google authentication failed — invalid or expired token",
      401,
      "GOOGLE_VERIFY_FAILED",
    );
  }
};

// ============================================================
// Export the verification function for use in authService.js
// ============================================================
module.exports = {
  verifyGoogleToken,
};
