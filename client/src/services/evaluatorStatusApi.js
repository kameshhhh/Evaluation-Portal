// ============================================================
// EVALUATOR STATUS API SERVICE
// ============================================================
// SRS §4.2: Multi-Judge Evaluation Status
//
// Provides functions to fetch evaluator submission status
// CRITICAL: NEVER exposes scores - only submission status
//
// Endpoints:
//   GET  /api/scarcity/sessions/:id/evaluator-status          → My status + counts
//   GET  /api/scarcity/sessions/:id/evaluator-status/detailed → Admin: names + status
//   POST /api/scarcity/sessions/:id/submit                    → Submit evaluation
//   GET  /api/scarcity/evaluator/my-sessions                  → All my sessions
//   POST /api/scarcity/sessions/:id/assign                    → Admin: assign evaluator
//   GET  /api/scarcity/sessions/:id/multi-judge-info          → Quick multi-judge check
// ============================================================

import api from "./api";

const BASE_URL = "/scarcity";

// ============================================================
// GET EVALUATOR SESSION STATUS
// ============================================================
// GET /api/scarcity/sessions/:sessionId/evaluator-status
// Get current evaluator's submission status and multi-judge counts
//
// @param {string} sessionId - UUID of session
// @returns {Promise<Object>} Status object with counts, NOT names
// ============================================================
export const getEvaluatorSessionStatus = async (sessionId) => {
  const response = await api.get(
    `${BASE_URL}/sessions/${sessionId}/evaluator-status`,
  );
  return response.data;
};

// ============================================================
// GET DETAILED EVALUATOR STATUS (ADMIN ONLY)
// ============================================================
// GET /api/scarcity/sessions/:sessionId/evaluator-status/detailed
// Get detailed evaluator status with names (admin view)
//
// @param {string} sessionId - UUID of session
// @returns {Promise<Object>} Detailed status with evaluator names
// ============================================================
export const getDetailedEvaluatorStatus = async (sessionId) => {
  const response = await api.get(
    `${BASE_URL}/sessions/${sessionId}/evaluator-status/detailed`,
  );
  return response.data;
};

// ============================================================
// SUBMIT EVALUATION
// ============================================================
// POST /api/scarcity/sessions/:sessionId/submit
// Submit evaluation and mark as complete (irreversible)
//
// @param {string} sessionId - UUID of session
// @returns {Promise<Object>} Updated status
// ============================================================
export const submitEvaluation = async (sessionId) => {
  const response = await api.post(`${BASE_URL}/sessions/${sessionId}/submit`);
  return response.data;
};

// ============================================================
// GET MY SESSIONS WITH STATUS
// ============================================================
// GET /api/scarcity/evaluator/my-sessions
// Get all sessions for current evaluator with submission status
// Used for faculty dashboard
//
// @returns {Promise<Object>} Sessions with status
// ============================================================
export const getMySessionsWithStatus = async () => {
  const response = await api.get(`${BASE_URL}/evaluator/my-sessions`);
  return response.data;
};

// ============================================================
// ASSIGN EVALUATOR TO SESSION (ADMIN ONLY)
// ============================================================
// POST /api/scarcity/sessions/:sessionId/assign
// Assign evaluator to session
//
// @param {string} sessionId - UUID of session
// @param {string} evaluatorId - UUID of evaluator
// @returns {Promise<Object>} Created assignment
// ============================================================
export const assignEvaluatorToSession = async (sessionId, evaluatorId) => {
  const response = await api.post(`${BASE_URL}/sessions/${sessionId}/assign`, {
    evaluatorId,
  });
  return response.data;
};

// ============================================================
// GET MULTI-JUDGE INFO
// ============================================================
// GET /api/scarcity/sessions/:sessionId/multi-judge-info
// Quick check if session is multi-judge (returns counts only)
//
// @param {string} sessionId - UUID of session
// @returns {Promise<Object>} Multi-judge info
// ============================================================
export const getMultiJudgeInfo = async (sessionId) => {
  const response = await api.get(
    `${BASE_URL}/sessions/${sessionId}/multi-judge-info`,
  );
  return response.data;
};

// ============================================================
// DEFAULT EXPORT
// ============================================================
export default {
  getEvaluatorSessionStatus,
  getDetailedEvaluatorStatus,
  submitEvaluation,
  getMySessionsWithStatus,
  assignEvaluatorToSession,
  getMultiJudgeInfo,
};
