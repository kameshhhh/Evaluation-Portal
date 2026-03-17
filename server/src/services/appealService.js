// ============================================================
// APPEAL SERVICE — Student Score Appeals
// ============================================================
// Conditions for filing an appeal:
//   A. Final score < 2.5 / 5.0
//   B. Large gap between faculty scores (max - min > 1.5)
//   C. Within 7-day window after session finalization
//   D. One appeal per student per session
// ============================================================

"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

const APPEAL_SCORE_THRESHOLD = 2.5;
const APPEAL_GAP_THRESHOLD = 1.5;
const APPEAL_WINDOW_DAYS = 7;

class AppealService {
  /**
   * Check if a student is eligible to file an appeal for a session.
   * Returns { eligible: boolean, reasons: string[], deadline: ISO }
   */
  async checkEligibility(studentId, sessionId) {
    logger.info("checkEligibility called", { studentId, sessionId });

    // 1. One appeal per session check
    const existingAppeal = await query(
      `SELECT id, status FROM score_appeals
       WHERE student_id = $1 AND session_id = $2`,
      [studentId, sessionId]
    );
    if (existingAppeal.rows.length > 0) {
      logger.info("checkEligibility: Already appealed", {
        studentId,
        sessionId,
      });
      return {
        eligible: false,
        reasons: ["You have already filed an appeal for this session."],
        existingAppeal: existingAppeal.rows[0],
      };
    }

    // 2. Session must be finalized
    const sessionRes = await query(
      `SELECT id, finalized_at, status FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId]
    );
    if (sessionRes.rows.length === 0) {
      logger.warn("checkEligibility: Session not found", { studentId, sessionId });
      return { eligible: false, reasons: ["Session not found."] };
    }
    const session = sessionRes.rows[0];
    if (!session.finalized_at) {
      logger.warn("checkEligibility: Session not finalized", {
        studentId,
        sessionId,
      });
      return { eligible: false, reasons: ["Session has not been finalized yet."] };
    }

    // 3. Within 7-day window
    const deadline = new Date(session.finalized_at);
    deadline.setDate(deadline.getDate() + APPEAL_WINDOW_DAYS);
    if (new Date() > deadline) {
      logger.warn("checkEligibility: Appeal window closed", {
        studentId,
        sessionId,
        deadline: deadline.toISOString(),
      });
      return {
        eligible: false,
        reasons: [`Appeal window closed on ${deadline.toISOString().split("T")[0]}.`],
      };
    }

    // 4. Check score conditions (A or B)
    const resultRes = await query(
      `SELECT display_score FROM final_student_results
       WHERE session_id = $1 AND student_id = $2`,
      [sessionId, studentId]
    );

    // If no result or display_score is null, fall back to session_planner_assignments
    let scoreData = resultRes.rows[0];
    if (!scoreData || scoreData.display_score == null) {
      const assignmentRes = await query(
        `SELECT AVG(marks) as display_score FROM session_planner_assignments
         WHERE session_id = $1 AND student_id = $2 AND status != 'removed' AND marks IS NOT NULL`,
        [sessionId, studentId]
      );
      if (assignmentRes.rows[0]?.display_score != null) {
        scoreData = assignmentRes.rows[0];
      }
    }

    logger.info("checkEligibility: Score data", {
      studentId,
      sessionId,
      finalResultsFound: resultRes.rows.length,
      scoreValue: scoreData?.display_score,
    });

    const marksRes = await query(
      `SELECT faculty_id, marks FROM session_planner_assignments
       WHERE session_id = $1 AND student_id = $2 AND status != 'removed' AND marks IS NOT NULL`,
      [sessionId, studentId]
    );

    logger.info("checkEligibility: Query session_planner_assignments", {
      studentId,
      sessionId,
      marksFound: marksRes.rows.length,
    });

    const reasons = [];
    let scoreAtAppeal = null;
    let facultyGap = null;

    // Condition A: score < 2.5
    if (scoreData && scoreData.display_score != null) {
      scoreAtAppeal = parseFloat(scoreData.display_score);
      if (scoreAtAppeal < APPEAL_SCORE_THRESHOLD) {
        reasons.push(`Your score (${scoreAtAppeal.toFixed(2)}) is below ${APPEAL_SCORE_THRESHOLD}.`);
      }
    } else {
      logger.warn("checkEligibility: No score found for student", {
        studentId,
        sessionId,
      });
    }

    // Condition B: large gap between faculty scores
    if (marksRes.rows.length >= 2) {
      const scores = marksRes.rows.map(r => parseFloat(r.marks));
      const gap = Math.max(...scores) - Math.min(...scores);
      facultyGap = gap;
      if (gap > APPEAL_GAP_THRESHOLD) {
        reasons.push(`Faculty scores differ by ${gap.toFixed(2)} (threshold: ${APPEAL_GAP_THRESHOLD}).`);
      }
    }

    if (reasons.length === 0) {
      logger.warn("checkEligibility: No qualifying conditions met", {
        studentId,
        sessionId,
        finalScoreFound: resultRes.rows.length > 0,
        facultyMarksCount: marksRes.rows.length,
      });
      return {
        eligible: false,
        reasons: ["Your score does not meet appeal criteria (score >= 2.5 and faculty gap <= 1.5)."],
      };
    }

    logger.info("checkEligibility: Student IS eligible", {
      studentId,
      sessionId,
      reasons,
    });

    return {
      eligible: true,
      reasons,
      scoreAtAppeal,
      facultyGap,
      deadline: deadline.toISOString(),
    };
  }

  /**
   * File a new appeal.
   */
  async fileAppeal(studentId, sessionId, reason, disputedFacultyId = null) {
    const eligibility = await this.checkEligibility(studentId, sessionId);
    if (!eligibility.eligible) {
      return { success: false, error: eligibility.reasons.join(" ") };
    }

    const result = await query(
      `INSERT INTO score_appeals
         (student_id, session_id, disputed_faculty_id, reason,
          score_at_appeal, faculty_gap, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        studentId,
        sessionId,
        disputedFacultyId,
        reason,
        eligibility.scoreAtAppeal,
        eligibility.facultyGap,
      ]
    );

    logger.info("Appeal filed", {
      appealId: result.rows[0].id,
      studentId,
      sessionId,
    });

    return { success: true, data: result.rows[0] };
  }

