// ============================================================
// AUTH ROUTES — Authentication Endpoint Definitions
// ============================================================
// Maps URL paths to authentication controller handlers.
// Applies appropriate middleware chains for each endpoint:
// - Public endpoints: rate limiter + validation
// - Protected endpoints: rate limiter + JWT auth + validation
// ============================================================

// Import Express Router for modular route definition
const express = require("express");
const router = express.Router();

// Import auth controller handlers
const {
  googleLogin,
  logout,
  getProfile,
  verifyToken,
} = require("../controllers/authController");

// Import middleware for the authentication chain
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

// Import request validation middleware and auth schemas
const validateRequest = require("../middleware/validateRequest");
const { googleLoginSchema } = require("../validators/authValidator");

// ============================================================
// POST /api/auth/google/login — Google One-Tap Login
// PUBLIC endpoint — no JWT required (this IS the login)
// Middleware chain: rate limiter → body validation → controller
// Rate limiter prevents brute-force login attempts
// Validation ensures credential is present and JWT-formatted
// ============================================================
router.post(
  "/google/login",
  authLimiter,
  validateRequest(googleLoginSchema, "body"),
  googleLogin,
);

// ============================================================
// POST /api/auth/logout — Revoke Current Session
// PROTECTED endpoint — requires valid JWT
// Middleware chain: rate limiter → JWT auth → controller
// ============================================================
router.post("/logout", authLimiter, authenticate, logout);

// ============================================================
// GET /api/auth/me — Get Current User Profile
// PROTECTED endpoint — requires valid JWT
// Middleware chain: authenticate → controller
// ============================================================
router.get("/me", authenticate, getProfile);

// ============================================================
// GET /api/auth/verify — Verify Token Validity
// PROTECTED endpoint — if auth middleware passes, token is valid
// Lightweight check used by frontend on page load
// ============================================================
router.get("/verify", authenticate, verifyToken);

// ============================================================
// Export the configured router
// Mounted at /api/auth in app.js
// ============================================================
module.exports = router;
