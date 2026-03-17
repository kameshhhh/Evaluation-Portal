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
const { requireProjectMember } = require("../middleware/projectMember");

// Import all controller handlers
const {
  // Files
  getFiles,
  getFile,
  commitFile,
  pushFiles,
  deleteFile,
  getFileHistory,
  // Commits
  getCommits,
  getCommit,
  getCommitDiff,
  // Branches
  getBranches,
  createBranch,
  deleteBranch,
  // Issues
  createIssue,
  getIssues,
  getIssue,
  updateIssue,
  getIssueComments,
  addIssueComment,
  // Pull requests
  createPullRequest,
  getPullRequests,
  updatePullRequest,
  addPrComment,
  submitPrReview,
  getPrReviews,
  // Activity feed
  getActivityFeed,
  getContributionGraph,
  getActivitySummary,
  // Stats & members
  getRepoStats,
  getProjectMembers,
  // Sync
  pullCommits,
  getSyncStatus,
  diffBetweenCommits,
} = require("../controllers/gitRepoController");

// ============================================================
// FILE ROUTES
// ============================================================

// GET /:projectId/files — Browse directory
router.get("/:projectId/files", authenticate, requireProjectMember, getFiles);

// GET /:projectId/file — Get single file content
router.get("/:projectId/file", authenticate, requireProjectMember, getFile);

// POST /:projectId/files/commit — Commit a file (create/update)
router.post("/:projectId/files/commit", authenticate, requireProjectMember, commitFile);

// POST /:projectId/push — Push multiple files in one commit
router.post("/:projectId/push", authenticate, requireProjectMember, pushFiles);

// DELETE /:projectId/files — Delete a file
router.delete("/:projectId/files", authenticate, requireProjectMember, deleteFile);

// GET /:projectId/files/history — Get file version history
router.get("/:projectId/files/history", authenticate, requireProjectMember, getFileHistory);

// ============================================================
// COMMIT ROUTES
// ============================================================

// GET /:projectId/commits — List commits
router.get("/:projectId/commits", authenticate, requireProjectMember, getCommits);

// GET /:projectId/commits/:commitHash — Get commit detail
router.get("/:projectId/commits/:commitHash", authenticate, requireProjectMember, getCommit);

// GET /:projectId/commits/:commitHash/diff — Get commit diff
router.get("/:projectId/commits/:commitHash/diff", authenticate, requireProjectMember, getCommitDiff);

// GET /:projectId/commits/:fromHash/diff-to/:toHash — Diff between two commits
router.get("/:projectId/commits/:fromHash/diff-to/:toHash", authenticate, requireProjectMember, diffBetweenCommits);

// ============================================================
// BRANCH ROUTES
// ============================================================

// GET /:projectId/branches — List branches
router.get("/:projectId/branches", authenticate, requireProjectMember, getBranches);

// POST /:projectId/branches — Create branch
router.post("/:projectId/branches", authenticate, requireProjectMember, createBranch);

// DELETE /:projectId/branches/:branchName — Delete branch
router.delete("/:projectId/branches/:branchName", authenticate, requireProjectMember, deleteBranch);

// ============================================================
// ISSUE ROUTES
// ============================================================

// POST /:projectId/issues — Create issue
router.post("/:projectId/issues", authenticate, requireProjectMember, createIssue);

// GET /:projectId/issues — List issues
router.get("/:projectId/issues", authenticate, requireProjectMember, getIssues);

// GET /issues/:issueId — Get single issue
router.get("/issues/:issueId", authenticate, getIssue);

// PATCH /issues/:issueId — Update issue
router.patch("/issues/:issueId", authenticate, updateIssue);

// GET /issues/:issueId/comments — Get issue comments
router.get("/issues/:issueId/comments", authenticate, getIssueComments);

// POST /issues/:issueId/comments — Add issue comment
router.post("/issues/:issueId/comments", authenticate, addIssueComment);

// ============================================================
// PULL REQUEST ROUTES
// ============================================================

// POST /:projectId/pull-requests — Create PR
router.post("/:projectId/pull-requests", authenticate, requireProjectMember, createPullRequest);

// GET /:projectId/pull-requests — List PRs
router.get("/:projectId/pull-requests", authenticate, requireProjectMember, getPullRequests);

// PATCH /pull-requests/:prId — Update PR
router.patch("/pull-requests/:prId", authenticate, updatePullRequest);

// POST /pull-requests/:prId/comments — Add comment
router.post("/pull-requests/:prId/comments", authenticate, addPrComment);

// POST /pull-requests/:prId/reviews — Submit PR review
router.post("/pull-requests/:prId/reviews", authenticate, submitPrReview);

// GET /pull-requests/:prId/reviews — Get PR reviews
router.get("/pull-requests/:prId/reviews", authenticate, getPrReviews);

// ============================================================
// ACTIVITY FEED ROUTES
// ============================================================

// GET /:projectId/activity — Get activity feed
router.get("/:projectId/activity", authenticate, requireProjectMember, getActivityFeed);

// GET /:projectId/contributions — Get contribution graph
router.get("/:projectId/contributions", authenticate, requireProjectMember, getContributionGraph);

// GET /:projectId/activity/summary — Get activity summary
router.get("/:projectId/activity/summary", authenticate, requireProjectMember, getActivitySummary);

// ============================================================
// STATS ROUTE
// ============================================================

// GET /:projectId/stats — Get repository stats
router.get("/:projectId/stats", authenticate, requireProjectMember, getRepoStats);

// GET /:projectId/members — Get project members for dropdowns
router.get("/:projectId/members", authenticate, requireProjectMember, getProjectMembers);

// ============================================================
// SYNC ROUTES
// ============================================================

// GET /:projectId/pull — Pull new commits since a given hash
router.get("/:projectId/pull", authenticate, requireProjectMember, pullCommits);

// GET /:projectId/sync/status — Check sync status (up_to_date / behind / diverged)
router.get("/:projectId/sync/status", authenticate, requireProjectMember, getSyncStatus);

module.exports = router;
