// ============================================================
// USE SESSION PROGRESS HOOK
// ============================================================
// SRS §4.1.3: Scarcity-Based Scoring - Visual Progress Tracking
//
// PURPOSE: Calculate and manage session allocation progress with
// color-coded status, accessibility props, and display formatting.
//
// FEATURES:
// - Calculate percentage allocated
// - Determine status color based on allocation
// - Format display text
// - Smooth animation triggers
// - Full accessibility (ARIA) labels
//
// USAGE:
// const progress = useSessionProgress(totalAllocated, maxPool);
// // -> { percentage, status, color, displayText, ariaProps, ... }
//
// FOLLOWS SAME PATTERNS AS:
// - useScarcityLogic.js (memoized calculations)
// - useProjectTrajectory.js (status state management)
// ============================================================

import { useMemo, useRef, useEffect } from "react";

// ============================================================
// CONSTANTS — Progress Status Types
// ============================================================

/**
 * Progress status states for visual feedback.
 * @enum {string}
 */
export const PROGRESS_STATUS = {
  /** 0-99% - In progress, blue color */
  UNDER: "under",
  /** 100% - Complete, green color */
  EXACT: "exact",
  /** >100% - Warning (should be prevented), yellow color */
  OVER: "over",
};

/**
 * Color mappings for each progress status.
 * Uses Tailwind CSS classes and hex values for SVG.
 */
export const STATUS_COLORS = {
  [PROGRESS_STATUS.UNDER]: {
    bg: "bg-blue-600",
    text: "text-blue-700",
    light: "bg-blue-100",
    border: "border-blue-200",
    hex: "#2563EB",
  },
  [PROGRESS_STATUS.EXACT]: {
    bg: "bg-green-600",
    text: "text-green-700",
    light: "bg-green-100",
    border: "border-green-200",
    hex: "#16A34A",
  },
  [PROGRESS_STATUS.OVER]: {
    bg: "bg-yellow-500",
    text: "text-yellow-700",
    light: "bg-yellow-100",
    border: "border-yellow-200",
    hex: "#EAB308",
  },
};

// ============================================================
// useSessionProgress Hook
// ============================================================

/**
 * Calculate and manage session allocation progress state.
 *
 * @param {number} allocated - Current total allocated points
 * @param {number} maxPool - Maximum points available in the pool
 * @param {Object} [options] - Configuration options
 * @param {boolean} [options.trackCompletion=false] - Track when progress just reached 100%
 * @returns {Object} Progress state and helpers
 *
 * @example
 * const progress = useSessionProgress(12.5, 15);
 * // progress.percentage = 83
 * // progress.status = 'under'
 * // progress.isComplete = false
 * // progress.displayText = "12.5 of 15 points (83%)"
 */
