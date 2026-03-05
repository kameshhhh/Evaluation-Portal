// ============================================================
// CREDIBILITY BANDS CONTROLLER — SRS-Compliant
// ============================================================
// SRS 5.3: "Statistical dilution only, no explicit punishment"
// SRS 7.2: "No raw ranking exposure, only bands"
//
// This controller exposes ONLY:
//   1. getCredibilityBands  — band counts for admin overview
//   2. recalculateAll       — admin-triggered full recalculation
//
// There are NO individual scores, NO alerts, NO monitoring,
// NO faculty dashboards, NO goals, NO recommendations, NO SSE.
// Credibility works silently — it only affects weighted averages.
// ============================================================

const { query } = require("../config/database");
const credibilityEngine = require("../services/credibility/CredibilityEngine");
const logger = require("../utils/logger");

// ============================================================
// GET /api/scarcity/credibility/bands
// Returns band distribution counts — admin only
// SRS 7.2: Only bands, no exact scores, no individual data
// ============================================================
const getCredibilityBands = async (req, res) => {
  try {
    // Count evaluators in each credibility band
    const result = await query(`
      SELECT
        credibility_band,
        COUNT(*)::int AS count
      FROM evaluator_credibility_profiles
      WHERE head_id IS NULL
      GROUP BY credibility_band
    `);

    const bands = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    result.rows.forEach((row) => {
      bands[row.credibility_band] = row.count;
    });

    const total = bands.HIGH + bands.MEDIUM + bands.LOW;

    res.json({
      success: true,
      data: {
        bands,
        total,
        // No exact scores, no individual data — SRS 7.2 compliant
        description:
          "Evaluators whose scores automatically receive higher or lower weight in final calculations.",
      },
    });
  } catch (error) {
    logger.error("Failed to get credibility bands", { error: error.message });
    res
      .status(500)
      .json({ success: false, error: "Failed to load credibility bands" });
  }
};

// ============================================================
// POST /api/scarcity/credibility/recalculate
// Admin-triggered full recalculation of all credibility scores
// ============================================================
const recalculateAll = async (req, res) => {
  try {
    const result = await credibilityEngine.batchRecalculate();
    res.json({
      success: true,
      message: "Credibility recalculation complete",
      data: {
        evaluatorsProcessed: result?.processed || 0,
      },
    });
  } catch (error) {
    logger.error("Failed to recalculate credibility", { error: error.message });
    res.status(500).json({ success: false, error: "Recalculation failed" });
  }
};

module.exports = {
  getCredibilityBands,
  recalculateAll,
};
