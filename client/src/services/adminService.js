// ============================================================
// ADMIN SERVICE — Frontend API Client for Admin Operations
// ============================================================
// Handles all HTTP communication with admin-only API endpoints.
// Uses the pre-configured Axios instance that auto-attaches JWT.
//
// All endpoints require:
//   1. Valid JWT token (via axios interceptor)
//   2. User role = 'admin' (enforced by backend middleware)
//
// ENDPOINTS — USER MANAGEMENT:
//   GET    /users                        → List all users (paginated)
//   PATCH  /users/:userId/role           → Update user role
//   DELETE /users/:userId                → Deactivate user
//   PATCH  /users/:userId/reactivate     → Reactivate user
//   GET    /users/:userId/sessions       → Get user sessions
//   GET    /users/:userId/snapshots      → Get login history
//   GET    /users/role-patterns          → Get role patterns
//
// ENDPOINTS — PROJECT MANAGEMENT:
//   GET    /projects                     → List all projects
//   GET    /projects/:id                 → Get project with team
//   PATCH  /projects/:id                 → Update project details
//   POST   /projects/:id/transition      → Change project state
//   GET    /projects/:id/history         → Get transition history
//
// ENDPOINTS — SYSTEM OPERATIONS:
//   POST   /evaluations/integrity-check  → Run full integrity check
// ============================================================

// Import the pre-configured Axios instance with JWT interceptors
import api from "./api";

// ============================================================
// USER MANAGEMENT API METHODS
// ============================================================

/**
 * Fetch all users with pagination.
 * Returns user records and pagination metadata.
 *
 * @param {number} [page=1] - Page number (1-based)
 * @param {number} [limit=20] - Items per page
 * @returns {Promise<{ users: Object[], pagination: Object }>}
 * @throws {Error} If the API request fails or user lacks admin role
 */
export const fetchUsers = async (page = 1, limit = 20) => {
  // Send GET request with page and limit as query parameters
  const response = await api.get(`/users?page=${page}&limit=${limit}`);
  // Return the nested data payload from the backend response
  return response.data.data;
};

/**
 * Update a user's role assignment.
 * The change takes effect on the user's next login.
 *
 * @param {string} userId - UUID of the user to update
 * @param {string} role - New role ('student', 'faculty', 'admin', 'pending')
 * @returns {Promise<Object>} Updated user record
 * @throws {Error} If userId not found or role is invalid
 */
export const updateUserRole = async (userId, role) => {
  // Send PATCH request with the new role in the body
  const response = await api.patch(`/users/${userId}/role`, { role });
  // Return the updated user data from backend
  return response.data.data;
};

/**
 * Deactivate a user account (soft delete).
 * Revokes all active sessions — user is immediately logged out.
 * The user's identity and history are preserved for audit.
 *
 * @param {string} userId - UUID of the user to deactivate
 * @returns {Promise<Object>} Confirmation with sessions revoked count
 * @throws {Error} If userId not found
 */
export const deactivateUser = async (userId) => {
  // Send DELETE request to soft-delete the user
  const response = await api.delete(`/users/${userId}`);
  // Return the confirmation response
  return response.data;
};

/**
 * Reactivate a previously deactivated user.
 * Restores login ability — user must re-authenticate via Google.
 *
 * @param {string} userId - UUID of the user to reactivate
 * @returns {Promise<Object>} Updated user record with is_active = true
 * @throws {Error} If userId not found
 */
export const reactivateUser = async (userId) => {
  // Send PATCH request to set is_active = true
  const response = await api.patch(`/users/${userId}/reactivate`);
  // Return the reactivated user data
  return response.data.data;
};

/**
 * Fetch active sessions for a specific user.
 * Shows which devices/browsers the user is logged in from.
 *
 * @param {string} userId - UUID of the user
 * @returns {Promise<{ sessions: Object[] }>} User sessions
 * @throws {Error} If userId not found
 */
export const fetchUserSessions = async (userId) => {
  // Send GET request for user's active sessions
  const response = await api.get(`/users/${userId}/sessions`);
  // Return the sessions array
  return response.data.data;
};

/**
 * Fetch login history (identity snapshots) for a specific user.
 * Shows every login event with IP, role, and timestamp.
 *
 * @param {string} userId - UUID of the user
 * @returns {Promise<{ snapshots: Object[] }>} Login history
 * @throws {Error} If userId not found
 */
export const fetchUserSnapshots = async (userId) => {
  // Send GET request for user's login history
  const response = await api.get(`/users/${userId}/snapshots`);
  // Return the snapshots array
  return response.data.data;
};

