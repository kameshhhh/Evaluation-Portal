// ============================================================
// ANOMALY DETECTION SERVICE — Faculty Evaluation Anomalies
// ============================================================
// Alert Types:
//   A. identical_marks — Faculty gave same score to ALL students
//   B. low_credibility — Faculty credibility dropped below 0.4
//   D. incomplete_evaluation — Faculty has pending assignments past deadline
// ============================================================

"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

const LOW_CREDIBILITY_THRESHOLD = 0.4;

class AnomalyDetectionService {
  /**
   * Run all anomaly checks for a session and insert alerts.
   * Called after finalization.
   *
   * @param {string} sessionId
   * @returns {Promise<{ alerts: Array }>}
   */
  async detectAnomalies(sessionId) {
    const alerts = [];

    try {
      const [identicalAlerts, credibilityAlerts, incompleteAlerts] =
        await Promise.all([
          this._checkIdenticalMarks(sessionId),
          this._checkLowCredibility(sessionId),
          this._checkIncompleteEvaluation(sessionId),
        ]);

      alerts.push(...identicalAlerts, ...credibilityAlerts, ...incompleteAlerts);

      // Persist alerts (deduplicate by faculty + session + type)
      for (const alert of alerts) {
        await query(
          `INSERT INTO faculty_alerts
             (faculty_id, session_id, alert_type, severity, title, details)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            alert.facultyId,
            sessionId,
            alert.alertType,
            alert.severity,
            alert.title,
            JSON.stringify(alert.details),
          ]
        );
      }

      logger.info("AnomalyDetection: completed", {
        sessionId,
        alertCount: alerts.length,
      });
    } catch (err) {
      logger.error("AnomalyDetection: failed", {
        sessionId,
        error: err.message,
      });
    }

    return { alerts };
  }

  /**
   * Alert A: Faculty gave identical marks to ALL evaluated students
   */
  async _checkIdenticalMarks(sessionId) {
    const alerts = [];

    const result = await query(
      `SELECT
         spa.faculty_id,
         fp.display_name AS faculty_name,
         COUNT(DISTINCT spa.student_id) AS student_count,
         COUNT(DISTINCT spa.marks) AS distinct_marks
       FROM session_planner_assignments spa
       JOIN persons fp ON fp.person_id = spa.faculty_id
       WHERE spa.session_id = $1
         AND spa.status != 'removed'
         AND spa.marks IS NOT NULL
       GROUP BY spa.faculty_id, fp.display_name
       HAVING COUNT(DISTINCT spa.student_id) >= 2
          AND COUNT(DISTINCT spa.marks) = 1`,
      [sessionId]
    );

    for (const row of result.rows) {
      alerts.push({
        facultyId: row.faculty_id,
        alertType: "identical_marks",
        severity: "warning",
        title: `${row.faculty_name} gave identical marks to all ${row.student_count} students`,
        details: {
          studentCount: parseInt(row.student_count),
          distinctMarks: parseInt(row.distinct_marks),
        },
      });
    }

    return alerts;
  }

  /**
   * Alert B: Faculty credibility score dropped below threshold
   */
  async _checkLowCredibility(sessionId) {
    const alerts = [];

    const result = await query(
      `SELECT DISTINCT
         spa.faculty_id,
         fp.display_name AS faculty_name,
         jcm.credibility_score
       FROM session_planner_assignments spa
       JOIN persons fp ON fp.person_id = spa.faculty_id
       LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = spa.faculty_id
       WHERE spa.session_id = $1
         AND spa.status != 'removed'
         AND jcm.credibility_score IS NOT NULL
         AND jcm.credibility_score < $2`,
      [sessionId, LOW_CREDIBILITY_THRESHOLD]
    );

    for (const row of result.rows) {
      alerts.push({
        facultyId: row.faculty_id,
        alertType: "low_credibility",
        severity: "critical",
        title: `${row.faculty_name} has low credibility score (${parseFloat(row.credibility_score).toFixed(2)})`,
        details: {
          credibilityScore: parseFloat(row.credibility_score),
          threshold: LOW_CREDIBILITY_THRESHOLD,
        },
      });
    }

    return alerts;
  }

  /**
   * Alert D: Faculty has pending (un-evaluated) assignments
   */
  async _checkIncompleteEvaluation(sessionId) {
    const alerts = [];

    const result = await query(
      `SELECT
         spa.faculty_id,
         fp.display_name AS faculty_name,
         COUNT(*) AS pending_count,
         (SELECT COUNT(*) FROM session_planner_assignments x
          WHERE x.session_id = $1 AND x.faculty_id = spa.faculty_id AND x.status != 'removed') AS total_count
       FROM session_planner_assignments spa
       JOIN persons fp ON fp.person_id = spa.faculty_id
       WHERE spa.session_id = $1
         AND spa.status != 'removed'
         AND spa.marks IS NULL
         AND spa.marks_submitted_at IS NULL
       GROUP BY spa.faculty_id, fp.display_name`,
      [sessionId]
    );

    for (const row of result.rows) {
      alerts.push({
        facultyId: row.faculty_id,
        alertType: "incomplete_evaluation",
        severity: parseInt(row.pending_count) === parseInt(row.total_count)
          ? "critical"
          : "warning",
        title: `${row.faculty_name} has ${row.pending_count} unevaluated students (of ${row.total_count})`,
        details: {
          pendingCount: parseInt(row.pending_count),
          totalCount: parseInt(row.total_count),
        },
      });
    }

    return alerts;
  }

  /**
   * Get all alerts for a session (admin view).
   */
  async getSessionAlerts(sessionId) {
    const result = await query(
      `SELECT fa.*,
              fp.display_name AS faculty_name
       FROM faculty_alerts fa
       JOIN persons fp ON fp.person_id = fa.faculty_id
       WHERE fa.session_id = $1
       ORDER BY
         CASE fa.severity WHEN 'critical' THEN 0 ELSE 1 END,
         fa.created_at DESC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * Get all unacknowledged alerts (admin dashboard).
   */
  async getUnacknowledgedAlerts() {
    const result = await query(
      `SELECT fa.*,
              fp.display_name AS faculty_name,
              fes.title AS session_title
       FROM faculty_alerts fa
       JOIN persons fp ON fp.person_id = fa.faculty_id
       LEFT JOIN faculty_evaluation_sessions fes ON fes.id = fa.session_id
       WHERE fa.is_acknowledged = FALSE
       ORDER BY
         CASE fa.severity WHEN 'critical' THEN 0 ELSE 1 END,
         fa.created_at DESC`
    );
    return result.rows;
  }

  /**
   * Acknowledge an alert (admin marks it as seen).
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    const result = await query(
      `UPDATE faculty_alerts
       SET is_acknowledged = TRUE, acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [acknowledgedBy, alertId]
    );
    return result.rows[0];
  }
}

module.exports = new AnomalyDetectionService();
