// ============================================================
// PERSONALIZATION CONTROLLER — HTTP Interface for Dashboard API
// ============================================================
// Maps HTTP requests to PersonalizationService method calls.
// Only ONE route matters: GET /api/personalization/dashboard
//
// This controller does NOT make personalization decisions.
// It delegates entirely to PersonalizationService.
//
// SECURITY:
//   - All routes require authentication (via auth middleware)
//   - req.user is set by the authenticate middleware
//   - No user input affects which dashboard type is returned
//   - Backend decides everything based on the user's identity
// ============================================================

// Import the PersonalizationService singleton instance
// This is the orchestrator that builds the dashboard data
const personalizationService = require("../services/personalization/PersonalizationService");

// Import logger for request tracking
const logger = require("../utils/logger");

// ============================================================
// GET /api/personalization/dashboard
// ============================================================
/**
 * Get the personalized dashboard data for the authenticated user.
 *
 * The auth middleware has already verified the JWT and set req.user.
 * We pass req.user to PersonalizationService which:
 *   1. Links auth identity to PEMM person
 *   2. Determines the user's role (student/faculty/admin)
 *   3. Fetches role-specific data (projects, evaluations, stats)
 *   4. Builds the complete dashboard payload
 *   5. Returns it with caching
 *
 * Frontend calls this on every dashboard render.
 * Response is cached server-side for 60 seconds.
 *
 * @param {Request} req - Express request (req.user set by auth middleware)
 * @param {Response} res - Express response
 */
const getDashboard = async (req, res) => {
  try {
    // Log the dashboard request for audit trail
    logger.debug("PersonalizationController: Dashboard requested", {
      userId: req.user.userId, // Auth user ID from JWT
      email: req.user.email, // User email for debugging
    });

    // Read Google display name from frontend header (if available)
    // The frontend sends this from the cached login response
    // This allows auto-created persons to have the real Google name
    const displayName = req.get("X-Display-Name") || null;
    if (displayName) {
      req.user.name = displayName;
    }

    // Delegate to PersonalizationService
    // This handles the entire pipeline: identity linking → data fetch → build
    const dashboardData = await personalizationService.getDashboardData(
      req.user,
    );

    // Return the complete dashboard payload
    // Status 200 — successful data retrieval
    return res.status(200).json({
      success: true, // Standard API success flag
      data: dashboardData, // The complete dashboard payload
    });
  } catch (error) {
    // Log the error with context for debugging
    logger.error("PersonalizationController: Dashboard generation failed", {
      userId: req.user?.userId, // May be undefined if auth failed somehow
      error: error.message, // Error message
      stack: error.stack, // Stack trace for debugging
    });

    // Return a generic error — don't leak internal details
    return res.status(500).json({
      success: false, // Standard failure flag
      error: "Failed to load dashboard data. Please try again.", // User-friendly message
    });
  }
};

// ============================================================
// POST /api/personalization/cache/invalidate
// ============================================================
/**
 * Invalidate the dashboard cache for the authenticated user.
 *
 * Called when the frontend knows data has changed:
 *   - After creating/updating a project
 *   - After profile update
 *   - Manual refresh button
 *
 * Forces the next GET /dashboard to rebuild from database.
 *
 * @param {Request} req - Express request (req.user set by auth middleware)
 * @param {Response} res - Express response
 */
const invalidateCache = async (req, res) => {
  try {
    // Log the cache invalidation request
    logger.debug("PersonalizationController: Cache invalidation requested", {
      userId: req.user.userId,
    });

    // Invalidate the cached dashboard for this user
    personalizationService.invalidateUserCache(req.user.userId);

    // Return success confirmation
    return res.status(200).json({
      success: true, // Cache invalidated successfully
      message: "Dashboard cache cleared. Next request will fetch fresh data.",
    });
  } catch (error) {
    // Log the error
    logger.error("PersonalizationController: Cache invalidation failed", {
      userId: req.user?.userId,
      error: error.message,
    });

    // Return error — cache invalidation failure is non-critical
    return res.status(500).json({
      success: false,
      error: "Failed to invalidate cache.",
    });
  }
};

// ============================================================
// Export controller handlers
// Used by personalizationRoutes.js to wire up HTTP endpoints
// ============================================================
module.exports = {
  getDashboard, // GET  /api/personalization/dashboard
  invalidateCache, // POST /api/personalization/cache/invalidate
};