/**
 * Fetch all configured role patterns.
 * Role patterns map email patterns to roles (e.g., '%.student@bitsathy.ac.in' → 'student').
 *
 * @returns {Promise<{ patterns: Object[] }>} Role patterns list
 */
export const fetchRolePatterns = async () => {
  // Send GET request for all role patterns
  const response = await api.get(`/users/role-patterns`);
  // Return the patterns array
  return response.data.data;
};

// ============================================================
// PROJECT MANAGEMENT API METHODS
// ============================================================

/**
 * Fetch all projects with optional filters.
 * Returns project records with pagination metadata.
 *
 * @param {Object} [filters={}] - Optional filters (status, academicYear, semester)
 * @param {number} [limit=50] - Items per page
 * @param {number} [offset=0] - Offset for pagination
 * @returns {Promise<{ projects: Object[], pagination: Object }>}
 */
export const fetchProjects = async (filters = {}, limit = 50, offset = 0) => {
  // Build query string from filters — only include defined values
  const params = new URLSearchParams();
  // Add limit and offset for pagination
  params.append("limit", limit);
  params.append("offset", offset);
  // Add optional filter parameters if they exist
  if (filters.status) params.append("status", filters.status);
  if (filters.academicYear) params.append("academicYear", filters.academicYear);
  if (filters.semester) params.append("semester", filters.semester);

  // Send GET request with query parameters
  const response = await api.get(`/projects?${params.toString()}`);
  // Return projects array and pagination metadata
  return {
    projects: response.data.data || [],
    pagination: response.data.pagination || {},
  };
};

/**
 * Fetch a single project with its full team members.
 *
 * @param {string} projectId - UUID of the project
 * @returns {Promise<{ project: Object, members: Object[] }>}
 */
export const fetchProjectWithTeam = async (projectId) => {
  // Send GET request for project details + team
  const response = await api.get(`/projects/${projectId}`);
  // Return the project and members data
  return response.data.data;
};

/**
 * Update project details (title, description, etc.).
 * Blocked if the project is currently frozen.
 *
 * @param {string} projectId - UUID of the project
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated project record
 */
export const updateProject = async (projectId, updates) => {
  // Send PATCH request with update fields in the body
  const response = await api.patch(`/projects/${projectId}`, updates);
  // Return the updated project data
  return response.data.data;
};

/**
 * Transition a project to a new state (e.g., active → frozen).
 *
 * @param {string} projectId - UUID of the project
 * @param {string} targetStatus - New status to transition to
 * @param {string} [reason=''] - Optional reason for the transition
 * @returns {Promise<Object>} Updated project with transition info
 */
export const transitionProject = async (
  projectId,
  targetStatus,
  reason = "",
) => {
  // Send POST request with the target status and reason
  const response = await api.post(`/projects/${projectId}/transition`, {
    targetStatus,
    reason,
  });
  // Return the updated project + transition metadata
  return response.data;
};

/**
 * Fetch the state transition history for a project.
 *
 * @param {string} projectId - UUID of the project
 * @returns {Promise<Object[]>} Array of state transition records
 */
export const fetchProjectHistory = async (projectId) => {
  // Send GET request for project's state change history
  const response = await api.get(`/projects/${projectId}/history`);
  // Return the history array
  return response.data.data;
};

/**
 * Fetch team members for a specific project.
 *
 * @param {string} projectId - UUID of the project
 * @returns {Promise<Object[]>} Array of team member records
 */
export const fetchProjectMembers = async (projectId) => {
  // Send GET request for active team members
  const response = await api.get(`/projects/${projectId}/members`);
  // Return the members array
  return response.data.data;
};

// ============================================================
// SYSTEM OPERATION API METHODS
// ============================================================

/**
 * Run a full system integrity check.
 * Verifies data consistency across all entities.
 * Can take a few seconds for large datasets.
 *
 * @returns {Promise<Object>} Integrity check results
 */
export const runIntegrityCheck = async () => {
  // Send POST request to trigger full integrity check
  const response = await api.post(`/evaluations/integrity-check`);
  // Return the integrity check results
  return response.data.data;
};

// ============================================================
// Export all admin service methods
// Used by the useAdmin hook and admin components
// ============================================================
export default {
  fetchUsers,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  fetchUserSessions,
  fetchUserSnapshots,
  fetchRolePatterns,
  fetchProjects,
  fetchProjectWithTeam,
  updateProject,
  transitionProject,
  fetchProjectHistory,
  fetchProjectMembers,
  runIntegrityCheck,
};
