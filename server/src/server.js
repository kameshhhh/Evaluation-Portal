// ============================================================
// SERVER ENTRY POINT — HTTP Server Initialization
// ============================================================
// Starts the Express HTTP server on the configured port.
// Separated from app.js to allow independent testing of the
// Express application without starting the HTTP server.
// Handles graceful shutdown and uncaught exception reporting.
// ============================================================

// Load environment variables FIRST — before any other imports
// This ensures all modules have access to env vars during initialization
require("dotenv").config();

// Import the configured Express application
const app = require("./app");

// Import logger for server lifecycle event tracking
const logger = require("./utils/logger");

// Import database pool for graceful shutdown
const { pool } = require("./config/database");

// Import automated workers
const SessionAutoFinalizer = require("./workers/SessionAutoFinalizer");

// Import Socket.IO for real-time event broadcasting
const socketServer = require("./socket");

// ============================================================
// Read the server port from environment variables
// Default to 5000 — avoids conflict with React dev server (3000)
// In production, the port should be set via environment variable
// ============================================================
const PORT = parseInt(process.env.PORT, 10) || 5000;

// ============================================================
// Start the HTTP server
// app.listen() creates an HTTP server and starts listening
// Returns the server instance for graceful shutdown handling
// ============================================================
const server = app.listen(PORT, () => {
  // Initialize Socket.IO on the HTTP server
  socketServer.initialize(server);

  // Log server startup with key configuration details
  logger.info(`Server started successfully`, {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
  });

  console.log("\n========================================");
  console.log(`  Zero-Trust Auth Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`  API Base: http://localhost:${PORT}/api`);
  console.log("========================================\n");
  console.log("Available endpoints:");
  console.log("  POST   /api/auth/google/login  — Google One-Tap login");
  console.log("  POST   /api/auth/logout        — Revoke session");
  console.log("  GET    /api/auth/me            — Get profile");
  console.log("  GET    /api/auth/verify        — Verify token");
  console.log("  GET    /api/health             — Health check");
  console.log("  GET    /api/users              — List users (admin)");
  console.log("  WS     Socket.IO               — Real-time events");
  console.log("");

  // ============================================================
  // START AUTOMATED WORKERS
  // These workers run in the background and handle:
  //   - Auto-finalizing sessions at their deadline
  //   - Automatically updating credibility scores
  // ============================================================
  if (process.env.AUTO_FINALIZE_ENABLED !== "false") {
    SessionAutoFinalizer.start();
  } else {
    console.log(
      "⚠️  SessionAutoFinalizer DISABLED via AUTO_FINALIZE_ENABLED=false",
    );
  }
});

// ============================================================
// GRACEFUL SHUTDOWN — Clean up resources on termination signals
// Handles SIGTERM (Docker/Kubernetes), SIGINT (Ctrl+C), and SIGHUP
// Ensures database connections are closed properly
// ============================================================
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received — starting graceful shutdown`);
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop automated workers first
  SessionAutoFinalizer.stop();

  // Stop accepting new connections
  // In-flight requests will complete before the server closes
  server.close(async () => {
    logger.info("HTTP server closed — no more connections");

    try {
      // Close the database connection pool
      // Releases all connections back to PostgreSQL
      await pool.end();
      logger.info("Database connections closed");
      console.log("Database connections closed. Goodbye!");
    } catch (err) {
      logger.error("Error closing database connections", {
        error: err.message,
      });
    }

    // Exit with success code
    process.exit(0);
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error("Forced shutdown — graceful shutdown timed out");
    process.exit(1);
  }, 10000);
};

// Register shutdown handlers for common termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ============================================================
// UNHANDLED REJECTION HANDLER — Catch async errors that escape
// Logs the error and shuts down gracefully to prevent undefined state
// ============================================================
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
  // Don't crash immediately — let the server finish current requests
  gracefulShutdown("UNHANDLED_REJECTION");
});

// ============================================================
// UNCAUGHT EXCEPTION HANDLER — Last resort error catching
// The process MUST exit after this — state may be corrupted
// ============================================================
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception — process will exit", {
    error: error.message,
    stack: error.stack,
  });
  // Exit immediately — uncaught exceptions leave the process in undefined state
  process.exit(1);
});

// ============================================================
// Export the server instance for testing
// ============================================================
module.exports = server;
