// ============================================================
// FACULTY ANALYTICS SERVICE
// ============================================================
// SRS §4.4: Faculty performance analytics & reporting
//
// Provides:
// - Performance trend across terms
// - Department comparison rankings
// - Response rate analysis
// - Data export for reporting
//
// Uses raw SQL via pg Pool (project convention).
// ============================================================

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

class FacultyAnalyticsService {
  // ============================================================
  // FACULTY PERFORMANCE TREND
  // ============================================================

  /**
   * Get normalized scores across multiple evaluation sessions for one faculty.
   *
   * @param {string} facultyId - UUID
   * @param {number} [limit=6] - Max sessions to return
   * @returns {Promise<Object>} Trend data
   */
  static async getFacultyTrend(facultyId, limit = 6) {
    const result = await query(
      `SELECT
         fns.session_id,
         fes.title              AS session_name,
         fes.academic_year,
         fes.semester,
         fes.evaluation_mode,
         fns.raw_average_score,
         fns.normalized_score,
         fns.student_count,
         fns.response_rate,
         fns.exposure_factor,
         fns.department_percentile,
         fns.calculated_at
       FROM faculty_normalized_scores fns
       JOIN faculty_evaluation_sessions fes ON fns.session_id = fes.id
       WHERE fns.faculty_id = $1
       ORDER BY fes.academic_year DESC, fes.semester DESC
       LIMIT $2`,
      [facultyId, limit],
    );

    const sessions = result.rows;
    const scores = sessions.map((s) => parseFloat(s.normalized_score));
    const trend = this._classifyTrend(scores);

    return {
      faculty_id: facultyId,
      sessions,
      trend,
      session_count: sessions.length,
      average_normalized:
        sessions.length > 0
          ? parseFloat(
              (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
            )
          : 0,
      highest_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
    };
  }

  // ============================================================
  // DEPARTMENT RANKINGS
  // ============================================================

  /**
   * Ranked faculty within a department for one session.
   *
   * @param {string} sessionId
   * @param {string} department
   * @returns {Promise<Array>}
   */
  static async getDepartmentRankings(sessionId, department) {
    const result = await query(
      `SELECT
         p.person_id          AS faculty_id,
         p.display_name       AS faculty_name,
         fns.normalized_score,
         fns.raw_average_score,
         fns.student_count,
         fns.response_rate,
         fns.exposure_factor,
         fns.department_percentile,
         fea.sessions_conducted,
         fea.contact_hours,
         fea.role_type,
         RANK() OVER (ORDER BY fns.normalized_score DESC) AS rank
       FROM faculty_normalized_scores fns
       JOIN persons p ON fns.faculty_id = p.person_id
       LEFT JOIN faculty_evaluation_assignments fea
         ON fns.faculty_id  = fea.faculty_id
        AND fns.session_id = fea.session_id
       WHERE fns.session_id = $1
         AND (fea.department = $2 OR p.department_code = $2)
       ORDER BY fns.normalized_score DESC`,
      [sessionId, department],
    );

    return result.rows;
  }

  // ============================================================
  // RESPONSE RATE ANALYSIS
  // ============================================================

  /**
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  static async getResponseRateAnalysis(sessionId) {
    // Total unique students who submitted for this session
    const submittedResult = await query(
      `SELECT COUNT(DISTINCT student_person_id) AS submitted_students
       FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND is_draft = false`,
      [sessionId],
    );

    // Per-faculty response count
    const perFacultyResult = await query(
      `SELECT
         fea.faculty_person_id       AS faculty_id,
         p.display_name              AS faculty_name,
         COUNT(DISTINCT fea.student_person_id) AS evaluator_count
       FROM faculty_evaluation_allocations fea
       JOIN persons p ON fea.faculty_person_id = p.person_id
       WHERE fea.session_id = $1 AND fea.is_draft = false
       GROUP BY fea.faculty_person_id, p.display_name
       ORDER BY evaluator_count DESC`,
      [sessionId],
    );

    return {
      session_id: sessionId,
      submitted_students: parseInt(
        submittedResult.rows[0]?.submitted_students || 0,
        10,
      ),
      per_faculty: perFacultyResult.rows,
    };
  }

  // ============================================================
  // EXPORT SESSION DATA
  // ============================================================

  /**
   * Full exportable dataset for one session.
   *
   * @param {string} sessionId
   * @returns {Promise<Array>}
   */
  static async exportSessionData(sessionId) {
    const result = await query(
      `SELECT
         fes.title                AS session_name,
         fes.academic_year,
         fes.semester,
         fes.evaluation_mode,
         p.person_id             AS faculty_id,
         p.display_name          AS faculty_name,
         p.department_code       AS department,
         fea2.role_type,
         fea2.sessions_conducted,
         fea2.contact_hours,
         fns.raw_average_score,
         fns.normalized_score,
         fns.student_count,
         fns.response_rate,
         fns.exposure_factor,
         fns.department_percentile
       FROM faculty_normalized_scores fns
       JOIN persons p ON fns.faculty_id = p.person_id
       JOIN faculty_evaluation_sessions fes ON fns.session_id = fes.id
       LEFT JOIN faculty_evaluation_assignments fea2
         ON fns.faculty_id  = fea2.faculty_id
        AND fns.session_id = fea2.session_id
       WHERE fns.session_id = $1
       ORDER BY fns.normalized_score DESC`,
      [sessionId],
    );

    return result.rows;
  }

  // ============================================================
  // SESSION OVERVIEW STATS
  // ============================================================

  /**
   * High-level stats for an admin/faculty session overview.
   *
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  static async getSessionOverview(sessionId) {
    const statsResult = await query(
      `SELECT
         COUNT(DISTINCT fea.student_person_id) AS total_students,
         COUNT(DISTINCT fea.faculty_person_id) AS total_faculty,
         SUM(fea.points)                       AS total_points_allocated,
         AVG(fea.points)                       AS avg_points_per_allocation
       FROM faculty_evaluation_allocations fea
       WHERE fea.session_id = $1 AND fea.is_draft = false`,
      [sessionId],
    );

    const scoreResult = await query(
      `SELECT
         AVG(normalized_score) AS avg_normalized,
         MAX(normalized_score) AS max_normalized,
         MIN(normalized_score) AS min_normalized,
         STDDEV(normalized_score) AS stddev_normalized
       FROM faculty_normalized_scores
       WHERE session_id = $1`,
      [sessionId],
    );

    const stats = statsResult.rows[0] || {};
    const scores = scoreResult.rows[0] || {};

    return {
      session_id: sessionId,
      total_students: parseInt(stats.total_students || 0, 10),
      total_faculty: parseInt(stats.total_faculty || 0, 10),
      total_points_allocated: parseFloat(stats.total_points_allocated || 0),
      avg_points_per_allocation: parseFloat(
        stats.avg_points_per_allocation || 0,
      ),
      score_distribution: {
        average: parseFloat(scores.avg_normalized || 0).toFixed(2),
        max: parseFloat(scores.max_normalized || 0).toFixed(2),
        min: parseFloat(scores.min_normalized || 0).toFixed(2),
        stddev: parseFloat(scores.stddev_normalized || 0).toFixed(2),
      },
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Classify trend direction from an array of scores (newest first).
   * @param {number[]} scores
   * @returns {string} 'improving' | 'declining' | 'stable'
   */
  static _classifyTrend(scores) {
    if (scores.length < 2) return "stable";
    const newest = scores[0];
    const oldest = scores[scores.length - 1];
    const diff = newest - oldest;

    if (diff > 0.5) return "improving";
    if (diff < -0.5) return "declining";
    return "stable";
  }
}

module.exports = FacultyAnalyticsService;
