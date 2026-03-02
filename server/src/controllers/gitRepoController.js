// ============================================================
// GIT REPOSITORY CONTROLLER — GitHub-Lite API Endpoints
// ============================================================
// HTTP handlers for GitHub-like repository features:
//   - Repository files (browse, read, commit, delete)
//   - Commits (list, detail)
//   - Branches (list, create, delete)
//   - Issues (CRUD, status transitions)
//   - Pull requests (create, update, comment, merge)
//   - Activity feed & contribution graphs
//   - Repository stats
//
// DOES NOT modify any existing controllers.
// ============================================================

"use strict";

const GitRepositoryService = require("../services/GitRepositoryService");
const ActivityStreamService = require("../services/ActivityStreamService");
const logger = require("../utils/logger");

// ============================================================
// FILE HANDLERS
// ============================================================

const getFiles = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const dirPath = req.query.path || "";
    const branch = req.query.branch || "main";
    const files = await GitRepositoryService.getFiles(
      projectId,
      dirPath,
      branch,
    );
    res.json({ success: true, data: files });
  } catch (error) {
    next(error);
  }
};

const getFile = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const filePath = req.query.path;
    if (!filePath) {
      return res
        .status(400)
        .json({ success: false, error: "path query required" });
    }
    const file = await GitRepositoryService.getFile(projectId, filePath);
    if (!file) {
      return res.status(404).json({ success: false, error: "File not found" });
    }
    res.json({ success: true, data: file });
  } catch (error) {
    next(error);
  }
};

const commitFile = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const authorId = req.user?.personId || req.user?.userId;
    const { filePath, fileName, content, mimeType, branch, message } = req.body;

    if (!filePath || !fileName || !message) {
      return res.status(400).json({
        success: false,
        error: "filePath, fileName, and message are required",
      });
    }

    const commit = await GitRepositoryService.commitFile(
      projectId,
      authorId,
      { filePath, fileName, content, mimeType, branch },
      message,
    );

    // Log activity
    await ActivityStreamService.logActivity(projectId, authorId, {
      activityType: "commit",
      targetType: "file",
      targetName: filePath,
      data: { commitHash: commit.commit_hash, message, filePath },
    });

    res.status(201).json({ success: true, data: commit });
  } catch (error) {
    next(error);
  }
};

