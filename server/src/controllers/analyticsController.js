// ============================================================
// ANALYTICS CONTROLLER — HTTP Interface for SRS Analytics API
// ============================================================
// Maps HTTP requests to analytics service method calls.
// Thin controller — all business logic lives in service classes.
//
// SERVICES INTEGRATED:
//   TemporalGrowthService           — SRS Section 6: Growth tracking
//   PersonVectorService             — SRS Section 7: Person vectors
//   PeerRankingSafeguardService     — SRS 4.5.3: Peer ranking safeguards
//   FacultyExposureNormalizationService — SRS 4.4.3: Faculty normalization
//   IntentAwareEvaluationService    — SRS 6.2: Intent modes
//
// SECURITY:
//   - All routes require authentication (via authenticate middleware)
//   - Admin routes require authorize('admin') middleware
//   - req.user is set by the authenticate middleware
//
// DOES NOT modify any existing controllers.
// ============================================================

"use strict";

const TemporalGrowthService = require("../services/analytics/TemporalGrowthService");
const PersonVectorService = require("../services/analytics/PersonVectorService");
const PeerRankingSafeguardService = require("../services/analytics/PeerRankingSafeguardService");
const FacultyExposureNormalizationService = require("../services/analytics/FacultyExposureNormalizationService");
const IntentAwareEvaluationService = require("../services/analytics/IntentAwareEvaluationService");
const logger = require("../utils/logger");

// ============================================================
// TEMPORAL GROWTH HANDLERS — SRS Section 6
// ============================================================

/**
 * GET /api/analytics/growth/:personId
 * Get growth history for a person (SRS 6: Temporal tracking)
 *
 * @param {Request} req — req.params.personId, req.query.limit
 * @param {Response} res — Growth trajectory data
 */
