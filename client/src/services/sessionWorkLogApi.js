import api from "./api";

const BASE = "/session-work-logs";

export const createSessionLog = (data) =>
  api.post(BASE, data).then((r) => r.data);

export const getMySessionLogs = (sessionId) =>
  api.get(`${BASE}/my-logs`, { params: sessionId ? { sessionId } : {} }).then((r) => r.data);

export const getMySessions = () =>
  api.get(`${BASE}/my-sessions`).then((r) => r.data);

export const deleteSessionLog = (logId) =>
  api.delete(`${BASE}/${logId}`).then((r) => r.data);

// Admin / faculty
export const getAllSessionLogs = (params = {}) =>
  api.get(`${BASE}/all`, { params }).then((r) => r.data);

export const getAllProjectLogs = (params = {}) =>
  api.get(`${BASE}/all-project-logs`, { params }).then((r) => r.data);

export const getLogStats = () =>
  api.get(`${BASE}/stats`).then((r) => r.data);

export const reviewSessionLog = (logId, comment) =>
  api.post(`${BASE}/${logId}/review`, { comment }).then((r) => r.data);
