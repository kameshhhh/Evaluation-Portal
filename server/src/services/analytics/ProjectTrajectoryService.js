// ============================================================
// PROJECT TRAJECTORY SERVICE — Team-Level Performance Analytics
// ============================================================
// SRS §4.1.2: Monthly Review History - Project Level Improvement
// SRS §6.1: Trajectory Analysis - Team-based Performance Trends
//
// PURPOSE: Aggregate individual member scores to project/team level
//          Visualize team improvement over time
//
// KEY METRICS:
// - Team Average Score (mean of all members)
// - Month-over-Month Delta (absolute and percentage)
// - Improvement Distribution (how many members improved/declined)
// - Team Trajectory (3-6 month history)
//
// PERFORMANCE TARGET: <50ms for project trajectory, <200ms for session bulk
// ============================================================

"use strict";

const { query } = require("../../config/database");

// ============================================================
// ProjectTrajectoryService Class — Static Methods for Team Analytics
// ============================================================
class ProjectTrajectoryService {
  // ============================================================
  // GET PROJECT TEAM TRAJECTORY
  // ============================================================
  /**
   * Get team performance trajectory over time.
   * Returns TEAM AVERAGE scores (NOT individual member scores).
   *
   * SRS §6.1: Track absolute team scores over time
   *
   * @param {string} projectId - UUID of project
   * @param {number} limit - Number of months to return (default: 6, max: 12)
   * @returns {Promise<Object>} Team average scores with metadata
   */
  static async getProjectTeamTrajectory(projectId, limit = 6) {
    const months = Math.min(Math.max(limit, 3), 12);

    try {
      // 1. Get all active team members for this project
      const membersQuery = `
        SELECT person_id
        FROM project_members
        WHERE project_id = $1
          AND left_at IS NULL
      `;

      const membersResult = await query(membersQuery, [projectId]);

      if (!membersResult.rows || membersResult.rows.length === 0) {
        return this._getEmptyTrajectory("No team members found");
      }

      const memberIds = membersResult.rows.map((m) => m.person_id);

      // 2. Get monthly team averages - ULTRA LIGHTWEIGHT QUERY
      // Aggregates all members in one query, no individual breakdown
      const trajectoryQuery = `
        WITH monthly_team_scores AS (
          SELECT 
            es.session_id,
            es.month_year,
            es.name AS session_name,
            AVG(sa.points) AS team_avg,
            COUNT(DISTINCT sa.target_id) AS members_evaluated,
            COUNT(DISTINCT sa.evaluator_id) AS evaluator_count,
            COUNT(sa.allocation_id) AS allocation_count,
            es.scarcity_pool_size AS pool_size
          FROM evaluation_sessions es
          INNER JOIN scarcity_allocations sa 
            ON es.session_id = sa.session_id
            AND sa.target_id = ANY($1::uuid[])
          WHERE es.status IN ('locked', 'closed', 'aggregated')
          GROUP BY es.session_id, es.month_year, es.name, es.scarcity_pool_size
          ORDER BY es.month_year DESC
          LIMIT $2
        )
        SELECT 
          month_year,
          session_name,
          ROUND(team_avg::numeric, 1) AS team_avg,
          members_evaluated,
          evaluator_count,
          allocation_count,
          pool_size,
          CASE 
            WHEN team_avg >= 12 THEN 'excellent'
            WHEN team_avg >= 9 THEN 'good'
            WHEN team_avg >= 6 THEN 'fair'
            ELSE 'needs_improvement'
          END AS performance_level
        FROM monthly_team_scores
        ORDER BY month_year ASC
      `;

      const result = await query(trajectoryQuery, [memberIds, months]);

      if (!result.rows || result.rows.length === 0) {
        return this._getEmptyTrajectory("No historical data available");
      }

      const results = result.rows;

      // 3. Calculate month-over-month deltas
      const enhancedResults = results.map((record, index) => {
        const prevRecord = results[index - 1];
        let delta = null;
        let deltaPercentage = null;

        if (prevRecord) {
          delta = parseFloat(
            (
              parseFloat(record.team_avg) - parseFloat(prevRecord.team_avg)
            ).toFixed(1),
          );
          deltaPercentage =
            parseFloat(prevRecord.team_avg) > 0
              ? Math.round((delta / parseFloat(prevRecord.team_avg)) * 100)
              : 0;
        }

        return {
          ...record,
          team_avg: parseFloat(record.team_avg),
          delta,
          delta_percentage: deltaPercentage,
          trend:
            delta === null
              ? "stable"
              : delta > 0
                ? "up"
                : delta < 0
                  ? "down"
                  : "stable",
        };
      });

      // 4. Calculate overall trajectory metrics
      const scores = results.map((r) => parseFloat(r.team_avg));
      const firstScore = scores[0] || 0;
      const lastScore = scores[scores.length - 1] || 0;
      const overallDelta = parseFloat((lastScore - firstScore).toFixed(1));
      const overallDeltaPercentage =
        firstScore > 0 ? Math.round((overallDelta / firstScore) * 100) : 0;

      return {
        project_id: projectId,
        team_size: memberIds.length,
        has_data: true,
        months_analyzed: results.length,
        trajectory: enhancedResults,
        summary: {
          first_month: results[0]?.month_year,
          last_month: results[results.length - 1]?.month_year,
          first_score: firstScore,
          last_score: lastScore,
          overall_delta: overallDelta,
          overall_delta_percentage: overallDeltaPercentage,
          overall_trend:
            overallDelta > 0 ? "up" : overallDelta < 0 ? "down" : "stable",
          average_score: parseFloat(
            (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1),
          ),
          peak_score: parseFloat(Math.max(...scores).toFixed(1)),
          lowest_score: parseFloat(Math.min(...scores).toFixed(1)),
        },
      };
    } catch (error) {
      console.error(
        `ProjectTrajectoryService: Error getting trajectory for project ${projectId}:`,
        error,
      );
      return this._getEmptyTrajectory(error.message);
    }
  }

