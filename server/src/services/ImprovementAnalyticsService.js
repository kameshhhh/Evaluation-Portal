// ============================================================
// IMPROVEMENT ANALYTICS SERVICE — SRS 4.1.2 Requirements
// ============================================================
// Handles all SRS 4.1.2 mandatory requirements:
//   - Previous review history storage & retrieval
//   - Last month's score display to judges
//   - Last month vs current work comparison
//   - Improvement indicators (trend analysis)
//
// DOES NOT modify any existing services.
// ============================================================

"use strict";

const pool = require("../config/database");
const logger = require("../utils/logger");

class ImprovementAnalyticsService {
  // ============================================================
  // IMPROVEMENT METRICS — Calculate and store trend data
  // ============================================================

  /**
   * Calculate improvement metrics for a person in a project.
   * Compares current period to previous period across all metric types.
   */
  static async calculateImprovement(projectId, personId, metricDate) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const metrics = [];

      // 1. Score improvement — compare evaluation scores
      const scoreMetric = await this._calculateScoreImprovement(
        client,
        projectId,
        personId,
        metricDate,
      );
      if (scoreMetric) metrics.push(scoreMetric);

      // 2. Productivity improvement — compare work log hours
      const productivityMetric = await this._calculateProductivityImprovement(
        client,
        projectId,
        personId,
        metricDate,
      );
      if (productivityMetric) metrics.push(productivityMetric);

      // 3. Consistency improvement — log frequency
      const consistencyMetric = await this._calculateConsistencyImprovement(
        client,
        projectId,
        personId,
        metricDate,
      );
      if (consistencyMetric) metrics.push(consistencyMetric);

