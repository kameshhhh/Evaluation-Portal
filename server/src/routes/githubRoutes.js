"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  saveToken,
  getTokenStatus,
  updateToken,
  deleteToken,
  validateToken,
  getStudentProfile,
} = require("../controllers/githubController");

// ── Student routes ──
router.post("/token", authenticate, saveToken);
router.get("/token/status", authenticate, getTokenStatus);
router.put("/token", authenticate, updateToken);
router.delete("/token", authenticate, deleteToken);
router.post("/token/validate", authenticate, validateToken);

// ── Admin / faculty routes ──
router.get("/profile/:personId", authenticate, authorize("admin", "faculty"), getStudentProfile);

module.exports = router;