  // ============================================================
  // GET PROJECT DELTA (Current vs Previous Month)
  // ============================================================
  /**
   * Get month-over-month improvement indicator.
   * Ultra lightweight - just the delta for badges
   *
   * SRS §4.1.2: Month-over-month improvement indicator
   *
   * @param {string} projectId - UUID of project
   * @param {string} currentSessionId - Current session for comparison (optional)
   * @returns {Promise<Object>} Delta information for badge display
   */
  static async getProjectDelta(projectId, currentSessionId = null) {
    try {
      // 1. Get project team members
      const membersQuery = `
        SELECT person_id
        FROM project_members
        WHERE project_id = $1
          AND left_at IS NULL
      `;

      const membersResult = await query(membersQuery, [projectId]);

      if (!membersResult.rows || membersResult.rows.length === 0) {
        return this._getEmptyDelta("Project or team not found");
      }

      const memberIds = membersResult.rows.map((m) => m.person_id);

      // 2. Get current session info if provided
      let currentSession = null;
      if (currentSessionId) {
        const sessionQuery = `
          SELECT session_id, month_year, status
          FROM evaluation_sessions
          WHERE session_id = $1
        `;
        const sessionResult = await query(sessionQuery, [currentSessionId]);
        currentSession = sessionResult.rows[0] || null;
      }

      // 3. Get current month's team average
      let currentAvg = null;
      if (currentSessionId) {
        const currentScoreQuery = `
          SELECT AVG(points) AS avg_score
          FROM scarcity_allocations
          WHERE session_id = $1
            AND target_id = ANY($2::uuid[])
        `;
        const currentResult = await query(currentScoreQuery, [
          currentSessionId,
          memberIds,
        ]);
        currentAvg = currentResult.rows[0]?.avg_score
          ? parseFloat(parseFloat(currentResult.rows[0].avg_score).toFixed(1))
          : null;
      }

      // 4. Find previous completed session and get its team average
      const previousQuery = `
        WITH previous_session AS (
          SELECT es.session_id, es.month_year
          FROM evaluation_sessions es
          WHERE es.status IN ('locked', 'closed', 'aggregated')
            ${currentSession ? `AND es.month_year < $2` : ""}
          ORDER BY es.month_year DESC
          LIMIT 1
        )
        SELECT 
          ps.session_id,
          ps.month_year,
          AVG(sa.points) AS avg_score
        FROM previous_session ps
        INNER JOIN scarcity_allocations sa 
          ON ps.session_id = sa.session_id
          AND sa.target_id = ANY($1::uuid[])
        GROUP BY ps.session_id, ps.month_year
      `;

      const params = currentSession
        ? [memberIds, currentSession.month_year]
        : [memberIds];

      const previousResult = await query(previousQuery, params);
      const previousData = previousResult.rows[0];
      const previousAvg = previousData?.avg_score
        ? parseFloat(parseFloat(previousData.avg_score).toFixed(1))
        : null;

      // 5. Calculate delta
      let delta = null;
      let deltaPercentage = null;
      let trend = "stable";

      if (currentAvg !== null && previousAvg !== null) {
        delta = parseFloat((currentAvg - previousAvg).toFixed(1));
        deltaPercentage =
          previousAvg > 0 ? Math.round((delta / previousAvg) * 100) : 0;
        trend = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
      }

      // 6. Get improvement distribution
      const distribution = await this._getImprovementDistribution(
        memberIds,
        currentSessionId,
        previousData?.session_id,
      );

      return {
        project_id: projectId,
        has_data: currentAvg !== null || previousAvg !== null,
        current: {
          score: currentAvg,
          session_id: currentSessionId,
          has_data: currentAvg !== null,
        },
        previous: {
          score: previousAvg,
          session_id: previousData?.session_id || null,
          month: previousData?.month_year || null,
          has_data: previousAvg !== null,
        },
        delta,
        delta_percentage: deltaPercentage,
        trend,
        improvement_distribution: distribution,
        display: {
          text: this._formatDeltaText(delta, deltaPercentage),
          color: this._getDeltaColor(trend, delta),
          icon: trend === "up" ? "▲" : trend === "down" ? "▼" : "→",
          badge_variant: this._getBadgeVariant(trend),
        },
      };
    } catch (error) {
      console.error(
        `ProjectTrajectoryService: Error getting delta for project ${projectId}:`,
        error,
      );
      return this._getEmptyDelta(error.message);
    }
  }

