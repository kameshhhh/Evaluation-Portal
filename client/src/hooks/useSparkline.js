// ============================================================
// useSparkline Hook
// ============================================================
// SRS §6.1: Trajectory Analysis - Visual Performance Trends
//
// PURPOSE: Fetch and manage sparkline data for UI visualization
// OPTIMIZED FOR: Fast rendering, minimal re-renders
//
// Features:
// - Automatic data fetching
// - Multiple size variants (xs, sm, md, lg, xl)
// - Color coding based on trend
// - Loading and error states
// - Click handler for detailed view
// - Bulk fetching for dashboards (prevents N+1)
//
// USAGE:
// const {
//   data,
//   isLoading,
//   error,
//   dimensions,
//   fetchSparkline,
//   generateSparklinePath,
//   hasData,
//   trend,
//   delta,
//   color
// } = useSparkline(memberId, { size: 'md', limit: 6 });
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getMemberSparkline,
  getMemberProjectSparkline,
  getBulkSparklines,
} from "../services/sparklineApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================
// Canvas dimensions for each sparkline size
const SPARKLINE_SIZES = {
  xs: { width: 40, height: 20, strokeWidth: 1.5, dotRadius: 1.5 },
  sm: { width: 60, height: 30, strokeWidth: 1.5, dotRadius: 2 },
  md: { width: 80, height: 40, strokeWidth: 2, dotRadius: 2.5 },
  lg: { width: 100, height: 50, strokeWidth: 2, dotRadius: 3 },
  xl: { width: 120, height: 60, strokeWidth: 2.5, dotRadius: 3.5 },
};

// ============================================================
// useSparkline — Main hook for sparkline data
// ============================================================
/**
 * Hook for managing sparkline data for a single member.
 *
 * @param {string} memberId - UUID of student
 * @param {Object} options - Configuration
 * @param {string} options.size - 'xs', 'sm', 'md', 'lg', 'xl' (default: 'md')
 * @param {number} options.limit - Data points (default: 6)
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @param {string} options.projectId - Optional project ID for project-specific sparkline
 * @returns {Object} Sparkline data and helper functions
 */
export const useSparkline = (memberId, options = {}) => {
  const {
    size = "md",
    limit = 6,
    autoFetch = true,
    projectId = null,
  } = options;

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  // Ref for mounted state
  const mountedRef = useRef(true);

  // ----------------------------------------------------------
  // DIMENSIONS — Get canvas dimensions for current size
  // ----------------------------------------------------------
  const dimensions = useMemo(
    () => SPARKLINE_SIZES[size] || SPARKLINE_SIZES.md,
    [size],
  );

  // ----------------------------------------------------------
  // FETCH SPARKLINE — Load data from backend
  // ----------------------------------------------------------
  const fetchSparkline = useCallback(async () => {
    if (!memberId) return;

    setIsLoading(true);
    setError(null);

    try {
      let sparklineData;

      if (projectId) {
        // Project-specific sparkline
        sparklineData = await getMemberProjectSparkline(
          memberId,
          projectId,
          limit,
        );
      } else {
        // General sparkline across all sessions
        sparklineData = await getMemberSparkline(memberId, limit);
      }

      if (!mountedRef.current) return;

      setData(sparklineData);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch sparkline:", err);
      setError("Could not load performance trend");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [memberId, projectId, limit]);

  // ----------------------------------------------------------
  // AUTO-FETCH — Fetch on mount if enabled
  // ----------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && memberId) {
      fetchSparkline();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, memberId, fetchSparkline]);

  // ----------------------------------------------------------
  // TREND HELPERS — UI-friendly trend information
  // ----------------------------------------------------------
  const getTrendIcon = useCallback(() => {
    if (!data?.has_data) return null;

    switch (data.trend) {
      case "up":
        return "↑";
      case "down":
        return "↓";
      default:
        return "→";
    }
  }, [data]);

  const getTrendText = useCallback(() => {
    if (!data?.has_data) return "No history";
    if (!data.delta) return "Stable";

    const direction = data.delta > 0 ? "improved" : "declined";
    return `${direction} by ${Math.abs(data.delta)} pts`;
  }, [data]);

  const getColorClass = useCallback(() => {
    if (!data?.has_data) return "text-gray-400";

    switch (data.trend) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-blue-600";
    }
  }, [data]);

  // ----------------------------------------------------------
  // SVG PATH GENERATION — Create sparkline path string
  // ----------------------------------------------------------
  const generateSparklinePath = useCallback(() => {
    if (!data?.has_data || !data.scores || data.scores.length < 2) {
      return null;
    }

    const { width, height } = dimensions;
    const scores = data.scores;
    const minScore = data.min_score;
    const maxScore = data.max_score;
    const range = maxScore - minScore || 1;

    // Padding to prevent clipping at edges
    const padding = 4;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    // Scale scores to fit canvas
    const points = scores.map((score, index) => {
      const x = padding + (index / (scores.length - 1)) * drawWidth;
      const y =
        padding + drawHeight - ((score - minScore) / range) * drawHeight;
      return { x, y };
    });

    // Generate SVG path
    const pathParts = points.map((point, index) => {
      return index === 0
        ? `M ${point.x},${point.y}`
        : `L ${point.x},${point.y}`;
    });

    return pathParts.join(" ");
  }, [data, dimensions]);

  // ----------------------------------------------------------
  // GENERATE AREA PATH — For filled area under line
  // ----------------------------------------------------------
  const generateAreaPath = useCallback(() => {
    const linePath = generateSparklinePath();
    if (!linePath) return null;

    const { width, height } = dimensions;
    const padding = 4;
    const drawWidth = width - padding * 2;

    // Close the path to create area
    return `${linePath} L ${padding + drawWidth},${height - padding} L ${padding},${height - padding} Z`;
  }, [generateSparklinePath, dimensions]);

  // ----------------------------------------------------------
  // GET POINT POSITIONS — For rendering dots
  // ----------------------------------------------------------
  const getPointPositions = useCallback(() => {
    if (!data?.has_data || !data.scores || data.scores.length < 2) {
      return [];
    }

    const { width, height } = dimensions;
    const scores = data.scores;
    const minScore = data.min_score;
    const maxScore = data.max_score;
    const range = maxScore - minScore || 1;

    const padding = 4;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    return scores.map((score, index) => ({
      x: padding + (index / (scores.length - 1)) * drawWidth,
      y: padding + drawHeight - ((score - minScore) / range) * drawHeight,
      score,
      date: data.dates?.[index] || "",
      isLast: index === scores.length - 1,
    }));
  }, [data, dimensions]);

  // ----------------------------------------------------------
  // REAL-TIME UPDATES via Socket.IO
  // ----------------------------------------------------------
  useDataChange(["evaluation", "session", "project"], fetchSparkline);

  // ----------------------------------------------------------
  // RETURN VALUES
  // ----------------------------------------------------------
  return {
    // Data
    data,
    isLoading,
    error,
    dimensions,

    // Actions
    fetchSparkline,

    // UI helpers
    getTrendIcon,
    getTrendText,
    getColorClass,
    generateSparklinePath,
    generateAreaPath,
    getPointPositions,

    // Interaction states
    isHovered,
    setIsHovered,

    // Derived values
    hasData: data?.has_data || false,
    trend: data?.trend || "stable",
    delta: data?.delta || 0,
    color: data?.color || "#94A3B8",
    scores: data?.scores || [],
    dates: data?.dates || [],
    minScore: data?.min_score || 0,
    maxScore: data?.max_score || 0,
    avgScore: data?.avg_score || 0,
  };
};

