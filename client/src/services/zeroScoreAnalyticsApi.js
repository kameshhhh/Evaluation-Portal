// ============================================================
// ZERO SCORE ANALYTICS API — Frontend Service for Analytics Dashboard
// ============================================================
// SRS §4.1.5 — Zero-Score Reason Analytics
// SRS §5.3 — Anti-Collusion Behavior Detection
// ============================================================

import api from "./api";

const BASE_URL = "/zero-score";

/**
 * Build query string from filters
 */
const buildQueryString = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.startDate) params.append("startDate", filters.startDate);
  if (filters.endDate) params.append("endDate", filters.endDate);
  if (filters.evaluationType)
    params.append("evaluationType", filters.evaluationType);
  if (filters.groupId) params.append("groupId", filters.groupId);
  if (filters.format) params.append("format", filters.format);
  return params.toString() ? `?${params.toString()}` : "";
};

/**
 * Get classification labels and descriptions
 */
export const getClassifications = async () => {
  const response = await api.get(`${BASE_URL}/classifications`);
  return response.data;
};

/**
 * Get basic aggregate analytics
 */
export const getAggregateAnalytics = async (filters = {}) => {
  const query = buildQueryString(filters);
  const response = await api.get(`${BASE_URL}/analytics${query}`);
  return response.data;
};

/**
 * Get enhanced analytics with anomalies and collusion patterns
 * Combines: base analytics + anomalies + collusion + monthly trends + session breakdown
 */
export const getEnhancedAnalytics = async (filters = {}) => {
  const query = buildQueryString(filters);
  const response = await api.get(`${BASE_URL}/analytics/enhanced${query}`);
  return response.data;
};

/**
 * Get anomaly detection results
 * Returns: { lazyEvaluators, harshEvaluators, lowVariety }
 */
export const getAnomalies = async () => {
  const response = await api.get(`${BASE_URL}/anomalies`);
  return response.data;
};

/**
 * Get collusion pattern detection results (SRS §5.3)
 * Returns pairs of evaluators with high target overlap
 */
export const getCollusionPatterns = async (filters = {}) => {
  const query = buildQueryString(filters);
  const response = await api.get(`${BASE_URL}/collusion${query}`);
  return response.data;
};

/**
 * Export zero-score data for external analysis
 * @param {Object} filters - startDate, endDate, evaluationType, groupId
 * @param {string} format - 'csv' or 'json'
 */
export const exportData = async (filters = {}, format = "json") => {
  const query = buildQueryString({ ...filters, format });

  if (format === "csv") {
    // For CSV, return the raw response for file download
    const response = await api.get(`${BASE_URL}/export${query}`, {
      responseType: "blob",
    });
    return response.data;
  }

  const response = await api.get(`${BASE_URL}/export${query}`);
  return response.data;
};

/**
 * Download CSV export
 */
export const downloadCSV = async (filters = {}) => {
  const blob = await exportData(filters, "csv");
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zero-score-analytics-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Download JSON export
 */
export const downloadJSON = async (filters = {}) => {
  const data = await exportData(filters, "json");
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zero-score-analytics-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

/**
 * Get evaluator-specific patterns
 */
export const getEvaluatorPatterns = async (evaluatorId) => {
  const response = await api.get(
    `${BASE_URL}/evaluator/${evaluatorId}/patterns`,
  );
  return response.data;
};

/**
 * Get target-specific patterns
 */
export const getTargetPatterns = async (targetId) => {
  const response = await api.get(`${BASE_URL}/target/${targetId}/patterns`);
  return response.data;
};

/**
 * Get reasons for a specific session
 */
export const getSessionReasons = async (sessionId) => {
  const response = await api.get(`${BASE_URL}/session/${sessionId}`);
  return response.data;
};

export default {
  getClassifications,
  getAggregateAnalytics,
  getEnhancedAnalytics,
  getAnomalies,
  getCollusionPatterns,
  exportData,
  downloadCSV,
  downloadJSON,
  getEvaluatorPatterns,
  getTargetPatterns,
  getSessionReasons,
};