  // ============================================================
  // GET BULK PROJECT DELTAS FOR SESSION
  // ============================================================
  /**
   * Get deltas for all projects in a session (BULK).
   * CRITICAL: Prevents N+1 queries on evaluation page.
   *
   * @param {string} sessionId - Current evaluation session
   * @returns {Promise<Object>} Map of projectId -> delta data
   */
  static async getSessionProjectDeltas(sessionId) {
    try {
      // 1. Get current session info
      const sessionQuery = `
        SELECT session_id, month_year, status
        FROM evaluation_sessions
        WHERE session_id = $1
      `;
      const sessionResult = await query(sessionQuery, [sessionId]);
      const currentSession = sessionResult.rows[0];

      if (!currentSession) {
        return {};
      }

      // 2. Get all projects and their members for targets in this session
      const projectsQuery = `
        SELECT DISTINCT
          p.project_id,
          p.title,
          pm.person_id AS member_id
        FROM scarcity_allocations sa
        INNER JOIN project_members pm ON sa.target_id = pm.person_id AND pm.left_at IS NULL
        INNER JOIN projects p ON pm.project_id = p.project_id
        WHERE sa.session_id = $1
      `;

      const projectsResult = await query(projectsQuery, [sessionId]);

      if (!projectsResult.rows || projectsResult.rows.length === 0) {
        return {};
      }

      // Group members by project
      const projectMembers = {};
      const projectTitles = {};
      for (const row of projectsResult.rows) {
        if (!projectMembers[row.project_id]) {
          projectMembers[row.project_id] = [];
          projectTitles[row.project_id] = row.title;
        }
        projectMembers[row.project_id].push(row.member_id);
      }

      // 3. Find previous session
      const previousSessionQuery = `
        SELECT session_id, month_year
        FROM evaluation_sessions
        WHERE status IN ('locked', 'closed', 'aggregated')
          AND month_year < $1
        ORDER BY month_year DESC
        LIMIT 1
      `;
      const previousSessionResult = await query(previousSessionQuery, [
        currentSession.month_year,
      ]);
      const previousSession = previousSessionResult.rows[0];

      if (!previousSession) {
        // No previous session, return empty deltas for all projects
        const result = {};
        for (const projectId of Object.keys(projectMembers)) {
          result[projectId] = {
            ...this._getEmptyDelta("First evaluation session"),
            project_id: projectId,
            project_title: projectTitles[projectId],
          };
        }
        return result;
      }

      // 4. BULK QUERY - Get all project averages for current and previous session
      const allMemberIds = [...new Set(Object.values(projectMembers).flat())];

      const currentAvgQuery = `
        SELECT 
          pm.project_id,
          AVG(sa.points) AS avg_score
        FROM scarcity_allocations sa
        INNER JOIN project_members pm ON sa.target_id = pm.person_id AND pm.left_at IS NULL
        WHERE sa.session_id = $1
          AND sa.target_id = ANY($2::uuid[])
        GROUP BY pm.project_id
      `;
      const currentAvgResult = await query(currentAvgQuery, [
        sessionId,
        allMemberIds,
      ]);

      const previousAvgQuery = `
        SELECT 
          pm.project_id,
          AVG(sa.points) AS avg_score
        FROM scarcity_allocations sa
        INNER JOIN project_members pm ON sa.target_id = pm.person_id AND pm.left_at IS NULL
        WHERE sa.session_id = $1
          AND sa.target_id = ANY($2::uuid[])
        GROUP BY pm.project_id
      `;
      const previousAvgResult = await query(previousAvgQuery, [
        previousSession.session_id,
        allMemberIds,
      ]);

      // 5. Create lookup maps
      const currentMap = {};
      for (const row of currentAvgResult.rows) {
        currentMap[row.project_id] = parseFloat(
          parseFloat(row.avg_score).toFixed(1),
        );
      }

      const previousMap = {};
      for (const row of previousAvgResult.rows) {
        previousMap[row.project_id] = parseFloat(
          parseFloat(row.avg_score).toFixed(1),
        );
      }

      // 6. Build result map
      const result = {};

      for (const projectId of Object.keys(projectMembers)) {
        const currentScore = currentMap[projectId] || null;
        const previousScore = previousMap[projectId] || null;
        const memberIds = projectMembers[projectId];

        let delta = null;
        let deltaPercentage = null;
        let trend = "stable";

        if (currentScore !== null && previousScore !== null) {
          delta = parseFloat((currentScore - previousScore).toFixed(1));
          deltaPercentage =
            previousScore > 0 ? Math.round((delta / previousScore) * 100) : 0;
          trend = delta > 0 ? "up" : delta < 0 ? "down" : "stable";
        }

        // Get improvement distribution
        let distribution = null;
        if (
          currentScore !== null &&
          previousScore !== null &&
          memberIds.length > 0
        ) {
          distribution = await this._getImprovementDistribution(
            memberIds,
            sessionId,
            previousSession.session_id,
          );
        }

        result[projectId] = {
          project_id: projectId,
          project_title: projectTitles[projectId],
          has_data: currentScore !== null || previousScore !== null,
          current: { score: currentScore, has_data: currentScore !== null },
          previous: {
            score: previousScore,
            session_id: previousSession.session_id,
            month: previousSession.month_year,
            has_data: previousScore !== null,
          },
          delta,
          delta_percentage: deltaPercentage,
          trend,
          improvement_distribution: distribution,
          display: {
            text: this._formatDeltaText(delta, deltaPercentage),
            color: this._getDeltaColor(trend, delta),
            icon: trend === "up" ? "▲" : trend === "down" ? "▼" : "→",
            badge_variant: this._getBadgeVariant(trend),
          },
        };
      }

      return result;
    } catch (error) {
      console.error(
        `ProjectTrajectoryService: Error getting session deltas for ${sessionId}:`,
        error,
      );
      return {};
    }
  }

