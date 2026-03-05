// ============================================================
// ALERTS ROUTES — Faculty Anomaly Alert API
// ============================================================
// Mounted at: /api/alerts
// All admin-only
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
