// ============================================================
// PERSONALIZATION SERVICE — Frontend API Client
// ============================================================
// Handles all HTTP communication with the personalization API.
// Uses the pre-configured Axios instance that auto-attaches JWT.
//
// The frontend never decides what to show — it asks the backend.
// This service fetches the dashboard data and relays it to hooks.
//
// ENDPOINTS:
//   GET  /personalization/dashboard        → Fetch dashboard data
//   POST /personalization/cache/invalidate  → Clear cached dashboard
// ============================================================

// Import the pre-configured Axios instance with JWT interceptors
import api from "./api";

// ============================================================
// PERSONALIZATION API METHODS
// ============================================================

/**
 * Fetch the personalized dashboard data for the authenticated user.
 *
 * The backend determines the dashboard type (student/faculty/admin)
 * based on the JWT identity. The frontend just renders what it gets.
 *
 * @returns {Promise<Object>} Dashboard data payload from backend
 * @throws {Error} If the API request fails
 */
export const fetchDashboard = async () => {
  // Call the personalization dashboard endpoint
  // The JWT is auto-attached by the Axios request interceptor
  const response = await api.get("/personalization/dashboard");

  // Return the dashboard data from the response
  // Shape: { type, user, sections, actions, notifications, meta }
  return response.data.data;
};

/**
 * Invalidate the cached dashboard data on the server.
 *
 * Call this after mutations that change dashboard-relevant data:
 *   - Creating or updating a project
 *   - Changing profile information
 *   - Manual refresh requested by user
 *
 * After invalidation, the next fetchDashboard() call will
 * return fresh data rebuilt from database.
 *
 * @returns {Promise<Object>} Confirmation response
 * @throws {Error} If the API request fails
 */
export const invalidateDashboardCache = async () => {
  // POST to the cache invalidation endpoint
  const response = await api.post("/personalization/cache/invalidate");

  // Return the confirmation response
  return response.data;
};

// ============================================================
// Export all personalization API methods
// Used by the usePersonalization hook
// ============================================================
export default {
  fetchDashboard, // GET dashboard data
  invalidateDashboardCache, // POST cache invalidation
};
