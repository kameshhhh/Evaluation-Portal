"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

class SessionWorkLogService {
  /**
   * Get the Monday of the current week.
   */
  static getCurrentWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().slice(0, 10);
  }

  /**
   * Check if session is currently active (open window).
   */
  static async isSessionActive(sessionId) {
    const result = await query(
      `SELECT id, status, opens_at, closes_at FROM faculty_evaluation_sessions
       WHERE id = $1`,
      [sessionId]
    );
    if (result.rows.length === 0) return { active: false, reason: "Session not found" };
    const s = result.rows[0];
    if (s.status !== "active") return { active: false, reason: `Session is ${s.status}` };
    const now = new Date();
    if (s.opens_at && now < new Date(s.opens_at)) return { active: false, reason: "Session not yet open" };
    if (s.closes_at && now > new Date(s.closes_at)) return { active: false, reason: "Session window closed" };
    return { active: true };
  }

  /**
   * Create a session work log for the current week.
   */
  static async createLog(sessionId, studentId, data) {
    const weekStart = SessionWorkLogService.getCurrentWeekStart();

    const result = await query(
      `INSERT INTO session_work_logs
        (session_id, student_id, week_start, summary, hours_spent,
         tasks_completed, challenges, learnings, next_week_plan, evidence_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        sessionId,
        studentId,
        weekStart,
        data.summary,
        data.hours_spent,
        JSON.stringify(data.tasks_completed || []),
        data.challenges || null,
        data.learnings || null,
        data.next_week_plan || null,
        data.evidence_urls || [],
      ]
    );
    return result.rows[0];
  }

  /**
   * Get all logs for a student (optionally filtered by session).
   */
  static async getStudentLogs(studentId, sessionId) {
    let sql = `
      SELECT swl.*, fes.title as session_title, fes.status as session_status,
             fes.opens_at, fes.closes_at,
             rp.display_name as reviewer_name
      FROM session_work_logs swl
      JOIN faculty_evaluation_sessions fes ON fes.id = swl.session_id
      LEFT JOIN persons rp ON rp.person_id = swl.reviewed_by
      WHERE swl.student_id = $1`;
    const params = [studentId];
    if (sessionId) {
      params.push(sessionId);
      sql += ` AND swl.session_id = $${params.length}`;
    }
    sql += ` ORDER BY swl.week_start DESC`;
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get all logs across all students (admin view).
   */
  static async getAllLogs(filters = {}) {
    let sql = `
      SELECT swl.*,
             fes.title as session_title, fes.status as session_status,
             sp.display_name as student_name, sp.department_code,
             sp.admission_year,
             rp.display_name as reviewer_name,
             sts.track as student_track,
             gt.github_username,
             CASE WHEN gt.id IS NOT NULL AND gt.is_valid THEN true ELSE false END as has_github
      FROM session_work_logs swl
      JOIN faculty_evaluation_sessions fes ON fes.id = swl.session_id
      JOIN persons sp ON sp.person_id = swl.student_id
      LEFT JOIN persons rp ON rp.person_id = swl.reviewed_by
      LEFT JOIN student_track_selections sts ON sts.person_id = swl.student_id
      LEFT JOIN github_tokens gt ON gt.person_id = swl.student_id
      WHERE 1=1`;
    const params = [];

    if (filters.sessionId) {
      params.push(filters.sessionId);
      sql += ` AND swl.session_id = $${params.length}`;
    }
    if (filters.studentId) {
      params.push(filters.studentId);
      sql += ` AND swl.student_id = $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND swl.status = $${params.length}`;
    }
    if (filters.track) {
      params.push(filters.track);
      sql += ` AND sts.track = $${params.length}`;
    }

    sql += ` ORDER BY swl.created_at DESC`;

    if (filters.limit) {
      params.push(filters.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (filters.offset) {
      params.push(filters.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get all project work logs across all students (admin view).
   */
  static async getAllProjectLogs(filters = {}) {
    let sql = `
      SELECT pwl.*,
             sp.display_name as student_name, sp.department_code,
             sp.admission_year,
             prj.title as project_title,
             vp.display_name as verifier_name,
             sts.track as student_track,
             gt.github_username,
             CASE WHEN gt.id IS NOT NULL AND gt.is_valid THEN true ELSE false END as has_github
      FROM project_work_logs pwl
      JOIN persons sp ON sp.person_id = pwl.person_id
      LEFT JOIN projects prj ON prj.project_id = pwl.project_id
      LEFT JOIN persons vp ON vp.person_id = pwl.verified_by
      LEFT JOIN student_track_selections sts ON sts.person_id = pwl.person_id
      LEFT JOIN github_tokens gt ON gt.person_id = pwl.person_id
      WHERE 1=1`;
    const params = [];

    if (filters.projectId) {
      params.push(filters.projectId);
      sql += ` AND pwl.project_id = $${params.length}`;
    }
    if (filters.studentId) {
      params.push(filters.studentId);
      sql += ` AND pwl.person_id = $${params.length}`;
    }
    if (filters.track) {
      params.push(filters.track);
      sql += ` AND sts.track = $${params.length}`;
    }

    sql += ` ORDER BY pwl.created_at DESC`;

    if (filters.limit) {
      params.push(filters.limit);
      sql += ` LIMIT $${params.length}`;
    }

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Review a session work log (admin/faculty).
   */
  static async reviewLog(logId, reviewerId, comment) {
    const result = await query(
      `UPDATE session_work_logs
       SET status = 'reviewed', reviewed_by = $2, reviewed_at = NOW(),
           review_comment = $3, updated_at = NOW()
       WHERE log_id = $1
       RETURNING *`,
      [logId, reviewerId, comment || null]
    );
    return result.rows[0];
  }

  /**
   * Delete a session work log (only if not reviewed, by the student).
   */
  static async deleteLog(logId, studentId) {
    const result = await query(
      `DELETE FROM session_work_logs
       WHERE log_id = $1 AND student_id = $2 AND status != 'reviewed'
       RETURNING log_id`,
      [logId, studentId]
    );
    return result.rows[0];
  }

  /**
   * Get sessions assigned to a student with log status.
   */
  static async getStudentSessions(studentId) {
    const weekStart = SessionWorkLogService.getCurrentWeekStart();
    const result = await query(
      `SELECT fes.id as session_id, fes.title, fes.status, fes.opens_at, fes.closes_at,
              fes.academic_year, fes.semester,
              spa.status as assignment_status, spa.marks, spa.marks_submitted_at,
              (SELECT COUNT(*) FROM session_work_logs swl
               WHERE swl.session_id = fes.id AND swl.student_id = $1) as total_logs,
              EXISTS(SELECT 1 FROM session_work_logs swl
               WHERE swl.session_id = fes.id AND swl.student_id = $1
                 AND swl.week_start = $2) as has_this_week_log
       FROM session_planner_assignments spa
       JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
       WHERE spa.student_id = $1 AND spa.status != 'removed'
       ORDER BY fes.opens_at DESC NULLS LAST`,
      [studentId, weekStart]
    );
    return result.rows;
  }

  /**
   * Admin stats summary.
   */
  static async getAdminStats() {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM session_work_logs) as total_session_logs,
        (SELECT COUNT(*) FROM session_work_logs WHERE status = 'reviewed') as reviewed_session_logs,
        (SELECT COUNT(*) FROM project_work_logs) as total_project_logs,
        (SELECT COUNT(*) FROM project_work_logs WHERE is_verified = true) as verified_project_logs,
        (SELECT COUNT(DISTINCT student_id) FROM session_work_logs) as students_with_session_logs,
        (SELECT COUNT(DISTINCT person_id) FROM project_work_logs) as students_with_project_logs
    `);
    const tracks = await query(`SELECT DISTINCT track FROM student_track_selections ORDER BY track`);
    return {
      ...result.rows[0],
      available_tracks: tracks.rows.map(r => r.track),
    };
  }
}

module.exports = SessionWorkLogService;
