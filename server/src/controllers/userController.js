// ============================================================
// USER CONTROLLER — Admin User Management Endpoints
// ============================================================
// Handles admin-level operations: listing users, changing roles,
// and deactivating accounts. All endpoints require authentication
// and admin role authorization (enforced by middleware chain).
// ============================================================

// Import models for database operations
const { User, IdentitySnapshot, Session } = require("../models");

// Import role service for pattern management
const { getAllPatterns } = require("../services/roleService");

// Import personalization service to invalidate caches after mutations
// Ensures affected users see fresh dashboard data immediately (SRS 8.2)
const personalizationService = require("../services/personalization/PersonalizationService");

// Import logger for admin action tracking
const logger = require("../utils/logger");

// ============================================================
// GET /api/users — List All Users (Admin Only)
// Returns paginated user list for the admin dashboard
// ============================================================

/**
 * List all users with pagination.
 * Admin-only endpoint — requires 'admin' role.
 *
 * @param {Request} req - Express request with query params: page, limit
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const listUsers = async (req, res, next) => {
  try {
    // Extract pagination parameters from query string
    // Defaults: page 1, 20 items per page
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    // Fetch paginated user list from the database
    const { users, total } = await User.listUsers(page, limit);

    // Return the user list with pagination metadata
    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET /api/users/:userId/sessions — Get User Sessions (Admin)
// Returns active sessions for a specific user
// ============================================================

/**
 * Get active sessions for a specific user.
 *
 * @param {Request} req - Express request with userId param
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const getUserSessions = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Get active sessions for the user
    const sessions = await Session.getActiveSessions(userId);

    return res.status(200).json({
      success: true,
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET /api/users/:userId/snapshots — Get Login History (Admin)
// Returns identity snapshots (login history) for a specific user
// ============================================================

/**
 * Get identity snapshots (login history) for a user.
 *
 * @param {Request} req - Express request with userId param
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const getUserSnapshots = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Get login history snapshots — most recent first
    const snapshots = await IdentitySnapshot.getByUserId(userId);

    return res.status(200).json({
      success: true,
      data: { snapshots },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PATCH /api/users/:userId/role — Update User Role (Admin)
// Changes a user's role — the change takes effect on next login
// ============================================================

/**
 * Update a user's role.
 *
 * @param {Request} req - Express request with userId param and body.role
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Validate that a role was provided
    if (!role || typeof role !== "string") {
      return res.status(400).json({
        success: false,
        error: "Role is required and must be a string",
      });
    }

    // Update the user's role in the database
    const updated = await User.updateRole(userId, role);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Log the admin action for audit trail
    logger.info("Admin updated user role", {
      adminId: req.user.userId,
      targetUserId: userId,
      newRole: role,
    });

    // Invalidate the affected user's dashboard cache so they get fresh role-based data
    // Also invalidate admin's cache so department counts update in real-time
    personalizationService.invalidateUserCache(userId);
    personalizationService.invalidateUserCache(req.user.userId);

    return res.status(200).json({
      success: true,
      data: { user: updated },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// DELETE /api/users/:userId — Deactivate User (Admin)
// Soft-deletes the user and revokes all their sessions
// ============================================================

/**
 * Deactivate a user account and revoke all sessions.
 *
 * @param {Request} req - Express request with userId param
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const deactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Deactivate the user (soft delete)
    const deactivated = await User.deactivate(userId);

    if (!deactivated) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Revoke all active sessions to force immediate logout
    const revokedCount = await Session.revokeAllForUser(userId);

    // Log the admin action
    logger.info("Admin deactivated user", {
      adminId: req.user.userId,
      targetUserId: userId,
      sessionsRevoked: revokedCount,
    });

    // Invalidate caches — admin sees updated counts, affected user's cache is cleared
    personalizationService.invalidateUserCache(userId);
    personalizationService.invalidateUserCache(req.user.userId);

    return res.status(200).json({
      success: true,
      message: "User deactivated and all sessions revoked",
      data: {
        sessionsRevoked: revokedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PATCH /api/users/:userId/reactivate — Reactivate User (Admin)
// Restores a previously deactivated user's ability to log in
// ============================================================

/**
 * Reactivate a deactivated user account.
 *
 * @param {Request} req - Express request with userId param
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const reactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Reactivate the user (restore is_active = true)
    const reactivated = await User.reactivate(userId);

    if (!reactivated) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Log the admin action for audit trail
    logger.info("Admin reactivated user", {
      adminId: req.user.userId,
      targetUserId: userId,
    });

    // Invalidate caches — admin sees updated counts, reactivated user gets fresh data
    personalizationService.invalidateUserCache(userId);
    personalizationService.invalidateUserCache(req.user.userId);

    return res.status(200).json({
      success: true,
      message: "User reactivated successfully",
      data: { user: reactivated },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET /api/users/role-patterns — Get Role Patterns (Admin)
// Returns all configured role patterns for management
// ============================================================

/**
 * Get all role patterns.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const getRolePatterns = async (req, res, next) => {
  try {
    const patterns = await getAllPatterns();

    return res.status(200).json({
      success: true,
      data: { patterns },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Export all user controller handlers
// Mapped to routes in userRoutes.js
// ============================================================
module.exports = {
  listUsers,
  getUserSessions,
  getUserSnapshots,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  getRolePatterns,
};
