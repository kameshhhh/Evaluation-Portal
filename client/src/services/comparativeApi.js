// ============================================================
// COMPARATIVE EVALUATION API — SRS §4.3
// ============================================================
// Frontend API service for cross-project comparative evaluation.
// Follows existing scarcityApi.js pattern: import api, export functions.
// ============================================================

import api from "./api";

// ============================================================
// ROUND ENDPOINTS — Admin
// ============================================================

export const createRound = async (roundData) => {
  const response = await api.post("/comparative/rounds", roundData);
  return response.data;
};

export const listRounds = async (status = null) => {
  const params = status ? { status } : {};
  const response = await api.get("/comparative/rounds", { params });
  return response.data;
};

export const getRound = async (roundId) => {
  const response = await api.get(`/comparative/rounds/${roundId}`);
  return response.data;
};

export const updateRound = async (roundId, updates) => {
  const response = await api.put(`/comparative/rounds/${roundId}`, updates);
  return response.data;
};

export const activateRound = async (roundId) => {
  const response = await api.post(`/comparative/rounds/${roundId}/activate`);
  return response.data;
};

export const closeRound = async (roundId) => {
  const response = await api.post(`/comparative/rounds/${roundId}/close`);
  return response.data;
};

// ============================================================
// ROUND — Project Pool
// ============================================================

export const addProjectsToRound = async (roundId, projects) => {
  const response = await api.post(`/comparative/rounds/${roundId}/projects`, {
    projects,
  });
  return response.data;
};

export const removeProjectFromRound = async (roundId, projectId) => {
  const response = await api.delete(
    `/comparative/rounds/${roundId}/projects/${projectId}`,
  );
  return response.data;
};

// ============================================================
// ROUND — Judge Assignment
// ============================================================

export const assignJudgesToRound = async (roundId, judges) => {
  const response = await api.post(`/comparative/rounds/${roundId}/judges`, {
    judges,
  });
  return response.data;
};

export const removeJudgeFromRound = async (roundId, judgeId) => {
  const response = await api.delete(
    `/comparative/rounds/${roundId}/judges/${judgeId}`,
  );
  return response.data;
};

// ============================================================
// ROUND — Eligible projects (Judge view)
// ============================================================

export const getEligibleProjects = async (roundId) => {
  const response = await api.get(
    `/comparative/rounds/${roundId}/eligible-projects`,
  );
  return response.data;
};

// ============================================================
// ROUND — Results (Admin)
// ============================================================

export const getRoundResults = async (roundId) => {
  const response = await api.get(`/comparative/rounds/${roundId}/results`);
  return response.data;
};

// ============================================================
// SESSION ENDPOINTS — Judge
// ============================================================

export const createComparativeSession = async (roundId, projectIds) => {
  const response = await api.post("/comparative/sessions", {
    roundId,
    projectIds,
  });
  return response.data;
};

export const getMySessions = async () => {
  const response = await api.get("/comparative/sessions/my");
  return response.data;
};

export const getMyActiveRounds = async () => {
  const response = await api.get("/comparative/sessions/my-rounds");
  return response.data;
};

export const getComparativeSession = async (sessionId) => {
  const response = await api.get(`/comparative/sessions/${sessionId}`);
  return response.data;
};

// ============================================================
// ALLOCATION ENDPOINTS — Judge
// ============================================================

export const saveAllocations = async (sessionId, allocationMatrix) => {
  const response = await api.put(
    `/comparative/sessions/${sessionId}/allocations`,
    { allocationMatrix },
  );
  return response.data;
};

export const saveAllocationForCriterion = async (
  sessionId,
  criterionKey,
  allocations,
) => {
  const response = await api.put(
    `/comparative/sessions/${sessionId}/allocations/${criterionKey}`,
    { allocations },
  );
  return response.data;
};

export const submitComparativeSession = async (
  sessionId,
  zeroScoreReasons = [],
) => {
  const response = await api.post(`/comparative/sessions/${sessionId}/submit`, {
    zeroScoreReasons,
  });
  return response.data;
};

// ============================================================
// SNAPSHOT ENDPOINTS
// ============================================================

export const saveSnapshot = async (sessionId) => {
  const response = await api.post(
    `/comparative/sessions/${sessionId}/snapshot`,
  );
  return response.data;
};

export const getSnapshots = async (sessionId) => {
  const response = await api.get(
    `/comparative/sessions/${sessionId}/snapshots`,
  );
  return response.data;
};

export const restoreSnapshot = async (sessionId, snapshotId) => {
  const response = await api.post(
    `/comparative/sessions/${sessionId}/snapshots/${snapshotId}/restore`,
  );
  return response.data;
};
