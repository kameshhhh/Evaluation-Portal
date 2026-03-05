// ============================================================
// SESSION REPORT API — Client service for admin session insights
// ============================================================
// Endpoints for the Session Report admin tab.
// Uses the shared api instance (JWT interceptors built-in).
// ============================================================

import api from "./api";

/**
 * Fetch sessions list with optional year/month filters.
 * @param {Object} filters - { year?: number, month?: number }
 * @returns {{ sessions: Array, availableYears: number[] }}
 */
export const fetchSessions = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.year) params.append("year", filters.year);
  if (filters.month) params.append("month", filters.month);

  const response = await api.get(
    `/session-report/sessions?${params.toString()}`
  );
  return response.data;
};

/**
 * Fetch full evaluation report for a specific session.
 * @param {string} sessionId - UUID of the session
 * @param {Object} options - { page?: number, pageSize?: number, track?: string }
 * @returns {{ session, rubricMap, summary, pagination, students, faculty }}
 */
export const fetchSessionReport = async (sessionId, options = {}) => {
  const params = new URLSearchParams();
  if (options.page) params.append("page", options.page);
  if (options.pageSize) params.append("pageSize", options.pageSize);
  if (options.track) params.append("track", options.track);

  const response = await api.get(
    `/session-report/sessions/${sessionId}/report?${params.toString()}`
  );
  return response.data;
};

/**
 * Download session report as CSV.
 * @param {string} sessionId
 * @param {string} track - optional track filter ("core", "it_core", "premium")
 */
export const downloadSessionReportCSV = async (sessionId, track = null) => {
  const params = new URLSearchParams({ format: "csv" });
  if (track) params.append("track", track);
  const response = await api.get(
    `/session-report/sessions/${sessionId}/download?${params.toString()}`,
    { responseType: "blob" }
  );
  // Trigger browser download
  const blob = new Blob([response.data], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session_report${track ? `_${track}` : ""}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};
