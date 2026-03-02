// ============================================================
// PROJECT ENHANCEMENT CONTROLLER — SRS 4.1.1 & 4.1.2 Endpoints
// ============================================================
// HTTP handlers for project management enhancements:
//   - Member profile (photo, scope, technical stack)
//   - Share percentage distribution
//   - Monthly plans (CRUD + status workflow)
//   - Work logs (CRUD + verification + summary)
//   - Review history & improvement indicators (SRS 4.1.2)
//
// DOES NOT modify any existing controllers.
// ============================================================

"use strict";

const ProjectEnhancementService = require("../services/ProjectEnhancementService");
const ImprovementAnalyticsService = require("../services/ImprovementAnalyticsService");
const logger = require("../utils/logger");
const { broadcastChange } = require("../socket");

// ============================================================
// MEMBER PROFILE HANDLERS — SRS 4.1.1
// ============================================================

/**
 * GET /api/project-enhancements/:projectId/members
 * Get all enhanced member profiles for a project.
 */
const getEnhancedMembers = async (req, res, next) => {
  try {
    const members = await ProjectEnhancementService.getEnhancedMembers(
      req.params.projectId,
    );
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/project-enhancements/:projectId/members/:personId/profile
 * Update member profile (photo, scope, technical stack).
 */
const updateMemberProfile = async (req, res, next) => {
  try {
    const { projectId, personId } = req.params;
    const updated = await ProjectEnhancementService.updateMemberProfile(
      projectId,
      personId,
      req.body,
    );
    broadcastChange("project_enhancement", "update_member_profile", {
      projectId,
      personId,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/project-enhancements/:projectId/shares
 * Update share percentages for all members (must total 100%).
 */
const updateSharePercentages = async (req, res, next) => {
  try {
    const { distributions } = req.body;
    if (!Array.isArray(distributions)) {
      return res
        .status(400)
        .json({ success: false, error: "distributions array required" });
    }
    const result = await ProjectEnhancementService.updateSharePercentages(
      req.params.projectId,
      distributions,
    );
    broadcastChange("project_enhancement", "update_shares", {
      projectId: req.params.projectId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// MONTHLY PLAN HANDLERS — SRS 4.1.1
// ============================================================

/**
 * POST /api/project-enhancements/:projectId/plans
 * Create a new monthly plan.
 */
const createMonthlyPlan = async (req, res, next) => {
  try {
    const submittedBy = req.user?.personId || req.user?.userId;
    const plan = await ProjectEnhancementService.createMonthlyPlan(
      req.params.projectId,
      req.body,
      submittedBy,
    );
    broadcastChange("project_enhancement", "create_plan", {
      projectId: req.params.projectId,
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/plans
 * Get all monthly plans for a project.
 */
const getMonthlyPlans = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    };
    const plans = await ProjectEnhancementService.getMonthlyPlans(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/plans/:planId
 * Get a single monthly plan by ID.
 */
const getMonthlyPlanById = async (req, res, next) => {
  try {
    const plan = await ProjectEnhancementService.getMonthlyPlanById(
      req.params.planId,
    );
    if (!plan) {
      return res.status(404).json({ success: false, error: "Plan not found" });
    }
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/project-enhancements/plans/:planId
 * Update a monthly plan.
 */
const updateMonthlyPlan = async (req, res, next) => {
  try {
    const plan = await ProjectEnhancementService.updateMonthlyPlan(
      req.params.planId,
      req.body,
    );
    broadcastChange("project_enhancement", "update_plan", {
      planId: req.params.planId,
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/project-enhancements/plans/:planId/transition
 * Transition monthly plan status (draft → submitted → approved → completed).
 */
const transitionPlanStatus = async (req, res, next) => {
  try {
    const actorId = req.user?.personId || req.user?.userId;
    const { status: newStatus } = req.body;
    if (!newStatus) {
      return res
        .status(400)
        .json({ success: false, error: "status is required" });
    }
    const plan = await ProjectEnhancementService.transitionPlanStatus(
      req.params.planId,
      newStatus,
      actorId,
    );
    broadcastChange("project_enhancement", "transition_plan", {
      planId: req.params.planId,
      newStatus,
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// WORK LOG HANDLERS — SRS 4.1.1
// ============================================================

/**
 * POST /api/project-enhancements/:projectId/work-logs
 * Create a work log entry.
 */
const createWorkLog = async (req, res, next) => {
  try {
    const personId = req.user?.personId || req.user?.userId;
    const log = await ProjectEnhancementService.createWorkLog(
      req.params.projectId,
      personId,
      req.body,
    );
    broadcastChange("project_enhancement", "create_work_log", {
      projectId: req.params.projectId,
      personId,
    });
    res.status(201).json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/work-logs
 * Get work logs with optional filters.
 */
const getWorkLogs = async (req, res, next) => {
  try {
    const filters = {
      personId: req.query.personId || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
      category: req.query.category || undefined,
      isVerified:
        req.query.isVerified !== undefined
          ? req.query.isVerified === "true"
          : undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset, 10) : undefined,
    };
    const logs = await ProjectEnhancementService.getWorkLogs(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/project-enhancements/work-logs/:logId
 * Update a work log entry (own logs, not yet verified).
 */
const updateWorkLog = async (req, res, next) => {
  try {
    const personId = req.user?.personId || req.user?.userId;
    const log = await ProjectEnhancementService.updateWorkLog(
      req.params.logId,
      req.body,
      personId,
    );
    broadcastChange("project_enhancement", "update_work_log", {
      logId: req.params.logId,
    });
    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/project-enhancements/work-logs/:logId
 * Delete a work log entry (own logs, not yet verified).
 */
const deleteWorkLog = async (req, res, next) => {
  try {
    const personId = req.user?.personId || req.user?.userId;
    const result = await ProjectEnhancementService.deleteWorkLog(
      req.params.logId,
      personId,
    );
    broadcastChange("project_enhancement", "delete_work_log", {
      logId: req.params.logId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/project-enhancements/work-logs/:logId/verify
 * Verify a work log (faculty only).
 */
const verifyWorkLog = async (req, res, next) => {
  try {
    const verifiedBy = req.user?.personId || req.user?.userId;
    const log = await ProjectEnhancementService.verifyWorkLog(
      req.params.logId,
      verifiedBy,
    );
    broadcastChange("project_enhancement", "verify_work_log", {
      logId: req.params.logId,
    });
    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/work-logs/summary
 * Get work log summary statistics.
 */
const getWorkLogSummary = async (req, res, next) => {
  try {
    const { personId, month } = req.query;
    if (!personId) {
      return res
        .status(400)
        .json({ success: false, error: "personId query required" });
    }
    const summary = await ProjectEnhancementService.getWorkLogSummary(
      req.params.projectId,
      personId,
      month || null,
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// REVIEW HISTORY & IMPROVEMENT HANDLERS — SRS 4.1.2
// ============================================================

/**
 * GET /api/project-enhancements/:projectId/review-history
 * Get evaluation history for a project.
 */
const getReviewHistory = async (req, res, next) => {
  try {
    const filters = {
      personId: req.query.personId || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    };
    const history = await ImprovementAnalyticsService.getReviewHistory(
      req.params.projectId,
      filters,
    );
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/improvement
 * Get improvement metrics for a team member.
 */
const getImprovementMetrics = async (req, res, next) => {
  try {
    const { personId, metricType, limit } = req.query;
    if (!personId) {
      return res
        .status(400)
        .json({ success: false, error: "personId query required" });
    }
    const metrics = await ImprovementAnalyticsService.getImprovementMetrics(
      req.params.projectId,
      personId,
      {
        metricType: metricType || undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/project-enhancements/:projectId/improvement/calculate
 * Trigger improvement calculation for all members.
 */
const calculateImprovement = async (req, res, next) => {
  try {
    const results =
      await ImprovementAnalyticsService.calculateProjectImprovement(
        req.params.projectId,
      );
    broadcastChange("project_enhancement", "calculate_improvement", {
      projectId: req.params.projectId,
    });
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/score-comparison
 * Get score comparison data for judges (last month vs current).
 */
const getScoreComparison = async (req, res, next) => {
  try {
    const comparison = await ImprovementAnalyticsService.getScoreComparison(
      req.params.projectId,
    );
    res.json({ success: true, data: comparison });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/project-enhancements/:projectId/improvement/summary
 * Get improvement summary for all members.
 */
const getImprovementSummary = async (req, res, next) => {
  try {
    const summary = await ImprovementAnalyticsService.getImprovementSummary(
      req.params.projectId,
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
