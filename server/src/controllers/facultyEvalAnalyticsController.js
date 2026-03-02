// ============================================================
// FACULTY EVALUATION ANALYTICS CONTROLLER
// ============================================================
// SRS §4.4.3 — Exposure Normalization & Analytics endpoints
//
// Separate from facultyEvaluationController.js (core CRUD/submit)
// to follow single-responsibility pattern.
//
// Handles:
// - Normalization weight management (admin)
// - Faculty performance trends (faculty)
// - Department rankings (admin)
// - Response rate analysis (admin)
// - Session data export (admin)
// - Faculty assignment management (admin)
// - Scarcity validation (student, real-time)
// ============================================================

const { query } = require("../config/database");
const logger = require("../utils/logger");
const FacultyNormalizationService = require("../services/faculty-evaluation/FacultyNormalizationService");
const FacultyAnalyticsService = require("../services/faculty-evaluation/FacultyAnalyticsService");
const FacultyScarcityService = require("../services/faculty-evaluation/FacultyScarcityService");
const ExposureWhatIfService = require("../services/faculty-evaluation/ExposureWhatIfService");
const {
  broadcastChange,
  emitToAll,
  emitToRole,
  emitToPerson,
  EVENTS,
} = require("../socket");

// ============================================================
// NORMALIZATION WEIGHTS — Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/admin/normalization/weights
 */
