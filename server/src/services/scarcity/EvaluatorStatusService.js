// ============================================================
// EVALUATOR STATUS SERVICE
// ============================================================
// SRS §4.2: Multi-Judge Evaluation - Submission Status Tracking
//
// Purpose: Track which evaluators have submitted evaluations for sessions
// CRITICAL: This service NEVER exposes scores - only submission status
//
// Business Rules:
// 1. Evaluators can see their OWN status + counts of others
// 2. Evaluators CANNOT see which SPECIFIC others have/haven't submitted
// 3. Session coordinators/admins CAN see detailed breakdown
// 4. Submission marks evaluator as done (has_submitted = true)
// 5. Late detection based on session deadline
//
// Uses existing tables:
// - session_evaluators: tracks evaluator assignments with has_submitted, submitted_at
// - evaluation_sessions: session metadata including deadline
// ============================================================

const { query } = require("../../config/database");

class EvaluatorStatusService {
  // ============================================================
  // GET MULTI-JUDGE STATUS FOR EVALUATOR
  // ============================================================
  // SRS §4.2: What an evaluator sees about other judges
  // Returns counts only - NO names of other evaluators
  //
  // @param {string} sessionId - UUID of session
  // @param {string} evaluatorId - UUID of current evaluator
  // @returns {Promise<Object>} Status object with counts, NOT names
  // ============================================================
  static async getEvaluatorSessionStatus(sessionId, evaluatorId) {
    // 1. Verify evaluator is assigned to this session
    const assignmentResult = await query(
      `SELECT se.session_id, se.evaluator_id, se.has_submitted, se.submitted_at, se.assigned_at
       FROM session_evaluators se
       WHERE se.session_id = $1 AND se.evaluator_id = $2`,
      [sessionId, evaluatorId],
    );

    if (assignmentResult.rows.length === 0) {
      throw new Error("Evaluator not assigned to this session");
    }

    const assignment = assignmentResult.rows[0];

    // 2. Get total evaluator count for this session
    const countResult = await query(
      `SELECT 
         COUNT(*) AS total_evaluators,
         COUNT(*) FILTER (WHERE has_submitted = true) AS submitted_count
       FROM session_evaluators
       WHERE session_id = $1`,
      [sessionId],
    );

    const counts = countResult.rows[0];
    const totalEvaluators = parseInt(counts.total_evaluators, 10);
    const submittedCount = parseInt(counts.submitted_count, 10);

    // 3. Get session details for deadline and name
    const sessionResult = await query(
      `SELECT session_id, name, month_year, deadline, status
       FROM evaluation_sessions
       WHERE session_id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error("Session not found");
    }

    const session = sessionResult.rows[0];

    // 4. Calculate if current evaluator is late
    const isLate =
      session.deadline &&
      assignment.has_submitted &&
      assignment.submitted_at &&
      new Date(assignment.submitted_at) > new Date(session.deadline);

    // 5. Determine submission status string
    let submissionStatus = "pending";
    if (assignment.has_submitted) {
      submissionStatus = isLate ? "late" : "submitted";
    }

    return {
      session_id: sessionId,
      session_name: session.name,
      session_month_year: session.month_year,
      session_status: session.status,
      deadline: session.deadline,

      // What evaluator sees about themselves
      my_status: {
        submission_status: submissionStatus,
        submitted_at: assignment.submitted_at,
        assigned_at: assignment.assigned_at,
        is_late: isLate,
      },

      // What evaluator sees about others (AGGREGATED ONLY - no names)
      multi_judge_status: {
        total_evaluators: totalEvaluators,
        submitted_count: submittedCount,
        pending_count: totalEvaluators - submittedCount,
        all_submitted: submittedCount === totalEvaluators,
        i_am_submitted: assignment.has_submitted,
      },

      // Progress bar data
      completion_percentage:
        totalEvaluators > 0
          ? Math.round((submittedCount / totalEvaluators) * 100)
          : 0,
    };
  }

  // ============================================================
  // GET DETAILED EVALUATOR STATUS (ADMIN/COORDINATOR VIEW)
  // ============================================================
  // SRS §4.2: Session coordinators need to track completion
  // Returns evaluator names - ADMIN ONLY
  //
  // @param {string} sessionId - UUID of session
  // @returns {Promise<Object>} Detailed status with evaluator names
  // ============================================================
  static async getDetailedEvaluatorStatus(sessionId) {
    // 1. Get all evaluator assignments with person details
    const assignmentsResult = await query(
      `SELECT 
         se.evaluator_id,
         se.has_submitted,
         se.submitted_at,
         se.assigned_at,
         p.name AS evaluator_name,
         p.email AS evaluator_email
       FROM session_evaluators se
       JOIN persons p ON se.evaluator_id = p.person_id
       WHERE se.session_id = $1
       ORDER BY se.has_submitted ASC, se.assigned_at ASC`,
      [sessionId],
    );

    // 2. Get session details
    const sessionResult = await query(
      `SELECT session_id, name, month_year, deadline, status
       FROM evaluation_sessions
       WHERE session_id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error("Session not found");
    }

    const session = sessionResult.rows[0];
    const assignments = assignmentsResult.rows;

    // 3. Calculate statistics
    const total = assignments.length;
    const submitted = assignments.filter((a) => a.has_submitted).length;
    const pending = total - submitted;
    const late = assignments.filter(
      (a) =>
        a.has_submitted &&
        session.deadline &&
        a.submitted_at &&
        new Date(a.submitted_at) > new Date(session.deadline),
    ).length;

    // 4. Format evaluator list
    const evaluators = assignments.map((a) => {
      const isLate =
        session.deadline &&
        a.has_submitted &&
        a.submitted_at &&
        new Date(a.submitted_at) > new Date(session.deadline);

      return {
        id: a.evaluator_id,
        name: a.evaluator_name,
        email: a.evaluator_email,
        submission_status: a.has_submitted
          ? isLate
            ? "late"
            : "submitted"
          : "pending",
        submitted_at: a.submitted_at,
        assigned_at: a.assigned_at,
        is_late: isLate,
      };
    });

    return {
      session: {
        id: session.session_id,
        name: session.name,
        month_year: session.month_year,
        deadline: session.deadline,
        status: session.status,
      },
      summary: {
        total_evaluators: total,
        submitted_count: submitted,
        pending_count: pending,
        late_count: late,
        completion_percentage:
          total > 0 ? Math.round((submitted / total) * 100) : 0,
        all_submitted: submitted === total,
      },
      evaluators,
    };
  }

