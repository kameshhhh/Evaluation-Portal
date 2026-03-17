// ============================================================
// PROJECT SERVICE — Frontend API Client for Project CRUD
// ============================================================
// Handles all HTTP communication with project API endpoints.
// Uses the pre-configured Axios instance that auto-attaches JWT.
//
// ENDPOINTS:
//   POST   /projects              → Create project with team
//   GET    /projects              → List projects (filtered)
//   GET    /projects/:id          → Get project with team
//   PATCH  /projects/:id          → Update project details
//   POST   /projects/:id/transition → State transition
//   POST   /projects/:id/members  → Add team member
//   DELETE /projects/:id/members/:personId → Remove member
//   GET    /projects/:id/members  → Get active members
//   GET    /projects/:id/history  → Transition history
//   GET    /persons               → List persons (for member search)
// ============================================================

import api from "./api";

// ============================================================
// PROJECT CRUD
// ============================================================

/**
 * Create a new project with initial team members.
 *
 * @param {Object} projectData - { title, description, academicYear, semester, startDate, expectedEndDate }
 * @param {Array} members - [{ personId, roleInProject }]
 * @returns {Promise<{ project: Object, members: Object[] }>}
 */
export const createProject = async (projectData, members = []) => {
  const response = await api.post("/projects", {
    ...projectData,
    members,
  });
  return response.data.data;
};

/**
 * List projects with optional filters and pagination.
 *
 * @param {Object} filters - { status, academicYear, semester }
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{ projects: Object[], pagination: Object }>}
 */
export const listProjects = async (filters = {}, limit = 50, offset = 0) => {
  const params = new URLSearchParams();
  params.append("limit", limit);
  params.append("offset", offset);
  if (filters.status) params.append("status", filters.status);
  if (filters.academicYear) params.append("academicYear", filters.academicYear);
  if (filters.semester) params.append("semester", filters.semester);

  const response = await api.get(`/projects?${params.toString()}`);
  return {
    projects: response.data.data || [],
    pagination: response.data.pagination || {},
  };
};

/**
 * List only the current user's projects (scoped by team membership).
 * Calls GET /api/projects/mine — returns projects where user is an active member.
 *
 * @param {Object} filters - { status, academicYear, semester }
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{ projects: Object[], pagination: Object }>}
 */
export const listMyProjects = async (filters = {}, limit = 50, offset = 0) => {
  const params = new URLSearchParams();
  params.append("limit", limit);
  params.append("offset", offset);
  if (filters.status) params.append("status", filters.status);
  if (filters.academicYear) params.append("academicYear", filters.academicYear);
  if (filters.semester) params.append("semester", filters.semester);

  const response = await api.get(`/projects/mine?${params.toString()}`);
  return {
    projects: response.data.data || [],
    pagination: response.data.pagination || {},
  };
};

/**
 * Get a single project with its team members.
 *
 * @param {string} projectId - UUID
 * @returns {Promise<{ project: Object, members: Object[] }>}
 */
export const getProject = async (projectId) => {
  const response = await api.get(`/projects/${projectId}`);
  return response.data.data;
};

/**
 * Update project details.
 *
 * @param {string} projectId - UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated project
 */
export const updateProject = async (projectId, updates) => {
  const response = await api.patch(`/projects/${projectId}`, updates);
  return response.data.data;
};

/**
 * Transition project to a new state.
 *
 * @param {string} projectId - UUID
 * @param {string} targetStatus - Target state
 * @param {string} reason - Reason for transition
 * @returns {Promise<Object>}
 */
export const transitionProject = async (
  projectId,
  targetStatus,
  reason = "",
) => {
  const response = await api.post(`/projects/${projectId}/transition`, {
    targetStatus,
    reason,
  });
  return response.data;
};

/**
 * Add a team member to a project.
 *
 * @param {string} projectId - UUID
 * @param {string} personId - UUID of the person to add
 * @param {string} roleInProject - Role (team_lead, member, mentor, co_mentor)
 * @returns {Promise<Object>} Added member
 */
export const addMember = async (
  projectId,
  personId,
  roleInProject = "member",
) => {
  const response = await api.post(`/projects/${projectId}/members`, {
    personId,
    roleInProject,
  });
  return response.data.data;
};

/**
 * Remove a team member from a project.
 *
 * @param {string} projectId - UUID
 * @param {string} personId - UUID of the person to remove
 * @returns {Promise<Object>}
 */
export const removeMember = async (projectId, personId) => {
  const response = await api.delete(
    `/projects/${projectId}/members/${personId}`,
  );
  return response.data;
};

/**
 * Get active team members for a project.
 *
 * @param {string} projectId - UUID
 * @returns {Promise<Object[]>} Array of members
 */
export const getMembers = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/members`);
  return response.data.data;
};

/**
 * Get project state transition history.
 *
 * @param {string} projectId - UUID
 * @returns {Promise<Object[]>}
 */
export const getProjectHistory = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/history`);
  return response.data.data;
};

// ============================================================
// PERSON SEARCH — for adding team members
// ============================================================

/**
 * Search persons for team member selection.
 *
 * @param {Object} filters - { personType, status, departmentCode }
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{ persons: Object[], total: number }>}
 */
export const searchPersons = async (filters = {}, limit = 50, offset = 0) => {
  const params = new URLSearchParams();
  params.append("limit", limit);
  params.append("offset", offset);
  if (filters.personType) params.append("personType", filters.personType);
  if (filters.status) params.append("status", filters.status);
  if (filters.departmentCode)
    params.append("departmentCode", filters.departmentCode);

  const response = await api.get(`/persons?${params.toString()}`);
  return {
    persons: response.data.data || [],
    total: response.data.pagination?.total || 0,
  };
};

export default {
  createProject,
  listProjects,
  listMyProjects,
  getProject,
  updateProject,
  transitionProject,
  addMember,
  removeMember,
  getMembers,
  getProjectHistory,
  searchPersons,
};