const getGrowthHistory = async (req, res) => {
  try {
    const { personId } = req.params;
    const { limit = 12 } = req.query;

    const history = await TemporalGrowthService.getGrowthHistory(personId, {
      limit: parseInt(limit),
    });

    res.json({ success: true, data: history });
  } catch (err) {
    logger.error("getGrowthHistory failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/growth/compute
 * Compute growth between two periods for a person (SRS 6)
 *
 * Body: { personId, fromPeriod, toPeriod }
 */
const computeGrowth = async (req, res) => {
  try {
    const { personId, fromPeriod, toPeriod } = req.body;

    if (!personId || !fromPeriod || !toPeriod) {
      return res.status(400).json({
        success: false,
        error: "personId, fromPeriod, and toPeriod are required",
      });
    }

    const growth = await TemporalGrowthService.computeGrowth(
      personId,
      fromPeriod,
      toPeriod,
    );

    res.json({ success: true, data: growth });
  } catch (err) {
    logger.error("computeGrowth failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/growth/batch/:sessionId
 * Compute batch growth for all targets in a session (admin)
 */
const computeBatchGrowth = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = await TemporalGrowthService.computeBatchGrowth(sessionId);
    res.json({ success: true, data: results });
  } catch (err) {
    logger.error("computeBatchGrowth failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// PERSON VECTOR HANDLERS — SRS Section 7
// ============================================================

/**
 * GET /api/analytics/vectors/:personId
 * Get the current person vector (SRS 7.2: for mentoring, not labeling)
 */
const getPersonVector = async (req, res) => {
  try {
    const { personId } = req.params;
    const vector = await PersonVectorService.getVector(personId);

    if (!vector) {
      return res.status(404).json({
        success: false,
        error: "Person vector not yet computed",
      });
    }

    res.json({ success: true, data: vector });
  } catch (err) {
    logger.error("getPersonVector failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/vectors/:personId/build
 * Build/rebuild person vector from all data sources (admin)
 */
const buildPersonVector = async (req, res) => {
  try {
    const { personId } = req.params;
    const vector = await PersonVectorService.buildVector(personId);
    res.json({ success: true, data: vector });
  } catch (err) {
    logger.error("buildPersonVector failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/vectors/batch
 * Build vectors for multiple people (admin)
 * Body: { personIds: string[] }
 */
const batchBuildVectors = async (req, res) => {
  try {
    const { personIds } = req.body;

    if (!personIds || !Array.isArray(personIds) || personIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "personIds array is required",
      });
    }

    const results = await PersonVectorService.batchBuild(personIds);
    res.json({ success: true, data: { computed: results.length, results } });
  } catch (err) {
    logger.error("batchBuildVectors failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/vectors/:personId/history
 * Get vector trajectory over time (SRS 7.2: trends only)
 */
const getVectorHistory = async (req, res) => {
  try {
    const { personId } = req.params;
    const { limit = 12 } = req.query;
    const history = await PersonVectorService.getVectorHistory(
      personId,
      parseInt(limit),
    );
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error("getVectorHistory failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/vectors/:personId/snapshot
 * Take an immutable vector snapshot (admin)
 * Body: { periodId, sessionId }
 */
const snapshotVector = async (req, res) => {
  try {
    const { personId } = req.params;
    const { periodId, sessionId } = req.body;
    const snapshot = await PersonVectorService.snapshot(
      personId,
      periodId,
      sessionId,
    );

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: "No current vector to snapshot",
      });
    }

    res.json({ success: true, data: snapshot });
  } catch (err) {
    logger.error("snapshotVector failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// PEER RANKING HANDLERS — SRS 4.5.3
// ============================================================

/**
 * POST /api/analytics/peer-rankings/surveys
 * Create a new peer ranking survey (admin)
 * Body: { sessionId, title, questions, participantIds, closesAt }
 */
const createPeerSurvey = async (req, res) => {
  try {
    const { sessionId, title, questions, participantIds, closesAt } = req.body;

    if (!sessionId || !title || !participantIds) {
      return res.status(400).json({
        success: false,
        error: "sessionId, title, and participantIds are required",
      });
    }

    const survey = await PeerRankingSafeguardService.createSurvey(sessionId, {
      title,
      questions: questions || [],
      participantIds,
      createdBy: req.user.userId,
      closesAt,
    });

    res.status(201).json({ success: true, data: survey });
  } catch (err) {
    logger.error("createPeerSurvey failed", { error: err.message });
    const status = err.message.includes("SRS 4.5.3") ? 422 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/peer-rankings/surveys/:surveyId/submit
 * Submit a peer ranking response (SRS 4.5.3: all validation enforced)
 * Body: { rankings: [{ questionIndex, rankings: [{ personId, rank }] }] }
 */
const submitPeerRanking = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { rankings } = req.body;

    if (!rankings || !Array.isArray(rankings)) {
      return res.status(400).json({
        success: false,
        error: "rankings array is required",
      });
    }

    // SRS 4.5.3: Service enforces no self-ranking, no equal ranking,
    // limited top positions, no duplicate submission
    const response = await PeerRankingSafeguardService.submitRanking(
      surveyId,
      req.user.userId,
      rankings,
    );

    res.status(201).json({ success: true, data: response });
  } catch (err) {
    logger.error("submitPeerRanking failed", { error: err.message });
    const status = err.message.includes("SRS 4.5.3")
      ? 422
      : err.message.includes("Duplicate")
        ? 409
        : 500;
    res.status(status).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/peer-rankings/surveys/:surveyId/aggregate
 * Aggregate survey results (admin) — SRS 4.5.3: anonymized output
 */
const aggregatePeerResults = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const result = await PeerRankingSafeguardService.aggregateResults(surveyId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("aggregatePeerResults failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/peer-rankings/surveys/:surveyId/detect-gaming
 * Run gaming detection algorithms (admin) — SRS 4.5.3
 */
const detectPeerGaming = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const result = await PeerRankingSafeguardService.detectGaming(surveyId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("detectPeerGaming failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/peer-rankings/surveys/:surveyId/results
 * Get anonymized aggregated results — SRS 4.5.3: no individual rankings
 */
const getPeerSurveyResults = async (req, res) => {
  try {
    const { surveyId } = req.params;
    const result = await PeerRankingSafeguardService.getSurveyResults(surveyId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("getPeerSurveyResults failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// FACULTY NORMALIZATION HANDLERS — SRS 4.4.3
// ============================================================

/**
 * POST /api/analytics/faculty/exposure
 * Log a faculty-student exposure event
 * Body: { facultyId, targetId, sessionId, roleType, contactHours, interactionType }
 */
const logFacultyExposure = async (req, res) => {
  try {
    const {
      facultyId,
      targetId,
      sessionId,
      roleType,
      contactHours,
      interactionType,
    } = req.body;

    if (!facultyId || !targetId) {
      return res.status(400).json({
        success: false,
        error: "facultyId and targetId are required",
      });
    }

    const record = await FacultyExposureNormalizationService.logExposure(
      facultyId,
      targetId,
      sessionId,
      { roleType, contactHours, interactionType },
    );

    res.status(201).json({ success: true, data: record });
  } catch (err) {
    logger.error("logFacultyExposure failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/analytics/faculty/normalize/:sessionId
 * Batch normalize all faculty scores in a session (admin)
 */
const batchNormalizeFaculty = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result =
      await FacultyExposureNormalizationService.batchNormalize(sessionId);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("batchNormalizeFaculty failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/faculty/:facultyId/profile
 * Get faculty exposure profile (admin)
 */
const getFacultyProfile = async (req, res) => {
  try {
    const { facultyId } = req.params;
    const profile =
      await FacultyExposureNormalizationService.getExposureProfile(facultyId);
    res.json({ success: true, data: profile });
  } catch (err) {
    logger.error("getFacultyProfile failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/faculty/exposure-weight
 * Compute exposure weight for a faculty-student pair
 * Query: ?facultyId=...&targetId=...
 */
const getExposureWeight = async (req, res) => {
  try {
    const { facultyId, targetId } = req.query;

    if (!facultyId || !targetId) {
      return res.status(400).json({
        success: false,
        error: "facultyId and targetId query params are required",
      });
    }

    const weight =
      await FacultyExposureNormalizationService.computeExposureWeight(
        facultyId,
        targetId,
      );
    res.json({ success: true, data: weight });
  } catch (err) {
    logger.error("getExposureWeight failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// INTENT-AWARE EVALUATION HANDLERS — SRS 6.2
// ============================================================

/**
 * GET /api/analytics/intents
 * List all available evaluation intent modes
 */
const listIntents = async (req, res) => {
  try {
    const intents = await IntentAwareEvaluationService.listIntents();
    res.json({ success: true, data: intents });
  } catch (err) {
    logger.error("listIntents failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/intents/:intentCode/config
 * Get weight configuration for a specific intent
 */
const getIntentConfig = async (req, res) => {
  try {
    const { intentCode } = req.params;
    const config =
      await IntentAwareEvaluationService.getIntentConfig(intentCode);
    res.json({ success: true, data: config });
  } catch (err) {
    logger.error("getIntentConfig failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/intents/session/:sessionId
 * Classify a session's evaluation intent
 */
const classifySessionIntent = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const classification =
      await IntentAwareEvaluationService.classifySessionIntent(sessionId);
    res.json({ success: true, data: classification });
  } catch (err) {
    logger.error("classifySessionIntent failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/analytics/intents/report/:targetId
 * Get intent-aware evaluation report for a person
 * Query: ?intentCode=growth&sessionId=...
 */
const getIntentReport = async (req, res) => {
  try {
    const { targetId } = req.params;
    const { intentCode = "comparative", sessionId } = req.query;

    const report = await IntentAwareEvaluationService.getIntentReport(
      targetId,
      intentCode,
      sessionId || null,
    );

    res.json({ success: true, data: report });
  } catch (err) {
    logger.error("getIntentReport failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// EXPORTS — All controller handlers
// ============================================================
module.exports = {
  // Temporal Growth
  getGrowthHistory,
  computeGrowth,
  computeBatchGrowth,
  // Person Vectors
  getPersonVector,
  buildPersonVector,
  batchBuildVectors,
  getVectorHistory,
  snapshotVector,
  // Peer Rankings
  createPeerSurvey,
  submitPeerRanking,
  aggregatePeerResults,
  detectPeerGaming,
  getPeerSurveyResults,
  // Faculty Normalization
  logFacultyExposure,
  batchNormalizeFaculty,
  getFacultyProfile,
  getExposureWeight,
  // Intent-Aware Evaluation
  listIntents,
  getIntentConfig,
  classifySessionIntent,
  getIntentReport,
};