  // ============================================================
  // SUBMIT EVALUATION
  // ============================================================
  // SRS §4.2.1: Mark evaluator's submission as complete
  // Sets has_submitted = true, submitted_at = NOW()
  //
  // @param {string} sessionId - UUID of session
  // @param {string} evaluatorId - UUID of evaluator
  // @returns {Promise<Object>} Updated status
  // ============================================================
  static async submitEvaluation(sessionId, evaluatorId) {
    // 1. Check if evaluator is assigned
    const assignmentResult = await query(
      `SELECT has_submitted FROM session_evaluators
       WHERE session_id = $1 AND evaluator_id = $2`,
      [sessionId, evaluatorId],
    );

    if (assignmentResult.rows.length === 0) {
      throw new Error("Evaluator not assigned to this session");
    }

    if (assignmentResult.rows[0].has_submitted) {
      throw new Error("Evaluation already submitted");
    }

    // 2. Verify evaluator has allocations for this session
    const allocationsResult = await query(
      `SELECT COUNT(*) AS count
       FROM scarcity_allocations
       WHERE session_id = $1 AND evaluator_id = $2`,
      [sessionId, evaluatorId],
    );

    if (parseInt(allocationsResult.rows[0].count, 10) === 0) {
      throw new Error("Cannot submit: No allocations found");
    }

    // 3. Update the submission status
    const now = new Date();
    await query(
      `UPDATE session_evaluators
       SET has_submitted = true, submitted_at = $3
       WHERE session_id = $1 AND evaluator_id = $2`,
      [sessionId, evaluatorId, now],
    );

    // 4. Return updated status
    return this.getEvaluatorSessionStatus(sessionId, evaluatorId);
  }

