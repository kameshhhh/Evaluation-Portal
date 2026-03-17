"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  getOverview,
  getStudents,
  getStudentDetail,
  exportStudents,
} = require("../controllers/evalActivityController");

// All routes require admin role
router.get("/overview", authenticate, authorize("admin"), getOverview);
router.get("/students", authenticate, authorize("admin"), getStudents);
router.get("/students/:personId/detail", authenticate, authorize("admin"), getStudentDetail);
router.get("/export", authenticate, authorize("admin"), exportStudents);

module.exports = router;
