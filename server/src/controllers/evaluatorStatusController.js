// ============================================================
// EVALUATOR STATUS CONTROLLER
// ============================================================
// SRS §4.2: Multi-Judge Evaluation Status
//
// Handles HTTP requests for evaluator submission status
// CRITICAL: NEVER exposes scores - only submission status
//
// Routes:
//   GET  /api/scarcity/sessions/:sessionId/evaluator-status          → My status + counts
//   GET  /api/scarcity/sessions/:sessionId/evaluator-status/detailed → Admin: names + status
//   POST /api/scarcity/sessions/:sessionId/submit                    → Submit evaluation
//   GET  /api/scarcity/evaluator/my-sessions                         → All my sessions with status
//   POST /api/scarcity/sessions/:sessionId/assign                    → Admin: assign evaluator
//   GET  /api/scarcity/sessions/:sessionId/multi-judge-info          → Quick multi-judge check
// ============================================================

const EvaluatorStatusService = require("../services/scarcity/EvaluatorStatusService");

// ============================================================
// GET MY SESSION STATUS
// ============================================================
// GET /api/scarcity/sessions/:sessionId/evaluator-status
// Get current evaluator's status and multi-judge counts
// Access: Any assigned evaluator
// ============================================================
const getMySessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const evaluatorId = req.user.userId;

    const status = await EvaluatorStatusService.getEvaluatorSessionStatus(
      sessionId,
      evaluatorId,
    );

    res.json(status);
  } catch (error) {
    console.error("Error in getMySessionStatus:", error);

    if (error.message === "Evaluator not assigned to this session") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You are not assigned to evaluate this session",
      });
    }

    if (error.message === "Session not found") {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Session not found",
      });
    }

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch session status",
    });
  }
};

// ============================================================
// GET DETAILED SESSION STATUS (ADMIN ONLY)
// ============================================================
// GET /api/scarcity/sessions/:sessionId/evaluator-status/detailed
// Get detailed evaluator status with names
// Access: Admin only
// ============================================================
const getDetailedSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Authorization: Admin only
    if (req.user.role !== "admin") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Only administrators can view detailed evaluator status",
      });
    }

    const detailedStatus =
      await EvaluatorStatusService.getDetailedEvaluatorStatus(sessionId);

    res.json(detailedStatus);
  } catch (error) {
    console.error("Error in getDetailedSessionStatus:", error);

    if (error.message === "Session not found") {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Session not found",
      });
    }

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch detailed evaluator status",
    });
  }
};

// ============================================================
// SUBMIT EVALUATION
// ============================================================
// POST /api/scarcity/sessions/:sessionId/submit
// Submit evaluation and mark as complete
// Access: Assigned evaluator
// ============================================================
const submitEvaluation = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const evaluatorId = req.user.userId;

    const updatedStatus = await EvaluatorStatusService.submitEvaluation(
      sessionId,
      evaluatorId,
    );

    res.json({
      message: "Evaluation submitted successfully",
      status: updatedStatus,
    });
  } catch (error) {
    console.error("Error in submitEvaluation:", error);

    if (error.message === "Evaluator not assigned to this session") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You are not assigned to evaluate this session",
      });
    }

    if (error.message === "Evaluation already submitted") {
      return res.status(400).json({
        error: "ALREADY_SUBMITTED",
        message: "You have already submitted this evaluation",
      });
    }

    if (error.message.includes("Cannot submit")) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: error.message,
      });
    }

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to submit evaluation",
    });
  }
};

// ============================================================
// GET MY SESSIONS WITH STATUS
// ============================================================
// GET /api/scarcity/evaluator/my-sessions
// Get all sessions for current evaluator with submission status
// Used for faculty dashboard
// ============================================================
const getMySessionsWithStatus = async (req, res) => {
  try {
    const evaluatorId = req.user.userId;

    const sessions =
      await EvaluatorStatusService.getEvaluatorSessionsWithStatus(evaluatorId);

    res.json({
      evaluator_id: evaluatorId,
      total_sessions: sessions.length,
      sessions,
    });
  } catch (error) {
    console.error("Error in getMySessionsWithStatus:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch sessions with status",
    });
  }
};

// ============================================================
// ASSIGN EVALUATOR TO SESSION (ADMIN ONLY)
// ============================================================
// POST /api/scarcity/sessions/:sessionId/assign
// Assign evaluator to session
// Access: Admin only
// ============================================================
const assignEvaluatorToSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { evaluatorId } = req.body;

    // Authorization: Admin only
    if (req.user.role !== "admin") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Only administrators can assign evaluators",
      });
    }

    if (!evaluatorId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "evaluatorId is required",
      });
    }

    const assignment = await EvaluatorStatusService.assignEvaluatorToSession(
      sessionId,
      evaluatorId,
    );

    res.status(201).json({
      message: "Evaluator assigned successfully",
      assignment,
    });
  } catch (error) {
    console.error("Error in assignEvaluatorToSession:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to assign evaluator to session",
    });
  }
};

// ============================================================
// GET MULTI-JUDGE INFO
// ============================================================
// GET /api/scarcity/sessions/:sessionId/multi-judge-info
// Quick check if session is multi-judge
// Access: Any authenticated user
// ============================================================
const getMultiJudgeInfo = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const info = await EvaluatorStatusService.isMultiJudgeSession(sessionId);

    res.json({
      session_id: sessionId,
      ...info,
    });
  } catch (error) {
    console.error("Error in getMultiJudgeInfo:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch multi-judge info",
    });
  }
};

module.exports = {
  getMySessionStatus,
  getDetailedSessionStatus,
  submitEvaluation,
  getMySessionsWithStatus,
  assignEvaluatorToSession,
  getMultiJudgeInfo,
};
