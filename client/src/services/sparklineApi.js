// ============================================================
// SPARKLINE API SERVICE
// ============================================================
// SRS §6.1: Trajectory Analysis - Lightweight Visualization
//
// Ultra-fast endpoints for performance trajectory visualization
// All functions return lightweight data optimized for UI rendering
//
// ENDPOINTS:
//   GET  /api/analytics/sparkline/member/:memberId           → Member sparkline
//   GET  /api/analytics/sparkline/member/:memberId/project/:projectId → Project-specific
//   POST /api/analytics/sparkline/bulk                       → Bulk sparklines
//   GET  /api/analytics/sparkline/member/:memberId/trend     → Quick trend only
// ============================================================

import api from "./api";

const BASE_URL = "/analytics/sparkline";

// ============================================================
// GET MEMBER SPARKLINE
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId
 * Get sparkline data for a single member across all sessions.
 *
 * @param {string} memberId - UUID of student
 * @param {number} limit - Number of data points (default: 6, max: 12)
 * @returns {Promise<Object>} Sparkline data with dates, scores, trend
 */
export const getMemberSparkline = async (memberId, limit = 6) => {
  try {
    const response = await api.get(`${BASE_URL}/member/${memberId}`, {
      params: { limit },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching sparkline:", error);
    throw error;
  }
};

// ============================================================
// GET PROJECT-SPECIFIC MEMBER SPARKLINE
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId/project/:projectId
 * Get sparkline for a member filtered to a specific project.
 *
 * @param {string} memberId - UUID of student
 * @param {string} projectId - UUID of project
 * @param {number} limit - Number of data points (default: 6, max: 12)
 * @returns {Promise<Object>} Sparkline data for specific project
 */
export const getMemberProjectSparkline = async (
  memberId,
  projectId,
  limit = 6,
) => {
  try {
    const response = await api.get(
      `${BASE_URL}/member/${memberId}/project/${projectId}`,
      {
        params: { limit },
      },
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching project sparkline:", error);
    throw error;
  }
};

// ============================================================
// GET BULK SPARKLINES (N+1 Prevention)
// ============================================================
/**
 * POST /api/analytics/sparkline/bulk
 * Get multiple sparklines in one request.
 * CRITICAL: Use this for dashboards to prevent N+1 queries!
 *
 * @param {Array<string>} memberIds - Array of member UUIDs
 * @param {number} limit - Data points per sparkline (default: 6)
 * @returns {Promise<Object>} Map of memberId -> sparkline data
 */
export const getBulkSparklines = async (memberIds, limit = 6) => {
  try {
    const response = await api.post(
      `${BASE_URL}/bulk`,
      { memberIds },
      { params: { limit } },
    );
    return response.data.sparklines;
  } catch (error) {
    console.error("Error fetching bulk sparklines:", error);
    throw error;
  }
};

// ============================================================
// GET MEMBER TREND ONLY (Ultra-lightweight)
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId/trend
 * Ultra-lightweight - just trend direction and delta.
 * Used for badges and quick indicators.
 *
 * @param {string} memberId - UUID of student
 * @returns {Promise<Object>} { trend, delta, color, has_data }
 */
export const getMemberTrend = async (memberId) => {
  try {
    const response = await api.get(`${BASE_URL}/member/${memberId}/trend`);
    return response.data;
  } catch (error) {
    console.error("Error fetching member trend:", error);
    throw error;
  }
};

// ============================================================
// DEFAULT EXPORT — All methods as object
// ============================================================
const sparklineApi = {
  getMemberSparkline,
  getMemberProjectSparkline,
  getBulkSparklines,
  getMemberTrend,
};

export default sparklineApi;
