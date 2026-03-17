// ============================================================
// COMPARATIVE REVIEW API — Frontend Service Wrapper
// ============================================================
// Standalone module — all endpoints under /api/comparative-review
// IMPORTANT: Backend wraps responses in { success, data }.
// The d() wrapper only strips axios .data, so components must
// extract .data from the result.
// ============================================================
import api from "./api";

const BASE = "/comparative-review";
const d = (promise) => promise.then((r) => r.data);

// ============================================================
// ADMIN — Round & Pairing Management
// ============================================================
export const createRound = (data) => d(api.post(`${BASE}/rounds`, data));
export const listRounds = (params) => d(api.get(`${BASE}/rounds`, { params }));
export const getRoundDetail = (roundId) => d(api.get(`${BASE}/rounds/${roundId}`));
export const updateRound = (roundId, data) => d(api.put(`${BASE}/rounds/${roundId}`, data));
export const getAvailableTeams = (roundId) => d(api.get(`${BASE}/rounds/${roundId}/available-teams`));
export const createPairing = (roundId, teamIds, soloPersonIds = []) => d(api.post(`${BASE}/rounds/${roundId}/pairings`, { teamIds, soloPersonIds }));
export const assignFacultyToPairing = (pairingId, facultyId) => d(api.put(`${BASE}/pairings/${pairingId}/assign-faculty`, { facultyId }));
export const deletePairing = (pairingId) => d(api.delete(`${BASE}/pairings/${pairingId}`));
export const deleteRound = (roundId) => d(api.delete(`${BASE}/rounds/${roundId}`));
export const finalizeRound = (roundId) => d(api.put(`${BASE}/rounds/${roundId}/finalize`));
export const getFacultyList = () => d(api.get(`${BASE}/faculty-list`));

// ============================================================
// FACULTY — View Pairings & Submit Marks
// ============================================================
export const getMyPairings = () => d(api.get(`${BASE}/my-pairings`));
export const getPairingDetail = (pairingId) => d(api.get(`${BASE}/pairings/${pairingId}/detail`));
export const submitCompReviewMarks = (pairingId, marks) => d(api.post(`${BASE}/pairings/${pairingId}/marks`, { marks }));

// ============================================================
// STUDENT — View Reviews
// ============================================================
export const getMyReviews = () => d(api.get(`${BASE}/my-reviews`));

// ============================================================
// RANKINGS — Global (all roles)
// ============================================================
export const getGlobalRankings = (params) => d(api.get(`${BASE}/rankings`, { params }));
