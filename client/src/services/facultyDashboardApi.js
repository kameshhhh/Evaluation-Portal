// ============================================================
// FACULTY DASHBOARD API — Data Fetching for Evaluator Cockpit
// ============================================================
// Service layer for Faculty Dashboard Phase 1.
// Fetches sessions, projects, and calculates scarcity pools.
//
// SRS REFERENCES:
//   §4.1.3 — Scarcity pool calculation (TeamSize × 5)
//   §4.1.2 — Monthly review history (trajectory data)
//   §6.1   — Trajectory analysis (trend indicators)
// ============================================================

import api from "./api";

// ============================================================
// TYPE DEFINITIONS (JSDoc for IDE support)
// ============================================================

/**
 * @typedef {'ACTIVE' | 'LOCKED' | 'ARCHIVED' | 'open' | 'in_progress' | 'closed'} SessionStatus
 */

/**
 * @typedef {'STRICT' | 'FLEXIBLE'} ScarcityMode
 */

/**
 * @typedef {'UP' | 'DOWN' | 'STABLE'} TrendIndicator
 */

/**
 * Evaluation Session object
 * @typedef {Object} EvaluationSession
 * @property {string} id - UUID
 * @property {string} title - Session title (e.g., "Feb 2026 Capstone Review")
 * @property {SessionStatus} status - Current session status
 * @property {ScarcityMode} scarcity_mode - STRICT (fixed pool) or FLEXIBLE (range)
 * @property {string} intent - Evaluation intent (growth/excellence/leadership/comparative)
 * @property {string} [window_start] - Evaluation window start date
 * @property {string} [window_end] - Evaluation window end date
 * @property {number} evaluator_count - Number of assigned evaluators
 * @property {number} pool_size - Total scarcity pool for this session
 */

/**
 * Project Team member
 * @typedef {Object} TeamMember
 * @property {string} id - Person UUID
 * @property {string} name - Display name
 * @property {string} [photo] - Profile photo URL
 * @property {number} [share_percentage] - Project share % (SRS 4.1.1)
 */

/**
 * Project Team object
 * @typedef {Object} ProjectTeam
 * @property {string} id - Project UUID
 * @property {string} name - Project name
 * @property {string} description - Project description
 * @property {number} member_count - Team size (2-4 members per SRS 4.1.1)
 * @property {TeamMember[]} members - Team member list
 * @property {number} previous_score_avg - Last month's average score (SRS 6.1)
 * @property {TrendIndicator} trend_indicator - UP/DOWN/STABLE (SRS 6.1)
 * @property {number} pool_size - Calculated scarcity pool (member_count × 5)
 */

/**
 * Scarcity Pool state
 * @typedef {Object} ScarcityPool
 * @property {number} total_points - Maximum points (TeamSize × 5)
 * @property {number} points_remaining - Points not yet allocated
 * @property {number} utilization - Percentage used (0-100)
 */

// ============================================================
// CONSTANTS — SRS 4.1.3 Scarcity Rules
// ============================================================

/** Points allocated per team member (SRS 4.1.3: "3 members → 15 points" = 5 each) */
const POINTS_PER_MEMBER = 5;

// ============================================================
// API FUNCTIONS
// ============================================================

/**
 * Fetch active evaluation sessions for the current evaluator.
 * Uses the personalization API which already provides faculty-specific data.
 *
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Promise<EvaluationSession[]>} Array of active sessions
 */