  // ============================================================
  // PRIVATE: _getImprovementDistribution
  // ============================================================
  /**
   * Get improvement distribution - how many members improved/declined.
   *
   * @private
   * @param {Array} memberIds - Array of member UUIDs
   * @param {string} currentSessionId - Current session ID
   * @param {string} previousSessionId - Previous session ID
   * @returns {Promise<Object|null>} Distribution data
   */
  static async _getImprovementDistribution(
    memberIds,
    currentSessionId,
    previousSessionId,
  ) {
    if (!currentSessionId || !previousSessionId || !memberIds.length) {
      return null;
    }

    try {
      const distributionQuery = `
        WITH current_scores AS (
          SELECT target_id, AVG(points) AS score
          FROM scarcity_allocations
          WHERE session_id = $1
            AND target_id = ANY($3::uuid[])
          GROUP BY target_id
        ),
        previous_scores AS (
          SELECT target_id, AVG(points) AS score
          FROM scarcity_allocations
          WHERE session_id = $2
            AND target_id = ANY($3::uuid[])
          GROUP BY target_id
        )
        SELECT 
          COUNT(CASE WHEN c.score > p.score THEN 1 END) AS improved,
          COUNT(CASE WHEN c.score < p.score THEN 1 END) AS declined,
          COUNT(CASE WHEN c.score = p.score THEN 1 END) AS unchanged,
          COUNT(CASE WHEN c.score IS NULL OR p.score IS NULL THEN 1 END) AS no_comparison
        FROM current_scores c
        FULL OUTER JOIN previous_scores p ON c.target_id = p.target_id
      `;

      const result = await query(distributionQuery, [
        currentSessionId,
        previousSessionId,
        memberIds,
      ]);

      const data = result.rows[0];

      return {
        improved: parseInt(data?.improved || 0),
        declined: parseInt(data?.declined || 0),
        unchanged: parseInt(data?.unchanged || 0),
        no_comparison: parseInt(data?.no_comparison || 0),
        total_members: memberIds.length,
        improvement_rate:
          memberIds.length > 0
            ? Math.round(((data?.improved || 0) / memberIds.length) * 100)
            : 0,
      };
    } catch (error) {
      console.error(
        "ProjectTrajectoryService: Error getting improvement distribution:",
        error,
      );
      return null;
    }
  }

