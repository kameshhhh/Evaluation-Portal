// ============================================================
// WINSTON LOGGER — Structured Logging for Zero-Trust System
// ============================================================
// Provides centralized, structured logging across the entire backend.
// Winston supports multiple transports (console, file, remote) and
// log levels for filtering verbosity per environment.
// CRITICAL: Never log sensitive data (tokens, emails, passwords).
// ============================================================

// Import Winston logging library
// Winston is the most popular Node.js logging library
// Supports structured JSON logs for production log aggregation
const winston = require("winston");

// ============================================================
// Define custom log format for development readability
// Combines timestamp, log level, and message into a single line
// Colors are added for console output to improve developer experience
// ============================================================
const devFormat = winston.format.combine(
  // Add ISO timestamp to every log entry for chronological ordering
  // Timestamps are essential for correlating events during debugging
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),

  // Colorize log level for visual distinction in terminal
  // error=red, warn=yellow, info=green, debug=blue
  winston.format.colorize(),

  // Custom printf format for human-readable development logs
  // Includes timestamp, level, message, and any additional metadata
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Build the base log line with timestamp and level
    let logLine = `${timestamp} [${level}]: ${message}`;

    // Append metadata as JSON if any extra fields are present
    // This captures structured data like query duration, error codes, etc.
    if (Object.keys(meta).length > 0) {
      logLine += ` ${JSON.stringify(meta)}`;
    }

    return logLine;
  }),
);

// ============================================================
// Define production log format — JSON for log aggregation tools
// Structured JSON logs are parsed by tools like ELK, Datadog, Splunk
// No colors in production — they add ANSI escape codes to JSON
// ============================================================
const prodFormat = winston.format.combine(
  // ISO timestamp for precise event ordering across distributed systems
  winston.format.timestamp(),

  // Output as JSON for machine parsing by log aggregation services
  // Each log entry becomes a parseable JSON object
  winston.format.json(),
);

// ============================================================
// Create the Winston logger instance
// Configuration adapts based on NODE_ENV environment variable
// Development: verbose, colorized console output
// Production: structured JSON, error-level file logging
// ============================================================
const logger = winston.createLogger({
  // Set log level from environment variable, defaulting to 'info'
  // 'debug' in development captures all events including DB queries
  // 'info' in production omits debug noise while capturing key events
  level: process.env.LOG_LEVEL || "info",

  // Use production JSON format by default for safety
  // Development format is applied to the console transport below
  format: prodFormat,

  // Default metadata added to every log entry
  // Service name helps identify logs in multi-service architectures
  defaultMeta: { service: "bitsathy-auth" },

  // ============================================================
  // Configure log transports (destinations for log output)
  // Multiple transports can run simultaneously
  // ============================================================
  transports: [
    // Console transport — always active for container/PM2 output
    // In development, uses colorized human-readable format
    // In production, uses JSON format for log aggregation
    new winston.transports.Console({
      format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
    }),

    // File transport for error-level logs only
    // Persists critical errors to disk for post-mortem analysis
    // Max size 5MB with rotation prevents disk space exhaustion
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880, // 5MB max file size before rotation
      maxFiles: 5, // Keep last 5 rotated error log files
    }),

    // File transport for all combined logs
    // Captures complete application history for debugging
    // Useful for replaying event sequences during investigations
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB max file size before rotation
      maxFiles: 5, // Keep last 5 rotated log files
    }),
  ],
});

// ============================================================
// Export the logger instance for use across the application
// Usage: const logger = require('../utils/logger');
//        logger.info('User authenticated', { userId: '...' });
// ============================================================
module.exports = logger;
