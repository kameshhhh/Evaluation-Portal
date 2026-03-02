// ============================================================
// USE SCARCITY LOGIC — Custom Hook for Pool Calculation
// ============================================================
// Provides scarcity pool calculations for the Faculty Dashboard.
// Implements the strict mathematical rules from SRS 4.1.3.
//
// SRS 4.1.3: "Score pool is proportional to team size:
//             3 members → 15 points, 4 members → 20 points"
//
// Usage:
//   const { totalPool, remaining, utilization, isExceeded } = useScarcityLogic(4, 8);
//   // → totalPool: 20, remaining: 12, utilization: 40, isExceeded: false
// ============================================================

import { useMemo } from "react";

// ============================================================
// CONSTANTS — SRS 4.1.3 Scarcity Rules
// ============================================================

/** Points allocated per team member */
const POINTS_PER_MEMBER = 5;

/** Valid team size range (SRS 4.1.1: Team size 2-4 members) */
const MIN_TEAM_SIZE = 2;
const MAX_TEAM_SIZE = 4;

// ============================================================
// useScarcityLogic Hook
// ============================================================

/**
 * Calculate scarcity pool state for a team.
 *
 * @param {number} teamSize - Number of team members (2-4)
 * @param {number} [allocatedPoints=0] - Points already allocated
 * @returns {Object} Scarcity pool state
 *   - totalPool: Maximum points available
 *   - remaining: Points still available to allocate
 *   - utilization: Percentage of pool used (0-100)
 *   - isExceeded: Whether allocation exceeds pool
 *   - isScarcityActive: Whether scarcity constraints are enforced
 *   - perMemberPoints: Points per member (constant = 5)
 *   - teamSizeValid: Whether team size is within valid range
 */
const useScarcityLogic = (teamSize, allocatedPoints = 0) => {
  return useMemo(() => {
    // Validate team size
    const validTeamSize = Math.max(0, Math.floor(teamSize) || 0);
    const teamSizeValid =
      validTeamSize >= MIN_TEAM_SIZE && validTeamSize <= MAX_TEAM_SIZE;

    // SRS 4.1.3: Calculate total pool
    const totalPool = validTeamSize * POINTS_PER_MEMBER;

    // Calculate remaining points
    const remaining = totalPool - allocatedPoints;

    // Calculate utilization percentage
    const utilization =
      totalPool > 0 ? Math.round((allocatedPoints / totalPool) * 100) : 0;

    // Check if pool is exceeded
    const isExceeded = allocatedPoints > totalPool;

    // Scarcity is active when we have a valid pool to enforce
    const isScarcityActive = totalPool > 0;

    return {
      totalPool,
      remaining,
      utilization,
      isExceeded,
      isScarcityActive,
      perMemberPoints: POINTS_PER_MEMBER,
      teamSizeValid,
      // Formatted display strings
      poolDisplay: `${totalPool} pts`,
      remainingDisplay: `${remaining} pts remaining`,
      utilizationDisplay: `${utilization}% used`,
      // Color indicators for UI
      utilizationColor: isExceeded
        ? "red"
        : utilization >= 75
          ? "amber"
          : "green",
    };
  }, [teamSize, allocatedPoints]);
};

// ============================================================
// Utility Functions (Exported for use without hook)
// ============================================================

/**
 * Calculate pool size without hook (for non-component code).
 * SRS 4.1.3: TeamSize × 5 points
 *
 * @param {number} teamSize - Number of team members
 * @returns {number} Total pool size
 */
export const calculatePool = (teamSize) => {
  return Math.max(0, Math.floor(teamSize) || 0) * POINTS_PER_MEMBER;
};

/**
 * Format pool size for display.
 * Example: "Team Size: 4 → Pool: 20 Pts"
 *
 * @param {number} teamSize - Number of team members
 * @returns {string} Formatted display string
 */
export const formatPoolDisplay = (teamSize) => {
  const pool = calculatePool(teamSize);
  return `Team Size: ${teamSize} → Pool: ${pool} Pts`;
};

// ============================================================
// Constants Export
// ============================================================
export { POINTS_PER_MEMBER, MIN_TEAM_SIZE, MAX_TEAM_SIZE };

// ============================================================
// Default Export
// ============================================================
export default useScarcityLogic;
