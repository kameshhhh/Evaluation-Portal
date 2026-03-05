// ============================================================
// EXPRESS APP SETUP — Application Configuration & Middleware Chain
// ============================================================
// Configures the Express.js application with all middleware in the
// correct order. Middleware ordering is CRITICAL for security:
// 1. Security headers (helmet) — set on every response
// 2. CORS — restrict cross-origin access
// 3. Body parsing — parse JSON request bodies
// 4. Rate limiting — prevent abuse before authentication
// 5. Routes — endpoint handlers
// 6. Error handler — catch all unhandled errors (MUST be last)
// ============================================================

// Load environment variables before any other imports
// This ensures all config modules have access to process.env values
require("dotenv").config();

// Import Express framework — the HTTP server foundation
const express = require("express");

// Import CORS middleware — controls cross-origin request access
// Only origins listed in CORS_ORIGIN env var can call our API
const cors = require("cors");

// Import security headers middleware (helmet wrapper + permissions policy)
const {
  securityHeaders,
  permissionsPolicy,
} = require("./middleware/securityHeaders");

// Import rate limiters for different endpoint groups
const { generalLimiter } = require("./middleware/rateLimiter");

// Import global error handler — MUST be the last middleware
const { errorHandler } = require("./middleware/errorHandler");

// Import route modules
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

// Import PEMM route registration function
const { registerPEMMRoutes } = require("./routes/pemmRoutes");

// Import authentication middleware for PEMM routes
const { authenticate: pemmAuth } = require("./middleware/auth");

// Import personalization routes — role-specific dashboard API
const personalizationRoutes = require("./routes/personalizationRoutes");

// Import scarcity routes — scarcity-based evaluation API
const scarcityRoutes = require("./routes/scarcityRoutes");

// Import analytics routes — SRS analytics features
// Covers: Temporal growth (SRS 6), Person vectors (SRS 7),
// Peer ranking safeguards (SRS 4.5.3), Faculty normalization (SRS 4.4.3),
// Intent-aware evaluation (SRS 6.2)
const analyticsRoutes = require("./routes/analyticsRoutes");

// Import project enhancement routes — SRS 4.1.1 & 4.1.2
// Covers: Member profiles, share %, monthly plans, work logs,
// review history, score comparison, improvement analytics
const projectEnhancementRoutes = require("./routes/projectEnhancementRoutes");

// Import GitHub-Lite repository routes — Innovation feature
// Covers: File repository, commits, branches, issues, PRs, activity feed
const gitRepoRoutes = require("./routes/gitRepoRoutes");

// Import Faculty Evaluation routes — SRS §4.4
// Covers: Faculty evaluation with scarcity-based tier ranking
const facultyEvaluationRoutes = require("./routes/facultyEvaluationRoutes");

// Import Peer Ranking routes — SRS §4.5
// Covers: Peer group creation, trait-based surveys, forced ranking,
// aggregated results (individual rankings NEVER exposed)
const peerRankingRoutes = require("./routes/peerRankingRoutes");

// SRS §4.3 — Cross-Project Comparative Evaluation (hybrid model)
const comparativeRoutes = require("./routes/comparativeRoutes");

// SRS §4.1.5 — Zero-Score Reason Capture
const zeroScoreRoutes = require("./routes/zeroScoreRoutes");

// SRS §1.2 + §8.1 — Evaluation Cohort Orchestration & Peer Suggestions
const cohortRoutes = require("./routes/cohortRoutes");

// Session Planner — Track selection, team formation, faculty-student assignments
// Session Planner — Track selection, team formation, faculty-student assignments
const sessionPlannerRoutes = require("./routes/sessionPlannerRoutes");

// Faculty Scope — Governance for faculty evaluation scope
const facultyScopeRoutes = require("./routes/facultyScopeRoutes");

// SRS §4.1.4 — Rubric-Based Distribution
const rubricRoutes = require("./routes/rubricRoutes");

// Session Report — Admin session insights & evaluation reporting
const sessionReportRoutes = require("./routes/sessionReportRoutes");

// Appeals — Student score appeal workflow
const appealsRoutes = require("./routes/appealsRoutes");

// Alerts — Faculty anomaly detection alerts
const alertsRoutes = require("./routes/alertsRoutes");

// Admin Management — Session delete & credibility reset
const adminManagementRoutes = require("./routes/adminManagementRoutes");

// Import logger for HTTP request logging
const logger = require("./utils/logger");

// ============================================================
// Create the Express application instance
// This is the main application object that holds all middleware and routes
// ============================================================
const app = express();

