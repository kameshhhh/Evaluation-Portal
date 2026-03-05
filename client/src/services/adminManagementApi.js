// ============================================================
// ADMIN MANAGEMENT API — Session Delete & Credibility Reset
// ============================================================
import api from "./api";

const BASE = "/admin-manage";

/** List all sessions for admin management view */
export const listAllSessions = async () => {
  const response = await api.get(`${BASE}/sessions`);
  return response.data;
};

/** Delete a session and all its data */
export const deleteSession = async (sessionId) => {
  const response = await api.delete(`${BASE}/sessions/${sessionId}`);
  return response.data;
};

/** List all faculty with credibility info */
export const listFacultyCredibility = async () => {
  const response = await api.get(`${BASE}/credibility/faculty`);
  return response.data;
};

/**
 * Reset credibility scores
 * @param {string[]|null} facultyIds - specific faculty IDs, or null/empty for ALL
 */
export const resetCredibility = async (facultyIds = null) => {
  const response = await api.post(`${BASE}/credibility/reset`, {
    facultyIds: facultyIds || undefined,
  });
  return response.data;
};
