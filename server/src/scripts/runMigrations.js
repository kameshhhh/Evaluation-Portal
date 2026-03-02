// ============================================================
// DATABASE MIGRATION RUNNER — Executes PEMM Schema Migrations
// ============================================================
// Reads all .sql migration files in order and executes them
// against the PostgreSQL database. Safe to run multiple times
// because all migrations use IF NOT EXISTS / IF EXISTS guards.
//
// Usage: node src/scripts/runMigrations.js
//
// This script does NOT modify existing tables (users, sessions,
// identity_snapshots, etc.) — it only CREATES new PEMM tables.
// ============================================================

// Load environment variables FIRST — needed for DATABASE_URL
require("dotenv").config();

// Import Node.js file system module for reading .sql files
const fs = require("fs");

// Import Node.js path module for resolving file paths
const path = require("path");

// Import the existing database pool for executing SQL
const { pool } = require("../config/database");

// Import the existing logger for structured output
const logger = require("../utils/logger");

// ============================================================
// Migration file directory — where all .sql files live
// ============================================================
const MIGRATIONS_DIR = path.join(__dirname, "..", "db", "migrations");

// ============================================================
// Main migration function — reads and executes all .sql files
// ============================================================
async function runMigrations() {
  // Log the start of migration process
  logger.info("Starting PEMM database migrations...");

  try {
    // Read all files in the migrations directory
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      // Filter to only .sql files
      .filter((file) => file.endsWith(".sql"))
      // Sort alphabetically to ensure correct execution order
      // Files are named 001_, 002_, etc. for deterministic ordering
      .sort();

    // Log how many migration files were found
    logger.info(`Found ${files.length} migration files`);

    // Execute each migration file in sequence
    // We don't parallelize because later migrations depend on earlier ones
    for (const file of files) {
      // Build the full path to the migration file
      const filePath = path.join(MIGRATIONS_DIR, file);

      // Read the SQL content from the file
      const sql = fs.readFileSync(filePath, "utf8");

      // Log which migration is being executed
      logger.info(`Running migration: ${file}`);

      // Execute the SQL against the database
      // pool.query handles connection checkout/release automatically
      await pool.query(sql);

      // Log successful completion of this migration
      logger.info(`Migration complete: ${file}`);
    }

    // All migrations succeeded
    logger.info("All PEMM migrations completed successfully");
  } catch (error) {
    // Log the failure with full error details
    logger.error("Migration failed", {
      error: error.message,
      code: error.code,
      detail: error.detail,
    });

    // Exit with error code to signal failure to CI/CD pipelines
    process.exit(1);
  } finally {
    // Close the database pool to prevent hanging Node.js process
    await pool.end();
  }
}

// ============================================================
// Execute migrations when script is run directly
// ============================================================
runMigrations();
