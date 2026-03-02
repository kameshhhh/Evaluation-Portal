// ============================================================
// SPARKLINE SERVICE — Ultra-Lightweight Trajectory Visualization
// ============================================================
// SRS §6.1: Trajectory Analysis - Lightweight Visualization Data
//
// Purpose: Provide MINIMAL data points for sparkline visualization
// OPTIMIZED FOR: Speed (<20ms), Small payload (<1KB), UI rendering
//
// CRITICAL DIFFERENCE FROM HistoricalScoreService:
// - NO credibility-weighted averaging (use raw AVG)
// - NO evaluator joins (dramatically faster)
// - NO work logs, feedback, or metadata
// - ONLY dates, scores, trend direction
//
// Performance Target: <20ms with 10,000+ students
// Payload Target: <1KB per sparkline
// ============================================================

"use strict";

const { query } = require("../../config/database");

// ============================================================
// SparklineService Class — Static Methods for Fast Trend Data
// ============================================================
class SparklineService {
  // ============================================================
  // GET SPARKLINE DATA FOR MEMBER
  // ============================================================
  /**
   * Get sparkline data for a single member across all sessions.
   * Ultra-lightweight - no evaluator joins, no weighted averaging.
   *
   * SRS §6.1: Visual trajectory of absolute scores
   *
   * @param {string} memberId - UUID of student
   * @param {string} projectId - UUID of project (optional, for project-specific history)
   * @param {number} limit - Max data points (default: 6, max: 12)
   * @returns {Promise<Object>} { dates, scores, trend, delta, color }
   */
  static async getMemberSparkline(memberId, projectId = null, limit = 6) {
    // Enforce reasonable limit for UI
    const dataPoints = Math.min(Math.max(limit, 3), 12);

    try {
      // ULTRA LIGHTWEIGHT QUERY
      // - Direct table access, minimal joins
      // - Uses covering index if available
      // - Returns raw average scores, no weighted calculations
      const sparklineQuery = `
        SELECT 
          es.month_year,
          es.name AS session_name,
          COALESCE(AVG(sa.points), 0) AS avg_score,
          COUNT(sa.allocation_id) AS allocation_count,
          es.scarcity_pool_size AS pool_size,
          es.locked_at
        FROM evaluation_sessions es
        INNER JOIN scarcity_allocations sa 
          ON es.session_id = sa.session_id
          AND sa.target_id = $1
        WHERE es.status IN ('locked', 'closed', 'aggregated')
        GROUP BY es.session_id, es.month_year, es.name, es.scarcity_pool_size, es.locked_at
        ORDER BY es.month_year DESC, es.locked_at DESC
        LIMIT $2
      `;

      const result = await query(sparklineQuery, [memberId, dataPoints]);

      // If no data, return empty sparkline
      if (!result.rows || result.rows.length === 0) {
        return this._getEmptySparkline(memberId, projectId);
      }

      // Process results - chronological order (oldest to newest)
      const chronological = result.rows.reverse();

      const dates = chronological.map((r) =>
        this._formatMonthYear(r.month_year),
      );
      const scores = chronological.map((r) =>
        parseFloat(parseFloat(r.avg_score).toFixed(1)),
      );
      const sessionNames = chronological.map((r) => r.session_name);

      // Calculate trend based on linear regression or simple comparison
      const trend = this._calculateTrend(scores);
      const delta =
        scores.length >= 2
          ? parseFloat((scores[scores.length - 1] - scores[0]).toFixed(1))
          : 0;

      // Determine color based on trend
      const color = this._getSparklineColor(trend);

      // Calculate min/max/avg
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      return {
        member_id: memberId,
        project_id: projectId,
        has_data: true,
        data_points: scores.length,
        dates,
        scores,
        session_names: sessionNames,
        trend,
        delta,
        color,
        min_score: parseFloat(minScore.toFixed(1)),
        max_score: parseFloat(maxScore.toFixed(1)),
        avg_score: parseFloat(avgScore.toFixed(1)),
      };
    } catch (error) {
      console.error(
        `SparklineService: Error generating sparkline for member ${memberId}:`,
        error,
      );
      // Fail gracefully - return empty sparkline
      return this._getEmptySparkline(memberId, projectId);
    }
  }