// ============================================================
// TRUST PROXY — Required when running behind a reverse proxy
// Express uses this to correctly read X-Forwarded-For headers
// Essential for rate limiting by real client IP (not proxy IP)
// SET THIS based on your deployment: 1 for single proxy, 'loopback' for local
// ============================================================
app.set("trust proxy", 1);

// ============================================================
// MIDDLEWARE CHAIN — Order matters for security!
// Each middleware processes the request before passing to the next
// ============================================================

// 1. Security headers — set protective HTTP headers on EVERY response
// Must be first to ensure headers are set even on error responses
// Includes: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
app.use(securityHeaders());

// 1b. Permissions-Policy — restrict browser feature access
// Disables camera, microphone, geolocation, payment etc. that we don't need
app.use(permissionsPolicy());

// 2. CORS — restrict which origins can call our API
// Reads allowed origins from CORS_ORIGIN environment variable
// Supports multiple origins (comma-separated in env var)
app.use(
  cors({
    // Parse the comma-separated origin list from environment
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) return callback(null, true);

      // Parse allowed origins from env var
      const allowedOrigins = (
        process.env.CORS_ORIGIN || "http://localhost:3000"
      )
        .split(",")
        .map((o) => o.trim());

      // Check if the request origin is in the allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS blocked request from unauthorized origin", {
          origin,
        });
        callback(new Error("Not allowed by CORS"));
      }
    },
    // Allow credentials (cookies, authorization headers)
    credentials: true,
    // Allowed HTTP methods for cross-origin requests
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // Allowed request headers from the client
    // X-Display-Name carries the Google display name for person auto-creation
    allowedHeaders: ["Content-Type", "Authorization", "X-Display-Name"],
    // Cache preflight results for 1 hour to reduce OPTIONS requests
    maxAge: 3600,
  }),
);

// 3. Body parsing — parse JSON request bodies with size limit
// 5mb limit supports file content uploads for GitHub-Lite repository
// Only JSON content type is accepted (matches our API contract)
app.use(express.json({ limit: "5mb" }));

// 4. URL-encoded body parsing for form submissions
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

// 5. Request logging — log every incoming request for debugging
// Logs method, path, and IP for request tracing
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent")?.substring(0, 100),
  });
  next();
});

// 6. General rate limiter — applies to ALL routes
// 100 requests per 15 minutes per IP address
// Auth routes have additional stricter limits
app.use(generalLimiter);

// ============================================================
// API ROUTES — Mount route modules at their base paths
// Each route module handles its own sub-paths
// ============================================================

// Health check endpoint — used by monitoring and load balancers
// Returns 200 if the server is running and responsive
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Authentication routes — login, logout, profile, verify
// Base path: /api/auth
// Public endpoints: POST /api/auth/google/login
// Protected endpoints: POST /api/auth/logout, GET /api/auth/me, GET /api/auth/verify
app.use("/api/auth", authRoutes);

// User management routes — admin-only CRUD operations
// Base path: /api/users
// All endpoints require authentication + admin role
app.use("/api/users", userRoutes);

// ============================================================
// PEMM MODULE ROUTES — Entity modeling, projects, evaluations
// Mounts: /api/persons, /api/projects, /api/evaluations
// Also registers the PEMM entity error handler middleware
// Does NOT modify any existing routes above
// ============================================================
registerPEMMRoutes(app, { authMiddleware: pemmAuth });

// ============================================================
// PERSONALIZATION ROUTES — User dashboard personalization API
// Mounts: /api/personalization/dashboard, /api/personalization/cache/invalidate
// All routes require authentication (JWT via authenticate middleware)
// Does NOT modify any existing routes above
// ============================================================
app.use("/api/personalization", personalizationRoutes);

// ============================================================
// SCARCITY ROUTES — Scarcity-based evaluation and allocation API
// Mounts: /api/scarcity/sessions/*, /api/scarcity/sessions/:id/allocate
// All routes require authentication (JWT via authenticate middleware)
// Does NOT modify any existing routes above
// ============================================================
app.use("/api/scarcity", scarcityRoutes);

// ============================================================
// ANALYTICS ROUTES — SRS Analytics API
// Mounts: /api/analytics/growth/*, /api/analytics/vectors/*,
//         /api/analytics/peer-rankings/*, /api/analytics/faculty/*,
//         /api/analytics/intents/*
// All routes require authentication (JWT via authenticate middleware)
// Does NOT modify any existing routes above
// ============================================================
app.use("/api/analytics", analyticsRoutes);

