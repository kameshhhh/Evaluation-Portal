// ============================================================
// FACULTY EVALUATION API SERVICE
// ============================================================
// SRS §4.4 — Faculty Evaluation Module
// Connects frontend to /api/faculty-evaluation backend endpoints.
// Follows existing scarcityApi.js pattern — returns response.data.
// ============================================================

import api from "./api";

/**
 * @description Get all active faculty evaluation sessions for the current student
 * @returns {Promise<{success: boolean, data: Array}>}
 * @see SRS §4.4.1
 */
export async function getActiveFacultySessions() {
  const response = await api.get("/faculty-evaluation/sessions");
  return response.data;
}

/**
 * @description Get eligible faculty + budget for a specific session
 * Returns ONLY faculty who have previously evaluated this student.
 * @param {string} sessionId - Faculty evaluation session ID
 * @returns {Promise<{success: boolean, data: {session, faculty, budget, existingAllocations, hasSubmitted}}>}
 * @see SRS §4.4.1 — "Student evaluates multiple faculty members"
 */
export async function getSessionFaculty(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/faculty`,
  );
  return response.data;
}

/**
 * @description Auto-save draft tier assignments
 * @param {string} sessionId - Session ID
 * @param {Array<{facultyPersonId: string, tier: string}>} allocations
 * @returns {Promise<{success: boolean, savedAt: string}>}
 */
export async function saveFacultyDraft(sessionId, allocations) {
  const response = await api.post(
    `/faculty-evaluation/sessions/${sessionId}/save-draft`,
    { allocations },
  );
  return response.data;
}

/**
 * @description Submit final faculty evaluation (irreversible)
 * @param {string} sessionId - Session ID
 * @param {Array<{facultyPersonId: string, tier: string}>} allocations
 * @returns {Promise<{success: boolean, data: {totalPoints, budget, submittedAt}}>}
 * @throws Budget exceeded, already submitted, session not active
 * @see SRS §4.4.1 — "System prevents assigning points to all faculty if pool < count"
 */
export async function submitFacultyEvaluation(sessionId, allocations) {
  const response = await api.post(
    `/faculty-evaluation/sessions/${sessionId}/submit`,
    { allocations },
  );
  return response.data;
}

/**
 * @description Get aggregated session results (banded, not raw scores)
 * @param {string} sessionId - Session ID
 * @returns {Promise<{success: boolean, data: {session, results: Array}}>}
 * @see SRS §7.2 — "No raw ranking exposure. Only trends, percentiles, bands"
 */
export async function getFacultyEvalResults(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/results`,
  );
  return response.data;
}

/**
 * @description Create a new faculty evaluation session (admin/faculty only)
 * @param {Object} sessionData - {title, description, evaluationMode, academicYear, semester, opensAt, closesAt}
 * @returns {Promise<{success: boolean, data: Object}>}
 * @see SRS §4.4.2 — "Mode is configurable per survey"
 */
export async function createFacultyEvalSession(sessionData) {
  const response = await api.post(
    "/faculty-evaluation/admin/sessions",
    sessionData,
  );
  return response.data;
}

/**
 * @description Get all sessions (admin view)
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getAllFacultyEvalSessions() {
  const response = await api.get("/faculty-evaluation/admin/sessions");
  return response.data;
}

// ============================================================
// SCARCITY VALIDATION (SRS §4.4.1)
// ============================================================

/**
 * @description Validate allocation before submission
 * @param {Object} payload - {allocations, scoringMode, facultyCount, allowAssignAll}
 * @returns {Promise<{success: boolean, data: {isValid, errors, warnings, totalPoints, budget}}>}
 */
export async function validateFacultyAllocation(payload) {
  const response = await api.post(
    "/faculty-evaluation/validate-allocation",
    payload,
  );
  return response.data;
}

