// ============================================================
// COHORT CONTROLLER — HTTP Handlers for Cohort Orchestration
// ============================================================
// Thin controller layer: extract params → call service → return JSON.
// Pattern matches existing controllers (scarcityController, etc.)
//
// ENDPOINTS (all require authentication):
//
//  ADMIN ENDPOINTS:
//   POST   /api/cohorts                           → Create cohort
//   GET    /api/cohorts                           → List cohorts
//   GET    /api/cohorts/:cohortId                 → Get cohort detail
//   PUT    /api/cohorts/:cohortId                 → Update cohort config
//   POST   /api/cohorts/:cohortId/activate        → Activate cohort
//   POST   /api/cohorts/:cohortId/complete        → Complete cohort
//
//  TARGET MANAGEMENT:
//   POST   /api/cohorts/:cohortId/targets         → Add targets
//   GET    /api/cohorts/:cohortId/targets         → List targets
//   DELETE /api/cohorts/:cohortId/targets/:targetId → Remove target
//   POST   /api/cohorts/:cohortId/targets/auto    → Auto-populate targets
//
//  EVALUATOR MANAGEMENT:
//   POST   /api/cohorts/:cohortId/evaluators      → Add evaluators
//   GET    /api/cohorts/:cohortId/evaluators      → List evaluators
//   DELETE /api/cohorts/:cohortId/evaluators/:evalId → Remove evaluator
//   POST   /api/cohorts/:cohortId/evaluators/auto → Auto-populate evaluators
//
//  ASSIGNMENT ENGINE:
//   POST   /api/cohorts/:cohortId/assignments/generate → Generate fair assignments
//   GET    /api/cohorts/:cohortId/assignments          → List assignments
//   PUT    /api/cohorts/:cohortId/assignments/:id/override → Admin override
//
//  COVERAGE & ALERTS:
//   GET    /api/cohorts/:cohortId/coverage         → Coverage dashboard
//   POST   /api/cohorts/:cohortId/alerts/detect    → Detect gaps
//   GET    /api/cohorts/:cohortId/alerts           → List alerts
//   PUT    /api/cohorts/alerts/:alertId/acknowledge → Acknowledge alert
//   PUT    /api/cohorts/alerts/:alertId/resolve     → Resolve alert
//
//  EVALUATOR VIEW:
//   GET    /api/cohorts/my-assignments             → My active assignments
//
//  PEER SUGGESTIONS:
//   GET    /api/cohorts/peer-suggestions           → Get suggestions for student
//   POST   /api/cohorts/peer-suggestions/refresh   → Admin: refresh all caches
// ============================================================

const CohortOrchestrationService = require("../services/CohortOrchestrationService");
const PeerSuggestionService = require("../services/PeerSuggestionService");
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ==========================================================
// COHORT CRUD
// ==========================================================

