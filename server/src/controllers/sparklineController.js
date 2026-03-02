// ============================================================
// SPARKLINE CONTROLLER — HTTP Interface for Lightweight Sparklines
// ============================================================
// SRS §6.1: Trajectory Analysis - Lightweight Visualization
//
// Handles HTTP requests for sparkline data
// Optimized for fast response times (<20ms)
//
// CRITICAL: This is a THIN controller - all logic is in SparklineService
//
// ENDPOINTS:
//   GET  /api/analytics/sparkline/member/:memberId           → Member sparkline
//   GET  /api/analytics/sparkline/member/:memberId/project/:projectId → Project-specific
//   POST /api/analytics/sparkline/bulk                       → Bulk sparklines
//   GET  /api/analytics/sparkline/member/:memberId/trend     → Quick trend only
// ============================================================

"use strict";

const SparklineService = require("../services/analytics/SparklineService");
const { query } = require("../config/database");

// ============================================================
// GET MEMBER SPARKLINE
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId
 * Get sparkline data for a single member across all sessions.
 *
 * Access: Faculty, Admin, and the student themselves
 *
 * @param {Request} req - req.params.memberId, req.query.limit
 * @param {Response} res - Sparkline data with dates, scores, trend
 */
const getMemberSparkline = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { limit = 6 } = req.query;
    const requestingUser = req.user;

    // Authorization: Students can only view their own sparklines
    if (
      requestingUser.role === "student" &&
      requestingUser.userId !== memberId &&
      requestingUser.personId !== memberId
    ) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Students can only view their own performance trajectories",
      });
    }

    // Get sparkline data
    const sparkline = await SparklineService.getMemberSparkline(
      memberId,
      null,
      parseInt(limit),
    );

    // Get member name for display (optional enhancement)
    let memberName = null;
    try {
      const memberResult = await query(
        `SELECT name FROM persons WHERE person_id = $1`,
        [memberId],
      );
      if (memberResult.rows.length > 0) {
        memberName = memberResult.rows[0].name;
      }
    } catch (e) {
      // Non-fatal - sparkline works without name
    }

    res.json({
      success: true,
      member: {
        id: memberId,
        name: memberName,
      },
      ...sparkline,
    });
  } catch (error) {
    console.error("Error in getMemberSparkline:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate performance trajectory",
    });
  }
};

// ============================================================
// GET PROJECT-SPECIFIC MEMBER SPARKLINE
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId/project/:projectId
 * Get sparkline for a member filtered to a specific project.
 *
 * Access: Faculty, Admin, and the student themselves
 */
const getMemberProjectSparkline = async (req, res) => {
  try {
    const { memberId, projectId } = req.params;
    const { limit = 6 } = req.query;
    const requestingUser = req.user;

    // Authorization
    if (
      requestingUser.role === "student" &&
      requestingUser.userId !== memberId &&
      requestingUser.personId !== memberId
    ) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Students can only view their own performance trajectories",
      });
    }

    // Get project-specific sparkline
    const sparkline = await SparklineService.getMemberProjectSparkline(
      memberId,
      projectId,
      parseInt(limit),
    );

    res.json({
      success: true,
      ...sparkline,
    });
  } catch (error) {
    console.error("Error in getMemberProjectSparkline:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate project performance trajectory",
    });
  }
};

// ============================================================
// GET BULK SPARKLINES (N+1 Prevention)
// ============================================================
/**
 * POST /api/analytics/sparkline/bulk
 * Get multiple sparklines in one request.
 * CRITICAL: Use this for dashboards to prevent N+1 queries!
 *
 * Body: { memberIds: string[] }
 * Query: ?limit=6
 *
 * Access: Faculty, Admin (batch operations restricted for students)
 */
const getBulkSparklines = async (req, res) => {
  try {
    const { memberIds } = req.body;
    const { limit = 6 } = req.query;
    const requestingUser = req.user;

    // Validate input
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "BAD_REQUEST",
        message: "memberIds array is required",
      });
    }

    // Limit batch size to prevent abuse
    if (memberIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: "BAD_REQUEST",
        message: "Maximum 100 sparklines per request",
      });
    }

    // Authorization: Students can only request their own sparkline
    let authorizedMemberIds = memberIds;
    if (requestingUser.role === "student") {
      authorizedMemberIds = memberIds.filter(
        (id) => id === requestingUser.userId || id === requestingUser.personId,
      );

      if (authorizedMemberIds.length === 0) {
        return res.status(403).json({
          success: false,
          error: "FORBIDDEN",
          message: "Students can only view their own performance data",
        });
      }
    }

    // Get bulk sparklines
    const sparklines = await SparklineService.getBulkSparklines(
      authorizedMemberIds,
      parseInt(limit),
    );

    res.json({
      success: true,
      count: Object.keys(sparklines).length,
      sparklines,
    });
  } catch (error) {
    console.error("Error in getBulkSparklines:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate sparklines",
    });
  }
};

// ============================================================
// GET MEMBER TREND ONLY (Ultra-lightweight)
// ============================================================
/**
 * GET /api/analytics/sparkline/member/:memberId/trend
 * Ultra-lightweight - just trend direction and delta.
 * Used for badges and quick indicators.
 *
 * Access: Faculty, Admin, and the student themselves
 */
const getMemberTrend = async (req, res) => {
  try {
    const { memberId } = req.params;
    const requestingUser = req.user;

    // Authorization
    if (
      requestingUser.role === "student" &&
      requestingUser.userId !== memberId &&
      requestingUser.personId !== memberId
    ) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Access denied",
      });
    }

    const trend = await SparklineService.getMemberTrendOnly(memberId);

    res.json({
      success: true,
      ...trend,
    });
  } catch (error) {
    console.error("Error in getMemberTrend:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Failed to get performance trend",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  getMemberSparkline,
  getMemberProjectSparkline,
  getBulkSparklines,
  getMemberTrend,
};
