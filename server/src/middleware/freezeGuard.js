// ============================================================
// FREEZE GUARD MIDDLEWARE — Blocks Modifications to Frozen Data
// ============================================================
// Express middleware that checks if an entity is frozen before
// allowing any modification request (PUT, PATCH, DELETE).
//
// This is the HTTP-level enforcement of the freeze mechanism.
// Even if someone bypasses the application logic, this
// middleware will block the request at the HTTP layer.
//
// How it works:
//   1. Extract the entity ID from request params
//   2. Query the database to check if the entity is frozen
//   3. If frozen, respond with 423 Locked immediately
//   4. If not frozen, call next() to continue the request
//
// Used on routes that modify projects, work logs, and plans.
// NOT used on read-only routes (GET requests).
// ============================================================

// Import database query function
const { query } = require("../config/database");

// Import custom error for freeze violations
const { FreezeViolationError } = require("../entities/EntityErrors");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// createFreezeGuard — factory for entity-specific freeze guards
// ============================================================

/**
 * Create a freeze guard middleware for a specific entity type.
 * The factory pattern allows us to create guards for different
 * entities (projects, work logs) with different freeze check logic.
 *
 * @param {string} entityType - 'project' or 'workLog'
 * @returns {Function} Express middleware function
 */
function createFreezeGuard(entityType) {
  /**
   * Express middleware that blocks requests to frozen entities.
   *
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   */
  return async function freezeGuard(req, res, next) {
    try {
      // Only block modification requests
      // GET and HEAD requests should always be allowed
      if (req.method === "GET" || req.method === "HEAD") {
        return next();
      }

      // Determine the entity ID from request params
      let isFrozen = false;

      if (entityType === "project") {
        // Check if the project is frozen
        const projectId = req.params.projectId || req.params.id;

        if (projectId) {
          const result = await query(
            "SELECT frozen_at FROM projects WHERE project_id = $1",
            [projectId],
          );

          // If the project has a frozen_at timestamp, it's frozen
          isFrozen =
            result.rows[0]?.frozen_at !== null &&
            result.rows[0]?.frozen_at !== undefined;
        }
      } else if (entityType === "workLog") {
        // Check if the work log is frozen
        const logId = req.params.logId || req.params.id;

        if (logId) {
          const result = await query(
            "SELECT is_frozen FROM work_logs WHERE log_id = $1",
            [logId],
          );

          isFrozen = result.rows[0]?.is_frozen === true;
        }
      }

      // If frozen, block the request with 423 Locked
      if (isFrozen) {
        logger.warn("Freeze guard blocked modification request", {
          entityType,
          method: req.method,
          path: req.path,
          ip: req.ip,
        });

        throw new FreezeViolationError(
          `Cannot modify frozen ${entityType}. The entity has been frozen for evaluation.`,
        );
      }

      // Not frozen — allow the request to continue
      next();
    } catch (error) {
      // If it's our custom error, pass it to the error handler
      if (error instanceof FreezeViolationError) {
        return next(error);
      }

      // For unexpected errors, log and pass through
      logger.error("Freeze guard error", { error: error.message });
      next(error);
    }
  };
}

// ============================================================
// Pre-built guards for common entity types
// ============================================================

// Guard for project routes
const projectFreezeGuard = createFreezeGuard("project");

// Guard for work log routes
const workLogFreezeGuard = createFreezeGuard("workLog");

// ============================================================
// Export the factory and pre-built guards
// ============================================================
module.exports = {
  createFreezeGuard,
  projectFreezeGuard,
  workLogFreezeGuard,
};
