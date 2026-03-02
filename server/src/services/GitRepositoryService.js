// ============================================================
// GIT REPOSITORY SERVICE — GitHub-Lite Innovation
// ============================================================
// Handles all GitHub-like repository features:
//   - File management (upload, read, version history)
//   - Commits (create, list, diff)
//   - Branches (create, switch, merge)
//   - Issues (CRUD, status workflow, assignments)
//   - Pull requests (create, review, merge)
//
// DOES NOT modify any existing services.
// ============================================================

"use strict";

const crypto = require("crypto");
const pool = require("../config/database");
const logger = require("../utils/logger");

class GitRepositoryService {
  // ============================================================
  // FILE MANAGEMENT
  // ============================================================

  /**
   * Create or update a file in the repository.
   * Creates a new commit for the change.
   */
  static async commitFile(projectId, authorId, fileData, commitMessage) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { filePath, fileName, content, mimeType } = fileData;

      // Generate blob hash from content
      const blobHash = crypto
        .createHash("sha256")
        .update(content || "")
        .digest("hex");

      // Check if file already exists (current version)
      const existing = await client.query(
        `SELECT file_id FROM repository_files
         WHERE project_id = $1 AND file_path = $2 AND is_current = TRUE AND deleted_at IS NULL`,
        [projectId, filePath],
      );

