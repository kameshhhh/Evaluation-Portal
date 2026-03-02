// ============================================================
// USER ROUTES — Admin User Management Endpoint Definitions
// ============================================================
// Maps URL paths to user management controller handlers.
// ALL endpoints require authentication AND admin role authorization
// AND real-time admin verification from the database.
// Middleware chain: authenticate → authorize('admin') → verifyAdminRealtime → controller
// ============================================================

// Import Express Router for modular route definition
const express = require("express");
const router = express.Router();

// Import user controller handlers
const {
  listUsers,
  getUserSessions,
  getUserSnapshots,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  getRolePatterns,
} = require("../controllers/userController");

// Import authentication, authorization, and real-time admin check
const {
  authenticate,
  authorize,
  verifyAdminRealtime,
} = require("../middleware/auth");

// Import admin-specific rate limiter
const { adminLimiter } = require("../middleware/rateLimiter");

// ============================================================
// Apply admin rate limiter — 30 requests per 15 min per IP
// Must be FIRST to reject excess requests before doing DB lookups
// ============================================================
router.use(adminLimiter);

// ============================================================
// Apply authentication to ALL user management routes
// Every request must have a valid JWT token
// ============================================================
router.use(authenticate);

// ============================================================
// Apply admin authorization to ALL user management routes
// Only users with 'admin' role can access these endpoints
// ============================================================
router.use(authorize("admin"));

// ============================================================
// Apply REAL-TIME admin verification from database
// Ensures the user is STILL an admin right now — not just at login time
// Catches: role revocations, account deactivations, stale JWTs
// ============================================================
router.use(verifyAdminRealtime);

// ============================================================
// GET /api/users — List All Users
// Returns paginated user list for admin dashboard
// Query params: ?page=1&limit=20
// ============================================================
router.get("/", listUsers);

// ============================================================
// GET /api/users/role-patterns — Get Role Patterns
// Returns all configured email-to-role mapping patterns
// Used for admin configuration management
// ============================================================
router.get("/role-patterns", getRolePatterns);

// ============================================================
// GET /api/users/:userId/sessions — Get User Sessions
// Returns active sessions for a specific user
// Used for security monitoring and session management
// ============================================================
router.get("/:userId/sessions", getUserSessions);

// ============================================================
// GET /api/users/:userId/snapshots — Get Login History
// Returns immutable identity snapshots (login history)
// Used for audit trail review
// ============================================================
router.get("/:userId/snapshots", getUserSnapshots);

// ============================================================
// PATCH /api/users/:userId/role — Update User Role
// Changes a user's role assignment
// Body: { role: 'student' | 'faculty' | 'admin' | ... }
// ============================================================
router.patch("/:userId/role", updateUserRole);

// ============================================================
// DELETE /api/users/:userId — Deactivate User
// Soft-deletes the user and revokes all their sessions
// The user's identity and history are preserved
// ============================================================
router.delete("/:userId", deactivateUser);

// ============================================================
// PATCH /api/users/:userId/reactivate — Reactivate User
// Restores a user that was previously deactivated
// User will need to re-authenticate after reactivation
// ============================================================
router.patch("/:userId/reactivate", reactivateUser);

// ============================================================
// Export the configured router
// Mounted at /api/users in app.js
// ============================================================
module.exports = router;
