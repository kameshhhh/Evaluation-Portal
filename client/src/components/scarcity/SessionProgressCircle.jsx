// ============================================================
// SESSION PROGRESS CIRCLE COMPONENT
// ============================================================
// SRS §4.1.3: Alternative circular progress visualization
//
// A compact circular progress indicator for mobile views and
// dashboard widgets where horizontal space is constrained.
//
// FEATURES:
// - SVG circular progress ring
// - Color-coded stroke based on allocation status
// - Center percentage display
// - Smooth animation
// - Accessibility support
//
// USE CASES:
// - Mobile compact view
// - Dashboard widgets
// - Table cells
// - Constrained spaces
//
// USAGE:
// <SessionProgressCircle
//   allocated={12.5}
//   maxPool={15}
//   size={48}
//   strokeWidth={4}
// />
// ============================================================

import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useSessionProgress } from "../../hooks/useSessionProgress";

// ============================================================
// SESSION PROGRESS CIRCLE COMPONENT
// ============================================================

/**
 * Circular progress indicator for scarcity pool allocation.
 *
 * @param {Object} props - Component props
 * @param {number} props.allocated - Current total allocated points
 * @param {number} props.maxPool - Maximum points available
 * @param {number} [props.size=40] - Diameter in pixels
 * @param {number} [props.strokeWidth=4] - Stroke width in pixels
 * @param {boolean} [props.animate=true] - Enable smooth animation
 * @param {boolean} [props.showPercentage=true] - Show percentage in center
 * @param {string} [props.className=''] - Additional CSS classes
 */
const SessionProgressCircle = ({
  allocated,
  maxPool,
  size = 40,
  strokeWidth = 4,
  animate = true,
  showPercentage = true,
  className = "",
}) => {
  // Animated percentage for smooth transitions
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  // Use the progress calculation hook
  const progress = useSessionProgress(allocated, maxPool);

  // SVG circle calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (animatedPercentage / 100) * circumference;

  // Animate percentage change
  useEffect(() => {
    if (animate) {
      // Small delay for smoother animation
      const timeout = setTimeout(() => {
        setAnimatedPercentage(progress.percentage);
      }, 50);
      return () => clearTimeout(timeout);
    } else {
      setAnimatedPercentage(progress.percentage);
    }
  }, [progress.percentage, animate]);

  // Calculate font size based on circle size
  const fontSize = Math.max(10, Math.floor(size / 4));

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      role="progressbar"
      aria-valuenow={progress.allocated}
      aria-valuemin={0}
      aria-valuemax={progress.maxPool}
      aria-valuetext={progress.ariaLabel}
      aria-label={`Scarcity pool: ${progress.ariaLabel}`}
    >
      {/* SVG Circle */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />

        {/* Progress fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progress.color.hex}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={animate ? "transition-all duration-300 ease-out" : ""}
        />
      </svg>

      {/* Center percentage */}
      {showPercentage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-semibold ${progress.color.text}`}
            style={{ fontSize: `${fontSize}px` }}
          >
            {progress.percentage}%
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// PROP TYPES
// ============================================================

SessionProgressCircle.propTypes = {
  /** Current total allocated points */
  allocated: PropTypes.number.isRequired,
  /** Maximum points available in pool */
  maxPool: PropTypes.number.isRequired,
  /** Diameter in pixels */
  size: PropTypes.number,
  /** Stroke width in pixels */
  strokeWidth: PropTypes.number,
  /** Enable smooth animation */
  animate: PropTypes.bool,
  /** Show percentage in center */
  showPercentage: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
};

// ============================================================
// EXPORT
// ============================================================

export default SessionProgressCircle;