export async function fetchActiveSessions(evaluatorId) {
  try {
    const response = await api.get("/personalization/dashboard", {
      params: { evaluatorId },
    });

    if (response.data?.success && response.data?.data) {
      const { sections } = response.data.data;

      // Map backend statuses to frontend statuses
      // Backend: draft, open, in_progress, closed, locked, aggregated
      // Frontend: active, pending, completed, drafting, closed
      const mapStatus = (backendStatus) => {
        const statusMap = {
          draft: "drafting",
          open: "active", // Open sessions are active for evaluation
          in_progress: "active", // In-progress sessions are active
          closed: "completed",
          locked: "completed",
          aggregated: "completed",
          active: "active", // Direct mapping if already correct
          pending: "pending", // Direct mapping if already correct
        };
        const normalized = backendStatus?.toLowerCase() || "active";
        return statusMap[normalized] || "pending";
      };

      // Combine evaluation assignments and scarcity evaluations
      const sessions = [];

      // From evaluationAssignments.sessions
      if (sections?.evaluationAssignments?.sessions) {
        sessions.push(
          ...sections.evaluationAssignments.sessions.map((s) => ({
            id: s.sessionId,
            title: `${s.sessionType?.replace("_", " ")} - ${s.intent || "Evaluation"}`,
            status: mapStatus(s.status),
            scarcity_mode: "STRICT",
            intent: s.intent || "comparative",
            window_start: s.windowStart,
            window_end: s.windowEnd,
            evaluator_count: s.evaluatorCount || 1,
            pool_size: s.poolSize || 0,
          })),
        );
      }

      // From scarcityEvaluations
      if (sections?.scarcityEvaluations) {
        sections.scarcityEvaluations.forEach((s) => {
          // Avoid duplicates
          if (!sessions.find((existing) => existing.id === s.sessionId)) {
            sessions.push({
              id: s.sessionId,
              title: `Scarcity Evaluation - ${s.evaluationMode?.replace("_", " ") || "Project"}`,
              status: mapStatus(s.status),
              scarcity_mode: "STRICT",
              intent: s.intent || "comparative",
              window_start: s.windowStart,
              window_end: s.windowEnd,
              evaluator_count: s.evaluatorCount || 1,
              pool_size: s.poolSize || 0,
            });
          }
        });
      }

      // From sessionPlannerSessions (faculty_evaluation_sessions + session_planner_assignments)
      if (sections?.sessionPlannerSessions) {
        sections.sessionPlannerSessions.forEach((s) => {
          if (!sessions.find((existing) => existing.id === s.sessionId)) {
            sessions.push({
              id: s.sessionId,
              title: s.title || "Evaluation Session",
              status: mapStatus(s.status),
              scarcity_mode: "STRICT",
              intent: "comparative",
              window_start: s.opensAt,
              window_end: s.closesAt,
              evaluator_count: 1,
              pool_size: 0,
              // Extra session planner fields
              session_date: s.sessionDate,
              session_time: s.sessionTime,
              venue: s.venue,
              assignment_count: s.assignmentCount || 0,
              evaluated_count: s.evaluatedCount || 0,
              students: s.students || [],
            });
          }
        });
      }

      return sessions;
    }

    return [];
  } catch (error) {
    console.error("fetchActiveSessions error:", error);
    throw error;
  }
}

/**
 * Fetch projects/teams for a specific evaluation session.
 * Gets the targets (students/teams) that the evaluator will score.
 *
 * @param {string} sessionId - Evaluation session UUID
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Promise<ProjectTeam[]>} Array of project teams
 */
export async function fetchSessionProjects(sessionId, evaluatorId) {
  try {
    const response = await api.get(`/scarcity/sessions/${sessionId}`, {
      params: { evaluatorId },
    });

    if (response.data?.success && response.data?.data) {
      const { targets, poolSize } = response.data.data;

      // Transform targets into ProjectTeam format
      // Note: In project_member mode, targets are individual members
      // We group them by project if available
      const teams = [];

      if (targets && targets.length > 0) {
        // For now, treat all targets as one "team" (the project being evaluated)
        teams.push({
          id: sessionId,
          name: "Project Team",
          description: "Team members for this evaluation session",
          member_count: targets.length,
          members: targets.map((t) => ({
            id: t.target_id,
            name: t.display_name || "Unknown",
            photo: t.photo || null,
            share_percentage: null,
          })),
          previous_score_avg: 0, // TODO: Fetch from history
          trend_indicator: "STABLE",
          pool_size: calculateMaxPool(targets.length),
        });
      }

      return teams;
    }

    return [];
  } catch (error) {
    // Don't throw - return empty array so dashboard can still load
    // This handles cases where session doesn't exist or user lacks access
    console.warn(`fetchSessionProjects(${sessionId}) failed:`, error.message);
    return [];
  }
}

/**
 * Fetch department overview stats for the faculty member.
 *
 * @returns {Promise<Object>} Department stats
 */
export async function fetchDepartmentStats() {
  try {
    const response = await api.get("/personalization/dashboard");

    if (response.data?.success && response.data?.data) {
      const { sections } = response.data.data;
      return (
        sections?.departmentOverview || {
          totalStudents: 0,
          activeProjects: 0,
          totalProjects: 0,
          submittedProjects: 0,
        }
      );
    }

    return {};
  } catch (error) {
    console.error("fetchDepartmentStats error:", error);
    throw error;
  }
}

/**
 * Fetch students assigned to the faculty member.
 *
 * @returns {Promise<Array>} Array of student objects
 */
export async function fetchAssignedStudents() {
  try {
    const response = await api.get("/personalization/dashboard");

    if (response.data?.success && response.data?.data) {
      return response.data.data.sections?.students || [];
    }

    return [];
  } catch (error) {
    console.error("fetchAssignedStudents error:", error);
    throw error;
  }
}

