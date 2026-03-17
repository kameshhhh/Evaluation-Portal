// ============================================================
// PROJECT MEMBER MIDDLEWARE — Verify project membership
// ============================================================
// Ensures the authenticated user is an active member of the
// project being accessed. Admins bypass this check.
// Must be used AFTER authenticate middleware.
//
// Usage:
//   router.get("/:projectId/files", authenticate, requireProjectMember, handler);
// ============================================================

"use strict";

const pool = require("../config/database");
const logger = require("../utils/logger");

/**
 * Middleware that verifies the caller is an active member of the
 * project identified by req.params.projectId.
 * Admins are allowed through without membership check.
 */
const requireProjectMember = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const personId = req.user?.personId;
    const role = req.user?.role;

    // Admins can access any project
    if (role === "admin") {
      return next();
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "Project ID is required",
      });
    }

    if (!personId) {
      return res.status(403).json({
        success: false,
        error: "Person identity not resolved — cannot verify membership",
      });
    }

    // Check active membership (left_at IS NULL = still a member)
    const result = await pool.query(
      `SELECT 1 FROM project_members
       WHERE project_id = $1 AND person_id = $2 AND left_at IS NULL
       LIMIT 1`,
      [projectId, personId],
    );

    if (result.rows.length === 0) {
      logger.warn("Project access denied — not a member", {
        projectId,
        personId,
        userId: req.user?.userId,
      });
      return res.status(403).json({
        success: false,
        error: "You are not a member of this project",
      });
    }

    next();
  } catch (error) {
    logger.error("Project member check failed", {
      error: error.message,
      projectId: req.params?.projectId,
    });
    next(error);
  }
};

module.exports = { requireProjectMember };