      // Store all calculated metrics
      for (const metric of metrics) {
        await client.query(
          `INSERT INTO improvement_metrics
             (project_id, person_id, metric_date, metric_type,
              current_value, previous_value, delta, delta_percentage, trend, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [
            projectId,
            personId,
            metricDate,
            metric.type,
            metric.currentValue,
            metric.previousValue,
            metric.delta,
            metric.deltaPercentage,
            metric.trend,
            JSON.stringify(metric.metadata || {}),
          ],
        );
      }

      await client.query("COMMIT");
      logger.info("Improvement metrics calculated", {
        projectId,
        personId,
        count: metrics.length,
      });
      return metrics;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate score improvement from evaluation data.
   * Uses existing evaluation tables if available.
   */
  static async _calculateScoreImprovement(
    client,
    projectId,
    personId,
    metricDate,
  ) {
    // Get current month's average score from evaluations
    const current = await client.query(
      `SELECT COALESCE(AVG(
         CASE
           WHEN metadata->>'normalized_score' IS NOT NULL
           THEN (metadata->>'normalized_score')::decimal
           ELSE 0
         END
       ), 0) AS avg_score
       FROM project_activities
       WHERE project_id = $1 AND activity_type = 'evaluation'
         AND (data->>'person_id')::text = $2::text
         AND date_trunc('month', occurred_at) = date_trunc('month', $3::date)`,
      [projectId, personId, metricDate],
    );

    // Get previous month's average score
    const previous = await client.query(
      `SELECT COALESCE(AVG(
         CASE
           WHEN metadata->>'normalized_score' IS NOT NULL
           THEN (metadata->>'normalized_score')::decimal
           ELSE 0
         END
       ), 0) AS avg_score
       FROM project_activities
       WHERE project_id = $1 AND activity_type = 'evaluation'
         AND (data->>'person_id')::text = $2::text
         AND date_trunc('month', occurred_at) = date_trunc('month', ($3::date - INTERVAL '1 month'))`,
      [projectId, personId, metricDate],
    );

    const currentVal = parseFloat(current.rows[0]?.avg_score) || 0;
    const previousVal = parseFloat(previous.rows[0]?.avg_score) || 0;

    if (currentVal === 0 && previousVal === 0) return null;

    const delta = currentVal - previousVal;
    const deltaPercentage = previousVal !== 0 ? (delta / previousVal) * 100 : 0;

    return {
      type: "score",
      currentValue: currentVal,
      previousValue: previousVal,
      delta,
      deltaPercentage: Math.round(deltaPercentage * 100) / 100,
      trend: delta > 0.01 ? "up" : delta < -0.01 ? "down" : "stable",
      metadata: { source: "evaluations" },
    };
  }

  /**
   * Calculate productivity improvement from work logs.
   */
  static async _calculateProductivityImprovement(
    client,
    projectId,
    personId,
    metricDate,
  ) {
    const current = await client.query(
      `SELECT COALESCE(SUM(hours), 0) AS total_hours
       FROM project_work_logs
       WHERE project_id = $1 AND person_id = $2
         AND date_trunc('month', log_date) = date_trunc('month', $3::date)`,
      [projectId, personId, metricDate],
    );

    const previous = await client.query(
      `SELECT COALESCE(SUM(hours), 0) AS total_hours
       FROM project_work_logs
       WHERE project_id = $1 AND person_id = $2
         AND date_trunc('month', log_date) = date_trunc('month', ($3::date - INTERVAL '1 month'))`,
      [projectId, personId, metricDate],
    );

    const currentVal = parseFloat(current.rows[0]?.total_hours) || 0;
    const previousVal = parseFloat(previous.rows[0]?.total_hours) || 0;

    if (currentVal === 0 && previousVal === 0) return null;

    const delta = currentVal - previousVal;
    const deltaPercentage = previousVal !== 0 ? (delta / previousVal) * 100 : 0;

    return {
      type: "productivity",
      currentValue: currentVal,
      previousValue: previousVal,
      delta,
      deltaPercentage: Math.round(deltaPercentage * 100) / 100,
      trend: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "stable",
      metadata: { unit: "hours" },
    };
  }

  /**
   * Calculate consistency improvement — how regularly the student logs work.
   */
  static async _calculateConsistencyImprovement(
    client,
    projectId,
    personId,
    metricDate,
  ) {
    const current = await client.query(
      `SELECT COUNT(DISTINCT log_date) AS days_logged
       FROM project_work_logs
       WHERE project_id = $1 AND person_id = $2
         AND date_trunc('month', log_date) = date_trunc('month', $3::date)`,
      [projectId, personId, metricDate],
    );

    const previous = await client.query(
      `SELECT COUNT(DISTINCT log_date) AS days_logged
       FROM project_work_logs
       WHERE project_id = $1 AND person_id = $2
         AND date_trunc('month', log_date) = date_trunc('month', ($3::date - INTERVAL '1 month'))`,
      [projectId, personId, metricDate],
    );

    const currentVal = parseInt(current.rows[0]?.days_logged) || 0;
    const previousVal = parseInt(previous.rows[0]?.days_logged) || 0;

    if (currentVal === 0 && previousVal === 0) return null;

    const delta = currentVal - previousVal;
    const deltaPercentage = previousVal !== 0 ? (delta / previousVal) * 100 : 0;

    return {
      type: "consistency",
      currentValue: currentVal,
      previousValue: previousVal,
      delta,
      deltaPercentage: Math.round(deltaPercentage * 100) / 100,
      trend: delta > 0 ? "up" : delta < 0 ? "down" : "stable",
      metadata: { unit: "days_logged" },
    };
  }

  // ============================================================
  // REVIEW HISTORY — SRS 4.1.2 Previous evaluation retrieval
  // ============================================================

  /**
   * Get full review history for a project (all evaluations over time).
   */
  static async getReviewHistory(projectId, filters = {}) {
    let query = `
      SELECT
        pa.activity_id,
        pa.actor_id,
        pa.actor_name,
        pa.occurred_at,
        pa.data,
        pa.target_name
      FROM project_activities pa
      WHERE pa.project_id = $1 AND pa.activity_type = 'evaluation'`;
    const values = [projectId];
    let idx = 2;

    if (filters.personId) {
      query += ` AND (pa.data->>'person_id')::text = $${idx}::text`;
      values.push(filters.personId);
      idx++;
    }

    query += " ORDER BY pa.occurred_at DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
      idx++;
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get improvement metrics for a person in a project.
   */
  static async getImprovementMetrics(projectId, personId, filters = {}) {
    let query = `
      SELECT *
      FROM improvement_metrics
      WHERE project_id = $1 AND person_id = $2`;
    const values = [projectId, personId];
    let idx = 3;

    if (filters.metricType) {
      query += ` AND metric_type = $${idx}`;
      values.push(filters.metricType);
      idx++;
    }

    query += " ORDER BY metric_date DESC";

    if (filters.limit) {
      query += ` LIMIT $${idx}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * Get score comparison data for judges — last month vs current.
   * Returns side-by-side comparison for each team member.
   */
  static async getScoreComparison(projectId) {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get all active members
    const members = await pool.query(
      `SELECT pm.person_id, p.display_name, pm.photo_url, pm.defined_scope, pm.declared_share_percentage
       FROM project_members pm
       JOIN persons p ON pm.person_id = p.person_id
       WHERE pm.project_id = $1 AND pm.left_at IS NULL`,
      [projectId],
    );

    const comparisons = [];

    for (const member of members.rows) {
      // Get latest improvement metrics for this person
      const metrics = await pool.query(
        `SELECT metric_type, current_value, previous_value, delta, delta_percentage, trend
         FROM improvement_metrics
         WHERE project_id = $1 AND person_id = $2
         ORDER BY metric_date DESC
         LIMIT 5`,
        [projectId, member.person_id],
      );

      // Get work log summary for current and last month
      const currentWork = await pool.query(
        `SELECT COALESCE(SUM(hours), 0) AS total_hours, COUNT(*) AS entries
         FROM project_work_logs
         WHERE project_id = $1 AND person_id = $2
           AND date_trunc('month', log_date) = date_trunc('month', $3::date)`,
        [projectId, member.person_id, currentMonth],
      );

      const lastWork = await pool.query(
        `SELECT COALESCE(SUM(hours), 0) AS total_hours, COUNT(*) AS entries
         FROM project_work_logs
         WHERE project_id = $1 AND person_id = $2
           AND date_trunc('month', log_date) = date_trunc('month', $3::date)`,
        [projectId, member.person_id, lastMonth],
      );

      comparisons.push({
        member: {
          personId: member.person_id,
          displayName: member.display_name,
          photoUrl: member.photo_url,
          scope: member.defined_scope,
          sharePercentage: member.declared_share_percentage,
        },
        metrics: metrics.rows,
        currentMonth: {
          hours: parseFloat(currentWork.rows[0]?.total_hours) || 0,
          entries: parseInt(currentWork.rows[0]?.entries) || 0,
        },
        lastMonth: {
          hours: parseFloat(lastWork.rows[0]?.total_hours) || 0,
          entries: parseInt(lastWork.rows[0]?.entries) || 0,
        },
      });
    }

    return {
      projectId,
      currentMonth: currentMonth.toISOString(),
      lastMonth: lastMonth.toISOString(),
      members: comparisons,
    };
  }

  /**
   * Calculate improvement for all members in a project.
   */
  static async calculateProjectImprovement(projectId) {
    const members = await pool.query(
      `SELECT person_id FROM project_members
       WHERE project_id = $1 AND left_at IS NULL`,
      [projectId],
    );

    const results = [];
    const metricDate = new Date();

    for (const member of members.rows) {
      const metrics = await this.calculateImprovement(
        projectId,
        member.person_id,
        metricDate,
      );
      results.push({
        personId: member.person_id,
        metrics,
      });
    }

    return results;
  }

  /**
   * Get improvement summary — aggregated trends for a project.
   */
  static async getImprovementSummary(projectId) {
    const result = await pool.query(
      `SELECT
         person_id,
         metric_type,
         current_value,
         previous_value,
         delta,
         delta_percentage,
         trend,
         metric_date
       FROM improvement_metrics
       WHERE project_id = $1
         AND metric_date = (SELECT MAX(metric_date) FROM improvement_metrics WHERE project_id = $1)
       ORDER BY person_id, metric_type`,
      [projectId],
    );

    // Group by person
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.person_id]) {
        grouped[row.person_id] = [];
      }
      grouped[row.person_id].push(row);
    }

    return grouped;
  }
}

module.exports = ImprovementAnalyticsService;
