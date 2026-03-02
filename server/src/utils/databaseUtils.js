// ============================================================
// DATABASE UTILITIES — Helper Functions for PostgreSQL Operations
// ============================================================
// Provides transaction wrappers and common database patterns
// used across models and services. Centralizes error handling
// and connection management for consistent behavior.
// ============================================================

// Import the database pool and client accessor
// pool: for standard queries, getClient: for transactions
const { query, getClient } = require("../config/database");

// Import logger for operation tracking and error reporting
const logger = require("./logger");

// ============================================================
// Transaction wrapper — executes a series of operations atomically
// If any operation fails, ALL changes are rolled back
// Critical for the login pipeline where multiple tables are updated
// ============================================================

/**
 * Execute a function within a database transaction.
 * Automatically handles BEGIN, COMMIT, and ROLLBACK.
 * The callback receives a client with an active transaction.
 *
 * @param {Function} callback - Async function receiving the transaction client
 * @returns {Promise<any>} The return value of the callback
 * @throws {Error} Rolls back transaction and re-throws on any failure
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO users ...', [...]);
 *   await client.query('INSERT INTO snapshots ...', [...]);
 *   return { success: true };
 * });
 */
const withTransaction = async (callback) => {
  // Acquire a dedicated client from the pool for this transaction
  // This client holds the transaction state — cannot be shared
  const client = await getClient();

  try {
    // Begin the transaction — all subsequent queries are atomic
    // PostgreSQL creates a savepoint; changes are invisible to other sessions
    await client.query("BEGIN");

    // Execute the caller's operations within the transaction
    // The callback receives the client to run queries against
    const result = await callback(client);

    // All operations succeeded — commit makes changes permanent
    // Changes become visible to other database sessions
    await client.query("COMMIT");

    // Return the callback's result to the caller
    return result;
  } catch (error) {
    // Any error triggers a full rollback — no partial state changes
    // This prevents data inconsistencies in the login pipeline
    await client.query("ROLLBACK");

    // Log the transaction failure for debugging and monitoring
    logger.error("Transaction rolled back", {
      error: error.message,
    });

    // Re-throw the error for the caller's error handler
    throw error;
  } finally {
    // ALWAYS release the client back to the pool
    // Failure to release causes connection leaks that eventually
    // exhaust the pool and block all database operations
    client.release();
  }
};

// ============================================================
// Check if a table exists in the database
// Used during initialization to avoid duplicate table creation
// ============================================================

/**
 * Check if a table exists in the current database schema.
 *
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} True if the table exists
 */
const tableExists = async (tableName) => {
  // Query the information_schema to check for table existence
  // This approach works across PostgreSQL versions and doesn't
  // require special permissions beyond basic read access
  const result = await query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName],
  );

  // The EXISTS query returns a single row with a boolean value
  return result.rows[0].exists;
};

// ============================================================
// Export utility functions for use in models, services, and scripts
// ============================================================
module.exports = {
  withTransaction,
  tableExists,
};