/**
 * @description Get educational content about scarcity principle
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getScarcityEducation() {
  const response = await api.get("/faculty-evaluation/scarcity-education");
  return response.data;
}

// ============================================================
// NORMALIZATION & ANALYTICS (SRS §4.4.3)
// ============================================================

/**
 * @description Get normalization weights (admin)
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getNormalizationWeights() {
  const response = await api.get(
    "/faculty-evaluation/admin/normalization/weights",
  );
  return response.data;
}

/**
 * @description Update normalization weights (admin)
 * @param {Object} weights - {sessionsWeight, hoursWeight, roleWeight, lectureWeight, ...}
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function updateNormalizationWeights(weights) {
  const response = await api.post(
    "/faculty-evaluation/admin/normalization/weights",
    weights,
  );
  return response.data;
}

/**
 * @description Get normalization explanation for a faculty member
 * @param {string} sessionId
 * @param {string} facultyId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getNormalizationExplanation(sessionId, facultyId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/normalization/${facultyId}`,
  );
  return response.data;
}

/**
 * @description Get faculty performance trend
 * @param {string} facultyId - Optional; omit for own trend (faculty role)
 * @param {number} limit - Number of sessions to include
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getFacultyTrend(facultyId, limit = 10) {
  const url = facultyId
    ? `/faculty-evaluation/admin/faculty/${facultyId}/trend`
    : "/faculty-evaluation/faculty/trend";
  const response = await api.get(url, { params: { limit } });
  return response.data;
}

/**
 * @description Get normalized results for a session
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getNormalizedResults(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/normalized-results`,
  );
  return response.data;
}

/**
 * @description Get department rankings for a session
 * @param {string} sessionId
 * @param {string} department - Optional department filter
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getDepartmentRankings(sessionId, department) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/department-rankings`,
    { params: { department } },
  );
  return response.data;
}

/**
 * @description Get response rate analysis
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getResponseRate(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/response-rate`,
  );
  return response.data;
}

/**
 * @description Get session overview stats
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getSessionOverview(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/overview`,
  );
  return response.data;
}

/**
 * @description Export session data (admin)
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function exportSessionData(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/export`,
  );
  return response.data;
}

/**
 * @description Assign faculty to a session with exposure data (admin)
 * @param {string} sessionId
 * @param {Array} assignments - [{facultyId, sessionsConducted, contactHours, roleType, department}]
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function assignFacultyToSession(sessionId, assignments) {
  const response = await api.post(
    `/faculty-evaluation/admin/sessions/${sessionId}/assign`,
    { assignments },
  );
  return response.data;
}

/**
 * @description Get faculty assignments for a session (admin)
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getSessionAssignments(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/admin/sessions/${sessionId}/assignments`,
  );
  return response.data;
}

/**
 * @description Trigger score recalculation for a session (admin)
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function recalculateSessionScores(sessionId) {
  const response = await api.post(
    `/faculty-evaluation/admin/sessions/${sessionId}/recalculate`,
  );
  return response.data;
}

// ============================================================
// WHAT-IF SIMULATION ENDPOINTS (B-02, SRS §4.4.3)
// ============================================================

/**
 * @description Simulate normalization with custom weights
 * @param {string} facultyId
 * @param {string} sessionId
 * @param {Object} weights - { sessions_weight, hours_weight, role_weight }
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function simulateWhatIf(facultyId, sessionId, weights) {
  const response = await api.post("/faculty-evaluation/what-if/simulate", {
    facultyId,
    sessionId,
    weights,
  });
  return response.data;
}

/**
 * @description Save a what-if scenario
 * @param {string} facultyId
 * @param {string} sessionId
 * @param {string} scenarioName
 * @param {Object} weights
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function saveWhatIfScenario(
  facultyId,
  sessionId,
  scenarioName,
  weights,
) {
  const response = await api.post("/faculty-evaluation/what-if/save", {
    facultyId,
    sessionId,
    scenarioName,
    weights,
  });
  return response.data;
}

/**
 * @description Get saved what-if scenarios for a faculty member
 * @param {string} facultyId
 * @param {string} sessionId - Optional
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getWhatIfScenarios(facultyId, sessionId) {
  const url = facultyId
    ? `/faculty-evaluation/what-if/scenarios/${facultyId}`
    : "/faculty-evaluation/what-if/scenarios";
  const response = await api.get(url, {
    params: sessionId ? { sessionId } : {},
  });
  return response.data;
}

/**
 * @description Delete a what-if scenario
 * @param {string} scenarioId
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteWhatIfScenario(scenarioId) {
  const response = await api.delete(
    `/faculty-evaluation/what-if/scenarios/${scenarioId}`,
  );
  return response.data;
}

// ============================================================
// ENHANCED TRANSPARENCY ENDPOINTS (B-02)
// ============================================================

/**
 * @description Get enhanced transparency report — full step-by-step calculation
 * @param {string} sessionId
 * @param {string} facultyId
 * @returns {Promise<{success: boolean, data: Object}>}
 */
export async function getEnhancedTransparencyReport(sessionId, facultyId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/transparency/${facultyId}`,
  );
  return response.data;
}

/**
 * @description Get department benchmarks for a session
 * @param {string} sessionId
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getDeptBenchmarks(sessionId) {
  const response = await api.get(
    `/faculty-evaluation/sessions/${sessionId}/benchmarks`,
  );
  return response.data;
}

/**
 * @description Get normalization audit history
 * @param {string} facultyId - Optional
 * @param {string} sessionId - Optional query param
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getAuditHistory(facultyId, sessionId) {
  const url = facultyId
    ? `/faculty-evaluation/normalization/audit/${facultyId}`
    : "/faculty-evaluation/normalization/audit";
  const response = await api.get(url, {
    params: sessionId ? { sessionId } : {},
  });
  return response.data;
}

/**
 * @description Get weight configuration history (admin)
 * @returns {Promise<{success: boolean, data: Array}>}
 */
export async function getWeightHistory() {
  const response = await api.get(
    "/faculty-evaluation/admin/normalization/weight-history",
  );
  return response.data;
}
