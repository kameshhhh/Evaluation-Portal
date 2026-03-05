// ============================================================
// CREDIBILITY CONTROLLER — HTTP Interface for Credibility API
// ============================================================
// Maps HTTP requests to CredibilityEngine and WeightedAggregation
// service method calls.
// Thin controller — all business logic lives in services.
//
// ROUTES HANDLED:
//   POST /api/scarcity/sessions/:sessionId/credibility/process  → Process session credibility
//   GET  /api/scarcity/sessions/:sessionId/credibility/weighted → Get weighted results
//   GET  /api/scarcity/credibility/profiles                     → List all profiles (admin)
//   GET  /api/scarcity/credibility/profiles/:evaluatorId        → Get evaluator profile
//   POST /api/scarcity/credibility/recalculate                  → Batch recalc (admin)
//   POST /api/scarcity/credibility/queue/process                → Process queue (admin)
//   GET  /api/scarcity/credibility/config                       → Get config (admin)
//   PUT  /api/scarcity/credibility/config/:key                  → Update config (admin)
//
// SECURITY:
//   - All routes require authentication (JWT via authenticate middleware)
//   - Admin-only routes use authorize("admin") middleware
// ============================================================

"use strict";

// Import the CredibilityEngine — main orchestrator (singleton)
const credibilityEngine = require("../services/credibility/CredibilityEngine");

// Import WeightedAggregationService (singleton)
const weightedAggregation = require("../services/credibility/WeightedAggregationService");

// Import CredibilityRepository for direct data access
const CredibilityRepository = require("../services/credibility/storage/CredibilityRepository");

// Import logger for request tracking
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// POST /api/scarcity/sessions/:sessionId/credibility/process
// ============================================================
/**
 * Process credibility signals for a session.
 * Runs the full credibility pipeline: analyze → compose → smooth.
 * Also computes weighted aggregation results.
 *
 * Requires admin role.
 *
 * @param {Request} req - Express request (req.user set by auth middleware)
 * @param {Response} res - Express response
 */
const processSessionCredibility = async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info("CredibilityController: Process session credibility request", {
      sessionId,
      userId: req.user.userId,
    });

    // 1. Run the credibility engine pipeline
    const engineResult = await credibilityEngine.processSession(sessionId);

    // 2. Compute weighted aggregation results
    const weightedResult =
      await weightedAggregation.computeWeightedResults(sessionId);

    broadcastChange("credibility", "process_session", { sessionId });
    res.json({
      success: true,
      data: {
        credibility: engineResult,
        weightedAggregation: weightedResult.summary,
      },
      message: `Credibility processed for ${engineResult.evaluators_processed} evaluators`,
    });
  } catch (error) {
    logger.error("CredibilityController: Process session failed", {
      sessionId: req.params.sessionId,
      error: error.message,
      code: error.code,
    });

    const statusCode =
      error.code === "INVALID_SESSION_STATUS"
        ? 400
        : error.code === "SESSION_NOT_FOUND"
          ? 404
          : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || "CREDIBILITY_ERROR",
    });
  }
};

