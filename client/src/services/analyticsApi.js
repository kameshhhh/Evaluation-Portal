// ============================================================
// ANALYTICS API SERVICE — HTTP Client for SRS Analytics Endpoints
// ============================================================
// Provides all API calls for the SRS Analytics features:
//   - Temporal growth tracking (SRS Section 6)
//   - Person vector analytics (SRS Section 7)
//   - Peer ranking with safeguards (SRS 4.5.3)
//   - Faculty exposure normalization (SRS 4.4.3)
//   - Intent-aware evaluation (SRS 6.2)
//
// Uses the shared axios instance (api.js) which automatically
// attaches JWT tokens and handles 401 responses.
//
// DOES NOT modify any existing API services.
// ============================================================

import api from "./api";

// ============================================================
// TEMPORAL GROWTH API — SRS Section 6
// ============================================================

/**
 * Get growth history/trajectory for a person.
 * SRS 6: Month-to-month score delta tracking.
 *
 * @param {string} personId — UUID of the person
 * @param {number} limit — Max records to fetch (default 12)
 * @returns {Promise<Object>} — { trajectory, summaries, overallTrend }
 */
export const getGrowthHistory = async (personId, limit = 12) => {
  const response = await api.get(`/analytics/growth/${personId}`, {
    params: { limit },
  });
  return response.data;
};

/**
 * Compute growth between two academic periods.
 *
 * @param {string} personId — UUID of the person
 * @param {string} fromPeriod — Starting period ID
 * @param {string} toPeriod — Ending period ID
 * @returns {Promise<Object>} — Growth result
 */
export const computeGrowth = async (personId, fromPeriod, toPeriod) => {
  const response = await api.post("/analytics/growth/compute", {
    personId,
    fromPeriod,
    toPeriod,
  });
  return response.data;
};

/**
 * Batch compute growth for all targets in a session.
 *
 * @param {string} sessionId — The evaluation session
 * @returns {Promise<Object>} — Batch growth results
 */
export const computeBatchGrowth = async (sessionId) => {
  const response = await api.post(`/analytics/growth/batch/${sessionId}`);
  return response.data;
};

// ============================================================
// PERSON VECTOR API — SRS Section 7
// SRS 7.2: "Used for mentoring, NOT labeling"
// ============================================================

/**
 * Get the current person vector (trait scores).
 *
 * @param {string} personId — UUID of the person
 * @returns {Promise<Object>} — Trait vector with confidence
 */
export const getPersonVector = async (personId) => {
  const response = await api.get(`/analytics/vectors/${personId}`);
  return response.data;
};

/**
 * Build/rebuild a person's vector from all data sources.
 *
 * @param {string} personId — UUID of the person
 * @returns {Promise<Object>} — Computed vector
 */
export const buildPersonVector = async (personId) => {
  const response = await api.post(`/analytics/vectors/${personId}/build`);
  return response.data;
};

/**
 * Batch build vectors for multiple people.
 *
 * @param {string[]} personIds — Array of person UUIDs
 * @returns {Promise<Object>} — Batch results
 */
export const batchBuildVectors = async (personIds) => {
  const response = await api.post("/analytics/vectors/batch", { personIds });
  return response.data;
};

/**
 * Get vector trajectory over time.
 * SRS 7.2: "Only trends, percentiles, bands"
 *
 * @param {string} personId — UUID of the person
 * @param {number} limit — Max snapshots
 * @returns {Promise<Object>} — { snapshots, traitTrajectories }
 */
export const getVectorHistory = async (personId, limit = 12) => {
  const response = await api.get(`/analytics/vectors/${personId}/history`, {
    params: { limit },
  });
  return response.data;
};

/**
 * Take an immutable vector snapshot.
 *
 * @param {string} personId — UUID of the person
 * @param {string} periodId — Academic period
 * @param {string} sessionId — Session context
 * @returns {Promise<Object>} — Snapshot record
 */
export const snapshotVector = async (personId, periodId, sessionId) => {
  const response = await api.post(`/analytics/vectors/${personId}/snapshot`, {
    periodId,
    sessionId,
  });
  return response.data;
};

// ============================================================
// PEER RANKING API — SRS 4.5.3
// ============================================================

/**
 * Create a new peer ranking survey.
 *
 * @param {Object} config — Survey configuration
 * @returns {Promise<Object>} — Created survey
 */
export const createPeerSurvey = async (config) => {
  const response = await api.post("/analytics/peer-rankings/surveys", config);
  return response.data;
};