export const useSessionProgress = (allocated, maxPool, options = {}) => {
  const { trackCompletion = false } = options;

  // Track previous status for detecting completion transition
  const prevStatusRef = useRef(null);

  const progress = useMemo(() => {
    // Handle edge case: no pool defined
    if (!maxPool || maxPool <= 0) {
      return {
        // Numeric values
        percentage: 0,
        rawPercentage: 0,
        roundedPercentage: 0,
        allocated: 0,
        maxPool: 0,
        remaining: 0,
        overage: 0,

        // Status
        status: PROGRESS_STATUS.UNDER,
        color: STATUS_COLORS[PROGRESS_STATUS.UNDER],
        isComplete: false,
        isOverAllocated: false,
        justCompleted: false,

        // Display text
        displayText: "No allocation pool",
        shortDisplayText: "0%",

        // Accessibility
        ariaLabel: "No points available to allocate",
        ariaProps: {
          role: "progressbar",
          "aria-valuenow": 0,
          "aria-valuemin": 0,
          "aria-valuemax": 0,
          "aria-valuetext": "No points available to allocate",
          "aria-label": "Scarcity pool allocation: No points available",
        },
      };
    }

    // Ensure allocated is a valid number
    const safeAllocated = Number(allocated) || 0;

    // Calculate percentage (cap display at 100, but track actual for status)
    const rawPercentage = (safeAllocated / maxPool) * 100;
    const displayPercentage = Math.min(Math.round(rawPercentage), 100);
    const roundedPercentage = Math.round(rawPercentage * 10) / 10; // One decimal

    // Determine status based on allocation vs pool
    let status = PROGRESS_STATUS.UNDER;
    // Use small epsilon for floating point comparison
    const epsilon = 0.001;
    if (Math.abs(safeAllocated - maxPool) < epsilon) {
      status = PROGRESS_STATUS.EXACT;
    } else if (safeAllocated > maxPool) {
      status = PROGRESS_STATUS.OVER;
    }

    // Calculate remaining/overage
    const remaining = Math.max(maxPool - safeAllocated, 0);
    const overage = Math.max(safeAllocated - maxPool, 0);

    // Generate display text based on status
    let displayText = "";
    let ariaLabel = "";

    switch (status) {
      case PROGRESS_STATUS.EXACT:
        displayText = `All ${maxPool} points allocated! ✓`;
        ariaLabel = `Allocation complete. ${maxPool} of ${maxPool} points allocated.`;
        break;

      case PROGRESS_STATUS.OVER:
        displayText = `⚠ Over allocated by ${overage.toFixed(1)} points`;
        ariaLabel = `Warning: Over allocated by ${overage.toFixed(1)} points. Maximum is ${maxPool}.`;
        break;

      case PROGRESS_STATUS.UNDER:
      default:
        displayText = `${safeAllocated.toFixed(1)} of ${maxPool} points (${displayPercentage}%)`;
        ariaLabel = `${displayPercentage} percent allocated. ${remaining.toFixed(1)} points remaining.`;
        break;
    }

    return {
      // Numeric values
      percentage: displayPercentage,
      rawPercentage,
      roundedPercentage,
      allocated: safeAllocated,
      maxPool,
      remaining,
      overage,

      // Status
      status,
      color: STATUS_COLORS[status],
      isComplete: status === PROGRESS_STATUS.EXACT,
      isOverAllocated: status === PROGRESS_STATUS.OVER,
      justCompleted: false, // Will be set in effect

      // Display text
      displayText,
      shortDisplayText: `${displayPercentage}%`,

      // Accessibility
      ariaLabel,
      ariaProps: {
        role: "progressbar",
        "aria-valuenow": safeAllocated,
        "aria-valuemin": 0,
        "aria-valuemax": maxPool,
        "aria-valuetext": ariaLabel,
        "aria-label": `Scarcity pool allocation: ${ariaLabel}`,
      },
    };
  }, [allocated, maxPool]);

  // Track completion transition for celebration effect
  const justCompleted = useMemo(() => {
    if (!trackCompletion) return false;

    const wasNotComplete = prevStatusRef.current !== PROGRESS_STATUS.EXACT;
    const isNowComplete = progress.status === PROGRESS_STATUS.EXACT;

    return wasNotComplete && isNowComplete;
  }, [progress.status, trackCompletion]);

  // Update previous status ref after render
  useEffect(() => {
    prevStatusRef.current = progress.status;
  }, [progress.status]);

  // ============================================================
  // CSS CLASS HELPERS
  // ============================================================

  /**
   * Get CSS class for progress bar fill.
   */
  const getFillClassName = useMemo(() => {
    const baseClass =
      "h-full rounded-full transition-all duration-300 ease-out";
    return `${baseClass} ${progress.color.bg}`;
  }, [progress.color.bg]);

  /**
   * Get CSS class for background track.
   */
  const getTrackClassName = useMemo(() => {
    return "w-full bg-gray-200 rounded-full overflow-hidden";
  }, []);

  /**
   * Get status badge component props.
   */
  const getStatusBadgeProps = useMemo(() => {
    let label = `${progress.percentage}%`;
    if (progress.isComplete) {
      label = "Complete";
    } else if (progress.isOverAllocated) {
      label = "Over allocated";
    }

    return {
      className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${progress.color.light} ${progress.color.text}`,
      children: label,
    };
  }, [progress]);

  return {
    ...progress,
    justCompleted,
    getFillClassName,
    getTrackClassName,
    getStatusBadgeProps,
  };
};

// ============================================================
// useSessionCompletion Hook
// ============================================================

/**
 * Track multi-judge session completion status.
 * SRS §4.2: Multi-judge session completion tracking for coordinator view.
 *
 * This hook tracks how many evaluators have completed their submissions
 * for a given session - useful for admin/coordinator dashboards.
 *
 * @param {string} sessionId - UUID of the session
 * @param {number} totalEvaluators - Total number of assigned evaluators
 * @param {number} submittedCount - Number of evaluators who have submitted
 * @returns {Object} Completion status
 *
 * @example
 * const completion = useSessionCompletion(sessionId, 5, 3);
 * // completion.completionPercentage = 60
 * // completion.isComplete = false
 * // completion.pendingCount = 2
 */
export const useSessionCompletion = (
  sessionId,
  totalEvaluators,
  submittedCount,
) => {
  const completionPercentage = useMemo(() => {
    if (!totalEvaluators || totalEvaluators <= 0) return 0;
    return Math.round((submittedCount / totalEvaluators) * 100);
  }, [submittedCount, totalEvaluators]);

  const isComplete = useMemo(() => {
    return submittedCount >= totalEvaluators && totalEvaluators > 0;
  }, [submittedCount, totalEvaluators]);

  const displayText = useMemo(() => {
    if (!totalEvaluators) return "No evaluators assigned";
    if (isComplete) return "All evaluators have submitted";
    return `${submittedCount} of ${totalEvaluators} evaluators submitted (${completionPercentage}%)`;
  }, [submittedCount, totalEvaluators, completionPercentage, isComplete]);

  const ariaLabel = useMemo(() => {
    if (!totalEvaluators) return "No evaluators assigned to this session";
    if (isComplete) return "Session complete. All evaluators have submitted.";
    return `Session ${completionPercentage} percent complete. ${totalEvaluators - submittedCount} evaluators pending.`;
  }, [totalEvaluators, completionPercentage, isComplete, submittedCount]);

  return {
    sessionId,
    completionPercentage,
    isComplete,
    displayText,
    ariaLabel,
    submittedCount,
    totalEvaluators,
    pendingCount: Math.max(0, totalEvaluators - submittedCount),
  };
};

// ============================================================
// Export default (main hook)
// ============================================================
export default useSessionProgress;
