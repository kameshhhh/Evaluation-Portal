// ============================================================
// RUBRIC CONTROLLER — HTTP handlers for rubric-based evaluation
// ============================================================
// Wraps RubricService with Express HTTP error handling.
// All write operations require admin role.
// Read operations require authentication only.
// ============================================================

"use strict";

const RubricService = require("../services/scarcity/RubricService");
const logger = require("../utils/logger");

// ----------------------------------------------------------
// GET /api/rubrics
// List all active rubrics
// ----------------------------------------------------------
async function listRubrics(req, res, next) {
  try {
    const rubrics = await RubricService.listRubrics({
      applicableEntity: req.query.entity || undefined,
    });
    res.json({ success: true, data: rubrics, count: rubrics.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------
// GET /api/rubrics/:headId
// Get a single rubric
// ----------------------------------------------------------
async function getRubric(req, res, next) {
  try {
    const rubric = await RubricService.getRubric(req.params.headId);
    if (!rubric) {
      return res.status(404).json({ success: false, error: "Rubric not found" });
    }
    res.json({ success: true, data: rubric });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------
// POST /api/rubrics/sessions/:sessionId/attach
// Attach 3 rubrics to a session
// Body: { headIds: [uuid, uuid, uuid], totalPool: number }
// ----------------------------------------------------------
async function attachRubricsToSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { headIds, totalPool } = req.body;

    if (!Array.isArray(headIds) || headIds.length !== 3) {
      return res.status(400).json({
        success: false,
        error: "Exactly 3 rubric IDs are required (SRS §4.1.4).",
      });
    }
    if (!totalPool || isNaN(Number(totalPool)) || Number(totalPool) < 3) {
      return res.status(400).json({
        success: false,
        error: "totalPool must be a positive number ≥ 3.",
      });
    }

    const actorId = req.user?.personId || req.user?.person_id;
    const result = await RubricService.attachToSession(
      sessionId,
      headIds,
      Number(totalPool),
      actorId
    );

    logger.info("rubricController: Rubrics attached", { sessionId, headIds });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message.includes("Exactly 3 rubrics")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
  }
}

// ----------------------------------------------------------
// GET /api/rubrics/sessions/:sessionId
// Get all rubrics configured for a session
// ----------------------------------------------------------
async function getSessionRubrics(req, res, next) {
  try {
    const rubrics = await RubricService.getSessionRubrics(req.params.sessionId);
    res.json({ success: true, data: rubrics, count: rubrics.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------
// GET /api/rubrics/sessions/:sessionId/allocations
// Get per-rubric allocation totals for current evaluator
// ----------------------------------------------------------
async function getRubricAllocationTotals(req, res, next) {
  try {
    const evaluatorId =
      req.query.evaluatorId ||
      req.user?.personId ||
      req.user?.person_id;

    const totals = await RubricService.getRubricAllocationTotals(
      req.params.sessionId,
      evaluatorId
    );
    res.json({ success: true, data: totals });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------
// GET /api/rubrics/sessions/:sessionId/results
// Get aggregated rubric results for a session
// ----------------------------------------------------------
async function getRubricResults(req, res, next) {
  try {
    const results = await RubricService.getRubricResults(req.params.sessionId);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRubrics,
  getRubric,
  attachRubricsToSession,
  getSessionRubrics,
  getRubricAllocationTotals,
  getRubricResults,
};
