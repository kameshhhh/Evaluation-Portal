"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createDailyLog,
  getMyDailyLogs,
  getToday,
  deleteDailyLog,
  getWindow,
  getAllDailyLogs,
  getDailyLogStats,
  reviewDailyLog,
} = require("../controllers/dailyWorkLogController");

// ── Student routes ──
router.post("/", authenticate, createDailyLog);
router.get("/my-logs", authenticate, getMyDailyLogs);
router.get("/today", authenticate, getToday);
router.get("/window", authenticate, getWindow);
router.delete("/:logId", authenticate, deleteDailyLog);

// ── Admin / faculty routes ──
router.get("/all", authenticate, authorize("admin", "faculty"), getAllDailyLogs);
router.get("/stats", authenticate, authorize("admin", "faculty"), getDailyLogStats);
router.post("/:logId/review", authenticate, authorize("admin", "faculty"), reviewDailyLog);

module.exports = router;