      // Mark old version as not current
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE repository_files SET is_current = FALSE
           WHERE project_id = $1 AND file_path = $2 AND is_current = TRUE`,
          [projectId, filePath],
        );
      }

      // Get author name
      const author = await client.query(
        "SELECT display_name FROM persons WHERE person_id = $1",
        [authorId],
      );
      const authorName = author.rows[0]?.display_name || "Unknown";

      // Create commit
      const commitHash = crypto
        .createHash("sha256")
        .update(`${projectId}${filePath}${blobHash}${Date.now()}`)
        .digest("hex");

      // Determine branch (default: main)
      const branch = fileData.branch || "main";

      // Calculate additions/deletions for text files
      const oldContent =
        existing.rows.length > 0
          ? (
              await client.query(
                "SELECT content FROM repository_files WHERE file_id = $1",
                [existing.rows[0].file_id],
              )
            ).rows[0]?.content || ""
          : "";

      const additions = (content || "").split("\n").length;
      const deletions =
        existing.rows.length > 0 ? oldContent.split("\n").length : 0;

      const commitResult = await client.query(
        `INSERT INTO repository_commits
           (project_id, commit_hash, author_id, author_name, message, branch,
            additions, deletions, changed_files, file_changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)
         RETURNING *`,
        [
          projectId,
          commitHash,
          authorId,
          authorName,
          commitMessage,
          branch,
          additions,
          deletions,
          JSON.stringify([
            {
              path: filePath,
              action: existing.rows.length > 0 ? "modified" : "added",
              additions,
              deletions,
            },
          ]),
        ],
      );

      // Insert new file version
      await client.query(
        `INSERT INTO repository_files
           (project_id, file_path, file_name, file_type, mime_type, file_size,
            content, blob_hash, parent_commit_id, is_current, author_id)
         VALUES ($1, $2, $3, 'file', $4, $5, $6, $7, $8, TRUE, $9)`,
        [
          projectId,
          filePath,
          fileName,
          mimeType || "text/plain",
          Buffer.byteLength(content || "", "utf8"),
          content,
          blobHash,
          commitResult.rows[0].commit_id,
          authorId,
        ],
      );

      // Update branch head
      await client.query(
        `INSERT INTO repository_branches (project_id, branch_name, head_commit_id, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, branch_name)
         DO UPDATE SET head_commit_id = $3, updated_at = NOW()`,
        [
          projectId,
          branch,
          commitResult.rows[0].commit_id,
          branch === "main",
          authorId,
        ],
      );

      await client.query("COMMIT");
      logger.info("File committed", {
        projectId,
        filePath,
        commitHash: commitHash.substring(0, 8),
      });
      return commitResult.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a file (soft delete) and create a commit for it.
   */
  static async deleteFile(projectId, authorId, filePath, commitMessage) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE repository_files
         SET deleted_at = NOW(), is_current = FALSE
         WHERE project_id = $1 AND file_path = $2 AND is_current = TRUE AND deleted_at IS NULL
         RETURNING *`,
        [projectId, filePath],
      );

      if (result.rows.length === 0) {
        throw new Error("File not found");
      }

      // Create delete commit
      const commitHash = crypto
        .createHash("sha256")
        .update(`${projectId}${filePath}delete${Date.now()}`)
        .digest("hex");

      const author = await client.query(
        "SELECT display_name FROM persons WHERE person_id = $1",
        [authorId],
      );

      await client.query(
        `INSERT INTO repository_commits
           (project_id, commit_hash, author_id, author_name, message, branch,
            deletions, changed_files, file_changes)
         VALUES ($1, $2, $3, $4, $5, 'main', $6, 1, $7)`,
        [
          projectId,
          commitHash,
          authorId,
          author.rows[0]?.display_name || "Unknown",
          commitMessage || `Delete ${filePath}`,
          (result.rows[0].content || "").split("\n").length,
          JSON.stringify([{ path: filePath, action: "deleted" }]),
        ],
      );

      await client.query("COMMIT");
      return { deleted: true, filePath };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get files in a directory (or root) of a project repository.
   */
  static async getFiles(projectId, dirPath = "", branch = "main") {
    // If dirPath is empty, get root level files
    const pattern = dirPath ? `${dirPath}/%` : "%";
    const depth = dirPath ? dirPath.split("/").length + 1 : 1;

    const result = await pool.query(
      `SELECT DISTINCT ON (file_path)
         file_id, file_path, file_name, file_type, mime_type, file_size,
         blob_hash, author_id, created_at, updated_at
       FROM repository_files
       WHERE project_id = $1
         AND is_current = TRUE
         AND deleted_at IS NULL
         AND ($2 = '' OR file_path LIKE $3)
         AND array_length(string_to_array(file_path, '/'), 1) = $4
       ORDER BY file_path, updated_at DESC`,
      [projectId, dirPath, pattern, depth],
    );

    return result.rows;
  }

  /**
   * Get a single file with content.
   */
  static async getFile(projectId, filePath) {
    const result = await pool.query(
      `SELECT rf.*, p.display_name AS author_name
       FROM repository_files rf
       LEFT JOIN persons p ON rf.author_id = p.person_id
       WHERE rf.project_id = $1 AND rf.file_path = $2
         AND rf.is_current = TRUE AND rf.deleted_at IS NULL`,
      [projectId, filePath],
    );

    return result.rows[0] || null;
  }

  /**
   * Get file version history.
   */
  static async getFileHistory(projectId, filePath) {
    const result = await pool.query(
      `SELECT rf.file_id, rf.blob_hash, rf.file_size, rf.created_at,
              rc.commit_hash, rc.message AS commit_message, rc.committed_at,
              p.display_name AS author_name
       FROM repository_files rf
       LEFT JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
       LEFT JOIN persons p ON rf.author_id = p.person_id
       WHERE rf.project_id = $1 AND rf.file_path = $2
       ORDER BY rf.created_at DESC`,
      [projectId, filePath],
    );

    return result.rows;
  }

  // ============================================================
  // COMMITS
  // ============================================================

  /**
   * Get commits for a project with optional filters.
   */
  static async getCommits(projectId, filters = {}) {
    let query = `
      SELECT rc.*, p.display_name AS author_display_name,
             pm.photo_url AS author_photo
      FROM repository_commits rc
      LEFT JOIN persons p ON rc.author_id = p.person_id
      LEFT JOIN project_members pm ON rc.author_id = pm.person_id
        AND pm.project_id = rc.project_id AND pm.left_at IS NULL
      WHERE rc.project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.branch) {
      query += ` AND rc.branch = $${idx}`;
      values.push(filters.branch);
      idx++;
    }

    if (filters.authorId) {
      query += ` AND rc.author_id = $${idx}`;
      values.push(filters.authorId);
      idx++;
    }

    query += " ORDER BY rc.committed_at DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
      idx++;
    }

    if (filters.offset) {
      query += ` OFFSET $${idx}`;
      values.push(filters.offset);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get a single commit with its file changes.
   */
  static async getCommit(projectId, commitHash) {
    const result = await pool.query(
      `SELECT rc.*, p.display_name AS author_display_name
       FROM repository_commits rc
       LEFT JOIN persons p ON rc.author_id = p.person_id
       WHERE rc.project_id = $1 AND rc.commit_hash = $2`,
      [projectId, commitHash],
    );

    return result.rows[0] || null;
  }

  // ============================================================
  // BRANCHES
  // ============================================================

  /**
   * Get all branches for a project.
   */
  static async getBranches(projectId) {
    const result = await pool.query(
      `SELECT rb.*, p.display_name AS created_by_name,
              rc.message AS last_commit_message,
              rc.committed_at AS last_commit_date
       FROM repository_branches rb
       LEFT JOIN persons p ON rb.created_by = p.person_id
       LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
       WHERE rb.project_id = $1
       ORDER BY rb.is_default DESC, rb.updated_at DESC`,
      [projectId],
    );
    return result.rows;
  }

  /**
   * Create a new branch.
   */
  static async createBranch(projectId, branchName, fromBranch, createdBy) {
    // Get head commit of source branch
    const source = await pool.query(
      `SELECT head_commit_id FROM repository_branches
       WHERE project_id = $1 AND branch_name = $2`,
      [projectId, fromBranch || "main"],
    );

    const headCommitId = source.rows[0]?.head_commit_id || null;

    const result = await pool.query(
      `INSERT INTO repository_branches
         (project_id, branch_name, head_commit_id, is_default, created_by)
       VALUES ($1, $2, $3, FALSE, $4)
       RETURNING *`,
      [projectId, branchName, headCommitId, createdBy],
    );

    logger.info("Branch created", { projectId, branchName });
    return result.rows[0];
  }

  /**
   * Delete a branch (cannot delete default or protected branches).
   */
  static async deleteBranch(projectId, branchName) {
    const result = await pool.query(
      `DELETE FROM repository_branches
       WHERE project_id = $1 AND branch_name = $2
         AND is_default = FALSE AND is_protected = FALSE
       RETURNING branch_id`,
      [projectId, branchName],
    );

    if (result.rows.length === 0) {
      throw new Error("Branch not found or is protected/default");
    }

    return { deleted: true };
  }

  // ============================================================
  // ISSUES — Bug/Feature Tracking
  // ============================================================

  /**
   * Create a new issue.
   */
  static async createIssue(projectId, reporterId, issueData) {
    // Get next issue number
    const numResult = await pool.query(
      "SELECT next_issue_number($1) AS issue_number",
      [projectId],
    );
    const issueNumber = numResult.rows[0].issue_number;

    const {
      title,
      description,
      issueType,
      priority,
      assigneeId,
      estimateHours,
      dueDate,
      labels,
      milestone,
    } = issueData;

    const result = await pool.query(
      `INSERT INTO project_issues
         (project_id, issue_number, title, description, issue_type, priority,
          assignee_id, reporter_id, estimate_hours, due_date, labels, milestone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        projectId,
        issueNumber,
        title,
        description || null,
        issueType || "task",
        priority || "medium",
        assigneeId || null,
        reporterId,
        estimateHours || null,
        dueDate || null,
        labels || [],
        milestone || null,
      ],
    );

    logger.info("Issue created", { projectId, issueNumber });
    return result.rows[0];
  }

  /**
   * Update an issue.
   */
  static async updateIssue(issueId, updates) {
    const allowed = [
      "title",
      "description",
      "issue_type",
      "status",
      "priority",
      "assignee_id",
      "estimate_hours",
      "actual_hours",
      "due_date",
      "labels",
      "milestone",
      "linked_commit_id",
    ];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    // Handle status transitions — set closed_at
    if (updates.status === "closed" || updates.status === "done") {
      setClauses.push(`closed_at = NOW()`);
      if (updates.closedBy) {
        setClauses.push(`closed_by = $${idx}`);
        values.push(updates.closedBy);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(issueId);

    const result = await pool.query(
      `UPDATE project_issues SET ${setClauses.join(", ")} WHERE issue_id = $${idx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Issue not found");
    }

    return result.rows[0];
  }

  /**
   * Get issues for a project with filters.
   */
  static async getIssues(projectId, filters = {}) {
    let query = `
      SELECT pi.*,
             a.display_name AS assignee_name,
             r.display_name AS reporter_name,
             pm.photo_url AS assignee_photo
      FROM project_issues pi
      LEFT JOIN persons a ON pi.assignee_id = a.person_id
      LEFT JOIN persons r ON pi.reporter_id = r.person_id
      LEFT JOIN project_members pm ON pi.assignee_id = pm.person_id
        AND pm.project_id = pi.project_id AND pm.left_at IS NULL
      WHERE pi.project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.status) {
      query += ` AND pi.status = $${idx}`;
      values.push(filters.status);
      idx++;
    }

    if (filters.assigneeId) {
      query += ` AND pi.assignee_id = $${idx}`;
      values.push(filters.assigneeId);
      idx++;
    }

    if (filters.issueType) {
      query += ` AND pi.issue_type = $${idx}`;
      values.push(filters.issueType);
      idx++;
    }

    if (filters.priority) {
      query += ` AND pi.priority = $${idx}`;
      values.push(filters.priority);
      idx++;
    }

    query += " ORDER BY pi.created_at DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
      idx++;
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get a single issue by ID.
   */
  static async getIssue(issueId) {
    const result = await pool.query(
      `SELECT pi.*,
              a.display_name AS assignee_name,
              r.display_name AS reporter_name
       FROM project_issues pi
       LEFT JOIN persons a ON pi.assignee_id = a.person_id
       LEFT JOIN persons r ON pi.reporter_id = r.person_id
       WHERE pi.issue_id = $1`,
      [issueId],
    );
    return result.rows[0] || null;
  }

  // ============================================================
  // PULL REQUESTS
  // ============================================================

  /**
   * Create a pull request.
   */
  static async createPullRequest(projectId, authorId, prData) {
    const numResult = await pool.query(
      "SELECT next_pr_number($1) AS pr_number",
      [projectId],
    );
    const prNumber = numResult.rows[0].pr_number;

    const { title, description, sourceBranch, targetBranch, reviewerIds } =
      prData;

    // Count commits between branches
    const commitCount = await pool.query(
      `SELECT COUNT(*) AS count FROM repository_commits
       WHERE project_id = $1 AND branch = $2`,
      [projectId, sourceBranch],
    );

    const result = await pool.query(
      `INSERT INTO pull_requests
         (project_id, pr_number, title, description, source_branch, target_branch,
          author_id, reviewer_ids, commit_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        projectId,
        prNumber,
        title,
        description || null,
        sourceBranch,
        targetBranch || "main",
        authorId,
        reviewerIds || [],
        parseInt(commitCount.rows[0]?.count) || 0,
      ],
    );

    logger.info("Pull request created", { projectId, prNumber });
    return result.rows[0];
  }

  /**
   * Update a pull request (add comment, change status, merge).
   */
  static async updatePullRequest(prId, updates, actorId) {
    const allowed = ["title", "description", "status", "reviewer_ids"];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    // Handle merge
    if (updates.status === "merged") {
      setClauses.push(`merged_at = NOW()`);
      setClauses.push(`merged_by = $${idx}`);
      values.push(actorId);
      idx++;
    }

    // Handle close
    if (updates.status === "closed") {
      setClauses.push(`closed_at = NOW()`);
      setClauses.push(`closed_by = $${idx}`);
      values.push(actorId);
      idx++;
    }

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(prId);

    const result = await pool.query(
      `UPDATE pull_requests SET ${setClauses.join(", ")} WHERE pr_id = $${idx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Pull request not found");
    }

    return result.rows[0];
  }

  /**
   * Add a comment to a pull request.
   */
  static async addPrComment(prId, authorId, comment) {
    const author = await pool.query(
      "SELECT display_name FROM persons WHERE person_id = $1",
      [authorId],
    );

    const newComment = {
      id: crypto.randomUUID(),
      authorId,
      authorName: author.rows[0]?.display_name || "Unknown",
      body: comment,
      createdAt: new Date().toISOString(),
    };

    const result = await pool.query(
      `UPDATE pull_requests
       SET comments = comments || $1::jsonb
       WHERE pr_id = $2
       RETURNING *`,
      [JSON.stringify([newComment]), prId],
    );

    if (result.rows.length === 0) {
      throw new Error("Pull request not found");
    }

    return result.rows[0];
  }

  /**
   * Get pull requests for a project.
   */
  static async getPullRequests(projectId, filters = {}) {
    let query = `
      SELECT pr.*, p.display_name AS author_name,
             pm.photo_url AS author_photo
      FROM pull_requests pr
      LEFT JOIN persons p ON pr.author_id = p.person_id
      LEFT JOIN project_members pm ON pr.author_id = pm.person_id
        AND pm.project_id = pr.project_id AND pm.left_at IS NULL
      WHERE pr.project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.status) {
      query += ` AND pr.status = $${idx}`;
      values.push(filters.status);
      idx++;
    }

    query += " ORDER BY pr.created_at DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get repository stats (file count, commit count, branch count, etc.).
   */
  static async getRepoStats(projectId) {
    const [files, commits, branches, issues] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) AS count FROM repository_files WHERE project_id = $1 AND is_current = TRUE AND deleted_at IS NULL",
        [projectId],
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM repository_commits WHERE project_id = $1",
        [projectId],
      ),
      pool.query(
        "SELECT COUNT(*) AS count FROM repository_branches WHERE project_id = $1",
        [projectId],
      ),
      pool.query(
        "SELECT COUNT(*) AS count, COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_count FROM project_issues WHERE project_id = $1",
        [projectId],
      ),
    ]);

    return {
      files: parseInt(files.rows[0]?.count) || 0,
      commits: parseInt(commits.rows[0]?.count) || 0,
      branches: parseInt(branches.rows[0]?.count) || 0,
      totalIssues: parseInt(issues.rows[0]?.count) || 0,
      openIssues: parseInt(issues.rows[0]?.open_count) || 0,
    };
  }
}

module.exports = GitRepositoryService;
