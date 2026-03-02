// ============================================================
// IDENTITY SNAPSHOT MODEL — Immutable Login History
// ============================================================
// Every login creates a permanent, unalterable snapshot of the
// user's identity state at that exact moment. This table is
// APPEND-ONLY — rows are NEVER updated or deleted.
// Purpose: Audit trail, compliance, security investigation,
// and historical identity tracking (email changes over time).
// ============================================================

// Import database query function for parameterized SQL execution
const { query } = require("../config/database");

// Import logger for structured event logging
const logger = require("../utils/logger");

// ============================================================
// Create an immutable identity snapshot
// Called during EVERY successful login — captures exact state
// Records: who logged in, what email they used, what role they had
// This is the core of the immutable identity architecture
// ============================================================

/**
 * Create an immutable identity snapshot recording a login event.
 * This record can NEVER be modified after creation — append-only.
 *
 * @param {Object} snapshotData - Login identity data to record
 * @param {string} snapshotData.userId - Internal UUID of the user
 * @param {string} snapshotData.email - Email used at the moment of login
 * @param {string} snapshotData.role - Role assigned at the moment of login
 * @param {string} [snapshotData.googleSub] - Google's unique subject ID
 * @param {Object} [client] - Optional transaction client for atomic operations
 * @returns {Promise<Object>} Created snapshot record with generated snapshot_id
 */
const create = async (
  { userId, email, role, googleSub = null },
  client = null,
) => {
  // Use transaction client if provided — ensures snapshot creation
  // is atomic with user creation and session logging
  const queryFn = client ? client.query.bind(client) : query;

  // INSERT the snapshot — gen_random_uuid() creates a unique snapshot ID
  // login_timestamp defaults to NOW() — server time, not client time
  // This ensures chronological accuracy regardless of client clock skew
  const result = await queryFn(
    `INSERT INTO user_identity_snapshots 
       (internal_user_id, email_at_login, role_at_login, google_id_sub) 
     VALUES ($1, $2, $3, $4) 
     RETURNING snapshot_id, internal_user_id, email_at_login, 
               role_at_login, login_timestamp, google_id_sub`,
    [userId, email, role, googleSub],
  );

  // Log snapshot creation — never log the email, only the snapshot ID
  // This maintains privacy while providing traceable audit events
  logger.info("Identity snapshot created", {
    snapshotId: result.rows[0].snapshot_id,
    userId,
  });

  // Return the complete snapshot record
  return result.rows[0];
};

// ============================================================
// Get login history for a specific user
// Returns snapshots ordered by most recent first
// Used for admin review and security audit dashboards
// ============================================================

/**
 * Retrieve login history snapshots for a user.
 * Ordered by most recent login first. Supports pagination.
 *
 * @param {string} userId - Internal UUID of the user
 * @param {number} [limit=50] - Maximum snapshots to return
 * @returns {Promise<Object[]>} Array of identity snapshots
 */
const getByUserId = async (userId, limit = 50) => {
  // Query snapshots ordered by login_timestamp descending
  // The index on (internal_user_id, login_timestamp DESC) makes this efficient
  // LIMIT prevents returning excessive data for users with many logins
  const result = await query(
    `SELECT snapshot_id, email_at_login, role_at_login, 
            login_timestamp, google_id_sub 
     FROM user_identity_snapshots 
     WHERE internal_user_id = $1 
     ORDER BY login_timestamp DESC 
     LIMIT $2`,
    [userId, limit],
  );

  // Return the array of snapshots — may be empty for new users
  return result.rows;
};

// ============================================================
// Get the most recent snapshot for a user
// Used to check the last known identity state
// Helpful for detecting email changes between logins
// ============================================================

/**
 * Get the most recent identity snapshot for a user.
 *
 * @param {string} userId - Internal UUID of the user
 * @returns {Promise<Object|null>} Most recent snapshot or null
 */
const getLatest = async (userId) => {
  // LIMIT 1 with DESC ordering returns just the most recent snapshot
  // The composite index ensures this is a fast indexed lookup
  const result = await query(
    `SELECT snapshot_id, email_at_login, role_at_login, 
            login_timestamp, google_id_sub 
     FROM user_identity_snapshots 
     WHERE internal_user_id = $1 
     ORDER BY login_timestamp DESC 
     LIMIT 1`,
    [userId],
  );

  // Return the latest snapshot or null if no logins recorded yet
  return result.rows[0] || null;
};

// ============================================================
// Export Identity Snapshot model functions
// Used primarily by authService.js during the login pipeline
// ============================================================
module.exports = {
  create,
  getByUserId,
  getLatest,
};