const createCohort = async (req, res, next) => {
  try {
    const cohort = await CohortOrchestrationService.createCohort({
      ...req.body,
      createdBy: req.user.personId,
    });
    broadcastChange("cohort", "created", { cohortId: cohort.cohort_id });
    res.status(201).json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

const listCohorts = async (req, res, next) => {
  try {
    const { status, cohortType, limit, offset } = req.query;
    const cohorts = await CohortOrchestrationService.listCohorts({
      status,
      cohortType,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    res.json({ success: true, data: cohorts });
  } catch (err) {
    next(err);
  }
};

const getCohort = async (req, res, next) => {
  try {
    const cohort = await CohortOrchestrationService.getCohort(
      req.params.cohortId,
    );
    if (!cohort) {
      return res
        .status(404)
        .json({ success: false, error: "Cohort not found" });
    }
    res.json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

const updateCohort = async (req, res, next) => {
  try {
    const cohort = await CohortOrchestrationService.updateCohort(
      req.params.cohortId,
      req.body,
    );
    broadcastChange("cohort", "updated", { cohortId: req.params.cohortId });
    res.json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

const autoSetupCohort = async (req, res, next) => {
  try {
    const summary = await CohortOrchestrationService.autoSetup(
      req.params.cohortId,
    );
    broadcastChange("cohort", "auto_setup", { cohortId: req.params.cohortId });
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

const activateCohort = async (req, res, next) => {
  try {
    const cohort = await CohortOrchestrationService.activateCohort(
      req.params.cohortId,
    );
    broadcastChange("cohort", "activated", { cohortId: req.params.cohortId });
    res.json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

const completeCohort = async (req, res, next) => {
  try {
    const cohort = await CohortOrchestrationService.completeCohort(
      req.params.cohortId,
    );
    broadcastChange("cohort", "completed", { cohortId: req.params.cohortId });
    res.json({ success: true, data: cohort });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// TARGET MANAGEMENT
// ==========================================================

const addTargets = async (req, res, next) => {
  try {
    const { targets } = req.body;
    const result = await CohortOrchestrationService.addTargets(
      req.params.cohortId,
      targets,
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getTargets = async (req, res, next) => {
  try {
    const targets = await CohortOrchestrationService.getTargets(
      req.params.cohortId,
    );
    res.json({ success: true, data: targets });
  } catch (err) {
    next(err);
  }
};

const removeTarget = async (req, res, next) => {
  try {
    await CohortOrchestrationService.removeTarget(
      req.params.cohortId,
      req.params.targetId,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const autoPopulateTargets = async (req, res, next) => {
  try {
    const targets = await CohortOrchestrationService.autoPopulateTargets(
      req.params.cohortId,
    );
    res.json({ success: true, data: targets, count: targets.length });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// EVALUATOR MANAGEMENT
// ==========================================================

const addEvaluators = async (req, res, next) => {
  try {
    const { evaluators } = req.body;
    const result = await CohortOrchestrationService.addEvaluators(
      req.params.cohortId,
      evaluators,
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getEvaluators = async (req, res, next) => {
  try {
    const evaluators = await CohortOrchestrationService.getEvaluators(
      req.params.cohortId,
    );
    res.json({ success: true, data: evaluators });
  } catch (err) {
    next(err);
  }
};

const removeEvaluator = async (req, res, next) => {
  try {
    await CohortOrchestrationService.removeEvaluator(
      req.params.cohortId,
      req.params.evaluatorId,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const autoPopulateEvaluators = async (req, res, next) => {
  try {
    const evaluators = await CohortOrchestrationService.autoPopulateEvaluators(
      req.params.cohortId,
    );
    res.json({ success: true, data: evaluators, count: evaluators.length });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// ASSIGNMENT ENGINE
// ==========================================================

const generateAssignments = async (req, res, next) => {
  try {
    const result = await CohortOrchestrationService.generateAssignments(
      req.params.cohortId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getAssignments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const assignments = await CohortOrchestrationService.getAssignments(
      req.params.cohortId,
      { status },
    );
    res.json({ success: true, data: assignments });
  } catch (err) {
    next(err);
  }
};

const overrideAssignment = async (req, res, next) => {
  try {
    const { newEvaluatorId, reason } = req.body;
    const assignment = await CohortOrchestrationService.overrideAssignment(
      req.params.assignmentId,
      newEvaluatorId,
      reason,
      req.user.personId,
    );
    res.json({ success: true, data: assignment });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// COVERAGE & ALERTS
// ==========================================================

const getCoverageDashboard = async (req, res, next) => {
  try {
    const data = await CohortOrchestrationService.getCoverageDashboard(
      req.params.cohortId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const detectGaps = async (req, res, next) => {
  try {
    const alerts = await CohortOrchestrationService.detectGapsAndAlert(
      req.params.cohortId,
    );
    res.json({ success: true, data: alerts, newAlerts: alerts.length });
  } catch (err) {
    next(err);
  }
};

const getAlerts = async (req, res, next) => {
  try {
    const { all } = req.query;
    const alerts =
      all === "true"
        ? await CohortOrchestrationService.getAllAlerts(req.params.cohortId)
        : await CohortOrchestrationService.getActiveAlerts(req.params.cohortId);
    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
};

const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await CohortOrchestrationService.acknowledgeAlert(
      req.params.alertId,
      req.user.personId,
    );
    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alert not found or already handled" });
    }
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
};

const resolveAlert = async (req, res, next) => {
  try {
    const { notes } = req.body;
    const alert = await CohortOrchestrationService.resolveAlert(
      req.params.alertId,
      req.user.personId,
      notes,
    );
    if (!alert) {
      return res
        .status(404)
        .json({ success: false, error: "Alert not found or already resolved" });
    }
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// EVALUATOR VIEW
// ==========================================================

const getMyAssignments = async (req, res, next) => {
  try {
    const assignments = await CohortOrchestrationService.getMyAssignments(
      req.user.personId,
    );
    res.json({ success: true, data: assignments });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// START EVALUATION FROM ASSIGNMENT
// ==========================================================

const startEvaluationForAssignment = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const result =
      await CohortOrchestrationService.startEvaluationForAssignment(
        assignmentId,
        req.user.personId,
      );
    res.status(result.alreadyStarted ? 200 : 201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// ==========================================================
// PEER SUGGESTIONS
// ==========================================================

const getPeerSuggestions = async (req, res, next) => {
  try {
    const { limit, department, cohortId } = req.query;
    const suggestions = await PeerSuggestionService.getSuggestions(
      req.user.personId,
      {
        limit: limit ? parseInt(limit) : 12,
        department,
        cohortId,
      },
    );
    res.json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
};

const refreshPeerSuggestions = async (req, res, next) => {
  try {
    const result = await PeerSuggestionService.refreshAllSuggestions();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createCohort,
  listCohorts,
  getCohort,
  updateCohort,
  autoSetupCohort,
  activateCohort,
  completeCohort,
  addTargets,
  getTargets,
  removeTarget,
  autoPopulateTargets,
  addEvaluators,
  getEvaluators,
  removeEvaluator,
  autoPopulateEvaluators,
  generateAssignments,
  getAssignments,
  overrideAssignment,
  getCoverageDashboard,
  detectGaps,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getMyAssignments,
  startEvaluationForAssignment,
  getPeerSuggestions,
  refreshPeerSuggestions,
};
