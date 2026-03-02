// ============================================================
// SESSION COMPLETION SERVICE
// ============================================================
// SRS §4.2: Multi-judge session completion tracking
//
// PURPOSE: Track overall session completion status across all
// evaluators for coordinator/admin views.
//
// KEY TABLES:
// - evaluation_sessions (session_id, name, month_year, status, ...)
// - session_evaluators  (session_id, evaluator_id, has_submitted, submitted_at)
// - scarcity_allocations (session_id, evaluator_id, target_id, points)
//
// PATTERNS:
// - Uses raw SQL via `const { query } = require(...)` (pg Pool)
// - Static methods, no constructor
// - Returns plain objects, no ORM models
// ============================================================

const { query } = require("../../config/database");

class SessionCompletionService {
  // ============================================================
  // GET SESSION COMPLETION STATUS
  // ============================================================
  /**
   * Returns completion percentage across ALL evaluators for
   * a given session. Used by coordinator dashboard.
   *
   * @param {string} sessionId - UUID of session
   * @returns {Promise<Object>} Completion status
   *
   * Performance target: <30ms
   */
  static async getSessionCompletionStatus(sessionId) {
    // Single optimized query for all evaluator data
    const result = await query(
      `SELECT
         se.evaluator_id,
         se.has_submitted,
         se.submitted_at,
         se.assigned_at,
         p.name AS evaluator_name,
         COALESCE(alloc.allocation_count, 0) AS allocation_count,
         COALESCE(alloc.total_points, 0) AS total_points
       FROM session_evaluators se
       JOIN persons p ON se.evaluator_id = p.person_id
       LEFT JOIN (
         SELECT
           evaluator_id,
           COUNT(*) AS allocation_count,
           SUM(points) AS total_points
         FROM scarcity_allocations
         WHERE session_id = $1
         GROUP BY evaluator_id
       ) alloc ON se.evaluator_id = alloc.evaluator_id
       WHERE se.session_id = $1
       ORDER BY se.has_submitted ASC, se.submitted_at DESC NULLS LAST`,
      [sessionId],
    );

    const evaluators = result.rows;
    const totalEvaluators = evaluators.length;
    const submittedCount = evaluators.filter(
      (e) => e.has_submitted === true,
    ).length;
    const pendingCount = totalEvaluators - submittedCount;

    // Calculate aggregate allocation stats
    const totalAllocatedPoints = evaluators.reduce(
      (sum, e) => sum + parseFloat(e.total_points || 0),
      0,
    );
    const averageAllocation =
      submittedCount > 0 ? totalAllocatedPoints / submittedCount : 0;

    return {
      session_id: sessionId,
      total_evaluators: totalEvaluators,
      submitted_count: submittedCount,
      pending_count: pendingCount,
      completion_percentage:
        totalEvaluators > 0
          ? Math.round((submittedCount / totalEvaluators) * 100)
          : 0,
      is_complete: submittedCount === totalEvaluators && totalEvaluators > 0,
      total_allocated_points: Math.round(totalAllocatedPoints * 10) / 10,
      average_allocation: Math.round(averageAllocation * 10) / 10,
      evaluators: evaluators.map((e) => ({
        evaluator_id: e.evaluator_id,
        evaluator_name: e.evaluator_name,
        has_submitted: e.has_submitted,
        submitted_at: e.submitted_at,
        assigned_at: e.assigned_at,
        allocation_count: parseInt(e.allocation_count, 10),
        total_points: parseFloat(e.total_points || 0),
      })),
    };
  }

  // ============================================================
  // GET ALL ACTIVE SESSIONS COMPLETION SUMMARY
  // ============================================================
  /**
   * Overview of completion progress across all active sessions.
   * Used for admin dashboard overview widgets.
   *
   * @param {number} [limit=10] - Maximum sessions to return
   * @returns {Promise<Array>} Array of session completion summaries
   *
   * Performance target: <50ms
   */
  static async getAllSessionsCompletionSummary(limit = 10) {
    const result = await query(
      `SELECT
         es.session_id AS id,
         es.name,
         es.month_year,
         es.status,
         COUNT(DISTINCT se.evaluator_id) AS total_evaluators,
         COUNT(DISTINCT CASE
           WHEN se.has_submitted = true THEN se.evaluator_id
         END) AS submitted_evaluators
       FROM evaluation_sessions es
       LEFT JOIN session_evaluators se ON es.session_id = se.session_id
       WHERE es.status IN ('active', 'open', 'in_progress')
         AND es.is_deleted = false
       GROUP BY es.session_id, es.name, es.month_year, es.status
       ORDER BY es.month_year DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((s) => {
      const total = parseInt(s.total_evaluators, 10);
      const submitted = parseInt(s.submitted_evaluators, 10);
      const pending = total - submitted;
      return {
        id: s.id,
        name: s.name,
        month_year: s.month_year,
        status: s.status,
        total_evaluators: total,
        submitted_evaluators: submitted,
        pending_evaluators: pending,
        completion_percentage:
          total > 0 ? Math.round((submitted / total) * 100) : 0,
        is_complete: submitted === total && total > 0,
      };
    });
  }
}

module.exports = SessionCompletionService;
