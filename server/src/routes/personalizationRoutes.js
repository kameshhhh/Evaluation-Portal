// ============================================================
// PERSONALIZATION ROUTES — HTTP Route Definitions
// ============================================================
// Defines the Express route handlers for the personalization API.
// All routes are protected by the authenticate middleware.
//
// Routes:
//   GET  /api/personalization/dashboard        → Get personalized dashboard
//   POST /api/personalization/cache/invalidate  → Clear user's dashboard cache
//
// Mount: app.use("/api/personalization", personalizationRoutes)
// ============================================================

// Import Express Router for route definition
const express = require("express");

// Create a new router instance for personalization routes
const router = express.Router();

// Import the authentication middleware
// This verifies JWT and sets req.user = { userId, email, role, tokenId }
const { authenticate } = require("../middleware/auth");

// Import the controller methods
const {
  getDashboard, // Handler for GET /dashboard
  invalidateCache, // Handler for POST /cache/invalidate
} = require("../controllers/personalizationController");

// ============================================================
// ROUTE DEFINITIONS
// ============================================================

// GET /api/personalization/dashboard
// Protected — requires valid JWT token
// Returns complete personalized dashboard data for the authenticated user
// The backend determines what to show based on the user's identity and role
router.get("/dashboard", authenticate, getDashboard);

// POST /api/personalization/cache/invalidate
// Protected — requires valid JWT token
// Clears the cached dashboard data for the authenticated user
// Frontend calls this after data mutations to force fresh data on next load
router.post("/cache/invalidate", authenticate, invalidateCache);

// ============================================================
// Export the router for mounting in app.js
// Mount point: app.use("/api/personalization", personalizationRoutes)
// ============================================================
module.exports = router;