  // ============================================================
  // GET BULK SPARKLINES FOR MULTIPLE MEMBERS
  // ============================================================
  /**
   * Get sparklines for multiple members in one query.
   * CRITICAL: Prevents N+1 queries on dashboard
   *
   * @param {Array} memberIds - Array of member UUIDs
   * @param {number} limit - Data points per sparkline
   * @returns {Promise<Object>} Map of memberId -> sparkline data
   */
  static async getBulkSparklines(memberIds, limit = 6) {
    if (!memberIds || memberIds.length === 0) {
      return {};
    }

    try {
      const dataPoints = Math.min(Math.max(limit, 3), 12);

      // Bulk query using lateral join for efficiency
      // Returns last N sessions with scores for each member
      const bulkQuery = `
        WITH member_list AS (
          SELECT unnest($1::uuid[]) AS member_id
        ),
        member_sessions AS (
          SELECT 
            ml.member_id,
            es.month_year,
            es.name AS session_name,
            AVG(sa.points) AS avg_score,
            es.locked_at,
            ROW_NUMBER() OVER (
              PARTITION BY ml.member_id 
              ORDER BY es.month_year DESC, es.locked_at DESC
            ) AS rn
          FROM member_list ml
          INNER JOIN scarcity_allocations sa ON sa.target_id = ml.member_id
          INNER JOIN evaluation_sessions es ON sa.session_id = es.session_id
          WHERE es.status IN ('locked', 'closed', 'aggregated')
          GROUP BY ml.member_id, es.session_id, es.month_year, es.name, es.locked_at
        )
        SELECT 
          member_id,
          month_year,
          session_name,
          avg_score,
          rn
        FROM member_sessions
        WHERE rn <= $2
        ORDER BY member_id, month_year ASC
      `;

      const result = await query(bulkQuery, [memberIds, dataPoints]);

      // Transform results into map
      const sparklineMap = {};

      // Group by member_id
      const memberData = {};
      for (const row of result.rows) {
        const memberId = row.member_id;
        if (!memberData[memberId]) {
          memberData[memberId] = [];
        }
        memberData[memberId].push({
          month_year: row.month_year,
          session_name: row.session_name,
          score: parseFloat(row.avg_score),
        });
      }

      // Process each member's data
      for (const memberId of memberIds) {
        const data = memberData[memberId];

        if (!data || data.length === 0) {
          sparklineMap[memberId] = this._getEmptySparkline(memberId, null);
          continue;
        }

        const dates = data.map((h) => this._formatMonthYear(h.month_year));
        const scores = data.map((h) => parseFloat(h.score.toFixed(1)));

        const trend = this._calculateTrend(scores);
        const delta =
          scores.length >= 2
            ? parseFloat((scores[scores.length - 1] - scores[0]).toFixed(1))
            : 0;

        sparklineMap[memberId] = {
          member_id: memberId,
          has_data: true,
          data_points: scores.length,
          dates,
          scores,
          trend,
          delta,
          color: this._getSparklineColor(trend),
          min_score: parseFloat(Math.min(...scores).toFixed(1)),
          max_score: parseFloat(Math.max(...scores).toFixed(1)),
        };
      }

      return sparklineMap;
    } catch (error) {
      console.error(
        "SparklineService: Error generating bulk sparklines:",
        error,
      );
      return {};
    }
  }

