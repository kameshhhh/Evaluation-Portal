// ============================================================
// PROJECT TRAJECTORY API SERVICE
// ============================================================
// SRS §4.1.2: Project-level improvement visualization
// SRS §6.1: Team trajectory analysis
//
// Provides functions for project-level performance analytics
//
// ENDPOINTS:
//   GET  /api/analytics/project/:projectId/trajectory    → Team trajectory
//   GET  /api/analytics/project/:projectId/delta         → Month-over-month delta
//   GET  /api/analytics/session/:sessionId/project-deltas → Bulk project deltas
// ============================================================

import api from "./api";

const BASE_URL = "/analytics";

// ============================================================
// GET PROJECT TRAJECTORY
// ============================================================
/**
 * GET /api/analytics/project/:projectId/trajectory
 * Get team performance history over multiple months.
 *
 * @param {string} projectId - UUID of project
 * @param {number} limit - Number of months (default: 6)
 * @returns {Promise<Object>} Team trajectory with monthly averages
 */
export const getProjectTrajectory = async (projectId, limit = 6) => {
  try {
    const response = await api.get(
      `${BASE_URL}/project/${projectId}/trajectory`,
      { params: { limit } },
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching project trajectory:", error);
    throw error;
  }
};

// ============================================================
// GET PROJECT DELTA
// ============================================================
/**
 * GET /api/analytics/project/:projectId/delta
 * Get month-over-month improvement (lightweight).
 *
 * @param {string} projectId - UUID of project
 * @param {string} sessionId - Current session for comparison (optional)
 * @returns {Promise<Object>} Delta data for badge display
 */
export const getProjectDelta = async (projectId, sessionId = null) => {
  try {
    const params = sessionId ? { sessionId } : {};
    const response = await api.get(`${BASE_URL}/project/${projectId}/delta`, {
      params,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching project delta:", error);
    throw error;
  }
};

// ============================================================
// GET SESSION PROJECT DELTAS (BULK)
// ============================================================
/**
 * GET /api/analytics/session/:sessionId/project-deltas
 * Get all project deltas for a session.
 * CRITICAL: Use this for evaluation pages to prevent N+1 queries!
 *
 * @param {string} sessionId - UUID of session
 * @returns {Promise<Object>} Map of projectId -> delta data
 */
export const getSessionProjectDeltas = async (sessionId) => {
  try {
    const response = await api.get(
      `${BASE_URL}/session/${sessionId}/project-deltas`,
    );
    return response.data.deltas || {};
  } catch (error) {
    console.error("Error fetching session project deltas:", error);
    throw error;
  }
};

// Default export for convenience
export default {
  getProjectTrajectory,
  getProjectDelta,
  getSessionProjectDeltas,
};
