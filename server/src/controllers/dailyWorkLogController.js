"use strict";

const DailyWorkLogService = require("../services/DailyWorkLogService");
const { broadcastChange } = require("../socket");
const logger = require("../utils/logger");

// POST / — Create daily work log (student)
const createDailyLog = async (req, res) => {
  try {
    const studentId = req.user.personId;

    // Server-side time window validation
    const window = DailyWorkLogService.isWithinWindow();
    if (!window.allowed) {
      return res.status(403).json({ success: false, error: window.reason || "Outside submission window" });
    }

    const { summary, hours_spent, tasks_completed, challenges, learnings } = req.body;
    if (!summary || !hours_spent) {
      return res.status(400).json({ success: false, error: "summary and hours_spent are required" });
    }

    // Check if already submitted today
    const existing = await DailyWorkLogService.getTodayLog(studentId);
    if (existing) {
      return res.status(409).json({ success: false, error: "You already submitted today's daily log" });
    }

    const log = await DailyWorkLogService.createLog(studentId, {
      summary, hours_spent, tasks_completed, challenges, learnings,
    });

    broadcastChange("daily_work_log", "created", { logId: log.log_id, studentId });
    return res.status(201).json({ success: true, data: log });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, error: "You already submitted today's daily log" });
    }
    logger.error("Create daily log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to create daily log" });
  }
};

// GET /my-logs — Get student's own daily logs
const getMyDailyLogs = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { dateFrom, dateTo } = req.query;
    const logs = await DailyWorkLogService.getStudentLogs(studentId, { dateFrom, dateTo });
    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Get my daily logs failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get daily logs" });
  }
};

// GET /today — Today's log status + window info
const getToday = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const window = DailyWorkLogService.isWithinWindow();
    const todayLog = await DailyWorkLogService.getTodayLog(studentId);
    return res.json({
      success: true,
      data: {
        window,
        todayLog: todayLog || null,
        hasSubmittedToday: !!todayLog,
      },
    });
  } catch (error) {
    logger.error("Get today daily log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get today status" });
  }
};

// DELETE /:logId — Student deletes own unreviewed log
const deleteDailyLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const studentId = req.user.personId;
    const deleted = await DailyWorkLogService.deleteLog(logId, studentId);
    if (!deleted) return res.status(404).json({ success: false, error: "Log not found or already reviewed" });

    broadcastChange("daily_work_log", "deleted", { logId, studentId });
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Delete daily log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to delete log" });
  }
};

// GET /window — Current window status (for countdown)
const getWindow = async (req, res) => {
  try {
    const window = DailyWorkLogService.isWithinWindow();
    return res.json({ success: true, data: window });
  } catch (error) {
    logger.error("Get window failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get window info" });
  }
};

// GET /all — Admin/faculty: get all daily logs with filters
const getAllDailyLogs = async (req, res) => {
  try {
    const { search, track, admissionYear, status, date, dateFrom, dateTo, studentIds, limit, offset } = req.query;
    const logs = await DailyWorkLogService.getAllLogs({
      search, track, admissionYear, status, date, dateFrom, dateTo,
      studentIds: studentIds ? studentIds.split(",") : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Get all daily logs failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get daily logs" });
  }
};

// GET /stats — Admin/faculty: aggregate stats
const getDailyLogStats = async (req, res) => {
  try {
    const stats = await DailyWorkLogService.getStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    logger.error("Get daily log stats failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get stats" });
  }
};

// POST /:logId/review — Admin/faculty: review a daily log
const reviewDailyLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const reviewerId = req.user.personId;
    const { comment } = req.body;
    const log = await DailyWorkLogService.reviewLog(logId, reviewerId, comment);
    if (!log) return res.status(404).json({ success: false, error: "Log not found" });

    broadcastChange("daily_work_log", "reviewed", { logId, reviewerId });
    return res.json({ success: true, data: log });
  } catch (error) {
    logger.error("Review daily log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to review log" });
  }
};

module.exports = {
  createDailyLog,
  getMyDailyLogs,
  getToday,
  deleteDailyLog,
  getWindow,
  getAllDailyLogs,
  getDailyLogStats,
  reviewDailyLog,
};
