// ============================================================
// TOKEN SERVICE — JWT Generation & Management
// ============================================================
// Handles all JWT token operations: creation, decoding, and
// token ID extraction. Tokens are the session identity issued
// by the backend after successful authentication.
// Token claims: userId, email, role, jti (token ID), iss, aud, exp
// Token fingerprint: SHA-256 hash of client context for binding
// ============================================================

// Import JWT library for token generation and decoding
const jwt = require("jsonwebtoken");

// Import UUID generator for unique token IDs (jti claim)
const { v4: uuidv4 } = require("uuid");

// Import Node.js crypto for token fingerprinting
const crypto = require("crypto");

// Import JWT configuration — secret, expiry, algorithm, issuer, audience
const jwtConfig = require("../config/jwtConfig");

// Import logger for token generation event tracking
const logger = require("../utils/logger");

// ============================================================
// TOKEN FINGERPRINTING — Bind tokens to client context
// Creates a SHA-256 hash of the client's User-Agent and IP address.
// This fingerprint is embedded in the JWT and verified on each
// request to detect token theft (stolen token used from a
// different client = fingerprint mismatch → rejected).
// ============================================================

/**
 * Generate a SHA-256 fingerprint from client context.
 * Used to bind JWT tokens to the client that created them.
 *
 * @param {string} userAgent - Client's User-Agent header
 * @param {string} ipAddress - Client's IP address
 * @returns {string} Hex-encoded SHA-256 fingerprint
 */
const generateFingerprint = (userAgent = "", ipAddress = "") => {
  return crypto
    .createHash("sha256")
    .update(`${userAgent}|${ipAddress}`)
    .digest("hex");
};

// ============================================================
// Generate a new JWT access token for an authenticated user
// This token contains the user's identity claims and is signed
// with the server's secret key using HS256 algorithm
// Includes a client fingerprint claim for token binding
// ============================================================

/**
 * Generate a signed JWT access token.
 * Contains user identity claims, session metadata, and client fingerprint.
 *
 * @param {Object} payload - Token payload data
 * @param {string} payload.userId - Internal UUID (for server-side lookups)
 * @param {string} payload.email - Normalized email address
 * @param {string} payload.role - Current role assignment
 * @param {string} [payload.userAgent] - Client User-Agent for fingerprinting
 * @param {string} [payload.ipAddress] - Client IP for fingerprinting
 * @returns {{ token: string, tokenId: string, expiresAt: Date }}
 */
const generateAccessToken = ({ userId, email, role, userAgent, ipAddress }) => {
  // Generate a unique token ID (jti claim) using UUID v4
  // This ID is stored in the user_sessions table for:
  // 1. Token revocation (logout or security incident)
  // 2. Session audit trail (when was this token used)
  // 3. Replay attack prevention (each token has a unique ID)
  const tokenId = uuidv4();

  // Calculate the expiration timestamp for the session record
  // Parse the JWT_EXPIRES_IN string ('2h') into milliseconds
  // Default to 2 hours if parsing fails
  const expiresInMs = parseExpiry(jwtConfig.JWT_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expiresInMs);

  // ============================================================
  // Sign the JWT token with all required claims
  // Payload claims:
  // - userId: Internal UUID for server-side user lookups
  // - email: Normalized email for display and logging
  // - role: Current role for authorization checks
  // - fgp: Client fingerprint hash for token binding
  // Registered claims (set via options):
  // - jti: Unique token ID for revocation and audit
  // - iss: Issuer identity (our server)
  // - aud: Intended audience (our client)
  // - exp: Expiration time (1 hour from now)
  // ============================================================
  const fingerprint = generateFingerprint(userAgent, ipAddress);

  const token = jwt.sign(
    {
      // Custom claims — our application's identity data
      userId,
      email,
      role,
      // Client fingerprint — verified on each request to detect token theft
      fgp: fingerprint,
    },
    // Sign with the server's secret key — NEVER expose this
    jwtConfig.JWT_SECRET,
    {
      // Registered claims set via options for JWT library to handle
      algorithm: jwtConfig.JWT_ALGORITHM,
      expiresIn: jwtConfig.JWT_EXPIRES_IN,
      issuer: jwtConfig.JWT_ISSUER,
      audience: jwtConfig.JWT_AUDIENCE,
      jwtid: tokenId, // The unique token ID (jti claim)
    },
  );

  // Log token generation — never log the actual token string
  logger.info("JWT access token generated", {
    tokenId,
    userId,
    expiresAt: expiresAt.toISOString(),
  });

  // Return the token, its ID, and expiration for session tracking
  return {
    token,
    tokenId,
    expiresAt,
  };
};

// ============================================================
// Extract the token ID (jti) from a JWT without full verification
// Used for logout — we need the jti to revoke the session
// but don't need to fully verify (it might be expired)
// ============================================================

/**
 * Decode a JWT token without verification to extract the token ID.
 * Used during logout to get the jti claim for session revocation.
 *
 * @param {string} token - JWT token string
 * @returns {string|null} The token's jti claim or null
 */
const getTokenId = (token) => {
  try {
    // jwt.decode() parses the token without signature verification
    // Safe to use here because we're just extracting the jti
    // The actual token validity doesn't matter for revocation
    const decoded = jwt.decode(token);
    return decoded?.jti || null;
  } catch (error) {
    // If the token can't be decoded at all, return null
    logger.warn("Failed to decode token for ID extraction", {
      error: error.message,
    });
    return null;
  }
};

// ============================================================
// Parse JWT expiry string into milliseconds
// Supports: '2h', '7d', '30m', '3600s', '1y'
// Used to calculate absolute expiration timestamps for the DB
// ============================================================

/**
 * Parse a JWT expiry string into milliseconds.
 *
 * @param {string} expiry - Expiry string (e.g., '2h', '7d')
 * @returns {number} Milliseconds until expiry
 */
const parseExpiry = (expiry) => {
  // Match the numeric part and the unit (h=hours, d=days, m=minutes, s=seconds)
  const match = expiry.match(/^(\d+)([hdms]?)$/);

  if (!match) {
    // Default to 2 hours if the format is unrecognized
    return 2 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // Convert to milliseconds based on the unit
  switch (unit) {
    case "h":
      return value * 60 * 60 * 1000; // Hours to ms
    case "d":
      return value * 24 * 60 * 60 * 1000; // Days to ms
    case "m":
      return value * 60 * 1000; // Minutes to ms
    case "s":
      return value * 1000; // Seconds to ms
    default:
      return value * 1000; // Default to seconds
  }
};

// ============================================================
// Export token service functions
// Used by authService.js for token generation in login pipeline
// Used by auth middleware for token verification support
// ============================================================
module.exports = {
  generateAccessToken,
  getTokenId,
  parseExpiry,
  generateFingerprint,
};