  // ============================================================
  // PRIVATE: _formatDeltaText
  // ============================================================
  /**
   * Format delta text for display.
   * @private
   */
  static _formatDeltaText(delta, percentage) {
    if (delta === null) return "No comparison";
    if (delta === 0) return "No change";

    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta} (${sign}${percentage}%)`;
  }

  // ============================================================
  // PRIVATE: _getDeltaColor
  // ============================================================
  /**
   * Get color for delta badge.
   * @private
   */
  static _getDeltaColor(trend, delta) {
    if (delta === null) return "#94A3B8"; // gray
    if (trend === "up") return "#10B981"; // green
    if (trend === "down") return "#EF4444"; // red
    return "#3B82F6"; // blue
  }

  // ============================================================
  // PRIVATE: _getBadgeVariant
  // ============================================================
  /**
   * Get badge variant for UI.
   * @private
   */
  static _getBadgeVariant(trend) {
    switch (trend) {
      case "up":
        return "success";
      case "down":
        return "danger";
      default:
        return "info";
    }
  }

  // ============================================================
  // PRIVATE: _getEmptyTrajectory
  // ============================================================
  /**
   * Empty trajectory response.
   * @private
   */
  static _getEmptyTrajectory(reason = "No data") {
    return {
      has_data: false,
      reason,
      trajectory: [],
      summary: {
        overall_trend: "stable",
        overall_delta: 0,
        overall_delta_percentage: 0,
      },
    };
  }

  // ============================================================
  // PRIVATE: _getEmptyDelta
  // ============================================================
  /**
   * Empty delta response.
   * @private
   */
  static _getEmptyDelta(reason = "No comparison data") {
    return {
      has_data: false,
      reason,
      delta: null,
      delta_percentage: null,
      trend: "stable",
      display: {
        text: "No history",
        color: "#94A3B8",
        icon: "→",
        badge_variant: "secondary",
      },
    };
  }
}

module.exports = ProjectTrajectoryService;
