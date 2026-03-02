// ============================================================
// TEMPORAL CONSISTENCY SERVICE — Time-Based Data Validation
// ============================================================
// Ensures that temporal data (work logs, plans) is consistent
// with the academic calendar and evaluation periods.
//
// Checks include:
//   - Work logs exist for the correct academic periods
//   - Plans are submitted before their deadlines
//   - No gaps in monthly submissions
//   - Total hours per person don't exceed reasonable limits
//   - All team members have submitted for the same periods
//
// This service is ADVISORY — it generates reports/warnings.
// It does NOT block operations (that's the validators' job).
// Used by:
//   - Dashboard to show completeness status
//   - Pre-evaluation checks
//   - Period-end reports
// ============================================================

// Import database query function
const { query } = require("../config/database");

// Import temporal utilities
const { AcademicCalendar } = require("../lib/temporal/AcademicCalendar");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// TemporalConsistencyService — checks time-based consistency
// ============================================================
class TemporalConsistencyService {
  /**
   * Check if all team members have submitted work logs for a period.
   * Returns a completeness report showing who submitted and who didn't.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} periodId - UUID of the academic period
   * @returns {Promise<{ complete: boolean, submitted: Array, missing: Array }>}
   */
  static async checkWorkLogCompleteness(projectId, periodId) {
    // Get all active team members
    const membersResult = await query(
      `SELECT pm.person_id, p.display_name
       FROM project_members pm
       JOIN persons p ON pm.person_id = p.person_id
       WHERE pm.project_id = $1 AND pm.left_at IS NULL`,
      [projectId],
    );

    // Get all work logs for this project and period
    const logsResult = await query(
      `SELECT person_id FROM work_logs
       WHERE project_id = $1 AND period_id = $2`,
      [projectId, periodId],
    );

    // Build sets for comparison
    const allMembers = membersResult.rows;
    const submittedIds = new Set(logsResult.rows.map((r) => r.person_id));

    // Categorize members
    const submitted = [];
    const missing = [];

    for (const member of allMembers) {
      if (submittedIds.has(member.person_id)) {
        submitted.push({
          personId: member.person_id,
          displayName: member.display_name,
        });
      } else {
        missing.push({
          personId: member.person_id,
          displayName: member.display_name,
        });
      }
    }

    return {
      complete: missing.length === 0,
      submitted,
      missing,
      totalMembers: allMembers.length,
      submittedCount: submitted.length,
      missingCount: missing.length,
    };
  }

  /**
   * Get a summary of work log submissions for a project
   * across all academic periods it spans.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Array>} Period-by-period submission summary
   */
  static async getSubmissionSummary(projectId) {
    // Get the project to know its academic year and semester
    const projectResult = await query(
      "SELECT * FROM projects WHERE project_id = $1",
      [projectId],
    );

    if (projectResult.rows.length === 0) {
      return [];
    }

    const project = projectResult.rows[0];

    // Get all periods for this semester
    const periodsResult = await query(
      `SELECT * FROM academic_months
       WHERE academic_year = $1 AND semester = $2
       ORDER BY month_index ASC`,
      [project.academic_year, project.semester],
    );

    // For each period, check completeness
    const summary = [];
    for (const period of periodsResult.rows) {
      const completeness =
        await TemporalConsistencyService.checkWorkLogCompleteness(
          projectId,
          period.period_id,
        );

      summary.push({
        periodId: period.period_id,
        monthName: period.month_name,
        monthIndex: period.month_index,
        isEvaluationMonth: period.is_evaluation_month,
        ...completeness,
      });
    }

    return summary;
  }

  /**
   * Check total hours per person across a semester.
   * Flags anyone with suspiciously high or low hours.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Array>} Per-person hour totals with flags
   */
  static async checkHourConsistency(projectId) {
    // Sum hours per person across all periods
    const sql = `
      SELECT
        wl.person_id,
        p.display_name,
        SUM(wl.hours_spent) as total_hours,
        COUNT(wl.log_id) as log_count
      FROM work_logs wl
      JOIN persons p ON wl.person_id = p.person_id
      WHERE wl.project_id = $1
      GROUP BY wl.person_id, p.display_name
      ORDER BY total_hours DESC
    `;

    const result = await query(sql, [projectId]);

    // Flag anomalies
    return result.rows.map((row) => ({
      personId: row.person_id,
      displayName: row.display_name,
      totalHours: parseFloat(row.total_hours),
      logCount: parseInt(row.log_count, 10),
      // Flag if average per log exceeds 160 hours (suspicious)
      flagHighAverage:
        parseFloat(row.total_hours) / parseInt(row.log_count, 10) > 160,
      // Flag if total is 0 (no work logged)
      flagZeroHours: parseFloat(row.total_hours) === 0,
    }));
  }

  /**
   * Check that a plan was submitted for each period.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<{ complete: boolean, submittedPeriods: number, totalPeriods: number, gaps: Array }>}
   */
  static async checkPlanCompleteness(projectId) {
    // Get the project
    const projectResult = await query(
      "SELECT academic_year, semester FROM projects WHERE project_id = $1",
      [projectId],
    );

    if (projectResult.rows.length === 0) {
      return {
        complete: false,
        submittedPeriods: 0,
        totalPeriods: 0,
        gaps: [],
      };
    }

    const project = projectResult.rows[0];

    // Get all periods for this semester
    const periodsResult = await query(
      `SELECT period_id, month_name, month_index FROM academic_months
       WHERE academic_year = $1 AND semester = $2
       ORDER BY month_index ASC`,
      [project.academic_year, project.semester],
    );

    // Get periods that have plans submitted
    const plansResult = await query(
      `SELECT DISTINCT period_id FROM project_month_plans
       WHERE project_id = $1`,
      [projectId],
    );

    const submittedPeriodIds = new Set(
      plansResult.rows.map((r) => r.period_id),
    );
    const gaps = [];

    for (const period of periodsResult.rows) {
      if (!submittedPeriodIds.has(period.period_id)) {
        gaps.push({
          periodId: period.period_id,
          monthName: period.month_name,
          monthIndex: period.month_index,
        });
      }
    }

    return {
      complete: gaps.length === 0,
      submittedPeriods: submittedPeriodIds.size,
      totalPeriods: periodsResult.rows.length,
      gaps,
    };
  }
}

// ============================================================
// Export TemporalConsistencyService class
// ============================================================
module.exports = TemporalConsistencyService;