/**
 * Submit a peer ranking response.
 * SRS 4.5.3: All ethical safeguards enforced server-side.
 *
 * @param {string} surveyId — UUID of the survey
 * @param {Array} rankings — Ranking data
 * @returns {Promise<Object>} — Submission confirmation
 */
export const submitPeerRanking = async (surveyId, rankings) => {
  const response = await api.post(
    `/analytics/peer-rankings/surveys/${surveyId}/submit`,
    { rankings },
  );
  return response.data;
};

/**
 * Aggregate survey results (admin).
 *
 * @param {string} surveyId — UUID of the survey
 * @returns {Promise<Object>} — Aggregated results
 */
export const aggregatePeerResults = async (surveyId) => {
  const response = await api.post(
    `/analytics/peer-rankings/surveys/${surveyId}/aggregate`,
  );
  return response.data;
};

/**
 * Run gaming detection on a survey (admin).
 *
 * @param {string} surveyId — UUID of the survey
 * @returns {Promise<Object>} — Detected flags
 */
export const detectPeerGaming = async (surveyId) => {
  const response = await api.post(
    `/analytics/peer-rankings/surveys/${surveyId}/detect-gaming`,
  );
  return response.data;
};

/**
 * Get anonymized survey results.
 * SRS 4.5.3: "Individual rankings NEVER revealed"
 *
 * @param {string} surveyId — UUID of the survey
 * @returns {Promise<Object>} — Anonymized aggregates
 */
export const getPeerSurveyResults = async (surveyId) => {
  const response = await api.get(
    `/analytics/peer-rankings/surveys/${surveyId}/results`,
  );
  return response.data;
};

// ============================================================
// FACULTY NORMALIZATION API — SRS 4.4.3
// ============================================================

/**
 * Log a faculty-student exposure event.
 *
 * @param {Object} data — { facultyId, targetId, sessionId, roleType, contactHours, interactionType }
 * @returns {Promise<Object>} — Logged record
 */
export const logFacultyExposure = async (data) => {
  const response = await api.post("/analytics/faculty/exposure", data);
  return response.data;
};

/**
 * Batch normalize faculty scores for a session.
 *
 * @param {string} sessionId — The session to normalize
 * @returns {Promise<Object>} — Normalization summary
 */
export const batchNormalizeFaculty = async (sessionId) => {
  const response = await api.post(`/analytics/faculty/normalize/${sessionId}`);
  return response.data;
};

/**
 * Get faculty exposure profile.
 *
 * @param {string} facultyId — UUID of the faculty member
 * @returns {Promise<Object>} — Exposure stats
 */
export const getFacultyProfile = async (facultyId) => {
  const response = await api.get(`/analytics/faculty/${facultyId}/profile`);
  return response.data;
};

/**
 * Compute exposure weight for a faculty-student pair.
 *
 * @param {string} facultyId — UUID of the faculty
 * @param {string} targetId — UUID of the student
 * @returns {Promise<Object>} — Weight details
 */
export const getExposureWeight = async (facultyId, targetId) => {
  const response = await api.get("/analytics/faculty/exposure-weight", {
    params: { facultyId, targetId },
  });
  return response.data;
};

// ============================================================
// INTENT-AWARE EVALUATION API — SRS 6.2
// ============================================================

/**
 * List all available evaluation intent modes.
 *
 * @returns {Promise<Object>} — Array of intent configs
 */
export const listIntents = async () => {
  const response = await api.get("/analytics/intents");
  return response.data;
};

/**
 * Get weight configuration for a specific intent.
 *
 * @param {string} intentCode — growth|excellence|leadership|comparative
 * @returns {Promise<Object>} — Intent config with weights
 */
export const getIntentConfig = async (intentCode) => {
  const response = await api.get(`/analytics/intents/${intentCode}/config`);
  return response.data;
};

/**
 * Classify a session's evaluation intent.
 *
 * @param {string} sessionId — The evaluation session
 * @returns {Promise<Object>} — Intent classification
 */
export const classifySessionIntent = async (sessionId) => {
  const response = await api.get(`/analytics/intents/session/${sessionId}`);
  return response.data;
};

/**
 * Get intent-aware evaluation report for a person.
 *
 * @param {string} targetId — Person being evaluated
 * @param {string} intentCode — Intent to apply
 * @param {string} sessionId — Optional session context
 * @returns {Promise<Object>} — Intent-adjusted evaluation report
 */
export const getIntentReport = async (
  targetId,
  intentCode = "comparative",
  sessionId = null,
) => {
  const response = await api.get(`/analytics/intents/report/${targetId}`, {
    params: { intentCode, ...(sessionId && { sessionId }) },
  });
  return response.data;
};
