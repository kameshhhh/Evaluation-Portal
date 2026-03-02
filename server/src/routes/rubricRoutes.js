// ============================================================
// RUBRIC ROUTES — SRS §4.1.4 Rubric-Based Distribution
// ============================================================
// Mount base: /api/rubrics
// ----------------------------------------------------------

"use strict";

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/rubricController");

// --- List all active rubrics (any authenticated user) ---
// GET /api/rubrics
router.get("/", authenticate, ctrl.listRubrics);

// --- Get a single rubric ---
// GET /api/rubrics/:headId
router.get("/:headId", authenticate, ctrl.getRubric);

// --- Attach 3 rubrics to a session (admin only) ---
// POST /api/rubrics/sessions/:sessionId/attach
router.post(
  "/sessions/:sessionId/attach",
  authenticate,
  authorize("admin"),
  ctrl.attachRubricsToSession
);

// --- Get session rubric configuration ---
// GET /api/rubrics/sessions/:sessionId
router.get("/sessions/:sessionId", authenticate, ctrl.getSessionRubrics);

// --- Get per-rubric allocation totals for current evaluator ---
// GET /api/rubrics/sessions/:sessionId/allocations
router.get(
  "/sessions/:sessionId/allocations",
  authenticate,
  ctrl.getRubricAllocationTotals
);

// --- Get aggregated rubric results for a session ---
// GET /api/rubrics/sessions/:sessionId/results
router.get(
  "/sessions/:sessionId/results",
  authenticate,
  ctrl.getRubricResults
);

module.exports = router;