  // ============================================================
  // ASSIGN EVALUATOR TO SESSION
  // ============================================================
  // Called when creating session or adding evaluators later
  // Creates row in session_evaluators if not exists
  //
  // @param {string} sessionId - UUID of session
  // @param {string} evaluatorId - UUID of evaluator
  // @returns {Promise<Object>} Created/existing assignment
  // ============================================================
  static async assignEvaluatorToSession(sessionId, evaluatorId) {
    // Check if already assigned
    const existingResult = await query(
      `SELECT session_id, evaluator_id, has_submitted, submitted_at, assigned_at
       FROM session_evaluators
       WHERE session_id = $1 AND evaluator_id = $2`,
      [sessionId, evaluatorId],
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Create new assignment
    const insertResult = await query(
      `INSERT INTO session_evaluators (session_id, evaluator_id, assigned_at, has_submitted)
       VALUES ($1, $2, NOW(), false)
       RETURNING session_id, evaluator_id, has_submitted, submitted_at, assigned_at`,
      [sessionId, evaluatorId],
    );

    return insertResult.rows[0];
  }

  // ============================================================
  // GET SESSIONS FOR EVALUATOR WITH STATUS
  // ============================================================
  // Used for faculty dashboard to show submission status
  // Returns all sessions where evaluator is assigned with status
  //
  // @param {string} evaluatorId - UUID of evaluator
  // @returns {Promise<Array>} Sessions with submission status
  // ============================================================
  static async getEvaluatorSessionsWithStatus(evaluatorId) {
    // Get all sessions for this evaluator with multi-judge counts
    const result = await query(
      `WITH evaluator_sessions AS (
         SELECT 
           se.session_id,
           se.has_submitted,
           se.submitted_at,
           se.assigned_at
         FROM session_evaluators se
         WHERE se.evaluator_id = $1
       ),
       session_counts AS (
         SELECT 
           session_id,
           COUNT(*) AS total_evaluators,
           COUNT(*) FILTER (WHERE has_submitted = true) AS submitted_count
         FROM session_evaluators
         GROUP BY session_id
       )
       SELECT 
         es.session_id,
         e.name AS session_name,
         e.month_year,
         e.status,
         e.deadline,
         es.has_submitted AS my_submitted,
         es.submitted_at AS my_submitted_at,
         es.assigned_at,
         COALESCE(sc.total_evaluators, 1) AS total_evaluators,
         COALESCE(sc.submitted_count, 0) AS submitted_count
       FROM evaluator_sessions es
       JOIN evaluation_sessions e ON es.session_id = e.session_id
       LEFT JOIN session_counts sc ON es.session_id = sc.session_id
       ORDER BY e.month_year DESC, e.created_at DESC`,
      [evaluatorId],
    );

    return result.rows.map((row) => {
      const totalEvaluators = parseInt(row.total_evaluators, 10);
      const submittedCount = parseInt(row.submitted_count, 10);

      // Determine late status
      const isLate =
        row.deadline &&
        row.my_submitted &&
        row.my_submitted_at &&
        new Date(row.my_submitted_at) > new Date(row.deadline);

      let myStatus = "pending";
      if (row.my_submitted) {
        myStatus = isLate ? "late" : "submitted";
      }

      return {
        id: row.session_id,
        name: row.session_name,
        month_year: row.month_year,
        status: row.status,
        deadline: row.deadline,
        my_submission_status: myStatus,
        my_submitted_at: row.my_submitted_at,
        assigned_at: row.assigned_at,
        multi_judge: {
          total_evaluators: totalEvaluators,
          submitted_count: submittedCount,
          pending_count: totalEvaluators - submittedCount,
          completion_percentage:
            totalEvaluators > 0
              ? Math.round((submittedCount / totalEvaluators) * 100)
              : 0,
          all_submitted: submittedCount === totalEvaluators,
        },
      };
    });
  }

  // ============================================================
  // CHECK IF SESSION IS MULTI-JUDGE
  // ============================================================
  // Quick check if a session has multiple evaluators
  //
  // @param {string} sessionId - UUID of session
  // @returns {Promise<Object>} Multi-judge info
  // ============================================================
  static async isMultiJudgeSession(sessionId) {
    const result = await query(
      `SELECT 
         COUNT(*) AS total_evaluators,
         COUNT(*) FILTER (WHERE has_submitted = true) AS submitted_count
       FROM session_evaluators
       WHERE session_id = $1`,
      [sessionId],
    );

    const total = parseInt(result.rows[0].total_evaluators, 10);
    const submitted = parseInt(result.rows[0].submitted_count, 10);

    return {
      is_multi_judge: total > 1,
      total_evaluators: total,
      submitted_count: submitted,
      pending_count: total - submitted,
      all_submitted: submitted === total,
    };
  }
}

module.exports = EvaluatorStatusService;
