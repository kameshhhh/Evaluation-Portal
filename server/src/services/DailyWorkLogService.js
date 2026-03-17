"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

// Cache whether the daily_work_logs table exists (checked once per process)
let _tableExists = null;
async function ensureTable() {
  if (_tableExists !== null) return _tableExists;
  try {
    await query(`SELECT 1 FROM daily_work_logs LIMIT 0`);
    _tableExists = true;
  } catch {
    _tableExists = false;
    logger.warn("daily_work_logs table does not exist yet — run migration 052");
  }
  return _tableExists;
}

// Cache whether the github_tokens table exists (checked once per process)
let _hasGithubTokens = null;
async function hasGithubTokensTable() {
  if (_hasGithubTokens !== null) return _hasGithubTokens;
  try {
    await query(`SELECT 1 FROM github_tokens LIMIT 0`);
    _hasGithubTokens = true;
  } catch {
    _hasGithubTokens = false;
  }
  return _hasGithubTokens;
}

class DailyWorkLogService {
  /**
   * Get current IST date/time info and check if within submission window.
   * Window: Mon-Sat, 8:00 AM - 4:00 PM IST.
   */
  static isWithinWindow() {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000);
    const istHour = istNow.getHours();
    const istMinute = istNow.getMinutes();
    const istDay = istNow.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    const isSunday = istDay === 0;
    const isWithinTime = istHour >= 8 && istHour < 16;
    const allowed = !isSunday && isWithinTime;

    // Compute real UTC timestamps for window open/close (8AM IST = 2:30 UTC, 4PM IST = 10:30 UTC)
    const todayUTC = new Date(now);
    todayUTC.setUTCHours(0, 0, 0, 0);
    // If IST day is ahead of UTC day, adjust base date
    const utcDay = now.getUTCDay();
    if (istDay !== utcDay) {
      todayUTC.setUTCDate(todayUTC.getUTCDate() + (istDay > utcDay ? 1 : 0));
    }
    const windowOpensAt = new Date(todayUTC.getTime() + (8 * 60 - 330) * 60000); // 8:00 IST in UTC
    const windowClosesAt = new Date(todayUTC.getTime() + (16 * 60 - 330) * 60000); // 16:00 IST in UTC

    let reason = "";
    if (isSunday) reason = "No submissions on Sunday";
    else if (istHour < 8) reason = "Window opens at 8:00 AM IST";
    else if (istHour >= 16) reason = "Window closed for today. Next window: tomorrow 8:00 AM IST";