// ============================================================
// SCARCITY CALCULATION — SRS 4.1.3
// ============================================================

/**
 * Calculate the maximum scarcity pool for a team.
 * SRS 4.1.3: "Score pool is proportional to team size:
 *             3 members → 15 points, 4 members → 20 points"
 *
 * @param {number} memberCount - Number of team members (2-4)
 * @returns {number} Total pool size
 */
export function calculateMaxPool(memberCount) {
  // SRS 4.1.3: 5 points per team member
  return memberCount * POINTS_PER_MEMBER;
}

/**
 * Get scarcity pool state for a team.
 *
 * @param {number} memberCount - Number of team members
 * @param {number} [allocatedPoints=0] - Points already allocated
 * @returns {ScarcityPool} Pool state object
 */
export function getScarcityPoolState(memberCount, allocatedPoints = 0) {
  const totalPoints = calculateMaxPool(memberCount);
  const pointsRemaining = totalPoints - allocatedPoints;
  const utilization =
    totalPoints > 0 ? Math.round((allocatedPoints / totalPoints) * 100) : 0;

  return {
    total_points: totalPoints,
    points_remaining: pointsRemaining,
    utilization,
  };
}

// ============================================================
// CREDIBILITY API — SRS §5.1 Evaluator Credibility Display
// ============================================================

/**
 * Fetch evaluator's credibility profile from the backend.
 * Returns score, band (HIGH/MEDIUM/LOW), and trend data.
 *
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Promise<Object>} Credibility profile with score and factors
 */
export async function fetchEvaluatorCredibility(evaluatorId) {
  try {
    const response = await api.get(
      `/scarcity/credibility/profiles/${evaluatorId}`,
    );

    if (response.data?.success && response.data?.data) {
      const { profile, current_weight, history } = response.data.data;

      // Calculate trend from historical signals (if available)
      let trend = "stable";
      let delta = 0;

      if (history?.signals && history.signals.length >= 2) {
        // Compare latest vs previous signal
        const latestScore = history.signals[0]?.composite_score;
        const previousScore = history.signals[1]?.composite_score;

        if (latestScore && previousScore) {
          delta = Math.round((latestScore - previousScore) * 1000) / 1000;
          if (delta > 0.02) trend = "improving";
          else if (delta < -0.02) trend = "declining";
        }
      }

      // Build history array for trend chart
      const historyData =
        history?.signals?.map((signal) => ({
          score: parseFloat((signal.composite_score || 0).toFixed(3)),
          calculated_at: signal.created_at || signal.calculated_at,
        })) || [];

      // Use last_alignment_score for actual alignment (not the weighted component)
      const alignmentRaw = profile?.last_alignment_score ?? profile?.alignment_component;
      const stabilityRaw = profile?.stability_component;
      const disciplineRaw = profile?.mean_pool_usage ?? profile?.discipline_component;

      return {
        score: profile?.credibility_score != null ? parseFloat(parseFloat(profile.credibility_score).toFixed(3)) : null,
        band: profile?.credibility_band ?? null,
        weight: current_weight ?? 1.0,
        trend,
        delta: delta !== 0 ? parseFloat(delta.toFixed(3)) : null,
        alignment: alignmentRaw != null ? parseFloat(parseFloat(alignmentRaw).toFixed(3)) : null,
        stability: stabilityRaw != null ? parseFloat(parseFloat(stabilityRaw).toFixed(3)) : null,
        discipline: disciplineRaw != null ? parseFloat(parseFloat(disciplineRaw).toFixed(3)) : null,
        lastCalculated: profile?.updated_at ?? null,
        totalSessions: profile?.session_count ?? 0,
        history: historyData,
        profile: profile
      };
    }

    // No profile found — return defaults for new evaluator
    return {
      score: null,
      band: null,
      weight: 1.0,
      trend: "stable",
      delta: null,
      alignment: null,
      stability: null,
      discipline: null,
      lastCalculated: null,
      totalSessions: 0,
      history: [], // Empty history for new evaluators
    };
  } catch (error) {
    // Don't throw — return null so dashboard can still load
    console.warn(
      `fetchEvaluatorCredibility(${evaluatorId}) failed:`,
      error.message,
    );
    return null;
  }
}

// ============================================================
// EXPORTS
// ============================================================
export default {
  fetchActiveSessions,
  fetchSessionProjects,
  fetchDepartmentStats,
  fetchAssignedStudents,
  fetchEvaluatorCredibility,
  calculateMaxPool,
  getScarcityPoolState,
  POINTS_PER_MEMBER,
};
