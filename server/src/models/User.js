// ============================================================
// USER MODEL — Core Identity Management
// ============================================================
// Handles all database operations for the 'users' table.
// The users table stores the IMMUTABLE core identity (UUID) and
// the MUTABLE mapping data (email_hash, role, active status).
// UUID (internal_user_id) is the eternal identity anchor — even if
// a user's email changes, their UUID remains the same forever.
// ============================================================

// Import database query function for parameterized SQL execution
// All queries use $1, $2 placeholders to prevent SQL injection
const { query } = require("../config/database");

// Import logger for structured event logging
const logger = require("../utils/logger");

// ============================================================
// Find a user by their bcrypt email hash
// This is the PRIMARY lookup method during login
// Email hash provides privacy while enabling unique identification
// ============================================================

/**
 * Find a user by their bcrypt-hashed email address.
 * Returns the full user record or null if not found.
 *
 * @param {string} emailHash - bcrypt hash of the normalized email
 * @returns {Promise<Object|null>} User record or null
 */
const findByEmailHash = async (emailHash) => {
  // Query users table by email_hash — the unique privacy-preserving identifier
  // bcrypt hashes are compared using bcrypt.compare(), not direct string match
  // We retrieve ALL users and compare hashes because bcrypt uses random salts
  const result = await query(
    `SELECT internal_user_id, email_hash, normalized_email, user_role, 
            is_active, created_at, updated_at 
     FROM users 
     WHERE normalized_email = $1`,
    [emailHash],
  );

  // Return the first matching user or null if no match exists
  // There should only be 0 or 1 results due to UNIQUE constraint on email_hash
  return result.rows[0] || null;
};

// ============================================================
// Find a user by their internal UUID
// Used for session validation and profile lookups
// UUID is NEVER exposed to the client — internal use only
// ============================================================

/**
 * Find a user by their internal UUID.
 * Used for server-side user lookups after JWT verification.
 *
 * @param {string} userId - UUID v4 internal user identifier
 * @returns {Promise<Object|null>} User record or null
 */
const findById = async (userId) => {
  // Direct UUID lookup using the primary key index
  // This is an O(1) operation due to the B-tree index on UUID
  const result = await query(
    `SELECT internal_user_id, email_hash, normalized_email, user_role, 
            is_active, created_at, updated_at 
     FROM users 
     WHERE internal_user_id = $1`,
    [userId],
  );

  // Return the matching user or null — UUID is globally unique
  return result.rows[0] || null;
};

// ============================================================
// Create a new user with a generated UUID identity
// Called during FIRST-TIME login only — when no existing user matches
// The UUID becomes the user's permanent identity across all systems
// ============================================================

/**
 * Create a new user record with auto-generated UUID.
 * PostgreSQL's gen_random_uuid() creates a cryptographically secure UUID v4.
 *
 * @param {Object} userData - User creation data
 * @param {string} userData.emailHash - bcrypt hash of normalized email
 * @param {string} userData.normalizedEmail - Human-readable email (for reference)
 * @param {string} [userData.role='pending'] - Initial role assignment
 * @param {Object} [client] - Optional transaction client for atomic operations
 * @returns {Promise<Object>} Created user record with generated UUID
 */
const create = async (
  { emailHash, normalizedEmail, role = "pending" },
  client = null,
) => {
  // Use the provided transaction client or the default pool
  // Transaction client ensures this INSERT is part of an atomic login pipeline
  const queryFn = client ? client.query.bind(client) : query;

  // INSERT with RETURNING clause gives us the complete record including
  // the auto-generated UUID and server-set timestamps
  // gen_random_uuid() in PostgreSQL generates a cryptographically secure UUID v4
  const result = await queryFn(
    `INSERT INTO users (email_hash, normalized_email, user_role) 
     VALUES ($1, $2, $3) 
     RETURNING internal_user_id, email_hash, normalized_email, user_role, 
               is_active, created_at, updated_at`,
    [emailHash, normalizedEmail, role],
  );

  // Log user creation for audit trail — never log the actual email
  // Use the UUID as the reference identifier in all logs
  logger.info("New user created", {
    userId: result.rows[0].internal_user_id,
    role,
  });

  // Return the complete user record including the generated UUID
  return result.rows[0];
};

