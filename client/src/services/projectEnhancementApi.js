// ============================================================
// PROJECT ENHANCEMENT API — SRS 4.1.1 & 4.1.2 Frontend Service
// ============================================================
// API functions for project management enhancements:
//   - Member profiles (photo, scope, share %)
//   - Monthly plans (CRUD + approval workflow)
//   - Work logs (CRUD + verification + summary)
//   - Review history & improvement indicators
//
// Uses the shared Axios instance from api.js.
// DOES NOT modify any existing services.
// ============================================================

import api from "./api";

// ============================================================
// MEMBER PROFILE API — SRS 4.1.1
// ============================================================

/** Get all enhanced member profiles for a project. */
export const getEnhancedMembers = (projectId) =>
  api.get(`/project-enhancements/${projectId}/members`).then((r) => r.data);

/** Update member profile (photo, scope, technical stack). */
export const updateMemberProfile = (projectId, personId, data) =>
  api
    .patch(
      `/project-enhancements/${projectId}/members/${personId}/profile`,
      data,
    )
    .then((r) => r.data);

/** Update share percentages for all members (must total 100%). */
export const updateSharePercentages = (projectId, distributions) =>
  api
    .put(`/project-enhancements/${projectId}/shares`, { distributions })
    .then((r) => r.data);

// ============================================================
// MONTHLY PLANS API — SRS 4.1.1
// ============================================================

/** Create a monthly plan. */
export const createMonthlyPlan = (projectId, planData) =>
  api
    .post(`/project-enhancements/${projectId}/plans`, planData)
    .then((r) => r.data);

/** Get all monthly plans for a project. */
export const getMonthlyPlans = (projectId, params = {}) =>
  api
    .get(`/project-enhancements/${projectId}/plans`, { params })
    .then((r) => r.data);

/** Get single plan by ID. */
export const getMonthlyPlanById = (planId) =>
  api.get(`/project-enhancements/plans/${planId}`).then((r) => r.data);

/** Update a monthly plan. */
export const updateMonthlyPlan = (projectId, planId, data) =>
  api.patch(`/project-enhancements/plans/${planId}`, data).then((r) => r.data);

/** Transition plan status (draft → submitted → approved → completed). */
export const transitionPlanStatus = (projectId, planId, status) =>
  api
    .post(`/project-enhancements/plans/${planId}/transition`, { status })
    .then((r) => r.data);

// ============================================================
// WORK LOGS API — SRS 4.1.1
// ============================================================

/** Create a work log entry. */
export const createWorkLog = (projectId, logData) =>
  api
    .post(`/project-enhancements/${projectId}/work-logs`, logData)
    .then((r) => r.data);

/** Get work logs with optional filters. */
export const getWorkLogs = (projectId, params = {}) =>
  api
    .get(`/project-enhancements/${projectId}/work-logs`, { params })
    .then((r) => r.data);

/** Get work log summary statistics. */
export const getWorkLogSummary = (projectId, params = {}) =>
  api
    .get(`/project-enhancements/${projectId}/work-logs/summary`, {
      params,
    })
    .then((r) => r.data);

/** Update a work log. */
export const updateWorkLog = (projectId, logId, data) =>
  api
    .patch(`/project-enhancements/work-logs/${logId}`, data)
    .then((r) => r.data);

/** Delete a work log. */
export const deleteWorkLog = (projectId, logId) =>
  api.delete(`/project-enhancements/work-logs/${logId}`).then((r) => r.data);

/** Verify a work log (faculty only). */
export const verifyWorkLog = (projectId, logId) =>
  api
    .post(`/project-enhancements/work-logs/${logId}/verify`)
    .then((r) => r.data);

// ============================================================
// REVIEW HISTORY & IMPROVEMENT API — SRS 4.1.2
// ============================================================

/** Get review/evaluation history for a project. */
export const getReviewHistory = (projectId, params = {}) =>
  api
    .get(`/project-enhancements/${projectId}/review-history`, { params })
    .then((r) => r.data);

/** Get improvement metrics for a team member. */
export const getImprovementMetrics = (projectId, personId, params = {}) =>
  api
    .get(`/project-enhancements/${projectId}/improvement`, {
      params: { personId, ...params },
    })
    .then((r) => r.data);

/** Trigger improvement calculation for all members. */
export const calculateImprovement = (projectId) =>
  api
    .post(`/project-enhancements/${projectId}/improvement/calculate`)
    .then((r) => r.data);

/** Get score comparison for judges (last month vs current). */
export const getScoreComparison = (projectId) =>
  api
    .get(`/project-enhancements/${projectId}/score-comparison`)
    .then((r) => r.data);

/** Get improvement summary for all members. */
export const getImprovementSummary = (projectId) =>
  api
    .get(`/project-enhancements/${projectId}/improvement/summary`)
    .then((r) => r.data);
