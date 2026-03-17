// ============================================================
// ALERTS ROUTES — Faculty Anomaly Alert API
// ============================================================
// Mounted at: /api/alerts
// Admin endpoints: view all, acknowledge, detect
// Faculty endpoints: view own alerts (read-only)
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getUnacknowledgedAlerts,
  getSessionAlerts,
  acknowledgeAlert,
  triggerDetection,
} = require("../controllers/alertsController");

// ── FACULTY ROUTES (Read-only) ──

// Faculty: get own alerts
router.get("/my", authenticate, authorize("faculty"), async (req, res) => {
  try {
    const facultyId = req.user.personId;
    const { query } = require("../config/database");

    const result = await query(
      `SELECT fa.*
       FROM faculty_alerts fa
       WHERE fa.faculty_id = $1
       ORDER BY
         CASE fa.severity WHEN 'critical' THEN 0 ELSE 1 END,
         fa.created_at DESC`,
      [facultyId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    const logger = require("../utils/logger");
    logger.error("getFacultyAlerts error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN ROUTES (Full control) ──

// All unacknowledged alerts
router.get("/", authenticate, authorize("admin"), getUnacknowledgedAlerts);

// Alerts for a specific session
router.get(
  "/session/:sessionId",
  authenticate,
  authorize("admin"),
  getSessionAlerts
);

// Acknowledge an alert
router.post(
  "/:alertId/ack",
  authenticate,
  authorize("admin"),
  acknowledgeAlert
);

// Manually trigger anomaly detection for a session
router.post(
  "/detect/:sessionId",
  authenticate,
  authorize("admin"),
  triggerDetection
);

module.exports = router;
