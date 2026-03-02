// ============================================================
// RATE LIMITER MIDDLEWARE — Brute Force Protection
// ============================================================
// Applies request rate limiting per IP address to prevent abuse.
// Different rate limits for different endpoint types:
// - Auth endpoints: Stricter limits (prevents credential stuffing)
// - General API: Moderate limits (prevents DoS)
// Uses express-rate-limit with in-memory store (Redis for production).
// ============================================================

// Import express-rate-limit for request throttling
// This middleware counts requests per IP within a time window
const rateLimit = require("express-rate-limit");

// Import logger for rate limit event tracking
const logger = require("../utils/logger");

// ============================================================
// Authentication rate limiter — strict limits for login endpoints
// Prevents brute-force attacks on the Google token verification flow
// 10 requests per 15 minutes per IP address — generous for real users,
// highly restrictive for automated attacks (hardened from 20)
// ============================================================
const authLimiter = rateLimit({
  // Time window in milliseconds — 15 minutes
  // Requests are counted within this sliding window
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,

  // Maximum requests allowed per IP within the window
  // 30 auth attempts per 15 minutes — generous for dev, still restrictive for bots
  // Automated attacks hit this limit within seconds
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 30,

  // Response message when rate limit is exceeded
  // Clear message helps legitimate users understand the restriction
  message: {
    success: false,
    error: "Too many authentication attempts — please try again later",
    code: "RATE_LIMITED",
    retryAfter: "15 minutes",
  },

  // Use standard headers to communicate rate limit status
  // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  standardHeaders: true,

  // Disable legacy X-RateLimit headers — use standard ones only
  legacyHeaders: false,

  // Custom handler for when rate limit is exceeded
  // Logs the event for security monitoring and alerting
  handler: (req, res, next, options) => {
    logger.warn("Auth rate limit exceeded — possible brute force", {
      ip: req.ip,
      path: req.path,
      userAgent: req.get("User-Agent"),
    });
    res.status(429).json(options.message);
  },

  // Skip successful requests — only count failures for auth
  // This prevents legitimate users from hitting limits on success
  skipSuccessfulRequests: true,
});

// ============================================================
// General API rate limiter — moderate limits for all endpoints
// Prevents DoS attacks and excessive API consumption
// 100 requests per 15 minutes per IP — sufficient for normal browsing
// ============================================================
const generalLimiter = rateLimit({
  // Same 15-minute window as auth limiter for consistency
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,

  // 500 requests per window — covers dashboard with multiple parallel API calls
  // Dashboard + cohort assignments + peer suggestions can make 15-20 requests per page load
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,

  // Response for rate-limited general requests
  message: {
    success: false,
    error: "Too many requests — please slow down",
    code: "RATE_LIMITED",
  },

  // Standard rate limit headers for client-side handling
  standardHeaders: true,
  legacyHeaders: false,

  // Log general rate limit events at info level (less severe than auth)
  handler: (req, res, next, options) => {
    logger.info("General rate limit exceeded", {
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

// ============================================================
// Admin API rate limiter — strict limits for admin endpoints
// Admin endpoints are high-value targets — stricter rate limits
// 30 requests per 15 minutes per IP (admin operations are infrequent)
// ============================================================
const adminLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,

  // 100 admin requests per window — admin tabs generate many parallel API calls
  max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX, 10) || 100,

  message: {
    success: false,
    error: "Too many admin requests — please slow down",
    code: "RATE_LIMITED",
  },

  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res, next, options) => {
    logger.warn("Admin rate limit exceeded — possible enumeration attempt", {
      ip: req.ip,
      path: req.path,
      userId: req.user?.userId,
    });
    res.status(429).json(options.message);
  },
});

// ============================================================
// Export all rate limiters for route-specific application
// authLimiter: Applied to /api/auth/* routes
// generalLimiter: Applied globally or to /api/* routes
// adminLimiter: Applied to /api/users/* admin routes
// ============================================================
module.exports = {
  authLimiter,
  generalLimiter,
  adminLimiter,
};
