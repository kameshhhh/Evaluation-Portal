"use strict";

const SessionWorkLogService = require("../services/SessionWorkLogService");
const { broadcastChange } = require("../socket");
const logger = require("../utils/logger");

// POST / — Create session work log (student)
const createSessionLog = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { session_id, summary, hours_spent, tasks_completed, challenges, learnings, next_week_plan, evidence_urls } = req.body;

    if (!session_id || !summary || !hours_spent) {
      return res.status(400).json({ success: false, error: "session_id, summary, and hours_spent are required" });
    }

    // Check session is active
    const check = await SessionWorkLogService.isSessionActive(session_id);
    if (!check.active) {
      return res.status(403).json({ success: false, error: check.reason });
    }

    const log = await SessionWorkLogService.createLog(session_id, studentId, {
      summary, hours_spent, tasks_completed, challenges, learnings, next_week_plan, evidence_urls,
    });

    broadcastChange("session_work_log", "created", { logId: log.log_id, studentId, sessionId: session_id });
    return res.status(201).json({ success: true, data: log });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, error: "You already submitted a log for this session this week" });
    }
    logger.error("Create session log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to create session log" });
  }
};

// GET /my-logs — Get student's own session logs
const getMySessionLogs = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { sessionId } = req.query;
    const logs = await SessionWorkLogService.getStudentLogs(studentId, sessionId);
    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Get my session logs failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get session logs" });
  }
};

// GET /my-sessions — Get sessions assigned to student with log status
const getMySessions = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const sessions = await SessionWorkLogService.getStudentSessions(studentId);
    return res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error("Get my sessions failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get sessions" });
  }
};

// GET /all — Admin: get all session work logs
const getAllSessionLogs = async (req, res) => {
  try {
    const { sessionId, studentId, status, limit, offset, track } = req.query;
    const logs = await SessionWorkLogService.getAllLogs({
      sessionId, studentId, status, track,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Get all session logs failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get all session logs" });
  }
};

// GET /all-project-logs — Admin: get all project work logs
const getAllProjectLogs = async (req, res) => {
  try {
    const { projectId, studentId, limit, track } = req.query;
    const logs = await SessionWorkLogService.getAllProjectLogs({
      projectId, studentId, track,
      limit: limit ? parseInt(limit) : undefined,
    });
    return res.json({ success: true, data: logs });
  } catch (error) {
    logger.error("Get all project logs failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get all project logs" });
  }
};

// GET /stats — Admin stats
const getLogStats = async (req, res) => {
  try {
    const stats = await SessionWorkLogService.getAdminStats();
    return res.json({ success: true, data: stats });
  } catch (error) {
    logger.error("Get log stats failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get stats" });
  }
};

// POST /:logId/review — Admin/faculty review a session log
const reviewSessionLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const reviewerId = req.user.personId;
    const { comment } = req.body;
    const log = await SessionWorkLogService.reviewLog(logId, reviewerId, comment);
    if (!log) return res.status(404).json({ success: false, error: "Log not found" });

    broadcastChange("session_work_log", "reviewed", { logId, reviewerId });
    return res.json({ success: true, data: log });
  } catch (error) {
    logger.error("Review session log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to review log" });
  }
};

// DELETE /:logId — Student deletes own unreviewed log
const deleteSessionLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const studentId = req.user.personId;
    const deleted = await SessionWorkLogService.deleteLog(logId, studentId);
    if (!deleted) return res.status(404).json({ success: false, error: "Log not found or already reviewed" });

    broadcastChange("session_work_log", "deleted", { logId, studentId });
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Delete session log failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to delete log" });
  }
};

module.exports = {
  createSessionLog,
  getMySessionLogs,
  getMySessions,
  getAllSessionLogs,
  getAllProjectLogs,
  getLogStats,
  reviewSessionLog,
  deleteSessionLog,
};
