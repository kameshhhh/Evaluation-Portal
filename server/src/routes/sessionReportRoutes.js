// ============================================================
// SESSION REPORT ROUTES — Admin-only session insight endpoints
// ============================================================
// Mounts under /api/session-report
// All routes require authentication + admin role
// ============================================================

const express = require("express");
const router = express.Router();

// Auth middleware — same pattern as all other admin routes
const { authenticate, authorize } = require("../middleware/auth");

// Controller
const {
  listSessions,
  getSessionReport,
  downloadSessionReport,
} = require("../controllers/sessionReportController");

// ============================================================
// All routes: authenticate → authorize('admin')
// ============================================================

// GET /api/session-report/sessions?year=2026&month=3
// Returns filtered session list + available years for dropdown
router.get("/sessions", authenticate, authorize("admin"), listSessions);

// GET /api/session-report/sessions/:sessionId/report?page=1&pageSize=50&track=core
// Returns paginated evaluation report for a single session
router.get(
  "/sessions/:sessionId/report",
  authenticate,
  authorize("admin"),
  getSessionReport
);

// GET /api/session-report/sessions/:sessionId/download?format=csv&track=core
// Download session report as CSV (optionally filtered by track)
router.get(
  "/sessions/:sessionId/download",
  authenticate,
  authorize("admin"),
  downloadSessionReport
);

module.exports = router;
