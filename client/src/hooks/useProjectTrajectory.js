// ============================================================
// useProjectTrajectory Hook
// ============================================================
// SRS §4.1.2: Project-level improvement visualization
// SRS §6.1: Team trajectory analysis
//
// PURPOSE: Fetch and manage project-level performance data
//
// Features:
// - Team trajectory over multiple months
// - Month-over-month delta for badges
// - Bulk fetching for evaluation page (N+1 prevention)
// - Loading and error states
// - Helper functions for UI
//
// HOOKS EXPORTED:
// - useProjectTrajectory - Full team trajectory
// - useProjectDelta - Lightweight delta for badges
// - useSessionProjectDeltas - Bulk fetch for all projects
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getProjectTrajectory,
  getProjectDelta,
  getSessionProjectDeltas,
} from "../services/projectTrajectoryApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// useProjectTrajectory — Full team trajectory data
// ============================================================
/**
 * Hook for managing project team trajectory data.
 *
 * @param {string} projectId - UUID of project
 * @param {Object} options - Configuration
 * @param {number} options.limit - Months of history (default: 6)
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @returns {Object} Trajectory data and helpers
 */
export const useProjectTrajectory = (projectId, options = {}) => {
  const { limit = 6, autoFetch = true } = options;

  const [trajectory, setTrajectory] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const fetchTrajectory = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getProjectTrajectory(projectId, limit);

      if (!mountedRef.current) return;

      setTrajectory(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch project trajectory:", err);
      setError("Could not load team performance history");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, limit]);

  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && projectId) {
      fetchTrajectory();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, projectId, fetchTrajectory]);

  // Helper functions for UI
  const hasData = trajectory?.has_data || false;
  const teamSize = trajectory?.team_size || 0;
  const summary = trajectory?.summary || null;

  // Generate SVG path for sparkline visualization
  const generateSparklinePath = useCallback(
    (width = 100, height = 40) => {
      if (!trajectory?.trajectory?.length) return null;

      const scores = trajectory.trajectory.map((t) => t.team_avg);
      const minScore = Math.min(...scores, 0);
      const maxScore = Math.max(...scores, 15);
      const range = maxScore - minScore || 1;

      const points = scores.map((score, index) => {
        const x = (index / (scores.length - 1)) * width;
        const y = height - ((score - minScore) / range) * height;
        return `${x},${y}`;
      });

      return `M ${points.join(" L ")}`;
    },
    [trajectory],
  );

  // Get point positions for hover tooltips
  const getPointPositions = useCallback(
    (width = 100, height = 40) => {
      if (!trajectory?.trajectory?.length) return [];

      const scores = trajectory.trajectory.map((t) => t.team_avg);
      const minScore = Math.min(...scores, 0);
      const maxScore = Math.max(...scores, 15);
      const range = maxScore - minScore || 1;

      return trajectory.trajectory.map((t, index) => {
        const x = (index / (scores.length - 1)) * width;
        const y = height - ((t.team_avg - minScore) / range) * height;
        return {
          x,
          y,
          score: t.team_avg,
          month: t.month_year,
          session: t.session_name,
          trend: t.trend,
        };
      });
    },
    [trajectory],
  );

  // Real-time updates via Socket.IO
  useDataChange(["project", "evaluation"], fetchTrajectory);

  return {
    // Data
    trajectory,
    isLoading,
    error,
    fetchTrajectory,

    // Helpers
    hasData,
    teamSize,
    summary,

    // Computed
    overallTrend: summary?.overall_trend || "stable",
    overallDelta: summary?.overall_delta || 0,
    overallDeltaPercentage: summary?.overall_delta_percentage || 0,

    // SVG helpers
    generateSparklinePath,
    getPointPositions,
  };
};

// ============================================================
// useProjectDelta — Lightweight delta for badges
// ============================================================
/**
 * Lightweight hook for delta badge display.
 *
 * @param {string} projectId - UUID of project
 * @param {string} sessionId - Current session for comparison (optional)
 * @param {Object} options - Configuration
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @returns {Object} Delta data and helpers
 */
export const useProjectDelta = (projectId, sessionId = null, options = {}) => {
  const { autoFetch = true } = options;

  const [delta, setDelta] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const fetchDelta = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getProjectDelta(projectId, sessionId);

      if (!mountedRef.current) return;

      setDelta(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch project delta:", err);
      setError("Could not load improvement data");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && projectId) {
      fetchDelta();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, projectId, fetchDelta]);

  // Helper functions
  const getBadgeVariant = useCallback(() => {
    return delta?.display?.badge_variant || "secondary";
  }, [delta]);

  const getBadgeColor = useCallback(() => {
    if (!delta?.has_data) return "bg-gray-100 text-gray-800";

    switch (delta.trend) {
      case "up":
        return "bg-green-100 text-green-800 border-green-200";
      case "down":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  }, [delta]);

  const getIcon = useCallback(() => {
    if (!delta?.has_data) return "→";
    return delta.display?.icon || "→";
  }, [delta]);

  // Real-time updates via Socket.IO
  useDataChange(["project", "evaluation"], fetchDelta);

  return {
    // Data
    delta,
    isLoading,
    error,
    fetchDelta,

    // Helpers
    getBadgeVariant,
    getBadgeColor,
    getIcon,

    // Derived
    hasData: delta?.has_data || false,
    trend: delta?.trend || "stable",
    deltaValue: delta?.delta,
    deltaPercentage: delta?.delta_percentage,
    displayText: delta?.display?.text || "No data",

    // Distribution
    improvementDistribution: delta?.improvement_distribution,
  };
};

// ============================================================
// useSessionProjectDeltas — Bulk fetch for evaluation page
// ============================================================
/**
 * Bulk fetch all project deltas for a session.
 * CRITICAL: Prevents N+1 queries on evaluation page!
 *
 * @param {string} sessionId - UUID of session
 * @param {Object} options - Configuration
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @returns {Object} Deltas map and helpers
 */
export const useSessionProjectDeltas = (sessionId, options = {}) => {
  const { autoFetch = true } = options;

  const [deltas, setDeltas] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  const fetchDeltas = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getSessionProjectDeltas(sessionId);

      if (!mountedRef.current) return;

      setDeltas(data);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch session project deltas:", err);
      setError("Could not load project improvements");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && sessionId) {
      fetchDeltas();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, sessionId, fetchDeltas]);

  // Get delta for a specific project
  const getProjectDeltaData = useCallback(
    (projectId) => {
      return deltas[projectId] || null;
    },
    [deltas],
  );

  // Real-time updates via Socket.IO
  useDataChange(["project", "evaluation", "session"], fetchDeltas);

  return {
    deltas,
    isLoading,
    error,
    fetchDeltas,
    getProjectDelta: getProjectDeltaData,
  };
};

// Default export
export default {
  useProjectTrajectory,
  useProjectDelta,
  useSessionProjectDeltas,
};
