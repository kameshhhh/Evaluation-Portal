// ============================================================
// SESSION MODEL — JWT Session Audit Trail
// ============================================================
// Tracks every JWT session issued by the system.
// Each login creates a session record that links the JWT token ID
// to the user, records the client fingerprint (user agent, IP),
// and supports token revocation for security incidents.
// This is NOT a traditional session store — JWTs are stateless.
// This table provides AUDIT capability and REVOCATION support.
// ============================================================

// Import database query function for parameterized SQL execution
const { query } = require("../config/database");

// Import logger for structured event logging
const logger = require("../utils/logger");

// ============================================================
// Create a session audit record
// Called during EVERY successful login after JWT generation
// Records the JWT token ID (jti claim) for revocation lookups
// ============================================================

/**
 * Create a session audit record for a newly issued JWT.
 * Links the JWT's jti (token ID) to the user for tracking and revocation.
 *
 * @param {Object} sessionData - Session creation data
 * @param {string} sessionData.userId - Internal UUID of the user
 * @param {string} sessionData.tokenId - JWT's jti claim (unique token identifier)
 * @param {string} sessionData.expiresAt - ISO timestamp when JWT expires
 * @param {string} [sessionData.userAgent] - Client's User-Agent header
 * @param {string} [sessionData.ipAddress] - Client's IP address
 * @param {Object} [client] - Optional transaction client
 * @returns {Promise<Object>} Created session record
 */
const create = async (
  { userId, tokenId, expiresAt, userAgent, ipAddress },
  client = null,
) => {
  // Use transaction client if provided for atomic login pipeline
  const queryFn = client ? client.query.bind(client) : query;

  // INSERT session record with all tracking metadata
  // The jwt_token_id has a UNIQUE constraint to prevent duplicate sessions
  // ip_address uses PostgreSQL's INET type for efficient network operations
  const result = await queryFn(
    `INSERT INTO user_sessions 
       (internal_user_id, jwt_token_id, expires_at, user_agent, ip_address) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING session_id, internal_user_id, jwt_token_id, 
               issued_at, expires_at, user_agent, ip_address`,
    [userId, tokenId, expiresAt, userAgent || null, ipAddress || null],
  );

  // Log session creation — never log the actual JWT token
  logger.info("Session created", {
    sessionId: result.rows[0].session_id,
    userId,
  });

  return result.rows[0];
};

// ============================================================
// Find a session by JWT token ID (jti claim)
// Used during JWT verification to check if the token has been revoked
// If revoked=true, the JWT is rejected even if cryptographically valid
// ============================================================

/**
 * Find a session by its JWT token ID.
 * Used to verify token validity and check for revocation.
 *
 * @param {string} tokenId - JWT's jti claim
 * @returns {Promise<Object|null>} Session record or null
 */
const findByTokenId = async (tokenId) => {
  // Look up session by jwt_token_id — indexed for fast lookups
  // Returns the full session including revocation status
  const result = await query(
    `SELECT session_id, internal_user_id, jwt_token_id, 
            issued_at, expires_at, revoked, revoked_at 
     FROM user_sessions 
     WHERE jwt_token_id = $1`,
    [tokenId],
  );

  return result.rows[0] || null;
};

// ============================================================
// Revoke a specific session by token ID
// Used when a user logs out or a security incident is detected
// Marks the session as revoked — the JWT becomes invalid server-side
// ============================================================

/**
 * Revoke a session, making its JWT invalid.
 *
 * @param {string} tokenId - JWT's jti claim to revoke
 * @returns {Promise<Object|null>} Revoked session record or null
 */
const revokeByTokenId = async (tokenId) => {
  // Set revoked=true and revoked_at=NOW() for the matching session
  // The auth middleware checks revocation status on every request
  const result = await query(
    `UPDATE user_sessions 
     SET revoked = true, revoked_at = NOW() 
     WHERE jwt_token_id = $1 AND revoked = false 
     RETURNING session_id, jwt_token_id, revoked_at`,
    [tokenId],
  );

  if (result.rows[0]) {
    logger.info("Session revoked", {
      sessionId: result.rows[0].session_id,
      tokenId,
    });
  }

  return result.rows[0] || null;
};

// ============================================================
// Revoke ALL sessions for a user — nuclear option
// Used during password reset, account compromise, or admin action
// Invalidates every active JWT for the user simultaneously
// ============================================================

/**
 * Revoke all active sessions for a user.
 * Used for security incidents or account-wide logout.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<number>} Number of sessions revoked
 */
const revokeAllForUser = async (userId) => {
  // Bulk revoke all non-revoked sessions for this user
  // Uses rowCount to report how many sessions were affected
  const result = await query(
    `UPDATE user_sessions 
     SET revoked = true, revoked_at = NOW() 
     WHERE internal_user_id = $1 AND revoked = false`,
    [userId],
  );

  // Log the bulk revocation with count for audit trail
  logger.info("All sessions revoked for user", {
    userId,
    revokedCount: result.rowCount,
  });

  return result.rowCount;
};

// ============================================================
// Get active (non-revoked, non-expired) sessions for a user
// Used for session management UI and concurrent login monitoring
// ============================================================

/**
 * Get all active sessions for a user.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<Object[]>} Array of active session records
 */
const getActiveSessions = async (userId) => {
  // Query for sessions that are not revoked AND not yet expired
  // NOW() is the server time — prevents client clock manipulation
  const result = await query(
    `SELECT session_id, jwt_token_id, issued_at, expires_at, 
            user_agent, ip_address 
     FROM user_sessions 
     WHERE internal_user_id = $1 
       AND revoked = false 
       AND expires_at > NOW() 
     ORDER BY issued_at DESC`,
    [userId],
  );

  return result.rows;
};

// ============================================================
// Export Session model functions
// Used by authService.js, auth middleware, and userController
// ============================================================
module.exports = {
  create,
  findByTokenId,
  revokeByTokenId,
  revokeAllForUser,
  getActiveSessions,
};
