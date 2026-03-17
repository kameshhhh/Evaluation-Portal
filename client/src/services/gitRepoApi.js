// ============================================================
// GIT REPOSITORY API — GitHub-Lite Frontend Service
// ============================================================
// API functions for GitHub-like repository features:
//   - File browsing, reading, committing
//   - Commit history
//   - Branch management
//   - Issue tracking
//   - Pull requests
//   - Activity feed & contribution graphs
//
// Uses the shared Axios instance from api.js.
// DOES NOT modify any existing services.
// ============================================================

import api from "./api";

// ============================================================
// FILE API
// ============================================================

/** Browse directory contents. */
export const getFiles = (projectId, path = "", branch = "main") =>
  api
    .get(`/repos/${projectId}/files`, { params: { path, branch } })
    .then((r) => r.data);

/** Get single file with content. Branch-aware. */
export const getFile = (projectId, path, branch = "main") =>
  api.get(`/repos/${projectId}/file`, { params: { path, branch } }).then((r) => r.data);

/** Commit a file (create or update). */
export const commitFile = (projectId, fileData) =>
  api.post(`/repos/${projectId}/files/commit`, fileData).then((r) => r.data);

/** Push multiple files in one atomic commit (like git push). */
export const pushFiles = (projectId, files, message, branch = "main") =>
  api
    .post(`/repos/${projectId}/push`, { files, message, branch })
    .then((r) => r.data);

/** Delete a file. Branch-aware. */
export const deleteRepoFile = (projectId, filePath, message, branch = "main") =>
  api
    .delete(`/repos/${projectId}/files`, { data: { filePath, message, branch } })
    .then((r) => r.data);

/** Get file version history. */
export const getFileHistory = (projectId, path) =>
  api
    .get(`/repos/${projectId}/files/history`, { params: { path } })
    .then((r) => r.data);

// ============================================================
// COMMIT API
// ============================================================

/** Get commit list with optional filters. */
export const getCommits = (projectId, params = {}) =>
  api.get(`/repos/${projectId}/commits`, { params }).then((r) => r.data);

/** Get single commit detail. */
export const getCommitDetail = (projectId, commitHash) =>
  api.get(`/repos/${projectId}/commits/${commitHash}`).then((r) => r.data);

/** Get diff for a commit (old/new content for each changed file). */
export const getCommitDiff = (projectId, commitHash) =>
  api.get(`/repos/${projectId}/commits/${commitHash}/diff`).then((r) => r.data);

// ============================================================
// BRANCH API
// ============================================================

/** List branches. */
export const getBranches = (projectId) =>
  api.get(`/repos/${projectId}/branches`).then((r) => r.data);

/** Create a new branch. */
export const createBranch = (projectId, data) =>
  api
    .post(`/repos/${projectId}/branches`, data)
    .then((r) => r.data);

/** Delete a branch. */
export const deleteBranch = (projectId, branchName) =>
  api.delete(`/repos/${projectId}/branches/${branchName}`).then((r) => r.data);

// ============================================================
// ISSUE API
// ============================================================

/** Create an issue. */
export const createIssue = (projectId, issueData) =>
  api.post(`/repos/${projectId}/issues`, issueData).then((r) => r.data);

/** Get issues with filters. */
export const getIssues = (projectId, params = {}) =>
  api.get(`/repos/${projectId}/issues`, { params }).then((r) => r.data);

/** Get single issue. */
export const getIssueDetail = (issueId) =>
  api.get(`/repos/issues/${issueId}`).then((r) => r.data);

/** Update an issue. */
export const updateIssue = (issueId, data) =>
  api.patch(`/repos/issues/${issueId}`, data).then((r) => r.data);

/** Get comments for an issue. */
export const getIssueComments = (issueId) =>
  api.get(`/repos/issues/${issueId}/comments`).then((r) => r.data);

/** Add a comment to an issue. */
export const addIssueComment = (issueId, body) =>
  api.post(`/repos/issues/${issueId}/comments`, { body }).then((r) => r.data);

// ============================================================
// PULL REQUEST API
// ============================================================

/** Create a pull request. */
export const createPullRequest = (projectId, prData) =>
  api.post(`/repos/${projectId}/pull-requests`, prData).then((r) => r.data);

/** Get pull requests with filters. */
export const getPullRequests = (projectId, params = {}) =>
  api.get(`/repos/${projectId}/pull-requests`, { params }).then((r) => r.data);

/** Update a pull request. */
export const updatePullRequest = (prId, data) =>
  api.patch(`/repos/pull-requests/${prId}`, data).then((r) => r.data);

/** Add a comment to a pull request. */
export const addPrComment = (prId, comment) =>
  api
    .post(`/repos/pull-requests/${prId}/comments`, { comment })
    .then((r) => r.data);

/** Submit a formal review on a pull request. */
export const submitPrReview = (prId, reviewData) =>
  api
    .post(`/repos/pull-requests/${prId}/reviews`, reviewData)
    .then((r) => r.data);

/** Get reviews for a pull request. */
export const getPrReviews = (prId) =>
  api.get(`/repos/pull-requests/${prId}/reviews`).then((r) => r.data);

// ============================================================
// ACTIVITY FEED API
// ============================================================

/** Get activity feed for a project. */
export const getActivityFeed = (projectId, params = {}) =>
  api.get(`/repos/${projectId}/activity`, { params }).then((r) => r.data);

/** Get contribution graph data. */
export const getContributionGraph = (projectId, personId, year) =>
  api
    .get(`/repos/${projectId}/contributions`, {
      params: { personId, year },
    })
    .then((r) => r.data);

/** Get activity summary. */
export const getActivitySummary = (projectId, days = 30) =>
  api
    .get(`/repos/${projectId}/activity/summary`, { params: { days } })
    .then((r) => r.data);

// ============================================================
// STATS API
// ============================================================

/** Get repository stats. */
export const getRepoStats = (projectId) =>
  api.get(`/repos/${projectId}/stats`).then((r) => r.data);

/** Get project members for dropdowns. */
export const getProjectMembers = (projectId) =>
  api.get(`/repos/${projectId}/members`).then((r) => r.data);

// ============================================================
// SYNC API
// ============================================================

/** Pull new commits since a given commit hash. Returns commits + file tree + headHash. */
export const pullCommits = (projectId, params = {}) =>
  api.get(`/repos/${projectId}/pull`, { params }).then((r) => r.data);

/** Check sync status (up_to_date / behind / diverged). */
export const getSyncStatus = (projectId, branch = "main", clientHash = null) =>
  api
    .get(`/repos/${projectId}/sync/status`, {
      params: { branch, clientHash },
    })
    .then((r) => r.data);

/** Diff between two arbitrary commits. */
export const diffBetweenCommits = (projectId, fromHash, toHash) =>
  api
    .get(`/repos/${projectId}/commits/${fromHash}/diff-to/${toHash}`)
    .then((r) => r.data);