// ============================================================
// GET /api/scarcity/sessions/:sessionId/credibility/weighted
// ============================================================
/**
 * Get credibility-weighted aggregation results for a session.
 * Compares weighted vs raw means.
 *
 * Query params:
 *   ?headId=<UUID> — filter by evaluation head
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getWeightedResults = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { headId } = req.query;

    const results = await weightedAggregation.getSessionWeightedResults(
      sessionId,
      headId || null,
    );

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        results,
        count: results.length,
      },
    });
  } catch (error) {
    logger.error("CredibilityController: Get weighted results failed", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/credibility/profiles
// ============================================================
/**
 * List all evaluator credibility profiles.
 * Admin-only endpoint for the credibility dashboard.
 *
 * Query params:
 *   ?band=HIGH|MEDIUM|LOW — filter by credibility band
 *   ?limit=100 — max results
 *   ?offset=0 — pagination offset
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getCredibilityProfiles = async (req, res) => {
  try {
    const { band, limit, offset } = req.query;

    const profiles = await CredibilityRepository.getAllProfiles({
      band: band || undefined,
      globalOnly: true, // Only show global profiles in admin listing
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
    });

    res.json({
      success: true,
      data: {
        profiles,
        count: profiles.length,
        filters: { band: band || "all" },
      },
    });
  } catch (error) {
    logger.error("CredibilityController: Get profiles failed", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/credibility/profiles/:evaluatorId
// ============================================================
/**
 * Get a single evaluator's credibility profile + history.
 * Faculty can view their own profile; admins can view any.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getEvaluatorProfile = async (req, res) => {
  try {
    const { evaluatorId } = req.params;

    // Authorization check: faculty can only view their own profile
    const isAdmin = req.user?.role === "admin" || req.user?.is_admin;
    const isOwnProfile = req.user?.personId === evaluatorId;

    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({
        success: false,
        error: "You can only view your own credibility profile",
        code: "FORBIDDEN",
      });
    }

    // Check judge_credibility_metrics FIRST (session planner pipeline)
    // then fall back to evaluator_credibility_profiles (old scarcity pipeline)
    const { pool } = require("../config/database");
    const jcmRes = await pool.query(
      `SELECT * FROM judge_credibility_metrics WHERE evaluator_id = $1`,
      [evaluatorId]
    );

    const [oldProfile, history, weight] = await Promise.all([
      CredibilityRepository.getEvaluatorProfile(evaluatorId),
      CredibilityRepository.getHistoricalSignals(evaluatorId, null, 20),
      CredibilityRepository.getEvaluatorWeight(evaluatorId),
    ]);

    // Prefer judge_credibility_metrics if it has data (session planner pipeline)
    const jcm = jcmRes.rows[0];
    let profile;

    if (jcm) {
      // Map judge_credibility_metrics to the same response shape
      // After reset: display_score=NULL, credibility_score=1.0, band='NEW'
      // For NEW band with NULL display_score → return 1.0 (same as brand-new default)
      const displayScore = jcm.display_score != null
        ? jcm.display_score
        : (jcm.credibility_band === 'NEW' ? 1.0 : jcm.credibility_score / 2.0);
      profile = {
        evaluator_id: jcm.evaluator_id,
        credibility_score: displayScore,
        credibility_band: jcm.credibility_band || "MEDIUM",
        alignment_component: jcm.alignment_score,
        last_alignment_score: jcm.alignment_score,
        stability_component: jcm.stability_score,
        discipline_component: jcm.discipline_score,
        mean_pool_usage: jcm.discipline_score,
        session_count: jcm.participation_count || 0,
        updated_at: jcm.last_updated,
      };

      // Build history signals from jcm.history JSONB
      const jcmHistory = (jcm.history || []).map((h) => ({
        composite_score: h.composite ?? h.displayScore / 100,
        alignment_score: h.alignment_score,
        stability_score: h.stability_score,
        discipline_score: h.discipline_score,
        created_at: h.timestamp,
        session_id: h.sessionId,
      }));

      return res.json({
        success: true,
        data: {
          evaluator_id: evaluatorId,
          profile,
          current_weight: jcm.credibility_score,
          history: {
            signals: jcmHistory,
            session_count: jcmHistory.length,
          },
        },
      });
    }

    // Fall back to old evaluator_credibility_profiles table
    if (!oldProfile) {
      return res.json({
        success: true,
        data: {
          evaluator_id: evaluatorId,
          profile: {
            evaluator_id: evaluatorId,
            credibility_score: 1.0,
            credibility_band: "NEW",
            alignment_component: 1.0,
            stability_component: 1.0,
            discipline_component: 1.0,
            session_count: 0,
            updated_at: new Date().toISOString()
          },
          current_weight: weight?.credibility_weight || 1.0,
          history: {
            signals: [],
            session_count: 0,
          },
          message: "New evaluator profile (default initialized)",
        },
      });
    }

    res.json({
      success: true,
      data: {
        evaluator_id: evaluatorId,
        profile: oldProfile,
        current_weight: weight?.credibility_weight || 1.0,
        history: {
          signals: history,
          session_count: history.length,
        },
      },
    });
  } catch (error) {
    logger.error("CredibilityController: Get evaluator profile failed", {
      evaluatorId: req.params.evaluatorId,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// POST /api/scarcity/credibility/recalculate
// ============================================================
/**
 * Batch recalculate all credibility profiles.
 * Admin-only, expensive operation.
 * Re-processes all historical sessions in chronological order.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const batchRecalculate = async (req, res) => {
  try {
    logger.info("CredibilityController: Batch recalculate requested", {
      userId: req.user.userId,
    });

    const result = await credibilityEngine.batchRecalculate();

    broadcastChange("credibility", "batch_recalculate", {});
    res.json({
      success: true,
      data: result,
      message: `Recalculated ${result.sessions_recalculated} sessions`,
    });
  } catch (error) {
    logger.error("CredibilityController: Batch recalculate failed", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// POST /api/scarcity/credibility/queue/process
// ============================================================
/**
 * Process all unprocessed sessions in the credibility queue.
 * Admin-only endpoint.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const processQueue = async (req, res) => {
  try {
    logger.info("CredibilityController: Process queue requested", {
      userId: req.user.userId,
    });

    const result = await credibilityEngine.processQueue();

    broadcastChange("credibility", "process_queue", {});
    res.json({
      success: true,
      data: result,
      message: `Processed ${result.sessions_processed} sessions from queue`,
    });
  } catch (error) {
    logger.error("CredibilityController: Process queue failed", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// GET /api/scarcity/credibility/config
// ============================================================
/**
 * Get current credibility configuration.
 * Admin-only endpoint.
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const getCredibilityConfig = async (req, res) => {
  try {
    const config = await CredibilityRepository.getConfiguration(true); // Force refresh

    res.json({
      success: true,
      data: { config },
    });
  } catch (error) {
    logger.error("CredibilityController: Get config failed", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// PUT /api/scarcity/credibility/config/:key
// ============================================================
/**
 * Update a single credibility configuration value.
 * Admin-only endpoint.
 *
 * Body: { value: <object> }
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
const updateCredibilityConfig = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({
        success: false,
        error: "Missing 'value' in request body",
      });
    }

    const updated = await CredibilityRepository.updateConfiguration(key, value);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: `Configuration key '${key}' not found`,
      });
    }

    logger.info("CredibilityController: Config updated", {
      key,
      userId: req.user.userId,
    });

    broadcastChange("credibility", "update_config", { key });
    res.json({
      success: true,
      data: { key, value: updated.config_value },
      message: `Configuration '${key}' updated`,
    });
  } catch (error) {
    logger.error("CredibilityController: Update config failed", {
      key: req.params.key,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ============================================================
// Export all handler functions
// ============================================================
module.exports = {
  processSessionCredibility,
  getWeightedResults,
  getCredibilityProfiles,
  getEvaluatorProfile,
  batchRecalculate,
  processQueue,
  getCredibilityConfig,
  updateCredibilityConfig,
};
