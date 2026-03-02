// ============================================================
// RUBRIC API SERVICE — Client-side API calls for SRS §4.1.4
// ============================================================
// All functions use the shared axios instance with JWT auto-attach.
// Base: /api/rubrics
// ============================================================

import api from "./api";

// ----------------------------------------------------------
// List all active rubrics
// ----------------------------------------------------------
export const listRubrics = async (entity) => {
  const params = entity ? { entity } : {};
  const response = await api.get("/rubrics", { params });
  return response.data;
};

// ----------------------------------------------------------
// Get a single rubric by headId
// ----------------------------------------------------------
export const getRubric = async (headId) => {
  const response = await api.get(`/rubrics/${headId}`);
  return response.data;
};

// ----------------------------------------------------------
// Attach 3 rubrics to a session (admin only)
// ----------------------------------------------------------
export const attachRubricsToSession = async (sessionId, headIds, totalPool) => {
  const response = await api.post(`/rubrics/sessions/${sessionId}/attach`, {
    headIds,
    totalPool,
  });
  return response.data;
};

// ----------------------------------------------------------
// Get rubric config for a session
// ----------------------------------------------------------
export const getSessionRubrics = async (sessionId) => {
  const response = await api.get(`/rubrics/sessions/${sessionId}`);
  return response.data;
};

// ----------------------------------------------------------
// Get per-rubric allocation totals for an evaluator
// ----------------------------------------------------------
export const getRubricAllocationTotals = async (sessionId, evaluatorId) => {
  const response = await api.get(
    `/rubrics/sessions/${sessionId}/allocations`,
    { params: { evaluatorId } }
  );
  return response.data;
};

// ----------------------------------------------------------
// Get aggregated rubric results for a session
// (used in ResultsDisplay for per-rubric breakdown)
// ----------------------------------------------------------
export const getRubricResults = async (sessionId) => {
  const response = await api.get(`/rubrics/sessions/${sessionId}/results`);
  return response.data;
};
