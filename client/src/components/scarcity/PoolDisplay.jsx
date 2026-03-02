// ============================================================
// POOL DISPLAY — Visual Pool Usage Indicator
// ============================================================
// Shows the evaluator's current pool usage as a progress bar
// with real-time updates as they adjust allocations.
//
// VISUAL STATES:
//   - Blue (< 100%): In progress — distribute more points
//   - Green (100%): Complete — all points distributed
//   - Yellow/Red (> 100%): Pool exceeded — submission blocked
//
// SRS 4.1.3: "Judge must distribute all or part of the pool"
//            "System shall prevent exceeding total"
//
// ENHANCEMENTS (A-07):
//   - Uses useSessionProgress hook for consistent state
//   - Full ARIA accessibility support
//   - Optional celebration effect at 100%
//   - Circular progress for mobile compact view
// ============================================================

// Import React for JSX rendering
import React, { useState, useEffect, useRef } from "react";

// Import Lucide icons for visual elements
import {
  Gauge, // Pool gauge icon
  AlertTriangle, // Warning icon (over limit)
  CheckCircle, // Success icon (complete)
  Info, // Info icon (in progress)
  PartyPopper, // Celebration icon
} from "lucide-react";

// Import progress hook and circle component
import {
  useSessionProgress,
  PROGRESS_STATUS,
} from "../../hooks/useSessionProgress";
import SessionProgressCircle from "./SessionProgressCircle";

// ============================================================
// PoolDisplay Component
// ============================================================
/**
 * Visual representation of pool usage with progress bar.
 *
 * @param {Object} props - Component props
 * @param {number} props.poolSize - Total pool size
 * @param {number} props.allocatedTotal - Points allocated so far
 * @param {number} props.remainingPool - Points still available
 * @param {number} props.utilization - Utilization percentage (0-100+)
 * @param {boolean} props.isExceeded - Whether pool has been exceeded
 * @param {boolean} [props.showCelebration=true] - Show celebration effect at 100%
 * @param {Function} [props.onComplete] - Callback when allocation reaches 100%
 */
const PoolDisplay = ({
  poolSize,
  allocatedTotal,
  remainingPool,
  utilization,
  isExceeded,
  showCelebration: enableCelebration = true,
  onComplete,
}) => {
  // Use the session progress hook for consistent state and accessibility
  const progress = useSessionProgress(allocatedTotal, poolSize, {
    trackCompletion: enableCelebration,
  });

  // Track celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCompleteRef = useRef(false);

  // Detect completion transition for celebration
  useEffect(() => {
    const wasComplete = prevCompleteRef.current;
    const isNowComplete = progress.isComplete;

    if (!wasComplete && isNowComplete) {
      // Just completed!
      if (enableCelebration) {
        setShowCelebration(true);
        const timeout = setTimeout(() => setShowCelebration(false), 3000);
        return () => clearTimeout(timeout);
      }
      if (onComplete) {
        onComplete();
      }
    }

    prevCompleteRef.current = isNowComplete;
  }, [progress.isComplete, enableCelebration, onComplete]);

  // ----------------------------------------------------------
  // Determine visual state based on progress status
  // ----------------------------------------------------------
  const getColorScheme = () => {
    if (progress.isOverAllocated) {
      // YELLOW/RED — Over the limit, submission blocked
      return {
        bg: "bg-yellow-50",
        border: "border-yellow-200",
        barColor: "bg-yellow-500",
        textColor: "text-yellow-700",
        labelColor: "text-yellow-600",
        icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
        message: `Exceeded by ${progress.overage.toFixed(1)} points`,
      };
    }

    if (progress.isComplete) {
      // GREEN — Exactly allocated, perfect!
      return {
        bg: "bg-green-50",
        border: "border-green-200",
        barColor: "bg-green-500",
        textColor: "text-green-700",
        labelColor: "text-green-600",
        icon: <CheckCircle className="h-5 w-5 text-green-500" />,
        message: "All points distributed! ✓",
      };
    }

    // BLUE — In progress
    return {
      bg: "bg-blue-50",
      border: "border-blue-200",
      barColor: "bg-blue-500",
      textColor: "text-blue-700",
      labelColor: "text-blue-600",
      icon: <Info className="h-5 w-5 text-blue-500" />,
      message: `${progress.remaining.toFixed(1)} points remaining`,
    };
  };

  // Get the current color scheme
  const colors = getColorScheme();

  return (
    // Pool display card
    <div
      className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-4 transition-colors duration-300`}
    >
      {/* Celebration banner - shown at 100% */}
      {showCelebration && (
        <div className="absolute inset-x-0 -top-2 flex justify-center pointer-events-none">
          <div className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium shadow-lg animate-bounce flex items-center gap-1">
            <PartyPopper className="h-3 w-3" />
            Perfect allocation!
          </div>
        </div>
      )}

      {/* Header row — Icon, title, and allocated/total */}
      <div className="flex items-center justify-between mb-3">
        {/* Left: Icon and label */}
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Point Pool
          </span>
        </div>
        {/* Right: Allocated / Total fraction */}
        <span className={`text-sm font-bold ${colors.textColor}`}>
          {progress.allocated.toFixed(1)} / {progress.maxPool}
        </span>
      </div>

      {/* Progress bar — visual representation of pool usage */}
      <div
        className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden"
        {...progress.ariaProps}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${colors.barColor}`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Footer row — Status icon and message */}
      <div className="flex items-center justify-between">
        {/* Left: Status message with icon */}
        <div className="flex items-center gap-1.5">
          {colors.icon}
          <span className={`text-xs font-medium ${colors.labelColor}`}>
            {colors.message}
          </span>
        </div>
        {/* Right: Utilization percentage */}
        <span className="text-xs text-gray-400">
          {progress.percentage}% used
        </span>
      </div>

      {/* Screen reader live region for status changes */}
      <div className="sr-only" role="status" aria-live="polite">
        {progress.ariaLabel}
      </div>

      {/* Mobile-only: Circular progress indicator (hidden on larger screens) */}
      <div className="sm:hidden absolute top-4 right-4">
        <SessionProgressCircle
          allocated={allocatedTotal}
          maxPool={poolSize}
          size={36}
          strokeWidth={3}
          showPercentage={true}
        />
      </div>
    </div>
  );
};

// ============================================================
// Export the PoolDisplay component
// ============================================================
export default PoolDisplay;