  // ============================================================
  // GET PROJECT-SPECIFIC SPARKLINE (Member in specific project)
  // ============================================================
  /**
   * Get sparkline for a member filtered to a specific project.
   * Uses the head_id in allocations to filter by project.
   *
   * @param {string} memberId - UUID of student
   * @param {string} projectId - UUID of project
   * @param {number} limit - Data points
   * @returns {Promise<Object>} Sparkline data
   */
  static async getMemberProjectSparkline(memberId, projectId, limit = 6) {
    const dataPoints = Math.min(Math.max(limit, 3), 12);

    try {
      // Query filtered by head_id (project)
      const projectSparklineQuery = `
        SELECT 
          es.month_year,
          es.name AS session_name,
          COALESCE(AVG(sa.points), 0) AS avg_score,
          COUNT(sa.allocation_id) AS allocation_count,
          es.scarcity_pool_size AS pool_size
        FROM evaluation_sessions es
        INNER JOIN scarcity_allocations sa 
          ON es.session_id = sa.session_id
          AND sa.target_id = $1
          AND sa.head_id = $2
        WHERE es.status IN ('locked', 'closed', 'aggregated')
        GROUP BY es.session_id, es.month_year, es.name, es.scarcity_pool_size
        ORDER BY es.month_year DESC
        LIMIT $3
      `;

      const result = await query(projectSparklineQuery, [
        memberId,
        projectId,
        dataPoints,
      ]);

      // If no data, return empty sparkline
      if (!result.rows || result.rows.length === 0) {
        return this._getEmptySparkline(memberId, projectId);
      }

      // Process results - chronological order
      const chronological = result.rows.reverse();

      const dates = chronological.map((r) =>
        this._formatMonthYear(r.month_year),
      );
      const scores = chronological.map((r) =>
        parseFloat(parseFloat(r.avg_score).toFixed(1)),
      );

      const trend = this._calculateTrend(scores);
      const delta =
        scores.length >= 2
          ? parseFloat((scores[scores.length - 1] - scores[0]).toFixed(1))
          : 0;

      return {
        member_id: memberId,
        project_id: projectId,
        has_data: true,
        data_points: scores.length,
        dates,
        scores,
        trend,
        delta,
        color: this._getSparklineColor(trend),
        min_score: parseFloat(Math.min(...scores).toFixed(1)),
        max_score: parseFloat(Math.max(...scores).toFixed(1)),
        avg_score: parseFloat(
          (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
        ),
      };
    } catch (error) {
      console.error(
        `SparklineService: Error generating project sparkline for member ${memberId}:`,
        error,
      );
      return this._getEmptySparkline(memberId, projectId);
    }
  }

  // ============================================================
  // HELPER: Calculate Trend Direction
  // ============================================================
  /**
   * Calculate trend using linear regression or simple comparison.
   *
   * @param {Array<number>} scores - Array of scores (oldest to newest)
   * @returns {string} 'up', 'down', or 'stable'
   */
  static _calculateTrend(scores) {
    if (scores.length < 2) return "stable";

    const first = scores[0];
    const last = scores[scores.length - 1];
    const diff = last - first;

    // If we have enough points, use linear regression
    if (scores.length >= 3) {
      const n = scores.length;
      const indices = Array.from({ length: n }, (_, i) => i);

      const sumX = indices.reduce((a, b) => a + b, 0);
      const sumY = scores.reduce((a, b) => a + b, 0);
      const sumXY = indices.reduce((sum, i) => sum + i * scores[i], 0);
      const sumXX = indices.reduce((sum, i) => sum + i * i, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

      if (slope > 0.5) return "up";
      if (slope < -0.5) return "down";
      return "stable";
    }

    // Simple comparison for 2 points
    if (diff > 1) return "up";
    if (diff < -1) return "down";
    return "stable";
  }

  // ============================================================
  // HELPER: Get Sparkline Color Based on Trend
  // ============================================================
  /**
   * Get sparkline color based on trend direction.
   * SRS §6.1: Color-coded visualization
   *
   * @param {string} trend - 'up', 'down', or 'stable'
   * @returns {string} Hex color code
   */
  static _getSparklineColor(trend) {
    switch (trend) {
      case "up":
        return "#10B981"; // green-500 - Improving
      case "down":
        return "#EF4444"; // red-500 - Declining
      case "stable":
      default:
        return "#3B82F6"; // blue-500 - Stable
    }
  }

  // ============================================================
  // HELPER: Format Month-Year for Display
  // ============================================================
  /**
   * Format month_year string for UI display.
   *
   * @param {string} monthYear - Format: 'YYYY-MM' or 'Month YYYY'
   * @returns {string} Short month name (e.g., 'Jan')
   */
  static _formatMonthYear(monthYear) {
    if (!monthYear) return "";

    // Handle 'YYYY-MM' format
    if (monthYear.includes("-") && monthYear.length <= 7) {
      const [year, month] = monthYear.split("-");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return monthNames[parseInt(month) - 1] || monthYear;
    }

    // Handle 'Month YYYY' format - extract first 3 letters
    if (monthYear.length > 3) {
      return monthYear.substring(0, 3);
    }

    return monthYear;
  }

  // ============================================================
  // HELPER: Empty Sparkline (No Data)
  // ============================================================
  /**
   * Return empty sparkline structure for members with no history.
   *
   * @param {string} memberId - UUID
   * @param {string} projectId - UUID (optional)
   * @returns {Object} Empty sparkline data
   */
  static _getEmptySparkline(memberId, projectId) {
    return {
      member_id: memberId,
      project_id: projectId,
      has_data: false,
      data_points: 0,
      dates: [],
      scores: [],
      session_names: [],
      trend: "stable",
      delta: 0,
      color: "#94A3B8", // gray-400 - No data
      min_score: 0,
      max_score: 0,
      avg_score: 0,
    };
  }

  // ============================================================
  // GET QUICK TREND (Ultra-lightweight - just trend)
  // ============================================================
  /**
   * Get only the trend direction and delta.
   * Even lighter than full sparkline - for badges and indicators.
   *
   * @param {string} memberId - UUID
   * @param {number} limit - Data points to consider (default: 2)
   * @returns {Promise<Object>} { trend, delta, color, has_data }
   */
  static async getMemberTrendOnly(memberId, limit = 2) {
    try {
      const quickQuery = `
        SELECT 
          COALESCE(AVG(sa.points), 0) AS avg_score
        FROM evaluation_sessions es
        INNER JOIN scarcity_allocations sa 
          ON es.session_id = sa.session_id
          AND sa.target_id = $1
        WHERE es.status IN ('locked', 'closed', 'aggregated')
        GROUP BY es.session_id, es.month_year
        ORDER BY es.month_year DESC
        LIMIT $2
      `;

      const result = await query(quickQuery, [memberId, limit]);

      if (!result.rows || result.rows.length < 2) {
        return {
          member_id: memberId,
          has_data: false,
          trend: "stable",
          delta: 0,
          color: "#94A3B8",
        };
      }

      // Scores are in DESC order, so reverse for chronological
      const scores = result.rows.reverse().map((r) => parseFloat(r.avg_score));
      const trend = this._calculateTrend(scores);
      const delta = parseFloat(
        (scores[scores.length - 1] - scores[0]).toFixed(1),
      );

      return {
        member_id: memberId,
        has_data: true,
        trend,
        delta,
        color: this._getSparklineColor(trend),
      };
    } catch (error) {
      console.error(
        `SparklineService: Error getting trend for member ${memberId}:`,
        error,
      );
      return {
        member_id: memberId,
        has_data: false,
        trend: "stable",
        delta: 0,
        color: "#94A3B8",
      };
    }
  }
}

module.exports = SparklineService;
