// ============================================================
// ACTIVITY STREAM SERVICE — Unified Project Activity Feed
// ============================================================
// Tracks ALL project events in a single denormalized stream:
//   - GitHub events: commits, issues, PRs, comments
//   - SRS events: work logs, monthly plans, scope updates
//   - Evaluation events: new evaluations, score changes
//   - System events: member joins, project updates
//
// Designed for fast reads (denormalized) with rich filtering.
// DOES NOT modify any existing services.
// ============================================================

"use strict";

const pool = require("../config/database");
const logger = require("../utils/logger");

class ActivityStreamService {
  /**
   * Log a project activity event.
   */
  static async logActivity(projectId, actorId, activityData) {
    const { activityType, targetType, targetId, targetName, data } =
      activityData;

    // Get actor info for denormalization
    let actorName = "System";
    let actorPhotoUrl = null;

    if (actorId) {
      const actor = await pool.query(
        `SELECT p.display_name, pm.photo_url
         FROM persons p
         LEFT JOIN project_members pm ON p.person_id = pm.person_id
           AND pm.project_id = $1 AND pm.left_at IS NULL
         WHERE p.person_id = $2`,
        [projectId, actorId],
      );
      if (actor.rows.length > 0) {
        actorName = actor.rows[0].display_name;
        actorPhotoUrl = actor.rows[0].photo_url;
      }
    }

    const result = await pool.query(
      `INSERT INTO project_activities
         (project_id, activity_type, actor_id, actor_name, actor_photo_url,
          target_type, target_id, target_name, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        projectId,
        activityType,
        actorId,
        actorName,
        actorPhotoUrl,
        targetType || null,
        targetId || null,
        targetName || null,
        JSON.stringify(data || {}),
      ],
    );

    logger.debug("Activity logged", { projectId, activityType });
    return result.rows[0];
  }

  /**
   * Get activity feed for a project with pagination.
   */
  static async getActivityFeed(projectId, filters = {}) {
    let query = `
      SELECT *
      FROM project_activities
      WHERE project_id = $1`;
    const values = [projectId];
    let idx = 2;

    if (filters.activityType) {
      query += ` AND activity_type = $${idx}`;
      values.push(filters.activityType);
      idx++;
    }

    if (filters.actorId) {
      query += ` AND actor_id = $${idx}`;
      values.push(filters.actorId);
      idx++;
    }

    if (filters.since) {
      query += ` AND occurred_at >= $${idx}`;
      values.push(filters.since);
      idx++;
    }

    if (filters.until) {
      query += ` AND occurred_at <= $${idx}`;
      values.push(filters.until);
      idx++;
    }

    query += " ORDER BY occurred_at DESC";

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
   * Get contribution graph data — GitHub-style activity heatmap.
   * Returns daily activity counts for the past year.
   */
  static async getContributionGraph(projectId, personId, year) {
    const targetYear = year || new Date().getFullYear();

    const result = await pool.query(
      `SELECT
         DATE(occurred_at) AS activity_date,
         COUNT(*) AS activity_count,
         jsonb_agg(DISTINCT activity_type) AS activity_types
       FROM project_activities
       WHERE project_id = $1
         AND ($2::uuid IS NULL OR actor_id = $2)
         AND EXTRACT(YEAR FROM occurred_at) = $3
       GROUP BY DATE(occurred_at)
       ORDER BY activity_date`,
      [projectId, personId || null, targetYear],
    );

    return result.rows;
  }

  /**
   * Get activity summary — counts by type for quick overview.
   */
  static async getActivitySummary(projectId, days = 30) {
    const result = await pool.query(
      `SELECT
         activity_type,
         COUNT(*) AS count,
         COUNT(DISTINCT actor_id) AS unique_actors
       FROM project_activities
       WHERE project_id = $1
         AND occurred_at >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY activity_type
       ORDER BY count DESC`,
      [projectId, days],
    );
    return result.rows;
  }

  /**
   * Get recent activity for multiple projects (dashboard overview).
   */
  static async getRecentAcrossProjects(projectIds, limit = 20) {
    if (!projectIds || projectIds.length === 0) return [];

    const result = await pool.query(
      `SELECT pa.*, proj.title AS project_title
       FROM project_activities pa
       JOIN projects proj ON pa.project_id = proj.project_id
       WHERE pa.project_id = ANY($1)
       ORDER BY pa.occurred_at DESC
       LIMIT $2`,
      [projectIds, limit],
    );

    return result.rows;
  }
}

module.exports = ActivityStreamService;
