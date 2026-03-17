// ============================================================
// ALERTS API — Faculty Anomaly Alert Service
// ============================================================
import api from "./api";

const BASE = "/alerts";
const d = (promise) => promise.then((r) => r.data);

/** Faculty: get own alerts */
export const getMyAlerts = () => d(api.get(`${BASE}/my`));

/** Admin: get all unacknowledged alerts */
export const getUnacknowledgedAlerts = () => d(api.get(BASE));

/** Admin: get alerts for a specific session */
export const getSessionAlerts = (sessionId) =>
  d(api.get(`${BASE}/session/${sessionId}`));

/** Admin: acknowledge an alert */
export const acknowledgeAlert = (alertId) =>
  d(api.post(`${BASE}/${alertId}/ack`));

/** Admin: manually trigger anomaly detection for a session */
export const triggerDetection = (sessionId) =>
  d(api.post(`${BASE}/detect/${sessionId}`));
