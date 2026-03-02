// ============================================================
// PROJECT ENHANCEMENT ROUTES — SRS 4.1.1 & 4.1.2 API Endpoints
// ============================================================
// Defines Express route handlers for project enhancements:
//   - Member profile management (photo, scope, tech stack)
//   - Share percentage distribution
//   - Monthly plans (CRUD + approval workflow)
//   - Work logs (CRUD + verification + summary)
//   - Review history & improvement indicators
//
// Mount: app.use("/api/project-enhancements", projectEnhancementRoutes)
//
// All routes require authentication via JWT.
// Faculty-only routes additionally require authorize('faculty').
// DOES NOT modify any existing routes.
// ============================================================

"use strict";

const express = require("express");
const router = express.Router();

// Import authentication + authorization middleware
const { authenticate, authorize } = require("../middleware/auth");

// Import all controller handlers
const {
  // Member profile
  getEnhancedMembers,
  updateMemberProfile,
  updateSharePercentages,
  // Monthly plans
  createMonthlyPlan,
  getMonthlyPlans,
  getMonthlyPlanById,
  updateMonthlyPlan,
  transitionPlanStatus,
  // Work logs
  createWorkLog,
  getWorkLogs,
  updateWorkLog,
  deleteWorkLog,
  verifyWorkLog,
  getWorkLogSummary,
  // Review history & improvement
  getReviewHistory,
  getImprovementMetrics,
  calculateImprovement,
  getScoreComparison,
  getImprovementSummary,
} = require("../controllers/projectEnhancementController");

// ============================================================
// MEMBER PROFILE ROUTES — SRS 4.1.1
// ============================================================

// GET /:projectId/members — Get all enhanced member profiles
router.get("/:projectId/members", authenticate, getEnhancedMembers);

// PATCH /:projectId/members/:personId/profile — Update member profile
router.patch(
  "/:projectId/members/:personId/profile",
  authenticate,
  updateMemberProfile,
);

// PUT /:projectId/shares — Update share percentages for all members
router.put("/:projectId/shares", authenticate, updateSharePercentages);

// ============================================================
// MONTHLY PLAN ROUTES — SRS 4.1.1
// ============================================================

// POST /:projectId/plans — Create a monthly plan
router.post("/:projectId/plans", authenticate, createMonthlyPlan);

// GET /:projectId/plans — Get all monthly plans
router.get("/:projectId/plans", authenticate, getMonthlyPlans);

// GET /plans/:planId — Get single plan
router.get("/plans/:planId", authenticate, getMonthlyPlanById);

// PATCH /plans/:planId — Update a plan
router.patch("/plans/:planId", authenticate, updateMonthlyPlan);

// POST /plans/:planId/transition — Transition plan status
router.post("/plans/:planId/transition", authenticate, transitionPlanStatus);

// ============================================================
// WORK LOG ROUTES — SRS 4.1.1
// ============================================================

// POST /:projectId/work-logs — Create a work log
router.post("/:projectId/work-logs", authenticate, createWorkLog);

// GET /:projectId/work-logs — Get work logs
router.get("/:projectId/work-logs", authenticate, getWorkLogs);

// GET /:projectId/work-logs/summary — Get work log summary
router.get("/:projectId/work-logs/summary", authenticate, getWorkLogSummary);

// PATCH /work-logs/:logId — Update a work log
router.patch("/work-logs/:logId", authenticate, updateWorkLog);

// DELETE /work-logs/:logId — Delete a work log
router.delete("/work-logs/:logId", authenticate, deleteWorkLog);

// POST /work-logs/:logId/verify — Verify a work log (faculty only)
router.post(
  "/work-logs/:logId/verify",
  authenticate,
  authorize("faculty"),
  verifyWorkLog,
);

// ============================================================
// REVIEW HISTORY & IMPROVEMENT ROUTES — SRS 4.1.2
// ============================================================

// GET /:projectId/review-history — Get evaluation history
router.get("/:projectId/review-history", authenticate, getReviewHistory);

// GET /:projectId/improvement — Get improvement metrics
router.get("/:projectId/improvement", authenticate, getImprovementMetrics);

// POST /:projectId/improvement/calculate — Trigger improvement calc
router.post(
  "/:projectId/improvement/calculate",
  authenticate,
  authorize("faculty"),
  calculateImprovement,
);

// GET /:projectId/score-comparison — Score comparison for judges
router.get("/:projectId/score-comparison", authenticate, getScoreComparison);

// GET /:projectId/improvement/summary — Improvement summary
router.get(
  "/:projectId/improvement/summary",
  authenticate,
  getImprovementSummary,
);

module.exports = router;
