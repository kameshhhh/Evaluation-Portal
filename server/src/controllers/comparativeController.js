// ============================================================
// COMPARATIVE EVALUATION CONTROLLER — SRS §4.3 HTTP Interface
// ============================================================
// Thin controller pattern — all business logic in ComparativeEvaluationService
// Response format: { success: true, data } or { success: false, error }
// ============================================================

const ComparativeEvaluationService = require("../services/ComparativeEvaluationService");
const { query } = require("../config/database");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// ROUND MANAGEMENT — Admin operations
// ============================================================

/**
 * POST /api/comparative/rounds
 * Create a new comparative evaluation round.
 */
const createRound = async (req, res) => {
  try {
    const {
      name,
      description,
      totalPool,
      criteria,
      selectionRules,
      evaluationWindowStart,
      evaluationWindowEnd,
    } = req.body;

    if (!name || !totalPool) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, totalPool",
      });
    }

    const round = await ComparativeEvaluationService.createRound({
      name,
      description,
      totalPool: parseFloat(totalPool),
      criteria,
      selectionRules,
      evaluationWindowStart,
      evaluationWindowEnd,
      createdBy: req.user.userId,
    });

    broadcastChange("comparative_round", "created", {
      roundId: round.id || round.round_id,
    });
    return res.status(201).json({ success: true, data: round });
  } catch (err) {
    console.error("createRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/rounds
 * List all rounds (optionally filter by status).
 */
const listRounds = async (req, res) => {
  try {
    const { status } = req.query;
    const rounds = await ComparativeEvaluationService.listRounds(
      status || null,
    );
    return res.json({ success: true, data: rounds });
  } catch (err) {
    console.error("listRounds error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/rounds/:roundId
 * Get round details with eligible projects and judges.
 */
const getRound = async (req, res) => {
  try {
    const round = await ComparativeEvaluationService.getRound(
      req.params.roundId,
    );
    return res.json({ success: true, data: round });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error("getRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * PUT /api/comparative/rounds/:roundId
 * Update round configuration (draft only).
 */
const updateRound = async (req, res) => {
  try {
    const round = await ComparativeEvaluationService.updateRound(
      req.params.roundId,
      req.body,
    );
    broadcastChange("comparative_round", "updated", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: round });
  } catch (err) {
    if (err.message.includes("draft")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("updateRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/comparative/rounds/:roundId/activate
 * Transition round from draft → active.
 */
const activateRound = async (req, res) => {
  try {
    const round = await ComparativeEvaluationService.updateRoundStatus(
      req.params.roundId,
      "active",
    );
    broadcastChange("comparative_round", "activated", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: round });
  } catch (err) {
    if (err.message.includes("Invalid")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("activateRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/comparative/rounds/:roundId/close
 * Transition round from active → closed.
 */
const closeRound = async (req, res) => {
  try {
    const round = await ComparativeEvaluationService.updateRoundStatus(
      req.params.roundId,
      "closed",
    );
    broadcastChange("comparative_round", "closed", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: round });
  } catch (err) {
    if (err.message.includes("Invalid")) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("closeRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// PROJECT POOL — Admin operations
// ============================================================

/**
 * POST /api/comparative/rounds/:roundId/projects
 * Add projects to round's eligible pool.
 * Body: { projects: [{ projectId, priority? }] }
 */
const addProjectsToRound = async (req, res) => {
  try {
    const { projects } = req.body;

    if (!Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({
        success: false,
        error: "projects must be a non-empty array",
      });
    }

    const round = await ComparativeEvaluationService.addProjectsToRound(
      req.params.roundId,
      projects,
    );
    broadcastChange("comparative_round", "projects_added", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: round });
  } catch (err) {
    console.error("addProjectsToRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * DELETE /api/comparative/rounds/:roundId/projects/:projectId
 * Remove project from round pool.
 */
const removeProjectFromRound = async (req, res) => {
  try {
    await ComparativeEvaluationService.removeProjectFromRound(
      req.params.roundId,
      req.params.projectId,
    );
    broadcastChange("comparative_round", "project_removed", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: { removed: true } });
  } catch (err) {
    console.error("removeProjectFromRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// JUDGE ASSIGNMENT — Admin operations
// ============================================================

/**
 * POST /api/comparative/rounds/:roundId/judges
 * Assign judges to round.
 * Body: { judges: [{ judgeId, credibilityScore? }] }
 */
const assignJudgesToRound = async (req, res) => {
  try {
    const { judges } = req.body;

    if (!Array.isArray(judges) || judges.length === 0) {
      return res.status(400).json({
        success: false,
        error: "judges must be a non-empty array",
      });
    }

    const round = await ComparativeEvaluationService.assignJudgesToRound(
      req.params.roundId,
      judges,
    );
    broadcastChange("comparative_round", "judges_assigned", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: round });
  } catch (err) {
    console.error("assignJudgesToRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * DELETE /api/comparative/rounds/:roundId/judges/:judgeId
 * Remove judge from round.
 */
const removeJudgeFromRound = async (req, res) => {
  try {
    await ComparativeEvaluationService.removeJudgeFromRound(
      req.params.roundId,
      req.params.judgeId,
    );
    broadcastChange("comparative_round", "judge_removed", {
      roundId: req.params.roundId,
    });
    return res.json({ success: true, data: { removed: true } });
  } catch (err) {
    console.error("removeJudgeFromRound error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// SESSION MANAGEMENT — Judge operations
// ============================================================

/**
 * GET /api/comparative/rounds/:roundId/eligible-projects
 * Get eligible projects for a judge in a round.
 */
const getEligibleProjects = async (req, res) => {
  try {
    // Get judgeId from person lookup
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1`,
      [req.user.userId],
    );

    if (personResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Person not found" });
    }

    const judgeId = personResult.rows[0].person_id;
    const projects = await ComparativeEvaluationService.getEligibleProjects(
      req.params.roundId,
      judgeId,
    );

    return res.json({ success: true, data: projects });
  } catch (err) {
    if (err.message.includes("not assigned")) {
      return res.status(403).json({ success: false, error: err.message });
    }
    console.error("getEligibleProjects error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/comparative/sessions
 * Judge creates a session by selecting projects from a round.
 * Body: { roundId, projectIds: [...] }
 */
const createSession = async (req, res) => {
  try {
    const { roundId, projectIds } = req.body;

    if (!roundId || !projectIds) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: roundId, projectIds",
      });
    }

    // Get judgeId from person lookup
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1`,
      [req.user.userId],
    );

    if (personResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Person not found" });
    }

    const judgeId = personResult.rows[0].person_id;

    const session = await ComparativeEvaluationService.createSession({
      roundId,
      judgeId,
      projectIds,
    });

    broadcastChange("comparative_session", "created", {
      sessionId: session.id || session.session_id,
    });
    return res.status(201).json({ success: true, data: session });
  } catch (err) {
    if (
      err.message.includes("already has") ||
      err.message.includes("not assigned") ||
      err.message.includes("not eligible") ||
      err.message.includes("Must select")
    ) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("createSession error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/sessions/my
 * Get all comparative sessions for the current judge.
 */
const getMySessions = async (req, res) => {
  try {
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1`,
      [req.user.userId],
    );

    if (personResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Person not found" });
    }

    const sessions = await ComparativeEvaluationService.getJudgeSessions(
      personResult.rows[0].person_id,
    );

    return res.json({ success: true, data: sessions });
  } catch (err) {
    console.error("getMySessions error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/sessions/my-rounds
 * Get all active rounds where the judge is assigned.
 */
const getMyActiveRounds = async (req, res) => {
  try {
    const personResult = await query(
      `SELECT person_id FROM persons WHERE identity_id = $1`,
      [req.user.userId],
    );

    if (personResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Person not found" });
    }

    const rounds = await ComparativeEvaluationService.getActiveRoundsForJudge(
      personResult.rows[0].person_id,
    );

    return res.json({ success: true, data: rounds });
  } catch (err) {
    console.error("getMyActiveRounds error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/sessions/:sessionId
 * Get session with full allocation matrix.
 */
const getSession = async (req, res) => {
  try {
    const session = await ComparativeEvaluationService.getSession(
      req.params.sessionId,
    );
    return res.json({ success: true, data: session });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error("getSession error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// ALLOCATION — Judge operations
// ============================================================

/**
 * PUT /api/comparative/sessions/:sessionId/allocations
 * Save full allocation matrix.
 * Body: { allocationMatrix: { criterion_key: { project_id: points } } }
 */
const saveAllocations = async (req, res) => {
  try {
    const { allocationMatrix } = req.body;

    if (!allocationMatrix || typeof allocationMatrix !== "object") {
      return res.status(400).json({
        success: false,
        error: "allocationMatrix is required",
      });
    }

    const session = await ComparativeEvaluationService.saveAllAllocations(
      req.params.sessionId,
      allocationMatrix,
    );

    broadcastChange("comparative_allocation", "saved", {
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, data: session });
  } catch (err) {
    if (
      err.message.includes("exceeds") ||
      err.message.includes("Negative") ||
      err.message.includes("not in session") ||
      err.message.includes("Cannot modify")
    ) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("saveAllocations error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * PUT /api/comparative/sessions/:sessionId/allocations/:criterionKey
 * Save allocations for a single criterion row.
 * Body: { allocations: { project_id: points, ... } }
 */
const saveAllocationForCriterion = async (req, res) => {
  try {
    const { allocations } = req.body;

    if (!allocations || typeof allocations !== "object") {
      return res.status(400).json({
        success: false,
        error: "allocations object is required",
      });
    }

    const session =
      await ComparativeEvaluationService.saveAllocationsForCriterion(
        req.params.sessionId,
        req.params.criterionKey,
        allocations,
      );

    broadcastChange("comparative_allocation", "saved", {
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, data: session });
  } catch (err) {
    if (
      err.message.includes("exceeds") ||
      err.message.includes("Negative") ||
      err.message.includes("Unknown criterion") ||
      err.message.includes("Cannot modify")
    ) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("saveAllocationForCriterion error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/comparative/sessions/:sessionId/submit
 * Submit and finalize the session.
 */
const submitSession = async (req, res) => {
  try {
    const { zeroScoreReasons } = req.body || {};
    const session = await ComparativeEvaluationService.submitSession(
      req.params.sessionId,
      zeroScoreReasons || [],
    );
    broadcastChange("comparative_session", "submitted", {
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, data: session });
  } catch (err) {
    if (
      err.message.includes("Pool exceeded") ||
      err.message.includes("Cannot submit")
    ) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("submitSession error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// SNAPSHOTS
// ============================================================

/**
 * POST /api/comparative/sessions/:sessionId/snapshot
 * Save manual snapshot.
 */
const saveSnapshot = async (req, res) => {
  try {
    const result = await ComparativeEvaluationService.saveSnapshot(
      req.params.sessionId,
    );
    broadcastChange("comparative_session", "snapshot_saved", {
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("saveSnapshot error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/comparative/sessions/:sessionId/snapshots
 * List all snapshots for a session.
 */
const getSnapshots = async (req, res) => {
  try {
    const snapshots = await ComparativeEvaluationService.getSnapshots(
      req.params.sessionId,
    );
    return res.json({ success: true, data: snapshots });
  } catch (err) {
    console.error("getSnapshots error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/comparative/sessions/:sessionId/snapshots/:snapshotId/restore
 * Restore a snapshot.
 */
const restoreSnapshot = async (req, res) => {
  try {
    const session = await ComparativeEvaluationService.restoreSnapshot(
      req.params.sessionId,
      req.params.snapshotId,
    );
    broadcastChange("comparative_session", "snapshot_restored", {
      sessionId: req.params.sessionId,
    });
    return res.json({ success: true, data: session });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ success: false, error: err.message });
    }
    console.error("restoreSnapshot error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// RESULTS — Admin operations
// ============================================================

/**
 * GET /api/comparative/rounds/:roundId/results
 * Get aggregated results for a round.
 */
const getRoundResults = async (req, res) => {
  try {
    const results = await ComparativeEvaluationService.getRoundResults(
      req.params.roundId,
    );
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error("getRoundResults error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  activateRound,
  closeRound,
  addProjectsToRound,
  removeProjectFromRound,
  assignJudgesToRound,
  removeJudgeFromRound,
  getEligibleProjects,
  createSession,
  getMySessions,
  getMyActiveRounds,
  getSession,
  saveAllocations,
  saveAllocationForCriterion,
  submitSession,
  saveSnapshot,
  getSnapshots,
  restoreSnapshot,
  getRoundResults,
};
