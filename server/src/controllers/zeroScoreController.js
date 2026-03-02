// ============================================================
// ZERO SCORE REASON CONTROLLER — HTTP Interface
// ============================================================
// Thin controller layer for zero-score reason capture.
// Delegates all logic to ZeroScoreReasonService.
// ============================================================

const {
  ZeroScoreReasonService,
  CLASSIFICATION_LABELS,
  VALID_CLASSIFICATIONS,
} = require("../services/ZeroScoreReasonService");
const { broadcastChange } = require("../socket");

// ----------------------------------------------------------
// recordReasons — POST /api/zero-score/reasons
// ----------------------------------------------------------
const recordReasons = async (req, res) => {
  try {
    const { evaluationType, sessionId, evaluatorId, reasons } = req.body;

    if (!evaluationType || !sessionId || !evaluatorId) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: evaluationType, sessionId, evaluatorId",
      });
    }

    if (!reasons || !Array.isArray(reasons)) {
      return res.status(400).json({
        success: false,
        error: "reasons must be an array",
      });
    }

    // Validate each reason has required fields
    for (const reason of reasons) {
      if (!reason.targetId || !reason.classification) {
        return res.status(400).json({
          success: false,
          error: "Each reason must have targetId and classification",
        });
      }

      if (!VALID_CLASSIFICATIONS.includes(reason.classification)) {
        return res.status(400).json({
          success: false,
          error: `Invalid classification: ${reason.classification}. Valid: ${VALID_CLASSIFICATIONS.join(", ")}`,
        });
      }
    }

    const result = await ZeroScoreReasonService.recordReasons({
      evaluationType,
      sessionId,
      evaluatorId,
      reasons,
    });

    broadcastChange("zero_score", "record_reasons", {
      evaluationType,
      sessionId,
      evaluatorId,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getSessionReasons — GET /api/zero-score/session/:sessionId
// ----------------------------------------------------------
const getSessionReasons = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const reasons =
      await ZeroScoreReasonService.getReasonsForSession(sessionId);
    return res.json({ success: true, data: reasons });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getEvaluatorPatterns — GET /api/zero-score/evaluator/:evaluatorId/patterns
// ----------------------------------------------------------
const getEvaluatorPatterns = async (req, res) => {
  try {
    const { evaluatorId } = req.params;
    const patterns =
      await ZeroScoreReasonService.getEvaluatorPatterns(evaluatorId);
    return res.json({ success: true, data: patterns });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getTargetPatterns — GET /api/zero-score/target/:targetId/patterns
// ----------------------------------------------------------
const getTargetPatterns = async (req, res) => {
  try {
    const { targetId } = req.params;
    const patterns = await ZeroScoreReasonService.getTargetPatterns(targetId);
    return res.json({ success: true, data: patterns });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getAggregateAnalytics — GET /api/zero-score/analytics
// ----------------------------------------------------------
const getAggregateAnalytics = async (req, res) => {
  try {
    const { evaluationType, dateFrom, dateTo } = req.query;

    const analytics = await ZeroScoreReasonService.getAggregateAnalytics({
      evaluationType: evaluationType || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    });

    return res.json({ success: true, data: analytics });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getClassifications — GET /api/zero-score/classifications
// ----------------------------------------------------------
const getClassifications = async (req, res) => {
  return res.json({
    success: true,
    data: CLASSIFICATION_LABELS,
  });
};

// ----------------------------------------------------------
// suggestDefault — GET /api/zero-score/suggest/:evaluatorId
// ----------------------------------------------------------
const suggestDefault = async (req, res) => {
  try {
    const { evaluatorId } = req.params;
    const { evaluationType } = req.query;

    const suggestion = await ZeroScoreReasonService.suggestDefault(
      evaluatorId,
      evaluationType || "scarcity",
    );

    return res.json({ success: true, data: { suggestion } });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getEnhancedAnalytics — GET /api/zero-score/analytics/enhanced
// SRS §4.1.5, §5.3: Full dashboard data with anomalies & collusion
// ----------------------------------------------------------
const getEnhancedAnalytics = async (req, res) => {
  try {
    const { evaluationType, dateFrom, dateTo } = req.query;

    const analytics = await ZeroScoreReasonService.getEnhancedAnalytics({
      evaluationType: evaluationType || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    });

    return res.json({ success: true, data: analytics });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getAnomalies — GET /api/zero-score/anomalies
// SRS §4.1.5: Detect lazy evaluation and harsh patterns
// ----------------------------------------------------------
const getAnomalies = async (req, res) => {
  try {
    const anomalies = await ZeroScoreReasonService.getAnomalies();
    return res.json({ success: true, data: anomalies });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// getCollusionPatterns — GET /api/zero-score/collusion
// SRS §5.3: Anti-Collusion Behavior detection
// ----------------------------------------------------------
const getCollusionPatterns = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const patterns = await ZeroScoreReasonService.detectCollusionPatterns({
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    });

    return res.json({ success: true, data: patterns });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// ----------------------------------------------------------
// exportData — GET /api/zero-score/export
// SRS §8.2: Export for aggregate analytics (anonymized)
// ----------------------------------------------------------
const exportData = async (req, res) => {
  try {
    const { sessionId, evaluatorId, classification, dateFrom, dateTo, format } =
      req.query;

    const data = await ZeroScoreReasonService.exportData({
      sessionId: sessionId || null,
      evaluatorId: evaluatorId || null,
      classification: classification || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    });

    if (format === "csv") {
      // Convert to CSV format
      if (data.length === 0) {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="zero-scores-export.csv"',
        );
        return res.send("No data available");
      }

      const headers = Object.keys(data[0]).join(",");
      const rows = data.map((row) =>
        Object.values(row)
          .map((v) => `"${v === null ? "" : v}"`)
          .join(","),
      );
      const csv = [headers, ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="zero-scores-export-${new Date().toISOString().split("T")[0]}.csv"`,
      );
      return res.send(csv);
    } else {
      // JSON format
      return res.json({ success: true, data });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

module.exports = {
  recordReasons,
  getSessionReasons,
  getEvaluatorPatterns,
  getTargetPatterns,
  getAggregateAnalytics,
  getClassifications,
  suggestDefault,
  getEnhancedAnalytics,
  getAnomalies,
  getCollusionPatterns,
  exportData,
};
