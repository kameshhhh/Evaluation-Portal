// ============================================================
// COHORT API SERVICE — Frontend API calls for Cohort System
// ============================================================
// Interfaces with /api/cohorts/* backend endpoints.
// Pattern matches existing services (scarcityApi.js, etc.)
// ============================================================

import api from "./api";

// ==========================================================
// COHORT CRUD
// ==========================================================

export const createCohort = async (cohortData) => {
  const response = await api.post("/cohorts", cohortData);
  return response.data;
};

export const listCohorts = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.cohortType) params.set("cohortType", filters.cohortType);
  if (filters.limit) params.set("limit", filters.limit);
  if (filters.offset) params.set("offset", filters.offset);

  const response = await api.get(`/cohorts?${params.toString()}`);
  return response.data;
};

export const getCohort = async (cohortId) => {
  const response = await api.get(`/cohorts/${cohortId}`);
  return response.data;
};

export const updateCohort = async (cohortId, updates) => {
  const response = await api.put(`/cohorts/${cohortId}`, updates);
  return response.data;
};

export const autoSetupCohort = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/auto-setup`);
  return response.data;
};

export const activateCohort = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/activate`);
  return response.data;
};

export const completeCohort = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/complete`);
  return response.data;
};

// ==========================================================
// TARGET MANAGEMENT
// ==========================================================

export const addTargets = async (cohortId, targets) => {
  const response = await api.post(`/cohorts/${cohortId}/targets`, { targets });
  return response.data;
};

export const getTargets = async (cohortId) => {
  const response = await api.get(`/cohorts/${cohortId}/targets`);
  return response.data;
};

export const removeTarget = async (cohortId, targetId) => {
  const response = await api.delete(`/cohorts/${cohortId}/targets/${targetId}`);
  return response.data;
};

export const autoPopulateTargets = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/targets/auto`);
  return response.data;
};

// ==========================================================
// EVALUATOR MANAGEMENT
// ==========================================================

export const addEvaluators = async (cohortId, evaluators) => {
  const response = await api.post(`/cohorts/${cohortId}/evaluators`, {
    evaluators,
  });
  return response.data;
};

export const getEvaluators = async (cohortId) => {
  const response = await api.get(`/cohorts/${cohortId}/evaluators`);
  return response.data;
};

export const removeEvaluator = async (cohortId, evaluatorId) => {
  const response = await api.delete(
    `/cohorts/${cohortId}/evaluators/${evaluatorId}`,
  );
  return response.data;
};

export const autoPopulateEvaluators = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/evaluators/auto`);
  return response.data;
};

// ==========================================================
// ASSIGNMENT ENGINE
// ==========================================================

export const generateAssignments = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/assignments/generate`);
  return response.data;
};

export const getAssignments = async (cohortId, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);

  const response = await api.get(
    `/cohorts/${cohortId}/assignments?${params.toString()}`,
  );
  return response.data;
};

export const overrideAssignment = async (
  cohortId,
  assignmentId,
  newEvaluatorId,
  reason,
) => {
  const response = await api.put(
    `/cohorts/${cohortId}/assignments/${assignmentId}/override`,
    { newEvaluatorId, reason },
  );
  return response.data;
};

// ==========================================================
// COVERAGE & ALERTS
// ==========================================================

export const getCoverageDashboard = async (cohortId) => {
  const response = await api.get(`/cohorts/${cohortId}/coverage`);
  return response.data;
};

export const detectGaps = async (cohortId) => {
  const response = await api.post(`/cohorts/${cohortId}/alerts/detect`);
  return response.data;
};

export const getAlerts = async (cohortId, includeAll = false) => {
  const response = await api.get(
    `/cohorts/${cohortId}/alerts${includeAll ? "?all=true" : ""}`,
  );
  return response.data;
};

export const acknowledgeAlert = async (alertId) => {
  const response = await api.put(`/cohorts/alerts/${alertId}/acknowledge`);
  return response.data;
};

export const resolveAlert = async (alertId, notes) => {
  const response = await api.put(`/cohorts/alerts/${alertId}/resolve`, {
    notes,
  });
  return response.data;
};

// ==========================================================
// EVALUATOR VIEW
// ==========================================================

export const getMyAssignments = async () => {
  const response = await api.get("/cohorts/my-assignments");
  return response.data;
};

/**
 * Start an evaluation session for a cohort assignment.
 * Creates a new evaluation_session linked to the assignment.
 * @param {string} assignmentId — UUID of the cohort_assignment
 * @returns {{ sessionId, assignmentId, cohortName, targetLabel, poolSize, studentCount, alreadyStarted }}
 */
export const startEvaluation = async (assignmentId) => {
  const response = await api.post(`/cohorts/assignments/${assignmentId}/start`);
  return response.data;
};

// ==========================================================
// PEER SUGGESTIONS
// ==========================================================

export const getPeerSuggestions = async (options = {}) => {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", options.limit);
  if (options.department) params.set("department", options.department);
  if (options.cohortId) params.set("cohortId", options.cohortId);

  const response = await api.get(
    `/cohorts/peer-suggestions?${params.toString()}`,
  );
  return response.data;
};

export const refreshPeerSuggestions = async () => {
  const response = await api.post("/cohorts/peer-suggestions/refresh");
  return response.data;
};
