// ============================================================
// GIT REPOSITORY ROUTES — GitHub-Lite API Endpoints
// ============================================================
// Defines Express route handlers for GitHub-like features:
//   - /files/* — File browsing, reading, committing, deleting
//   - /commits/* — Commit list, detail
//   - /branches/* — Branch management
//   - /issues/* — Issue tracking
//   - /pull-requests/* — Code review workflow
//   - /activity/* — Activity feed & contribution graphs
//   - /stats — Repository statistics
//
// Mount: app.use("/api/repos", gitRepoRoutes)
//
// All routes require authentication via JWT.
// DOES NOT modify any existing routes.
// ============================================================

"use strict";

const express = require("express");
const router = express.Router();

// Import authentication middleware
const { authenticate } = require("../middleware/auth");

// Import all controller handlers
const {
  // Files
  getFiles,
  getFile,
  commitFile,
  deleteFile,
  getFileHistory,
  // Commits
  getCommits,
  getCommit,
  // Branches
  getBranches,
  createBranch,
  deleteBranch,
  // Issues
  createIssue,
  getIssues,
  getIssue,
  updateIssue,
  // Pull requests
  createPullRequest,
  getPullRequests,
  updatePullRequest,
  addPrComment,
  // Activity feed
  getActivityFeed,
  getContributionGraph,
  getActivitySummary,
  // Stats
  getRepoStats,
} = require("../controllers/gitRepoController");

// ============================================================
// FILE ROUTES
// ============================================================

// GET /:projectId/files — Browse directory
router.get("/:projectId/files", authenticate, getFiles);

// GET /:projectId/file — Get single file content
router.get("/:projectId/file", authenticate, getFile);

// POST /:projectId/files/commit — Commit a file (create/update)
router.post("/:projectId/files/commit", authenticate, commitFile);

// DELETE /:projectId/files — Delete a file
router.delete("/:projectId/files", authenticate, deleteFile);

// GET /:projectId/files/history — Get file version history
router.get("/:projectId/files/history", authenticate, getFileHistory);

// ============================================================
// COMMIT ROUTES
// ============================================================

// GET /:projectId/commits — List commits
router.get("/:projectId/commits", authenticate, getCommits);

// GET /:projectId/commits/:commitHash — Get commit detail
router.get("/:projectId/commits/:commitHash", authenticate, getCommit);

// ============================================================
// BRANCH ROUTES
// ============================================================

// GET /:projectId/branches — List branches
router.get("/:projectId/branches", authenticate, getBranches);

// POST /:projectId/branches — Create branch
router.post("/:projectId/branches", authenticate, createBranch);

// DELETE /:projectId/branches/:branchName — Delete branch
router.delete("/:projectId/branches/:branchName", authenticate, deleteBranch);

// ============================================================
// ISSUE ROUTES
// ============================================================

// POST /:projectId/issues — Create issue
router.post("/:projectId/issues", authenticate, createIssue);

// GET /:projectId/issues — List issues
router.get("/:projectId/issues", authenticate, getIssues);

// GET /issues/:issueId — Get single issue
router.get("/issues/:issueId", authenticate, getIssue);

// PATCH /issues/:issueId — Update issue
router.patch("/issues/:issueId", authenticate, updateIssue);

// ============================================================
// PULL REQUEST ROUTES
// ============================================================

// POST /:projectId/pull-requests — Create PR
router.post("/:projectId/pull-requests", authenticate, createPullRequest);

// GET /:projectId/pull-requests — List PRs
router.get("/:projectId/pull-requests", authenticate, getPullRequests);

// PATCH /pull-requests/:prId — Update PR
router.patch("/pull-requests/:prId", authenticate, updatePullRequest);

// POST /pull-requests/:prId/comments — Add comment
router.post("/pull-requests/:prId/comments", authenticate, addPrComment);

// ============================================================
// ACTIVITY FEED ROUTES
// ============================================================

// GET /:projectId/activity — Get activity feed
router.get("/:projectId/activity", authenticate, getActivityFeed);

// GET /:projectId/contributions — Get contribution graph
router.get("/:projectId/contributions", authenticate, getContributionGraph);

// GET /:projectId/activity/summary — Get activity summary
router.get("/:projectId/activity/summary", authenticate, getActivitySummary);

// ============================================================
// STATS ROUTE
// ============================================================

// GET /:projectId/stats — Get repository stats
router.get("/:projectId/stats", authenticate, getRepoStats);

module.exports = router;
