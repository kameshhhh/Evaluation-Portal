// ============================================================
// PEER RANKING API SERVICE — Frontend API Client
// ============================================================
// Client-side API service for peer ranking endpoints (SRS §4.5).
// All functions return response.data following existing patterns.
//
// @see SRS §4.5.1 — Peer group management
// @see SRS §4.5.2 — Survey & ranking operations
// @see SRS §4.5.3 — Results (aggregated only)
// ============================================================

import api from "./api";

// ============================================================
// PEER GROUP API — SRS §4.5.1
// ============================================================

/**
 * Get peers available for group creation (classmates, teammates).
 * @returns {Promise<Object[]>} Array of { personId, displayName, department, relationship }
 */
export const getAvailablePeers = async () => {
  const response = await api.get("/peer-ranking/available-peers");
  return response.data;
};

/**
 * Get the student's active peer groups.
 * @returns {Promise<Object[]>} Array of peer groups with resolved peer names
 */
export const getMyPeerGroups = async () => {
  const response = await api.get("/peer-ranking/groups");
  return response.data;
};

/**
 * Create a private peer group.
 * @param {Object} groupData - { groupName, peerIds: string[], refreshPeriod? }
 * @returns {Promise<Object>} Created group
 */
export const createPeerGroup = async (groupData) => {
  const response = await api.post("/peer-ranking/groups", groupData);
  return response.data;
};

/**
 * Deactivate (soft-delete) a peer group.
 * @param {string} groupId - Group UUID
 * @returns {Promise<Object>} Deactivation result
 */
export const deletePeerGroup = async (groupId) => {
  const response = await api.delete(`/peer-ranking/groups/${groupId}`);
  return response.data;
};

// ============================================================
// SURVEY API — SRS §4.5.2
// ============================================================

/**
 * Get default trait questions for survey creation.
 * @returns {Promise<Object[]>} Array of trait question configs
 */
export const getTraitQuestions = async () => {
  const response = await api.get("/peer-ranking/traits");
  return response.data;
};

/**
 * Get active surveys available to the student.
 * @returns {Promise<Object[]>} Surveys with status (pending/draft/submitted)
 */
export const getActiveSurveys = async () => {
  const response = await api.get("/peer-ranking/surveys");
  return response.data;
};

/**
 * Create a student-initiated survey from trait selections.
 * @param {Object} data - { groupId, traitKeys: string[] }
 * @returns {Promise<Object>} Created survey
 */
export const createStudentSurvey = async (data) => {
  const response = await api.post("/peer-ranking/surveys/create", data);
  return response.data;
};

/**
 * Get the peers to rank for a specific survey.
 * @param {string} surveyId - Survey UUID
 * @returns {Promise<Object[]>} Peers with display info (self excluded)
 */
export const getSurveyPeers = async (surveyId) => {
  const response = await api.get(`/peer-ranking/surveys/${surveyId}/peers`);
  return response.data;
};

// ============================================================
// RANKING API — SRS §4.5.2, §4.5.3
// ============================================================

/**
 * Save ranking draft (auto-save or manual).
 * @param {string} surveyId - Survey UUID
 * @param {Object[]} rankings - Partial ranking data
 * @returns {Promise<Object>} Save confirmation with timestamp
 */
export const saveDraft = async (surveyId, rankings) => {
  const response = await api.post(
    `/peer-ranking/surveys/${surveyId}/save-draft`,
    { rankings },
  );
  return response.data;
};

/**
 * Submit final ranking — irreversible.
 * @param {string} surveyId - Survey UUID
 * @param {Object[]} rankings - Final ranking data
 * @returns {Promise<Object>} Submission result
 */
export const submitRanking = async (surveyId, rankings) => {
  const response = await api.post(`/peer-ranking/surveys/${surveyId}/submit`, {
    rankings,
  });
  return response.data;
};

/**
 * Get aggregated (anonymized) survey results.
 * SRS §4.5.3: Individual rankings NEVER revealed.
 * @param {string} surveyId - Survey UUID
 * @returns {Promise<Object>} Aggregated scores with bands
 */
export const getSurveyResults = async (surveyId) => {
  const response = await api.get(`/peer-ranking/surveys/${surveyId}/results`);
  return response.data;
};