  /**
   * List appeals (admin view) with optional status filter.
   */
  async listAppeals(statusFilter = null) {
    let sql = `
      SELECT sa.*,
             sp.display_name AS student_name,
             sp.department_code AS student_dept,
             fes.title AS session_title,
             fes.finalized_at,
             dp.display_name AS disputed_faculty_name,
             rp.display_name AS resolved_by_name
      FROM score_appeals sa
      JOIN persons sp ON sp.person_id = sa.student_id
      JOIN faculty_evaluation_sessions fes ON fes.id = sa.session_id
      LEFT JOIN persons dp ON dp.person_id = sa.disputed_faculty_id
      LEFT JOIN persons rp ON rp.person_id = sa.resolved_by
    `;
    const params = [];
    if (statusFilter) {
      params.push(statusFilter);
      sql += ` WHERE sa.status = $1`;
    }
    sql += ` ORDER BY sa.created_at DESC`;

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Resolve an appeal (admin action).
   */
  async resolveAppeal(appealId, status, resolvedBy, resolutionNotes = null) {
    if (!["accepted", "rejected"].includes(status)) {
      return { success: false, error: "Status must be 'accepted' or 'rejected'." };
    }

    const result = await query(
      `UPDATE score_appeals
       SET status = $1, resolved_by = $2, resolution_notes = $3, resolved_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, resolvedBy, resolutionNotes, appealId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: "Appeal not found." };
    }

    logger.info("Appeal resolved", {
      appealId,
      status,
      resolvedBy,
    });

    return { success: true, data: result.rows[0] };
  }

  /**
   * Get student's appeals (for student dashboard).
   */
  async getStudentAppeals(studentId) {
    const result = await query(
      `SELECT sa.*, fes.title AS session_title
       FROM score_appeals sa
       JOIN faculty_evaluation_sessions fes ON fes.id = sa.session_id
       WHERE sa.student_id = $1
       ORDER BY sa.created_at DESC`,
      [studentId]
    );
    return result.rows;
  }
}

module.exports = new AppealService();