// ============================================================
// useBulkSparklines — Fetch multiple sparklines at once
// ============================================================
/**
 * Hook for fetching multiple sparklines in one request.
 * CRITICAL: Use this for dashboards to prevent N+1 queries!
 *
 * @param {Array<string>} memberIds - Array of member UUIDs
 * @param {Object} options - Configuration
 * @param {number} options.limit - Data points per sparkline (default: 6)
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @returns {Object} Map of sparklines and helper functions
 */
export const useBulkSparklines = (memberIds, options = {}) => {
  const { limit = 6, autoFetch = true } = options;

  const [sparklines, setSparklines] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  // Stable reference for memberIds
  const memberIdsRef = useRef(memberIds);
  memberIdsRef.current = memberIds;

  // ----------------------------------------------------------
  // FETCH BULK SPARKLINES
  // ----------------------------------------------------------
  const fetchBulkSparklines = useCallback(async () => {
    const ids = memberIdsRef.current;
    if (!ids || ids.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getBulkSparklines(ids, limit);

      if (!mountedRef.current) return;

      setSparklines(data || {});
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to fetch bulk sparklines:", err);
      setError("Could not load performance trends");
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [limit]);

  // ----------------------------------------------------------
  // AUTO-FETCH — Fetch on mount if enabled
  // ----------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && memberIds?.length > 0) {
      fetchBulkSparklines();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, memberIds?.length, fetchBulkSparklines]);

  // ----------------------------------------------------------
  // GET SPARKLINE — Get sparkline for specific member
  // ----------------------------------------------------------
  const getSparkline = useCallback(
    (memberId) => {
      return sparklines[memberId] || null;
    },
    [sparklines],
  );

  // ----------------------------------------------------------
  // HAS SPARKLINE — Check if member has sparkline data
  // ----------------------------------------------------------
  const hasSparkline = useCallback(
    (memberId) => {
      return !!sparklines[memberId]?.has_data;
    },
    [sparklines],
  );

  // Real-time updates via Socket.IO
  useDataChange(["evaluation", "session", "project"], fetchBulkSparklines);

  return {
    sparklines,
    isLoading,
    error,
    fetchBulkSparklines,
    getSparkline,
    hasSparkline,
    count: Object.keys(sparklines).length,
  };
};

// ============================================================
// EXPORTS
// ============================================================
export default useSparkline;