async function getNormalizationWeights(req, res) {
  try {
    const weights = await FacultyNormalizationService.getActiveWeights();
    res.json({ success: true, data: weights });
  } catch (err) {
    logger.error("getNormalizationWeights failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/faculty-evaluation/admin/normalization/weights
 */
async function updateNormalizationWeights(req, res) {
  try {
    const newWeights = await FacultyNormalizationService.updateWeights(
      req.body,
    );
    broadcastChange("normalization_weights", "updated", {});
    res.json({ success: true, data: newWeights });
  } catch (err) {
    logger.error("updateNormalizationWeights failed", { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
}

// ============================================================
// NORMALIZATION EXPLANATION — Faculty
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/normalization/:facultyId
 */
async function getNormalizationExplanation(req, res) {
  try {
    const { sessionId, facultyId } = req.params;
    const explanation =
      await FacultyNormalizationService.getNormalizationExplanation(
        sessionId,
        facultyId,
      );
    if (!explanation) {
      return res.status(404).json({
        success: false,
        error: "Normalization data not found for this faculty in this session",
      });
    }
    res.json({ success: true, data: explanation });
  } catch (err) {
    logger.error("getNormalizationExplanation failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// FACULTY TREND — Faculty
// ============================================================

/**
 * GET /api/faculty-evaluation/faculty/trend
 * or GET /api/faculty-evaluation/faculty/:facultyId/trend (admin)
 */
async function getFacultyTrend(req, res) {
  try {
    // If admin queries another faculty, use params; otherwise use own personId
    const facultyId = req.params.facultyId || req.user.personId;
    const limit = parseInt(req.query.limit) || 6;

    const trend = await FacultyAnalyticsService.getFacultyTrend(
      facultyId,
      limit,
    );
    res.json({ success: true, data: trend });
  } catch (err) {
    logger.error("getFacultyTrend failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// NORMALIZED RESULTS — Faculty/Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/normalized-results
 */
async function getNormalizedResults(req, res) {
  try {
    const { sessionId } = req.params;

    const result = await query(
      `SELECT
         fns.faculty_id,
         p.display_name       AS faculty_name,
         p.department_code    AS department,
         fns.raw_average_score,
         fns.normalized_score,
         fns.student_count,
         fns.response_rate,
         fns.exposure_factor,
         fns.role_weight,
         fns.department_percentile
       FROM faculty_normalized_scores fns
       JOIN persons p ON fns.faculty_id = p.person_id
       WHERE fns.session_id = $1
       ORDER BY fns.normalized_score DESC`,
      [sessionId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error("getNormalizedResults failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// DEPARTMENT RANKINGS — Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/department-rankings
 */
async function getDepartmentRankings(req, res) {
  try {
    const { sessionId } = req.params;
    const { department } = req.query;

    if (!department) {
      return res.status(400).json({
        success: false,
        error: "department query parameter is required",
      });
    }

    const rankings = await FacultyAnalyticsService.getDepartmentRankings(
      sessionId,
      department,
    );
    res.json({ success: true, data: rankings });
  } catch (err) {
    logger.error("getDepartmentRankings failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// RESPONSE RATE — Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/response-rate
 */
async function getResponseRate(req, res) {
  try {
    const { sessionId } = req.params;
    const analysis =
      await FacultyAnalyticsService.getResponseRateAnalysis(sessionId);
    res.json({ success: true, data: analysis });
  } catch (err) {
    logger.error("getResponseRate failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// SESSION OVERVIEW — Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/overview
 */
async function getSessionOverview(req, res) {
  try {
    const { sessionId } = req.params;
    const overview =
      await FacultyAnalyticsService.getSessionOverview(sessionId);
    res.json({ success: true, data: overview });
  } catch (err) {
    logger.error("getSessionOverview failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// EXPORT DATA — Admin
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/export
 */
async function exportSessionData(req, res) {
  try {
    const { sessionId } = req.params;
    const data = await FacultyAnalyticsService.exportSessionData(sessionId);
    res.json({ success: true, data });
  } catch (err) {
    logger.error("exportSessionData failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// FACULTY ASSIGNMENTS — Admin
// ============================================================

/**
 * POST /api/faculty-evaluation/admin/sessions/:sessionId/assign
 * Body: { assignments: [{ facultyId, sessionsConducted, contactHours, roleType, department }] }
 */
async function assignFaculty(req, res) {
  try {
    const { sessionId } = req.params;
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: "assignments array is required and must not be empty",
      });
    }

    // Verify session exists
    const sessionResult = await query(
      `SELECT id, status FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    // Upsert each assignment
    const results = [];
    for (const asn of assignments) {
      const result = await query(
        `INSERT INTO faculty_evaluation_assignments
           (session_id, faculty_id, sessions_conducted, contact_hours, role_type, department)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (session_id, faculty_id) DO UPDATE SET
           sessions_conducted = EXCLUDED.sessions_conducted,
           contact_hours      = EXCLUDED.contact_hours,
           role_type          = EXCLUDED.role_type,
           department         = EXCLUDED.department,
           is_active          = true
         RETURNING *`,
        [
          sessionId,
          asn.facultyId,
          asn.sessionsConducted || 0,
          asn.contactHours || 0,
          asn.roleType || "lecture",
          asn.department || null,
        ],
      );
      results.push(result.rows[0]);
    }

    broadcastChange("faculty_assignment", "assigned", { sessionId });
    res.status(201).json({ success: true, data: results });
  } catch (err) {
    logger.error("assignFaculty failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/faculty-evaluation/admin/sessions/:sessionId/assignments
 */
async function getAssignments(req, res) {
  try {
    const { sessionId } = req.params;
    const result = await query(
      `SELECT fea.*, p.display_name AS faculty_name, p.department_code
       FROM faculty_evaluation_assignments fea
       LEFT JOIN persons p ON fea.faculty_id = p.person_id
       WHERE fea.session_id = $1 AND fea.is_active = true
       ORDER BY p.display_name ASC`,
      [sessionId],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error("getAssignments failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// RECALCULATE NORMALIZED SCORES — Admin trigger
// ============================================================

/**
 * POST /api/faculty-evaluation/admin/sessions/:sessionId/recalculate
 */
async function recalculateScores(req, res) {
  try {
    const { sessionId } = req.params;
    const results =
      await FacultyNormalizationService.recalculateSession(sessionId);
    broadcastChange("normalized_scores", "recalculated", { sessionId });
    res.json({
      success: true,
      data: {
        recalculated_count: results.length,
        scores: results,
      },
    });
  } catch (err) {
    logger.error("recalculateScores failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// SCARCITY VALIDATION — Student (real-time)
// ============================================================

/**
 * POST /api/faculty-evaluation/validate-allocation
 * Body: { allocations, scoringMode, facultyCount, allowAssignAll }
 */
async function validateAllocation(req, res) {
  try {
    const { allocations, scoringMode, facultyCount, allowAssignAll } = req.body;
    const result = FacultyScarcityService.validateAllocation(
      allocations || [],
      scoringMode,
      facultyCount,
      allowAssignAll,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("validateAllocation failed", { error: err.message });
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/faculty-evaluation/scarcity-education
 */
async function getScarcityEducation(req, res) {
  try {
    const education = FacultyScarcityService.getScarcityEducation();
    res.json({ success: true, data: education });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// WHAT-IF SIMULATION — Faculty (B-02)
// ============================================================

/**
 * POST /api/faculty-evaluation/what-if/simulate
 * Body: { facultyId, sessionId, weights: { sessions_weight, hours_weight, role_weight } }
 */
async function simulateWhatIf(req, res) {
  try {
    const { facultyId, sessionId, weights } = req.body;
    const fId = facultyId || req.user.personId;
    if (!sessionId || !weights) {
      return res
        .status(400)
        .json({ success: false, error: "sessionId and weights are required" });
    }
    const sum =
      parseFloat(weights.sessions_weight) +
      parseFloat(weights.hours_weight) +
      parseFloat(weights.role_weight);
    if (Math.abs(sum - 1.0) > 0.02) {
      return res
        .status(400)
        .json({ success: false, error: "Weights must sum to 1.0" });
    }
    const result = await ExposureWhatIfService.simulateCustomWeights(
      fId,
      sessionId,
      weights,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("simulateWhatIf failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/faculty-evaluation/what-if/save
 * Body: { facultyId, sessionId, scenarioName, weights }
 */
async function saveWhatIfScenario(req, res) {
  try {
    const { facultyId, sessionId, scenarioName, weights } = req.body;
    const fId = facultyId || req.user.personId;
    if (!sessionId || !scenarioName || !weights) {
      return res.status(400).json({
        success: false,
        error: "sessionId, scenarioName, and weights required",
      });
    }
    const scenario = await ExposureWhatIfService.saveScenario(
      fId,
      sessionId,
      scenarioName,
      weights,
      req.user.personId,
    );
    broadcastChange("what_if_scenario", "saved", { sessionId });
    res.status(201).json({ success: true, data: scenario });
  } catch (err) {
    logger.error("saveWhatIfScenario failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/faculty-evaluation/what-if/scenarios/:facultyId
 */
async function getWhatIfScenarios(req, res) {
  try {
    const fId = req.params.facultyId || req.user.personId;
    const sessionId = req.query.sessionId || null;
    const scenarios = await ExposureWhatIfService.getFacultyScenarios(
      fId,
      sessionId,
    );
    res.json({ success: true, data: scenarios });
  } catch (err) {
    logger.error("getWhatIfScenarios failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * DELETE /api/faculty-evaluation/what-if/scenarios/:scenarioId
 */
async function deleteWhatIfScenario(req, res) {
  try {
    const { scenarioId } = req.params;
    const deleted = await ExposureWhatIfService.deleteScenario(
      scenarioId,
      req.user.personId,
    );
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Scenario not found" });
    }
    broadcastChange("what_if_scenario", "deleted", { scenarioId });
    res.json({ success: true });
  } catch (err) {
    logger.error("deleteWhatIfScenario failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// WEIGHT HISTORY — Admin (B-02)
// ============================================================

/**
 * GET /api/faculty-evaluation/admin/normalization/weight-history
 */
async function getWeightHistory(req, res) {
  try {
    const history = await FacultyNormalizationService.getWeightHistory();
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error("getWeightHistory failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// AUDIT HISTORY — Faculty/Admin (B-02)
// ============================================================

/**
 * GET /api/faculty-evaluation/normalization/audit/:facultyId
 */
async function getAuditHistory(req, res) {
  try {
    const fId = req.params.facultyId || req.user.personId;
    const sessionId = req.query.sessionId || null;
    const limit = parseInt(req.query.limit) || 20;
    const history = await FacultyNormalizationService.getAuditHistory(
      fId,
      sessionId,
      limit,
    );
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error("getAuditHistory failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// DEPARTMENT BENCHMARKS — Admin (B-02)
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/benchmarks
 */
async function getDeptBenchmarks(req, res) {
  try {
    const { sessionId } = req.params;
    // Recalculate first, then return
    await FacultyNormalizationService.calculateDeptBenchmarks(sessionId);
    const benchmarks =
      await FacultyNormalizationService.getDeptBenchmarks(sessionId);
    res.json({ success: true, data: benchmarks });
  } catch (err) {
    logger.error("getDeptBenchmarks failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// ENHANCED TRANSPARENCY REPORT — Faculty (B-02)
// ============================================================

/**
 * GET /api/faculty-evaluation/sessions/:sessionId/transparency/:facultyId
 */
async function getEnhancedExplanation(req, res) {
  try {
    const { sessionId, facultyId } = req.params;
    const report =
      await FacultyNormalizationService.getEnhancedTransparencyReport(
        sessionId,
        facultyId,
      );
    if (!report) {
      return res
        .status(404)
        .json({ success: false, error: "No normalization data found" });
    }
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error("getEnhancedExplanation failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getNormalizationWeights,
  updateNormalizationWeights,
  getNormalizationExplanation,
  getFacultyTrend,
  getNormalizedResults,
  getDepartmentRankings,
  getResponseRate,
  getSessionOverview,
  exportSessionData,
  assignFaculty,
  getAssignments,
  recalculateScores,
  validateAllocation,
  getScarcityEducation,
  simulateWhatIf,
  saveWhatIfScenario,
  getWhatIfScenarios,
  deleteWhatIfScenario,
  getWeightHistory,
  getAuditHistory,
  getDeptBenchmarks,
  getEnhancedExplanation,
};