// ============================================================
// PROJECT ENHANCEMENT ROUTES — SRS 4.1.1 & 4.1.2 API
// Mounts: /api/project-enhancements/projects/:projectId/members,
//         /api/project-enhancements/projects/:projectId/plans,
//         /api/project-enhancements/projects/:projectId/work-logs,
//         /api/project-enhancements/projects/:projectId/improvement
// All routes require authentication (JWT via authenticate middleware)
// Does NOT modify any existing routes above
// ============================================================
app.use("/api/project-enhancements", projectEnhancementRoutes);

// ============================================================
// GITHUB-LITE REPOSITORY ROUTES — Innovation Feature
// Mounts: /api/repos/:projectId/files, /api/repos/:projectId/commits,
//         /api/repos/:projectId/branches, /api/repos/:projectId/issues,
//         /api/repos/:projectId/pull-requests, /api/repos/:projectId/activity
// All routes require authentication (JWT via authenticate middleware)
// Does NOT modify any existing routes above
// ============================================================
app.use("/api/repos", gitRepoRoutes);

// ============================================================
// FACULTY EVALUATION ROUTES — SRS §4.4
// Students evaluate faculty using scarcity-based tier ranking.
// Routes: /api/faculty-evaluation/sessions, /sessions/:id/faculty,
//         /sessions/:id/save-draft, /sessions/:id/submit, /sessions/:id/results
// RULE: Only faculty who previously evaluated the student are eligible.
// ============================================================
app.use("/api/faculty-evaluation", facultyEvaluationRoutes);

// ============================================================
// PEER RANKING ROUTES — SRS §4.5
// Student-facing: Peer group creation, trait surveys, forced ranking.
// Routes: /api/peer-ranking/groups, /surveys, /surveys/:id/submit, etc.
// Privacy: Individual rankings NEVER exposed (SRS §4.5.3).
// ============================================================
app.use("/api/peer-ranking", peerRankingRoutes);

// ============================================================
// COMPARATIVE EVALUATION ROUTES — SRS §4.3
// Hybrid model: Admin creates rounds with criteria + project pool,
// Judges select 3-5 projects and allocate via matrix grid.
// Routes: /api/comparative/rounds, /sessions, /allocations, etc.
// ============================================================
app.use("/api/comparative", comparativeRoutes);

// ============================================================
// ZERO-SCORE REASON ROUTES — SRS §4.1.5
// Evaluator-provided zero-score classifications: scarcity_driven,
// below_expectation, insufficient_observation. Batch capture at
// submit time. Admin analytics endpoint.
// ============================================================
app.use("/api/zero-score", zeroScoreRoutes);

// ============================================================
// SRS §1.2 + §8.1 — EVALUATION COHORTS & PEER SUGGESTIONS
// Structured evaluation containers with fairness guarantees.
// Cohort CRUD, target/evaluator management, hybrid assignment,
// coverage tracking, alerts, and lightweight peer suggestions.
// ============================================================
app.use("/api/cohorts", cohortRoutes);

// ============================================================
// SESSION PLANNER — Track selection, team formation, session planning
// ============================================================
app.use("/api/session-planner", sessionPlannerRoutes);

// ============================================================
// FACULTY SCOPE — Governance for faculty evaluation scope
// ============================================================
app.use("/api/faculty-scope", facultyScopeRoutes);

// ============================================================
// RUBRIC ROUTES — SRS §4.1.4 Rubric-Based Distribution
// Lists, reads, and attaches evaluation rubrics to sessions.
// Write ops (attach) require admin role.
// ============================================================
app.use("/api/rubrics", rubricRoutes);

// ============================================================
// SESSION REPORT — Admin session insights & evaluation reporting
// ============================================================
app.use("/api/session-report", sessionReportRoutes);

// ============================================================
// APPEALS — Student score appeal workflow
// ============================================================
app.use("/api/appeals", appealsRoutes);

// ============================================================
// ALERTS — Faculty anomaly detection alerts
// ============================================================
app.use("/api/alerts", alertsRoutes);

// ============================================================
// ADMIN MANAGEMENT — Session delete & credibility reset
// ============================================================
app.use("/api/admin-manage", adminManagementRoutes);

// ============================================================
// 404 HANDLER — Catch unmatched routes
// Must be after all route definitions but before error handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER — Must be the LAST middleware
// Catches all errors from controllers and middleware
// Returns consistent error response format
// ============================================================
app.use(errorHandler);

// ============================================================
// Export the configured Express app for use in server.js
// The app is separate from the server for testing flexibility
// ============================================================
module.exports = app;