const deleteFile = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const authorId = req.user?.personId || req.user?.userId;
    const { filePath, message } = req.body;

    if (!filePath) {
      return res
        .status(400)
        .json({ success: false, error: "filePath required" });
    }

    const result = await GitRepositoryService.deleteFile(
      projectId,
      authorId,
      filePath,
      message,
    );

    await ActivityStreamService.logActivity(projectId, authorId, {
      activityType: "file_delete",
      targetType: "file",
      targetName: filePath,
      data: { filePath },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getFileHistory = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const filePath = req.query.path;
    if (!filePath) {
      return res
        .status(400)
        .json({ success: false, error: "path query required" });
    }
    const history = await GitRepositoryService.getFileHistory(
      projectId,
      filePath,
    );
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// COMMIT HANDLERS
// ============================================================

const getCommits = async (req, res, next) => {
  try {
    const filters = {
      branch: req.query.branch || undefined,
      authorId: req.query.authorId || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : undefined,
    };
    const commits = await GitRepositoryService.getCommits(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: commits });
  } catch (error) {
    next(error);
  }
};

const getCommit = async (req, res, next) => {
  try {
    const commit = await GitRepositoryService.getCommit(
      req.params.projectId,
      req.params.commitHash,
    );
    if (!commit) {
      return res
        .status(404)
        .json({ success: false, error: "Commit not found" });
    }
    res.json({ success: true, data: commit });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// BRANCH HANDLERS
// ============================================================

const getBranches = async (req, res, next) => {
  try {
    const branches = await GitRepositoryService.getBranches(
      req.params.projectId,
    );
    res.json({ success: true, data: branches });
  } catch (error) {
    next(error);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const createdBy = req.user?.personId || req.user?.userId;
    const { branchName, fromBranch } = req.body;

    if (!branchName) {
      return res
        .status(400)
        .json({ success: false, error: "branchName required" });
    }

    const branch = await GitRepositoryService.createBranch(
      req.params.projectId,
      branchName,
      fromBranch,
      createdBy,
    );

    await ActivityStreamService.logActivity(req.params.projectId, createdBy, {
      activityType: "branch_create",
      targetType: "branch",
      targetName: branchName,
      data: { branchName, fromBranch: fromBranch || "main" },
    });

    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
};

const deleteBranch = async (req, res, next) => {
  try {
    const result = await GitRepositoryService.deleteBranch(
      req.params.projectId,
      req.params.branchName,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ISSUE HANDLERS
// ============================================================

const createIssue = async (req, res, next) => {
  try {
    const reporterId = req.user?.personId || req.user?.userId;
    const issue = await GitRepositoryService.createIssue(
      req.params.projectId,
      reporterId,
      req.body,
    );

    await ActivityStreamService.logActivity(req.params.projectId, reporterId, {
      activityType: "issue_create",
      targetType: "issue",
      targetId: issue.issue_id,
      targetName: `#${issue.issue_number} ${issue.title}`,
      data: { issueNumber: issue.issue_number, title: issue.title },
    });

    res.status(201).json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

const getIssues = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status || undefined,
      assigneeId: req.query.assigneeId || undefined,
      issueType: req.query.issueType || undefined,
      priority: req.query.priority || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    };
    const issues = await GitRepositoryService.getIssues(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: issues });
  } catch (error) {
    next(error);
  }
};

const getIssue = async (req, res, next) => {
  try {
    const issue = await GitRepositoryService.getIssue(req.params.issueId);
    if (!issue) {
      return res.status(404).json({ success: false, error: "Issue not found" });
    }
    res.json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

const updateIssue = async (req, res, next) => {
  try {
    const actorId = req.user?.personId || req.user?.userId;
    const updates = { ...req.body };
    if (updates.status === "closed" || updates.status === "done") {
      updates.closedBy = actorId;
    }

    const issue = await GitRepositoryService.updateIssue(
      req.params.issueId,
      updates,
    );

    await ActivityStreamService.logActivity(issue.project_id, actorId, {
      activityType: "issue_update",
      targetType: "issue",
      targetId: issue.issue_id,
      targetName: `#${issue.issue_number} ${issue.title}`,
      data: { issueNumber: issue.issue_number, changes: Object.keys(req.body) },
    });

    res.json({ success: true, data: issue });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// PULL REQUEST HANDLERS
// ============================================================

const createPullRequest = async (req, res, next) => {
  try {
    const authorId = req.user?.personId || req.user?.userId;
    const pr = await GitRepositoryService.createPullRequest(
      req.params.projectId,
      authorId,
      req.body,
    );

    await ActivityStreamService.logActivity(req.params.projectId, authorId, {
      activityType: "pr_create",
      targetType: "pull_request",
      targetId: pr.pr_id,
      targetName: `#${pr.pr_number} ${pr.title}`,
      data: {
        prNumber: pr.pr_number,
        title: pr.title,
        sourceBranch: pr.source_branch,
      },
    });

    res.status(201).json({ success: true, data: pr });
  } catch (error) {
    next(error);
  }
};

const getPullRequests = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    };
    const prs = await GitRepositoryService.getPullRequests(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: prs });
  } catch (error) {
    next(error);
  }
};

const updatePullRequest = async (req, res, next) => {
  try {
    const actorId = req.user?.personId || req.user?.userId;
    const pr = await GitRepositoryService.updatePullRequest(
      req.params.prId,
      req.body,
      actorId,
    );

    await ActivityStreamService.logActivity(pr.project_id, actorId, {
      activityType: `pr_${req.body.status || "update"}`,
      targetType: "pull_request",
      targetId: pr.pr_id,
      targetName: `#${pr.pr_number} ${pr.title}`,
      data: { prNumber: pr.pr_number, changes: Object.keys(req.body) },
    });

    res.json({ success: true, data: pr });
  } catch (error) {
    next(error);
  }
};

const addPrComment = async (req, res, next) => {
  try {
    const authorId = req.user?.personId || req.user?.userId;
    const { comment } = req.body;
    if (!comment) {
      return res
        .status(400)
        .json({ success: false, error: "comment required" });
    }
    const pr = await GitRepositoryService.addPrComment(
      req.params.prId,
      authorId,
      comment,
    );
    res.json({ success: true, data: pr });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// ACTIVITY FEED HANDLERS
// ============================================================

const getActivityFeed = async (req, res, next) => {
  try {
    const filters = {
      activityType: req.query.type || undefined,
      actorId: req.query.actorId || undefined,
      since: req.query.since || undefined,
      until: req.query.until || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : undefined,
    };
    const feed = await ActivityStreamService.getActivityFeed(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
};

const getContributionGraph = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { personId, year } = req.query;
    const graph = await ActivityStreamService.getContributionGraph(
      projectId,
      personId || null,
      year ? parseInt(year, 10) : undefined,
    );
    res.json({ success: true, data: graph });
  } catch (error) {
    next(error);
  }
};

const getActivitySummary = async (req, res, next) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const summary = await ActivityStreamService.getActivitySummary(
      req.params.projectId,
      days,
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// REPOSITORY STATS HANDLER
// ============================================================

const getRepoStats = async (req, res, next) => {
  try {
    const stats = await GitRepositoryService.getRepoStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
