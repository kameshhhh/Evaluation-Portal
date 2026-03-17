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
const { getClient } = require("../config/database");
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
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const { filePath, fileName, content, mimeType } = fileData;
      const branch = fileData.branch || "main";

      // Generate blob hash from content
      const blobHash = crypto
        .createHash("sha256")
        .update(content || "")
        .digest("hex");

      // Check if file already exists (on this branch or main)
      const existing = await client.query(
        `SELECT rf.file_id FROM repository_files rf
         JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
         WHERE rf.project_id = $1 AND rf.file_path = $2
           AND rf.is_current = TRUE AND rf.deleted_at IS NULL
           AND rc.branch IN ($3, 'main')
         ORDER BY CASE WHEN rc.branch = $3 THEN 0 ELSE 1 END
         LIMIT 1`,
        [projectId, filePath, branch],
      );

      // Mark old version as not-current (ONLY on the same branch)
      await client.query(
        `UPDATE repository_files SET is_current = FALSE
         WHERE file_id IN (
           SELECT rf.file_id FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.file_path = $2
             AND rf.is_current = TRUE AND rc.branch = $3
         )`,
        [projectId, filePath, branch],
      );

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

      // Get current branch head for parent commit chain
      const headResult = await client.query(
        `SELECT rb.head_commit_id, rc.commit_hash AS head_hash
         FROM repository_branches rb
         LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
         WHERE rb.project_id = $1 AND rb.branch_name = $2`,
        [projectId, branch],
      );
      const parentCommitId = headResult.rows[0]?.head_commit_id || null;
      const parentHash = headResult.rows[0]?.head_hash || null;

      // Optimistic lock: reject if branch moved since client last synced
      if (fileData.expectedHead && parentHash && fileData.expectedHead !== parentHash) {
        const err = new Error("Branch has diverged. Pull latest changes before pushing.");
        err.statusCode = 409;
        err.currentHead = parentHash;
        throw err;
      }

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
           (project_id, commit_hash, parent_commit_id, parent_hash, author_id, author_name, message, branch,
            additions, deletions, changed_files, file_changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
         RETURNING *`,
        [
          projectId,
          commitHash,
          parentCommitId,
          parentHash,
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
   * Batch commit multiple files in one atomic commit (like git push).
   * Creates a single commit with all file changes.
   */
  static async batchCommitFiles(projectId, authorId, files, commitMessage, branch = "main", expectedHead = null) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const author = await client.query(
        "SELECT display_name FROM persons WHERE person_id = $1",
        [authorId],
      );
      const authorName = author.rows[0]?.display_name || "Unknown";

      // Create a single commit for the entire push
      const commitHash = crypto
        .createHash("sha256")
        .update(`${projectId}${branch}push${files.length}${Date.now()}`)
        .digest("hex");

      let totalAdditions = 0;
      let totalDeletions = 0;
      const fileChanges = [];

      // Pre-calculate diff stats
      for (const f of files) {
        const existing = await client.query(
          `SELECT rf.file_id, rf.content FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.file_path = $2
             AND rf.is_current = TRUE AND rf.deleted_at IS NULL
             AND rc.branch IN ($3, 'main')
           ORDER BY CASE WHEN rc.branch = $3 THEN 0 ELSE 1 END
           LIMIT 1`,
          [projectId, f.filePath, branch],
        );

        const additions = (f.content || "").split("\n").length;
        const deletions = existing.rows.length > 0
          ? (existing.rows[0].content || "").split("\n").length
          : 0;

        totalAdditions += additions;
        totalDeletions += deletions;
        fileChanges.push({
          path: f.filePath,
          action: existing.rows.length > 0 ? "modified" : "added",
          additions,
          deletions,
        });
      }

      // Get current branch head for parent commit chain
      const headResult = await client.query(
        `SELECT rb.head_commit_id, rc.commit_hash AS head_hash
         FROM repository_branches rb
         LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
         WHERE rb.project_id = $1 AND rb.branch_name = $2`,
        [projectId, branch],
      );
      const parentCommitId = headResult.rows[0]?.head_commit_id || null;
      const parentHash = headResult.rows[0]?.head_hash || null;

      // Optimistic lock: reject if branch moved since client last synced
      if (expectedHead && parentHash && expectedHead !== parentHash) {
        const err = new Error("Branch has diverged. Pull latest changes before pushing.");
        err.statusCode = 409;
        err.currentHead = parentHash;
        throw err;
      }

      const commitResult = await client.query(
        `INSERT INTO repository_commits
           (project_id, commit_hash, parent_commit_id, parent_hash, author_id, author_name, message, branch,
            additions, deletions, changed_files, file_changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          projectId,
          commitHash,
          parentCommitId,
          parentHash,
          authorId,
          authorName,
          commitMessage,
          branch,
          totalAdditions,
          totalDeletions,
          files.length,
          JSON.stringify(fileChanges),
        ],
      );

      // Insert each file version
      for (const f of files) {
        const blobHash = crypto
          .createHash("sha256")
          .update(f.content || "")
          .digest("hex");

        // Mark old version as not-current on the same branch
        await client.query(
          `UPDATE repository_files SET is_current = FALSE
           WHERE file_id IN (
             SELECT rf.file_id FROM repository_files rf
             JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
             WHERE rf.project_id = $1 AND rf.file_path = $2
               AND rf.is_current = TRUE AND rc.branch = $3
           )`,
          [projectId, f.filePath, branch],
        );

        const fileName = f.filePath.split("/").pop();
        await client.query(
          `INSERT INTO repository_files
             (project_id, file_path, file_name, file_type, mime_type, file_size,
              content, blob_hash, parent_commit_id, is_current, author_id)
           VALUES ($1, $2, $3, 'file', $4, $5, $6, $7, $8, TRUE, $9)`,
          [
            projectId,
            f.filePath,
            fileName,
            f.mimeType || "text/plain",
            Buffer.byteLength(f.content || "", "utf8"),
            f.content,
            blobHash,
            commitResult.rows[0].commit_id,
            authorId,
          ],
        );
      }

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
      logger.info("Batch push committed", {
        projectId,
        branch,
        fileCount: files.length,
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
  static async deleteFile(projectId, authorId, filePath, commitMessage, branch = "main") {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Branch-aware delete — only mark file version on this branch
      const result = await client.query(
        `UPDATE repository_files
         SET deleted_at = NOW(), is_current = FALSE
         WHERE file_id IN (
           SELECT rf.file_id FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.file_path = $2
             AND rf.is_current = TRUE AND rf.deleted_at IS NULL
             AND rc.branch IN ($3, 'main')
         )
         RETURNING *`,
        [projectId, filePath, branch],
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

      // Get current branch head for parent commit chain
      const headResult = await client.query(
        `SELECT rb.head_commit_id, rc.commit_hash AS head_hash
         FROM repository_branches rb
         LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
         WHERE rb.project_id = $1 AND rb.branch_name = $2`,
        [projectId, branch],
      );
      const parentCommitId = headResult.rows[0]?.head_commit_id || null;
      const parentHash = headResult.rows[0]?.head_hash || null;

      const deleteCommit = await client.query(
        `INSERT INTO repository_commits
           (project_id, commit_hash, parent_commit_id, parent_hash, author_id, author_name, message, branch,
            deletions, changed_files, file_changes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10)
         RETURNING *`,
        [
          projectId,
          commitHash,
          parentCommitId,
          parentHash,
          authorId,
          author.rows[0]?.display_name || "Unknown",
          commitMessage || `Delete ${filePath}`,
          branch,
          (result.rows[0].content || "").split("\n").length,
          JSON.stringify([{ path: filePath, action: "deleted" }]),
        ],
      );

      // Update branch head
      await client.query(
        `UPDATE repository_branches SET head_commit_id = $1, updated_at = NOW()
         WHERE project_id = $2 AND branch_name = $3`,
        [deleteCommit.rows[0].commit_id, projectId, branch],
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
   * Branch-aware: shows files from current branch + main (branch takes priority).
   * Synthesizes directory entries for nested paths (like real GitHub).
   */
  static async getFiles(projectId, dirPath = "", branch = "main") {
    // Get ALL current files visible on this branch (branch-specific + inherited from main)
    const result = await pool.query(
      `SELECT DISTINCT ON (rf.file_path)
         rf.file_id, rf.file_path, rf.file_name, rf.file_type, rf.mime_type,
         rf.file_size, rf.blob_hash, rf.author_id, rf.created_at, rf.updated_at,
         rc.message AS last_commit_message, rc.committed_at AS last_commit_date,
         rc.author_name AS last_commit_author
       FROM repository_files rf
       JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
       WHERE rf.project_id = $1
         AND rf.deleted_at IS NULL
         AND rf.is_current = TRUE
         AND rc.branch IN ($2, 'main')
       ORDER BY rf.file_path,
         CASE WHEN rc.branch = $2 THEN 0 ELSE 1 END,
         rf.created_at DESC`,
      [projectId, branch],
    );

    // Synthesize directory entries and filter to current level
    const prefix = dirPath ? dirPath + "/" : "";
    const seen = new Set();
    const entries = [];

    for (const file of result.rows) {
      const fp = file.file_path;

      // Skip files not under the current directory
      if (dirPath && !fp.startsWith(prefix)) continue;

      // Get relative path from current directory
      const relative = dirPath ? fp.slice(prefix.length) : fp;

      if (relative.includes("/")) {
        // Nested deeper — synthesize a directory entry for the next level
        const dirName = relative.split("/")[0];
        const fullDirPath = dirPath ? prefix + dirName : dirName;
        if (!seen.has(fullDirPath)) {
          seen.add(fullDirPath);
          entries.push({
            file_path: fullDirPath,
            file_name: dirName,
            is_directory: true,
            file_type: "directory",
          });
        }
      } else {
        // Direct file at this level
        if (!seen.has(fp)) {
          seen.add(fp);
          entries.push({ ...file, is_directory: false });
        }
      }
    }

    return entries;
  }

  /**
   * Get a single file with content. Branch-aware.
   */
  static async getFile(projectId, filePath, branch = "main") {
    const result = await pool.query(
      `SELECT DISTINCT ON (rf.file_path)
         rf.*, p.display_name AS author_name
       FROM repository_files rf
       LEFT JOIN persons p ON rf.author_id = p.person_id
       JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
       WHERE rf.project_id = $1 AND rf.file_path = $2
         AND rf.is_current = TRUE AND rf.deleted_at IS NULL
         AND rc.branch IN ($3, 'main')
       ORDER BY rf.file_path,
         CASE WHEN rc.branch = $3 THEN 0 ELSE 1 END,
         rf.created_at DESC`,
      [projectId, filePath, branch],
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

    if (filters.sinceHash) {
      const sinceCommit = await pool.query(
        `SELECT committed_at FROM repository_commits WHERE project_id = $1 AND commit_hash = $2`,
        [projectId, filters.sinceHash],
      );
      if (sinceCommit.rows.length > 0) {
        query += ` AND rc.committed_at > $${idx}`;
        values.push(sinceCommit.rows[0].committed_at);
        idx++;
      }
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
    const client = await getClient();
    const source = await client.query(
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
    const client = await getClient();
    const result = await client.query(
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
   * When merging, copies source branch files to target branch (real merge).
   */
  static async updatePullRequest(prId, updates, actorId) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

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

      if (updates.status === "merged") {
        setClauses.push(`merged_at = NOW()`);
        setClauses.push(`merged_by = $${idx}`);
        values.push(actorId);
        idx++;
      }

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

      const result = await client.query(
        `UPDATE pull_requests SET ${setClauses.join(", ")} WHERE pr_id = $${idx} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        throw new Error("Pull request not found");
      }

      const pr = result.rows[0];

      // Real merge: copy source branch files to target branch
      if (updates.status === "merged") {
        const authorRow = await client.query(
          "SELECT display_name FROM persons WHERE person_id = $1",
          [actorId],
        );
        const authorName = authorRow.rows[0]?.display_name || "Unknown";

        // Get files that exist on source branch
        const sourceFiles = await client.query(
          `SELECT rf.* FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.is_current = TRUE
             AND rf.deleted_at IS NULL AND rc.branch = $2`,
          [pr.project_id, pr.source_branch],
        );

        if (sourceFiles.rows.length > 0) {
          // Create merge commit on target branch
          const mergeHash = crypto
            .createHash("sha256")
            .update(`${pr.project_id}merge${pr.pr_number}${Date.now()}`)
            .digest("hex");

          const mergeCommit = await client.query(
            `INSERT INTO repository_commits
               (project_id, commit_hash, author_id, author_name, message, branch,
                changed_files, file_changes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
              pr.project_id,
              mergeHash,
              actorId,
              authorName,
              `Merge pull request #${pr.pr_number}: ${pr.title}`,
              pr.target_branch,
              sourceFiles.rows.length,
              JSON.stringify(
                sourceFiles.rows.map((f) => ({
                  path: f.file_path,
                  action: "merged",
                })),
              ),
            ],
          );

          // Copy each file from source branch to target branch
          for (const sf of sourceFiles.rows) {
            // Mark old target-branch version as not current
            await client.query(
              `UPDATE repository_files SET is_current = FALSE
               WHERE file_id IN (
                 SELECT rf2.file_id FROM repository_files rf2
                 JOIN repository_commits rc2 ON rf2.parent_commit_id = rc2.commit_id
                 WHERE rf2.project_id = $1 AND rf2.file_path = $2
                   AND rf2.is_current = TRUE AND rc2.branch = $3
               )`,
              [pr.project_id, sf.file_path, pr.target_branch],
            );

            // Insert merged file version on target branch
            await client.query(
              `INSERT INTO repository_files
                 (project_id, file_path, file_name, file_type, mime_type, file_size,
                  content, blob_hash, parent_commit_id, is_current, author_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
              [
                pr.project_id,
                sf.file_path,
                sf.file_name,
                sf.file_type,
                sf.mime_type,
                sf.file_size,
                sf.content,
                sf.blob_hash,
                mergeCommit.rows[0].commit_id,
                sf.author_id,
              ],
            );
          }

          // Update target branch head
          await client.query(
            `UPDATE repository_branches SET head_commit_id = $1, updated_at = NOW()
             WHERE project_id = $2 AND branch_name = $3`,
            [
              mergeCommit.rows[0].commit_id,
              pr.project_id,
              pr.target_branch,
            ],
          );
        }

        logger.info("PR merged with files", {
          prId,
          prNumber: pr.pr_number,
          filesCopied: sourceFiles.rows.length,
        });
      }

      await client.query("COMMIT");
      return pr;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

  // ============================================================
  // ISSUE COMMENTS
  // ============================================================

  /**
   * Add a comment to an issue.
   */
  static async addIssueComment(issueId, authorId, body) {
    const author = await pool.query(
      "SELECT display_name FROM persons WHERE person_id = $1",
      [authorId],
    );
    const authorName = author.rows[0]?.display_name || "Unknown";

    const result = await pool.query(
      `INSERT INTO issue_comments (issue_id, author_id, author_name, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [issueId, authorId, authorName, body],
    );
    return result.rows[0];
  }

  /**
   * Get comments for an issue.
   */
  static async getIssueComments(issueId) {
    const result = await pool.query(
      `SELECT * FROM issue_comments
       WHERE issue_id = $1
       ORDER BY created_at ASC`,
      [issueId],
    );
    return result.rows;
  }

  // ============================================================
  // PR REVIEWS (formal approval workflow)
  // ============================================================

  /**
   * Submit a review on a pull request.
   */
  static async submitPrReview(prId, reviewerId, reviewData) {
    const reviewer = await pool.query(
      "SELECT display_name FROM persons WHERE person_id = $1",
      [reviewerId],
    );
    const reviewerName = reviewer.rows[0]?.display_name || "Unknown";

    const result = await pool.query(
      `INSERT INTO pr_reviews (pr_id, reviewer_id, reviewer_name, status, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [prId, reviewerId, reviewerName, reviewData.status, reviewData.body || null],
    );

    logger.info("PR review submitted", { prId, status: reviewData.status });
    return result.rows[0];
  }

  /**
   * Get all reviews for a pull request.
   */
  static async getPrReviews(prId) {
    const result = await pool.query(
      `SELECT * FROM pr_reviews
       WHERE pr_id = $1
       ORDER BY created_at DESC`,
      [prId],
    );
    return result.rows;
  }

  // ============================================================
  // FILE DIFF
  // ============================================================

  /**
   * Get diff for a specific commit — returns old and new content for each changed file.
   */
  static async getCommitDiff(projectId, commitHash) {
    // Get the commit
    const commit = await pool.query(
      `SELECT * FROM repository_commits
       WHERE project_id = $1 AND commit_hash = $2`,
      [projectId, commitHash],
    );
    if (commit.rows.length === 0) return null;

    const c = commit.rows[0];
    const fileChanges = c.file_changes || [];
    const diffs = [];

    for (const fc of fileChanges) {
      const filePath = fc.path || fc.file_path;
      if (!filePath) continue;

      // Get the new version (file committed in this commit)
      const newFile = await pool.query(
        `SELECT content FROM repository_files
         WHERE project_id = $1 AND file_path = $2 AND parent_commit_id = $3`,
        [projectId, filePath, c.commit_id],
      );

      // Get the previous version (most recent before this commit)
      const oldFile = await pool.query(
        `SELECT rf.content FROM repository_files rf
         JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
         WHERE rf.project_id = $1 AND rf.file_path = $2
           AND rc.committed_at < $3
         ORDER BY rc.committed_at DESC LIMIT 1`,
        [projectId, filePath, c.committed_at],
      );

      diffs.push({
        filePath,
        action: fc.action || "modified",
        additions: fc.additions || 0,
        deletions: fc.deletions || 0,
        oldContent: oldFile.rows[0]?.content || "",
        newContent: newFile.rows[0]?.content || "",
      });
    }

    return { commit: c, diffs };
  }

  // ============================================================
  // PROJECT MEMBERS (for assignee dropdowns)
  // ============================================================

  /**
   * Get active project members for dropdowns.
   */
  static async getProjectMembers(projectId) {
    const result = await pool.query(
      `SELECT pm.person_id, p.display_name, pm.role_in_project, pm.photo_url
       FROM project_members pm
       JOIN persons p ON pm.person_id = p.person_id
       WHERE pm.project_id = $1 AND pm.left_at IS NULL
       ORDER BY p.display_name`,
      [projectId],
    );
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

  // ============================================================
  // PULL / SYNC — True Git-like synchronization
  // ============================================================

  /**
   * Pull commits newer than a given commit hash.
   * Returns new commits, current file tree, and branch head info.
   */
  static async pullCommits(projectId, branch = "main", sinceHash = null) {
    let commitsQuery, commitsValues;

    if (sinceHash) {
      const sinceCommit = await pool.query(
        `SELECT committed_at FROM repository_commits
         WHERE project_id = $1 AND commit_hash = $2`,
        [projectId, sinceHash],
      );

      if (sinceCommit.rows.length > 0) {
        commitsQuery = `
          SELECT rc.*, p.display_name AS author_display_name
          FROM repository_commits rc
          LEFT JOIN persons p ON rc.author_id = p.person_id
          WHERE rc.project_id = $1 AND rc.branch = $2
            AND rc.committed_at > $3
          ORDER BY rc.committed_at ASC`;
        commitsValues = [projectId, branch, sinceCommit.rows[0].committed_at];
      } else {
        // sinceHash not found — return all (client is stale)
        commitsQuery = `
          SELECT rc.*, p.display_name AS author_display_name
          FROM repository_commits rc
          LEFT JOIN persons p ON rc.author_id = p.person_id
          WHERE rc.project_id = $1 AND rc.branch = $2
          ORDER BY rc.committed_at ASC`;
        commitsValues = [projectId, branch];
      }
    } else {
      commitsQuery = `
        SELECT rc.*, p.display_name AS author_display_name
        FROM repository_commits rc
        LEFT JOIN persons p ON rc.author_id = p.person_id
        WHERE rc.project_id = $1 AND rc.branch = $2
        ORDER BY rc.committed_at ASC`;
      commitsValues = [projectId, branch];
    }

    const [commitsResult, headResult, filesResult] = await Promise.all([
      pool.query(commitsQuery, commitsValues),
      pool.query(
        `SELECT rb.head_commit_id, rc.commit_hash AS head_hash
         FROM repository_branches rb
         LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
         WHERE rb.project_id = $1 AND rb.branch_name = $2`,
        [projectId, branch],
      ),
      pool.query(
        `SELECT DISTINCT ON (rf.file_path)
           rf.file_id, rf.file_path, rf.file_name, rf.file_type, rf.mime_type,
           rf.file_size, rf.blob_hash, rf.content, rf.created_at
         FROM repository_files rf
         JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
         WHERE rf.project_id = $1
           AND rf.deleted_at IS NULL
           AND rf.is_current = TRUE
           AND rc.branch IN ($2, 'main')
         ORDER BY rf.file_path,
           CASE WHEN rc.branch = $2 THEN 0 ELSE 1 END,
           rf.created_at DESC`,
        [projectId, branch],
      ),
    ]);

    return {
      commits: commitsResult.rows,
      headHash: headResult.rows[0]?.head_hash || null,
      headCommitId: headResult.rows[0]?.head_commit_id || null,
      files: filesResult.rows,
      totalNewCommits: commitsResult.rows.length,
    };
  }

  /**
   * Check sync status — whether client is up-to-date, behind, or diverged.
   */
  static async getSyncStatus(projectId, branch = "main", clientHash = null) {
    const head = await pool.query(
      `SELECT rb.head_commit_id, rc.commit_hash AS head_hash
       FROM repository_branches rb
       LEFT JOIN repository_commits rc ON rb.head_commit_id = rc.commit_id
       WHERE rb.project_id = $1 AND rb.branch_name = $2`,
      [projectId, branch],
    );

    const serverHead = head.rows[0]?.head_hash || null;

    if (!serverHead) {
      return { status: "up_to_date", commitsBehind: 0, headHash: null };
    }

    if (!clientHash) {
      const total = await pool.query(
        `SELECT COUNT(*) AS count FROM repository_commits
         WHERE project_id = $1 AND branch = $2`,
        [projectId, branch],
      );
      return {
        status: "behind",
        commitsBehind: parseInt(total.rows[0].count),
        headHash: serverHead,
      };
    }

    if (clientHash === serverHead) {
      return { status: "up_to_date", commitsBehind: 0, headHash: serverHead };
    }

    // Check if clientHash exists in commit history
    const clientCommit = await pool.query(
      `SELECT committed_at FROM repository_commits
       WHERE project_id = $1 AND commit_hash = $2`,
      [projectId, clientHash],
    );

    if (clientCommit.rows.length === 0) {
      return { status: "diverged", commitsBehind: -1, headHash: serverHead };
    }

    // Count commits newer than client's position
    const behind = await pool.query(
      `SELECT COUNT(*) AS count FROM repository_commits
       WHERE project_id = $1 AND branch = $2
         AND committed_at > $3`,
      [projectId, branch, clientCommit.rows[0].committed_at],
    );

    const commitsBehind = parseInt(behind.rows[0].count);
    return {
      status: commitsBehind > 0 ? "behind" : "up_to_date",
      commitsBehind,
      headHash: serverHead,
    };
  }

  /**
   * Diff between two arbitrary commits (not just parent → child).
   * Returns changed files with old/new content.
   */
  static async diffBetweenCommits(projectId, fromHash, toHash) {
    const [fromResult, toResult] = await Promise.all([
      pool.query(
        `SELECT * FROM repository_commits WHERE project_id = $1 AND commit_hash = $2`,
        [projectId, fromHash],
      ),
      pool.query(
        `SELECT * FROM repository_commits WHERE project_id = $1 AND commit_hash = $2`,
        [projectId, toHash],
      ),
    ]);

    if (fromResult.rows.length === 0 || toResult.rows.length === 0) return null;

    const fromCommit = fromResult.rows[0];
    const toCommit = toResult.rows[0];

    // Collect all changed file paths between the two commits
    const betweenCommits = await pool.query(
      `SELECT file_changes FROM repository_commits
       WHERE project_id = $1 AND branch = $2
         AND committed_at > $3 AND committed_at <= $4
       ORDER BY committed_at ASC`,
      [projectId, fromCommit.branch, fromCommit.committed_at, toCommit.committed_at],
    );

    const changedPaths = new Set();
    for (const c of betweenCommits.rows) {
      for (const fc of (c.file_changes || [])) {
        const p = fc.path || fc.file_path;
        if (p) changedPaths.add(p);
      }
    }

    const diffs = [];
    for (const filePath of changedPaths) {
      const [oldFile, newFile] = await Promise.all([
        pool.query(
          `SELECT rf.content FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.file_path = $2
             AND rc.committed_at <= $3
           ORDER BY rc.committed_at DESC LIMIT 1`,
          [projectId, filePath, fromCommit.committed_at],
        ),
        pool.query(
          `SELECT rf.content FROM repository_files rf
           JOIN repository_commits rc ON rf.parent_commit_id = rc.commit_id
           WHERE rf.project_id = $1 AND rf.file_path = $2
             AND rc.committed_at <= $3
           ORDER BY rc.committed_at DESC LIMIT 1`,
          [projectId, filePath, toCommit.committed_at],
        ),
      ]);

      const oldContent = oldFile.rows[0]?.content || "";
      const newContent = newFile.rows[0]?.content || "";
      if (oldContent === newContent) continue;

      const action = !oldFile.rows[0] ? "added" : !newFile.rows[0] ? "deleted" : "modified";

      diffs.push({
        filePath,
        action,
        additions: action === "deleted" ? 0 : (newContent || "").split("\n").length,
        deletions: action === "added" ? 0 : (oldContent || "").split("\n").length,
        oldContent,
        newContent,
      });
    }

    return {
      fromCommit,
      toCommit,
      diffs,
      commitsBetween: betweenCommits.rows.length,
    };
  }
}

module.exports = GitRepositoryService;
