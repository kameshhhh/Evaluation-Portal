// ============================================================
// DATABASE CONFIGURATION — PostgreSQL Connection Pool
// ============================================================
// Uses the 'pg' library's Pool for efficient connection management.
// Connection pooling prevents opening/closing DB connections per request,
// which is critical for handling 10,000+ concurrent users without
// exhausting PostgreSQL's max_connections limit.
// ============================================================

// Load environment variables before any other imports
// dotenv reads .env file and populates process.env
// This MUST happen before accessing any env vars
require("dotenv").config();

// Import Pool from pg — manages a pool of reusable database connections
// Pool automatically handles connection lifecycle, retries, and timeouts
const { Pool } = require("pg");

// Import logger for structured database event logging
// Centralized logging ensures all DB events are traceable
const logger = require("../utils/logger");

// ============================================================
// Create the connection pool with environment-driven configuration
// Every parameter comes from .env to support different environments
// (development, staging, production) without code changes
// ============================================================
const pool = new Pool({
  // Full PostgreSQL connection string — includes host, port, user, password, database
  // Format: postgresql://user:password@host:port/database
  // In production, this should use SSL and a managed database service
  connectionString: process.env.DATABASE_URL,

  // Minimum number of idle connections maintained in the pool
  // Keeps connections warm to avoid cold-start latency on queries
  // Default 2 ensures at least 2 connections are always ready
  min: parseInt(process.env.DB_POOL_MIN, 10) || 2,

  // Maximum number of connections the pool can create
  // Caps concurrent DB connections to prevent overwhelming PostgreSQL
  // 20 handles ~10,000 concurrent users with 50ms avg query time
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,

  // Milliseconds a connection can sit idle before being released
  // Frees unused connections to reduce server memory footprint
  // 30 seconds balances reuse frequency and resource conservation
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,

  // Maximum time (ms) to wait for a connection from the pool
  // If all connections are busy and pool is at max, this prevents
  // indefinite blocking — request fails fast with a clear error
  connectionTimeoutMillis: 5000,
});

// ============================================================
// Pool event listeners for monitoring and debugging
// These log connection lifecycle events for operational visibility
// Essential for diagnosing connection leaks and pool exhaustion
// ============================================================

// Fires when a new connection is established in the pool
// Useful for monitoring pool growth and connection creation rate
pool.on("connect", () => {
  logger.debug("New database connection established in pool");
});

// Fires when a connection encounters an error while idle in the pool
// Critical for detecting network issues, PostgreSQL restarts, or
// connection drops — allows proactive reconnection handling
pool.on("error", (err) => {
  // Log as error level — this indicates infrastructure problems
  // Do NOT log connection strings or credentials in the error
  logger.error("Unexpected database pool error", {
    message: err.message,
    code: err.code,
  });
});

// Fires when an idle connection is removed from the pool
// Tracks pool shrinkage — normal during low-traffic periods
pool.on("remove", () => {
  logger.debug("Database connection removed from pool");
});

// ============================================================
// Exported query function — wrapper around pool.query
// Provides a consistent interface for all database operations
// All queries go through this to enable centralized logging,
// error handling, and potential query instrumentation
// ============================================================

/**
 * Execute a parameterized SQL query against the connection pool.
 * ALWAYS use parameterized queries ($1, $2, ...) to prevent SQL injection.
 * The pool automatically manages connection checkout/release.
 *
 * @param {string} text - SQL query string with $n placeholders
 * @param {Array} params - Array of parameter values (prevents SQL injection)
 * @returns {Promise<pg.QueryResult>} PostgreSQL query result object
 *
 * @example
 * const result = await query('SELECT * FROM users WHERE email_hash = $1', [hash]);
 */
const query = async (text, params) => {
  // Record query start time for performance monitoring
  // Helps identify slow queries that need optimization or indexing
  const start = Date.now();

  try {
    // Execute parameterized query through the connection pool
    // Pool automatically checks out a connection, runs the query,
    // and releases the connection back — no manual management needed
    const result = await pool.query(text, params);

    // Calculate query execution duration for performance visibility
    const duration = Date.now() - start;

    // Log query metrics at debug level — not in production logs
    // Never log the actual params to prevent sensitive data leakage
    logger.debug("Query executed", {
      // Truncate query text to prevent log bloat on large queries
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });

    // Return the full result object for caller to process
    return result;
  } catch (error) {
    // Log query failures with context for debugging
    // Include query text but NEVER include params (may contain PII)
    logger.error("Database query failed", {
      query: text.substring(0, 100),
      error: error.message,
      code: error.code,
    });

    // Re-throw to let the caller's error handler deal with it
    // The global error handler will send appropriate HTTP responses
    throw error;
  }
};

// ============================================================
// Get a dedicated client from the pool for transaction support
// Transactions require a single connection for BEGIN/COMMIT/ROLLBACK
// Used in authService.js for atomic login pipeline operations
// ============================================================

/**
 * Get a client from the pool for transaction operations.
 * Caller MUST release the client after use to prevent connection leaks.
 *
 * @returns {Promise<pg.PoolClient>} A dedicated database client
 *
 * @example
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   // ... multiple queries ...
 *   await client.query('COMMIT');
 * } catch (e) {
 *   await client.query('ROLLBACK');
 *   throw e;
 * } finally {
 *   client.release(); // CRITICAL — always release
 * }
 */
const getClient = async () => {
  // pool.connect() checks out a dedicated connection from the pool
  // This connection is exclusively held by the caller until released
  const client = await pool.connect();
  return client;
};

// ============================================================
// Export pool and utility functions for use across the application
// pool: Direct access for advanced use cases
// query: Standard parameterized query execution
// getClient: Transaction support with dedicated connections
// ============================================================
module.exports = {
  pool,
  query,
  getClient,
};