    return {
      allowed,
      reason,
      isSunday,
      istHour,
      istMinute,
      istDay,
      windowOpensAt: windowOpensAt.toISOString(),
      windowClosesAt: windowClosesAt.toISOString(),
      currentIST: istNow.toISOString(),
    };
  }

  /**
   * Get IST date string for today.
   */
  static getTodayIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000);
    return istNow.toISOString().slice(0, 10);
  }

  /**
   * Create a daily work log. Enforces one-per-day via unique constraint.
   */
  static async createLog(studentId, data) {
    if (!(await ensureTable())) throw new Error("daily_work_logs table not available");
    const todayIST = this.getTodayIST();
    const { summary, hours_spent, tasks_completed, challenges, learnings } = data;

    const result = await query(
      `INSERT INTO daily_work_logs (student_id, log_date, summary, hours_spent, tasks_completed, challenges, learnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        studentId,
        todayIST,
        summary,
        hours_spent,
        JSON.stringify(tasks_completed || []),
        challenges || null,
        learnings || null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Check if student already submitted today's log.
   */
  static async getTodayLog(studentId) {
    if (!(await ensureTable())) return null;
    const todayIST = this.getTodayIST();
    const result = await query(
      `SELECT log_id, log_date, summary, hours_spent, status, created_at
       FROM daily_work_logs WHERE student_id = $1 AND log_date = $2`,
      [studentId, todayIST]
    );
    return result.rows[0] || null;
  }

  /**
   * Get a student's own daily logs, ordered by date DESC.
   */
  static async getStudentLogs(studentId, filters = {}) {
    if (!(await ensureTable())) return [];
    const params = [studentId];
    let idx = 1;
    let conditions = [`d.student_id = $1`];

    if (filters.dateFrom) {
      idx++;
      params.push(filters.dateFrom);
      conditions.push(`d.log_date >= $${idx}`);
    }
    if (filters.dateTo) {
      idx++;
      params.push(filters.dateTo);
      conditions.push(`d.log_date <= $${idx}`);
    }

    const sql = `
      SELECT d.*, p.display_name AS reviewer_name
      FROM daily_work_logs d
      LEFT JOIN persons p ON p.person_id = d.reviewed_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY d.log_date DESC
    `;
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Admin/Faculty: get all daily logs with filters.
   * Safely handles github_tokens table not existing.
   */
  static async getAllLogs(filters = {}) {
    if (!(await ensureTable())) return [];
    const params = [];
    const conditions = [];
    let idx = 0;

    if (filters.search) {
      idx++;
      params.push(`%${filters.search}%`);
      conditions.push(`(p.display_name ILIKE $${idx} OR p.department_code ILIKE $${idx})`);
    }
    if (filters.track) {
      idx++;
      params.push(filters.track);
      conditions.push(`sts.track = $${idx}`);
    }
    if (filters.admissionYear) {
      idx++;
      params.push(parseInt(filters.admissionYear));
      conditions.push(`p.admission_year = $${idx}`);
    }
    if (filters.status) {
      idx++;
      params.push(filters.status);
      conditions.push(`d.status = $${idx}`);
    }
    if (filters.date) {
      idx++;
      params.push(filters.date);
      conditions.push(`d.log_date = $${idx}`);
    }
    if (filters.dateFrom) {
      idx++;
      params.push(filters.dateFrom);
      conditions.push(`d.log_date >= $${idx}`);
    }
    if (filters.dateTo) {
      idx++;
      params.push(filters.dateTo);
      conditions.push(`d.log_date <= $${idx}`);
    }
    if (filters.studentIds && filters.studentIds.length > 0) {
      idx++;
      params.push(filters.studentIds);
      conditions.push(`d.student_id = ANY($${idx}::uuid[])`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = parseInt(filters.limit) || 100;
    const offset = parseInt(filters.offset) || 0;
    idx++;
    params.push(limit);
    const limitIdx = idx;
    idx++;
    params.push(offset);
    const offsetIdx = idx;

    // Use cached github_tokens check
    let gtJoin = "";
    let gtSelect = "";
    if (await hasGithubTokensTable()) {
      gtJoin = `LEFT JOIN github_tokens gt ON gt.person_id = d.student_id`;
      gtSelect = `, gt.github_username, gt.is_valid AS has_github`;
    }

    const sql = `
      SELECT d.*,
        p.display_name AS student_name,
        p.department_code,
        p.admission_year,
        rv.display_name AS reviewer_name,
        sts.track AS student_track
        ${gtSelect}
      FROM daily_work_logs d
      JOIN persons p ON p.person_id = d.student_id
      LEFT JOIN persons rv ON rv.person_id = d.reviewed_by
      LEFT JOIN student_track_selections sts ON sts.person_id = d.student_id
      ${gtJoin}
      ${whereClause}
      ORDER BY d.log_date DESC, d.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Admin/Faculty: review a daily log.
   */
  static async reviewLog(logId, reviewerId, comment) {
    if (!(await ensureTable())) return null;
    const result = await query(
      `UPDATE daily_work_logs
       SET status = 'reviewed', reviewed_by = $2, reviewed_at = NOW(),
           review_comment = $3, updated_at = NOW()
       WHERE log_id = $1
       RETURNING *`,
      [logId, reviewerId, comment || null]
    );
    return result.rows[0];
  }

  /**
   * Student: delete own unreviewed log.
   */
  static async deleteLog(logId, studentId) {
    if (!(await ensureTable())) return null;
    const result = await query(
      `DELETE FROM daily_work_logs
       WHERE log_id = $1 AND student_id = $2 AND status != 'reviewed'
       RETURNING log_id`,
      [logId, studentId]
    );
    return result.rows[0];
  }

  /**
   * Admin/Faculty: aggregate stats.
   */
  static async getStats() {
    if (!(await ensureTable())) return { total_logs: 0, reviewed_logs: 0, today_logs: 0, students_with_logs: 0 };
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM daily_work_logs) AS total_logs,
        (SELECT COUNT(*) FROM daily_work_logs WHERE status = 'reviewed') AS reviewed_logs,
        (SELECT COUNT(*) FROM daily_work_logs WHERE log_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date) AS today_logs,
        (SELECT COUNT(DISTINCT student_id) FROM daily_work_logs) AS students_with_logs
    `);
    return result.rows[0];
  }
}

module.exports = DailyWorkLogService;
