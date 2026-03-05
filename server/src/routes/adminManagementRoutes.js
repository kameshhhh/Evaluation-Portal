// ============================================================
// ADMIN MANAGEMENT ROUTES — Session Delete & Credibility Reset
// ============================================================
// Mounts under /api/admin-manage
// All routes require authentication + admin role
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  listAllSessions,
  deleteSession,
  listFacultyCredibility,
  resetCredibility,
} = require("../controllers/adminManagementController");

// GET  /api/admin-manage/sessions                — List all sessions
router.get("/sessions", authenticate, authorize("admin"), listAllSessions);

// DELETE /api/admin-manage/sessions/:sessionId   — Delete a session
router.delete("/sessions/:sessionId", authenticate, authorize("admin"), deleteSession);

// GET  /api/admin-manage/credibility/faculty     — List faculty + credibility
router.get("/credibility/faculty", authenticate, authorize("admin"), listFacultyCredibility);

// POST /api/admin-manage/credibility/reset       — Reset credibility (selected or all)
router.post("/credibility/reset", authenticate, authorize("admin"), resetCredibility);

module.exports = router;
