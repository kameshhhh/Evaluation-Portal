// ============================================================
// PROJECT ENHANCEMENT SERVICE — SRS 4.1.1 Requirements
// ============================================================
// Handles all SRS 4.1.1 mandatory requirements:
//   - Member photos (upload/display)
//   - Defined scope per member (individual responsibilities)
//   - Monthly plans (project planning with approval workflow)
//   - Work logs (time tracking with evidence & Git linkage)
//
// DOES NOT modify any existing services.
// ============================================================

"use strict";

const crypto = require("crypto");
const pool = require("../config/database");
const logger = require("../utils/logger");

class ProjectEnhancementService {
  // ============================================================
  // MEMBER ENHANCEMENTS — Photos, Scope, Technical Stack
  // ============================================================

  /**
   * Update member profile (photo, scope, technical stack).
   * Does NOT touch existing fields like role_in_project or declared_share_percentage.
   */
  static async updateMemberProfile(projectId, personId, updates) {
    const allowed = ["photo_url", "defined_scope", "technical_stack"];
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(updates[key]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(projectId, personId);

    const result = await pool.query(
      `UPDATE project_members
       SET ${setClauses.join(", ")}
       WHERE project_id = $${paramIdx} AND person_id = $${paramIdx + 1} AND left_at IS NULL
       RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Member not found or not active in this project");
    }

    logger.info("Member profile updated", {
      projectId,
      personId,
      fields: Object.keys(updates),
    });
    return result.rows[0];
  }

  /**
   * Get all members with enhanced profile data for a project.
   */
  static async getEnhancedMembers(projectId) {
    const result = await pool.query(
      `SELECT pm.*, p.display_name, p.email, p.department
       FROM project_members pm
       JOIN persons p ON pm.person_id = p.person_id
       WHERE pm.project_id = $1 AND pm.left_at IS NULL
       ORDER BY pm.joined_at`,
      [projectId],
    );
    return result.rows;
  }

  /**
   * Update share percentages for all members.
   * Validates that total = 100%.
   */
  static async updateSharePercentages(projectId, distributions) {
    // distributions: [{ personId, sharePercentage }]
    const total = distributions.reduce(
      (sum, d) => sum + Number(d.sharePercentage),
      0,
    );

    if (Math.abs(total - 100) > 0.01) {
      throw new Error(
        `Share percentages must total 100%. Current total: ${total.toFixed(2)}%`,
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const dist of distributions) {
        await client.query(
          `UPDATE project_members
           SET declared_share_percentage = $1
           WHERE project_id = $2 AND person_id = $3 AND left_at IS NULL`,
          [dist.sharePercentage, projectId, dist.personId],
        );
      }

      await client.query("COMMIT");
      logger.info("Share percentages updated", {
        projectId,
        count: distributions.length,
      });
      return { success: true, total };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // MONTHLY PLANS — SRS 4.1.1 Project Planning
  // ============================================================

  /**
   * Create a new monthly plan for a project.
   */
  static async createMonthlyPlan(projectId, planData, submittedBy) {
    const { month, planText, goals } = planData;

    const result = await pool.query(
      `INSERT INTO project_monthly_plans
         (project_id, month, plan_text, goals, submitted_by, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING *`,
      [projectId, month, planText, JSON.stringify(goals || []), submittedBy],
    );

    logger.info("Monthly plan created", { projectId, month });
    return result.rows[0];
  }

  /**
   * Update an existing monthly plan.
   */
  static async updateMonthlyPlan(planId, updates) {
    const allowed = ["plan_text", "goals", "completion_notes"];
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        const val =
          key === "goals" ? JSON.stringify(updates[key]) : updates[key];
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(val);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(planId);

    const result = await pool.query(
      `UPDATE project_monthly_plans
       SET ${setClauses.join(", ")}
       WHERE plan_id = $${paramIdx}
       RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error("Monthly plan not found");
    }

    return result.rows[0];
  }

  /**
   * Transition monthly plan status: draft → submitted → approved → completed.
   */
  static async transitionPlanStatus(planId, newStatus, actorId) {
    const validTransitions = {
      draft: ["submitted"],
      submitted: ["approved", "draft"],
      approved: ["completed", "submitted"],
      completed: [],
    };

    // Get current plan
    const current = await pool.query(
      "SELECT * FROM project_monthly_plans WHERE plan_id = $1",
      [planId],
    );

    if (current.rows.length === 0) {
      throw new Error("Monthly plan not found");
    }

    const plan = current.rows[0];
    const allowed = validTransitions[plan.status] || [];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition from '${plan.status}' to '${newStatus}'. Allowed: ${allowed.join(", ")}`,
      );
    }

    // Build update based on new status
    const extraFields = {};
    if (newStatus === "submitted") {
      extraFields.submitted_by = actorId;
      extraFields.submitted_at = new Date();
    } else if (newStatus === "approved") {
      extraFields.approved_by = actorId;
      extraFields.approved_at = new Date();
    } else if (newStatus === "completed") {
      extraFields.completed_at = new Date();
    }

    const setClauses = [`status = $1`];
    const values = [newStatus];
    let idx = 2;

    for (const [key, val] of Object.entries(extraFields)) {
      setClauses.push(`${key} = $${idx}`);
      values.push(val);
      idx++;
    }

    values.push(planId);

    const result = await pool.query(
      `UPDATE project_monthly_plans
       SET ${setClauses.join(", ")}
       WHERE plan_id = $${idx}
       RETURNING *`,
      values,
    );

    logger.info("Monthly plan status changed", {
      planId,
      from: plan.status,
      to: newStatus,
    });
    return result.rows[0];
  }

  /**
   * Get all monthly plans for a project, ordered by month DESC.
   */
  static async getMonthlyPlans(projectId, filters = {}) {
    let query = `SELECT * FROM project_monthly_plans WHERE project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.status) {
      query += ` AND status = $${idx}`;
      values.push(filters.status);
      idx++;
    }

    query += " ORDER BY month DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
      idx++;
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get a single monthly plan by ID.
   */
  static async getMonthlyPlanById(planId) {
    const result = await pool.query(
      "SELECT * FROM project_monthly_plans WHERE plan_id = $1",
      [planId],
    );
    return result.rows[0] || null;
  }

  // ============================================================
  // WORK LOGS — SRS 4.1.1 Time Tracking with Evidence
  // ============================================================

  /**
   * Create a work log entry.
   */
  static async createWorkLog(projectId, personId, logData) {
    const {
      logDate,
      hours,
      description,
      category,
      tags,
      linkedCommitId,
      linkedIssueId,
      evidenceUrls,
      mood,
      blockers,
      nextSteps,
    } = logData;

    const result = await pool.query(
      `INSERT INTO project_work_logs
         (project_id, person_id, log_date, hours, description, category, tags,
          linked_commit_id, linked_issue_id, evidence_urls, mood, blockers, next_steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        projectId,
        personId,
        logDate || new Date(),
        hours,
        description,
        category || "coding",
        tags || [],
        linkedCommitId || null,
        linkedIssueId || null,
        evidenceUrls || [],
        mood || null,
        blockers || null,
        nextSteps || null,
      ],
    );

    logger.info("Work log created", { projectId, personId, hours });
    return result.rows[0];
  }

  /**
   * Update a work log entry.
   */
  static async updateWorkLog(logId, updates, personId) {
    const allowed = [
      "hours",
      "description",
      "category",
      "tags",
      "linked_commit_id",
      "linked_issue_id",
      "evidence_urls",
      "mood",
      "blockers",
      "next_steps",
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

    if (setClauses.length === 0) {
      throw new Error("No valid fields to update");
    }

    values.push(logId, personId);

    const result = await pool.query(
      `UPDATE project_work_logs
       SET ${setClauses.join(", ")}
       WHERE log_id = $${idx} AND person_id = $${idx + 1} AND is_verified = FALSE
       RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error(
        "Work log not found, not owned by you, or already verified",
      );
    }

    return result.rows[0];
  }

  /**
   * Verify a work log (faculty only).
   */
  static async verifyWorkLog(logId, verifiedBy) {
    const result = await pool.query(
      `UPDATE project_work_logs
       SET is_verified = TRUE, verified_by = $1, verified_at = NOW()
       WHERE log_id = $2
       RETURNING *`,
      [verifiedBy, logId],
    );

    if (result.rows.length === 0) {
      throw new Error("Work log not found");
    }

    logger.info("Work log verified", { logId, verifiedBy });
    return result.rows[0];
  }

  /**
   * Get work logs for a project with optional filters.
   */
  static async getWorkLogs(projectId, filters = {}) {
    let query = `
      SELECT wl.*, p.display_name AS person_name
      FROM project_work_logs wl
      JOIN persons p ON wl.person_id = p.person_id
      WHERE wl.project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.personId) {
      query += ` AND wl.person_id = $${idx}`;
      values.push(filters.personId);
      idx++;
    }

    if (filters.startDate) {
      query += ` AND wl.log_date >= $${idx}`;
      values.push(filters.startDate);
      idx++;
    }

    if (filters.endDate) {
      query += ` AND wl.log_date <= $${idx}`;
      values.push(filters.endDate);
      idx++;
    }

    if (filters.category) {
      query += ` AND wl.category = $${idx}`;
      values.push(filters.category);
      idx++;
    }

    if (filters.isVerified !== undefined) {
      query += ` AND wl.is_verified = $${idx}`;
      values.push(filters.isVerified);
      idx++;
    }

    query += " ORDER BY wl.log_date DESC, wl.created_at DESC";

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
   * Get work log summary statistics for a project member.
   */
  static async getWorkLogSummary(projectId, personId, month) {
    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_entries,
         COALESCE(SUM(hours), 0) AS total_hours,
         COALESCE(AVG(hours), 0) AS avg_hours_per_entry,
         COUNT(DISTINCT log_date) AS days_logged,
         COUNT(CASE WHEN is_verified THEN 1 END) AS verified_count,
         COUNT(CASE WHEN linked_commit_id IS NOT NULL THEN 1 END) AS linked_commits,
         COALESCE(AVG(mood), 0) AS avg_mood,
         jsonb_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories_used
       FROM project_work_logs
       WHERE project_id = $1 AND person_id = $2
         AND ($3::date IS NULL OR date_trunc('month', log_date) = date_trunc('month', $3::date))`,
      [projectId, personId, month || null],
    );

    return result.rows[0];
  }

  /**
   * Delete a work log (only if not verified).
   */
  static async deleteWorkLog(logId, personId) {
    const result = await pool.query(
      `DELETE FROM project_work_logs
       WHERE log_id = $1 AND person_id = $2 AND is_verified = FALSE
       RETURNING log_id`,
      [logId, personId],
    );

    if (result.rows.length === 0) {
      throw new Error(
        "Work log not found, not owned by you, or already verified",
      );
    }

    return { deleted: true };
  }
}

module.exports = ProjectEnhancementService;
