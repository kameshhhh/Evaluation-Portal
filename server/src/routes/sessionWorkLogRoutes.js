"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  createSessionLog,
  getMySessionLogs,
  getMySessions,
  getAllSessionLogs,
  getAllProjectLogs,
  getLogStats,
  reviewSessionLog,
  deleteSessionLog,
} = require("../controllers/sessionWorkLogController");

// ── Student routes ──
router.post("/", authenticate, createSessionLog);
router.get("/my-logs", authenticate, getMySessionLogs);
router.get("/my-sessions", authenticate, getMySessions);
router.delete("/:logId", authenticate, deleteSessionLog);

// ── Admin / faculty routes ──
router.get("/all", authenticate, authorize("admin", "faculty"), getAllSessionLogs);
router.get("/all-project-logs", authenticate, authorize("admin", "faculty"), getAllProjectLogs);
router.get("/stats", authenticate, authorize("admin", "faculty"), getLogStats);
router.post("/:logId/review", authenticate, authorize("admin", "faculty"), reviewSessionLog);

module.exports = router;
