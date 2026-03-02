// ============================================================
// USER REPOSITORY — Repository Pattern Wrapper for User Model
// ============================================================
// Provides a clean interface for user data access within the
// identity resolution pipeline. Separates data access concerns
// from business logic in the resolvers.
//
// DELEGATES to the existing User model (models/User.js) for
// all database operations. This repository adds:
//   - Consistent error mapping to domain-specific errors
//   - Structured logging for data access audit trail
//   - Connection availability checking
//   - Query timing for performance monitoring
//
// Existing User model functions remain UNCHANGED.
// ============================================================

const User = require("../../../models/User");
const { DatabaseUnavailableError } = require("../errors/IdentityErrors");

// ============================================================
// UserRepository class — clean data access layer for identity
// ============================================================
class UserRepository {
  /**
   * @param {{ logger: Object, db: Object }} deps - Dependencies
   * @param {Object} deps.logger - Winston logger instance
   * @param {Object} deps.db - Database pool (config/database.js)
   */
  constructor({ logger, db }) {
    this.logger = logger.child
      ? logger.child({ module: "UserRepository" })
      : logger;
    this.db = db;
  }

  // ============================================================
  // Find user by hashed email — delegates to User.findByEmailHash
  // Adds: error mapping, timing, structured logging
  // ============================================================

  /**
   * Find a user by their hashed email.
   * Delegates to User.findByEmailHash() — no logic duplication.
   *
   * @param {string} emailHash - bcrypt hash of the normalized email
   * @returns {Promise<Object|null>} User row or null if not found
   * @throws {DatabaseUnavailableError} If the database is unreachable
   */
  async findByEmailHash(emailHash) {
    const startTime = Date.now();

    try {
      const user = await User.findByEmailHash(emailHash);

      this.logger.debug("User lookup by email hash completed", {
        found: !!user,
        durationMs: Date.now() - startTime,
      });

      return user;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Map connection/query errors to DatabaseUnavailableError
      if (this._isConnectionError(error)) {
        this.logger.error("Database unavailable during user lookup", {
          error: error.message,
          durationMs,
        });
        throw new DatabaseUnavailableError(
          "User lookup failed — database unreachable",
        );
      }

      // Re-throw other errors for the resolver to handle
      throw error;
    }
  }

  // ============================================================
  // Find user by ID — delegates to User.findById
  // ============================================================

  /**
   * Find a user by their primary key ID.
   *
   * @param {string} userId - UUID primary key
   * @returns {Promise<Object|null>} User row or null
   * @throws {DatabaseUnavailableError} If the database is unreachable
   */
  async findById(userId) {
    const startTime = Date.now();

    try {
      const user = await User.findById(userId);

      this.logger.debug("User lookup by ID completed", {
        found: !!user,
        durationMs: Date.now() - startTime,
      });

      return user;
    } catch (error) {
      if (this._isConnectionError(error)) {
        throw new DatabaseUnavailableError(
          "User lookup by ID failed — database unreachable",
        );
      }
      throw error;
    }
  }

  // ============================================================
  // Create a new user — delegates to User.create
  // ============================================================

  /**
   * Create a new user record.
   *
   * @param {Object} userData - User creation data
   * @returns {Promise<Object>} Created user row
   * @throws {DatabaseUnavailableError} If the database is unreachable
   */
  async create(userData) {
    const startTime = Date.now();

    try {
      const user = await User.create(userData);

      this.logger.info("New user created via identity resolver", {
        userId: user.id,
        durationMs: Date.now() - startTime,
      });

      return user;
    } catch (error) {
      if (this._isConnectionError(error)) {
        throw new DatabaseUnavailableError(
          "User creation failed — database unreachable",
        );
      }
      throw error;
    }
  }

  // ============================================================
  // Health check — verify database connectivity
  // ============================================================

  /**
   * Check if the database connection is healthy.
   *
   * @returns {Promise<boolean>} True if the database responds
   */
  async isHealthy() {
    try {
      await this.db.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Private: Detect connection-level database errors
  // ============================================================

  /**
   * @param {Error} error - The caught error
   * @returns {boolean} True if this is a connection/network error
   */
  _isConnectionError(error) {
    const connectionCodes = [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EPIPE",
      "EAI_AGAIN",
      "57P01", // admin_shutdown
      "57P02", // crash_shutdown
      "57P03", // cannot_connect_now
      "08000", // connection_exception
      "08001", // sqlclient_unable_to_establish_sqlconnection
      "08003", // connection_does_not_exist
      "08006", // connection_failure
    ];

    return (
      connectionCodes.includes(error.code) ||
      (error.message && /connection|ECONNREFUSED|timeout/i.test(error.message))
    );
  }
}

// ============================================================
// Export UserRepository class
// ============================================================
module.exports = UserRepository;
