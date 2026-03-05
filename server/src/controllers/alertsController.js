// ============================================================
// ALERTS CONTROLLER — Faculty Anomaly Alert Endpoints
// ============================================================
// GET    /api/alerts              — Admin: unacknowledged alerts
// GET    /api/alerts/session/:id  — Admin: alerts for a session
// POST   /api/alerts/:id/ack     — Admin: acknowledge alert
// POST   /api/alerts/detect/:id  — Admin: trigger detection for session
// ============================================================

const anomalyDetectionService = require("../services/anomalyDetectionService");
const logger = require("../utils/logger");

/**
 * GET /api/alerts — All unacknowledged alerts
 */
const getUnacknowledgedAlerts = async (req, res) => {
  try {
    const alerts = await anomalyDetectionService.getUnacknowledgedAlerts();
    return res.json({ success: true, data: alerts });
  } catch (err) {
    logger.error("getUnacknowledgedAlerts error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/alerts/session/:sessionId — Alerts for a specific session
 */
const getSessionAlerts = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const alerts = await anomalyDetectionService.getSessionAlerts(sessionId);
    return res.json({ success: true, data: alerts });
  } catch (err) {
    logger.error("getSessionAlerts error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/alerts/:alertId/ack — Acknowledge an alert
 */
const acknowledgeAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const acknowledgedBy = req.user.personId;
    const alert = await anomalyDetectionService.acknowledgeAlert(
      alertId,
      acknowledgedBy
    );
    if (!alert) {
      return res.status(404).json({ success: false, error: "Alert not found." });
    }
    return res.json({ success: true, data: alert });
  } catch (err) {
    logger.error("acknowledgeAlert error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/alerts/detect/:sessionId — Manually trigger anomaly detection
 */
const triggerDetection = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await anomalyDetectionService.detectAnomalies(sessionId);
    return res.json({
      success: true,
      message: `Detected ${result.alerts.length} anomalies.`,
      data: result.alerts,
    });
  } catch (err) {
    logger.error("triggerDetection error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getUnacknowledgedAlerts,
  getSessionAlerts,
  acknowledgeAlert,
  triggerDetection,
};
