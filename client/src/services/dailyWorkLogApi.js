import api from "./api";

const BASE = "/daily-work-logs";

export const createDailyLog = (data) =>
  api.post(BASE, data).then((r) => r.data);

export const getMyDailyLogs = (filters = {}) =>
  api.get(`${BASE}/my-logs`, { params: filters }).then((r) => r.data);

export const getTodayStatus = () =>
  api.get(`${BASE}/today`).then((r) => r.data);

export const getWindowInfo = () =>
  api.get(`${BASE}/window`).then((r) => r.data);

export const deleteDailyLog = (logId) =>
  api.delete(`${BASE}/${logId}`).then((r) => r.data);

// Admin / faculty
export const getAllDailyLogs = (params = {}) =>
  api.get(`${BASE}/all`, { params }).then((r) => r.data);

export const getDailyLogStats = () =>
  api.get(`${BASE}/stats`).then((r) => r.data);

export const reviewDailyLog = (logId, comment) =>
  api.post(`${BASE}/${logId}/review`, { comment }).then((r) => r.data);
