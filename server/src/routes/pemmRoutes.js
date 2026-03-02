// ============================================================
// PEMM ROUTE REGISTRATION — Mounts All PEMM Routes
// ============================================================
// Central registration file for all PEMM module routes.
// Import this in the main app.js/server.js and call:
//
//   registerPEMMRoutes(app);
//
// This will mount:
//   /api/persons/*       → personController
//   /api/projects/*      → projectController
//   /api/evaluations/*   → evaluationController
//
// Also registers the entity error handler middleware.
//
// IMPORTANT: This does NOT modify the existing route files.
// It only ADDS new routes in new URL namespaces.
// ============================================================

// Import the controllers
const personController = require("../controllers/personController");
const projectController = require("../controllers/projectController");
const evaluationController = require("../controllers/evaluationController");

// Import the entity error handler middleware
const entityErrorHandler = require("../middleware/entityErrorHandler");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// registerPEMMRoutes — mounts all PEMM routes on the Express app
// ============================================================
/**
 * Register all PEMM module routes on the Express application.
 * Call this function in the main server setup file.
 *
 * @param {Object} app - Express application instance
 * @param {Object} [options] - Configuration options
 * @param {Function} [options.authMiddleware] - Authentication middleware to protect routes
 * @param {string} [options.prefix] - URL prefix (default: '/api')
 */
function registerPEMMRoutes(app, options = {}) {
  // Default URL prefix
  const prefix = options.prefix || "/api";

  // PEMM Health Check — no auth required, just proves PEMM is mounted
  // Use this to verify the module is loaded before testing other endpoints
  app.get(`${prefix}/pemm/health`, (req, res) => {
    // Return a simple JSON confirming PEMM is operational
    res.status(200).json({
      success: true, // Standard success flag
      module: "PEMM", // Module name identifier
      status: "operational", // Current module status
      timestamp: new Date().toISOString(), // When this was checked
      endpoints: {
        // All available endpoints
        persons: `${prefix}/persons`, // Person CRUD routes
        projects: `${prefix}/projects`, // Project CRUD routes
        evaluations: `${prefix}/evaluations`, // Evaluation freeze/verify routes
      },
    });
  });

  // If auth middleware is provided, apply it to all PEMM routes
  // This allows us to use the EXISTING auth system without modification
  if (options.authMiddleware) {
    // Mount auth middleware on all PEMM route prefixes
    app.use(`${prefix}/persons`, options.authMiddleware);
    app.use(`${prefix}/projects`, options.authMiddleware);
    app.use(`${prefix}/evaluations`, options.authMiddleware);
  }

  // Mount the person routes
  app.use(`${prefix}/persons`, personController);

  // Mount the project routes
  app.use(`${prefix}/projects`, projectController);

  // Mount the evaluation routes
  app.use(`${prefix}/evaluations`, evaluationController);

  // Register the PEMM entity error handler
  // This MUST come after all PEMM routes but can be before
  // the existing global error handler
  app.use(entityErrorHandler);

  // Log successful registration
  logger.info("PEMM routes registered", {
    prefix,
    routes: [
      `${prefix}/persons`,
      `${prefix}/projects`,
      `${prefix}/evaluations`,
    ],
  });
}

// ============================================================
// Export the registration function
// ============================================================
module.exports = { registerPEMMRoutes };
