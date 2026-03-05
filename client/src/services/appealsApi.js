// ============================================================
// APPEALS API — Student Score Appeal Service
// ============================================================
import api from "./api";

const BASE = "/appeals";
const d = (promise) => promise.then((r) => r.data);

/** Check if student is eligible to appeal a session */
export const checkAppealEligibility = (sessionId) =>
  d(api.get(`${BASE}/check/${sessionId}`));

/** File a score appeal (student) */
export const fileAppeal = (sessionId, reason, disputedFacultyId = null) =>
  d(api.post(BASE, { sessionId, reason, disputedFacultyId }));

/** Get student's own appeals */
export const getMyAppeals = () => d(api.get(`${BASE}/my`));

/** Admin: list all appeals (optional status filter) */
export const listAppeals = (status = null) =>
  d(api.get(BASE, { params: status ? { status } : {} }));

/** Admin: resolve an appeal */
export const resolveAppeal = (appealId, status, resolutionNotes = "") =>
  d(api.put(`${BASE}/${appealId}`, { status, resolutionNotes }));
