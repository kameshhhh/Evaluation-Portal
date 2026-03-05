// ============================================================
// APPEALS ROUTES — Student Score Appeals API
// ============================================================
// Mounted at: /api/appeals
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  fileAppeal,
  checkEligibility,
  getMyAppeals,
  listAppeals,
  resolveAppeal,
} = require("../controllers/appealsController");

// Student: check if eligible to appeal
router.get(
  "/check/:sessionId",
  authenticate,
  authorize("student"),
  checkEligibility
);

// Student: file an appeal
router.post("/", authenticate, authorize("student"), fileAppeal);

// Student: see my appeals
router.get("/my", authenticate, authorize("student"), getMyAppeals);

// Admin: list all appeals (?status=pending)
router.get("/", authenticate, authorize("admin"), listAppeals);

// Admin: resolve an appeal
router.put("/:id", authenticate, authorize("admin"), resolveAppeal);

module.exports = router;