// ============================================================
// Update user role — called when role resolution detects a change
// Role changes are tracked in identity snapshots for audit history
// ============================================================

/**
 * Update a user's current role.
 * Also updates the updated_at timestamp for change tracking.
 *
 * @param {string} userId - UUID of the user to update
 * @param {string} newRole - New role to assign
 * @param {Object} [client] - Optional transaction client
 * @returns {Promise<Object>} Updated user record
 */
const updateRole = async (userId, newRole, client = null) => {
  // Use transaction client if provided for atomic login pipeline
  const queryFn = client ? client.query.bind(client) : query;

  // UPDATE with RETURNING gives us the updated record in one round-trip
  // NOW() ensures the updated_at timestamp reflects the exact change time
  const result = await queryFn(
    `UPDATE users 
     SET user_role = $1, updated_at = NOW() 
     WHERE internal_user_id = $2 
     RETURNING internal_user_id, normalized_email, user_role, updated_at`,
    [newRole, userId],
  );

  // Log the role change for security auditing
  logger.info("User role updated", {
    userId,
    newRole,
  });

  // Return the updated user record
  return result.rows[0];
};

// ============================================================
// Deactivate a user — soft delete that preserves identity history
// The user's UUID and snapshots are preserved for compliance
// is_active=false prevents new logins while keeping audit trail
// ============================================================

/**
 * Deactivate a user (soft delete).
 * Preserves all historical data for compliance and audit requirements.
 *
 * @param {string} userId - UUID of the user to deactivate
 * @returns {Promise<Object>} Updated user record
 */
const deactivate = async (userId) => {
  // Soft delete — set is_active to false instead of deleting the row
  // This preserves the user's identity snapshots and session history
  // Essential for compliance requirements (e.g., GDPR right to data portability)
  const result = await query(
    `UPDATE users 
     SET is_active = false, updated_at = NOW() 
     WHERE internal_user_id = $1 
     RETURNING internal_user_id, is_active, updated_at`,
    [userId],
  );

  // Log deactivation for security audit trail
  logger.info("User deactivated", { userId });

  return result.rows[0];
};

// ============================================================
// Reactivate a previously deactivated user — admin endpoint
// Restores the user's ability to log in and access the system
// Does NOT restore revoked sessions — user must re-authenticate
// ============================================================

/**
 * Reactivate a deactivated user (restore access).
 * Sets is_active back to true so the user can log in again.
 *
 * @param {string} userId - UUID of the user to reactivate
 * @returns {Promise<Object>} Updated user record
 */
const reactivate = async (userId) => {
  const result = await query(
    `UPDATE users 
     SET is_active = true, updated_at = NOW() 
     WHERE internal_user_id = $1 
     RETURNING internal_user_id, normalized_email, user_role, 
               is_active, updated_at`,
    [userId],
  );

  logger.info("User reactivated", { userId });

  return result.rows[0];
};

// ============================================================
// List all users with pagination — admin endpoint
// Returns user data WITHOUT sensitive fields (email_hash)
// Supports pagination to handle 10,000+ users efficiently
// ============================================================

/**
 * List users with pagination.
 * Returns non-sensitive user data for admin dashboard.
 *
 * @param {number} [page=1] - Page number (1-based)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<{ users: Object[], total: number }>}
 */
const listUsers = async (page = 1, limit = 20) => {
  // Calculate OFFSET from page number — SQL pagination standard
  // Page 1 = offset 0, Page 2 = offset 20, etc.
  const offset = (page - 1) * limit;

  // Execute count and data queries in parallel for efficiency
  // COUNT gives total for pagination controls in the frontend
  const [usersResult, countResult] = await Promise.all([
    query(
      `SELECT internal_user_id, normalized_email, user_role, 
              is_active, created_at, updated_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query("SELECT COUNT(*) as total FROM users"),
  ]);

  return {
    users: usersResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
};

// ============================================================
// Export all User model functions
// These are used by services (authService, roleService) and
// controllers (authController, userController)
// ============================================================
module.exports = {
  findByEmailHash,
  findById,
  create,
  updateRole,
  deactivate,
  reactivate,
  listUsers,
};
