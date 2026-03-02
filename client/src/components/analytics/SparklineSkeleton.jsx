// ============================================================
// SPARKLINE SKELETON LOADER
// ============================================================
// SRS §6.1: Loading state for sparkline charts
//
// Animated placeholder while data is loading
// Matches dimensions of actual sparkline for smooth transitions
//
// USAGE:
// <SparklineSkeleton size="md" />
// ============================================================

import React from "react";
import PropTypes from "prop-types";

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================
const SKELETON_SIZES = {
  xs: { width: 40, height: 20 },
  sm: { width: 60, height: 30 },
  md: { width: 80, height: 40 },
  lg: { width: 100, height: 50 },
  xl: { width: 120, height: 60 },
};

// ============================================================
// SPARKLINE SKELETON COMPONENT
// ============================================================
const SparklineSkeleton = ({ size = "md", className = "" }) => {
  const dimensions = SKELETON_SIZES[size] || SKELETON_SIZES.md;
  const { width, height } = dimensions;

  // Generate a fake wavy line for visual effect
  const generateWavyPath = () => {
    const points = [];
    const numPoints = 5;
    const padding = 4;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    for (let i = 0; i < numPoints; i++) {
      const x = padding + (i / (numPoints - 1)) * drawWidth;
      // Gentle wave pattern
      const y = padding + drawHeight / 2 + Math.sin(i * 0.8) * (drawHeight / 4);
      points.push(i === 0 ? `M ${x},${y}` : `L ${x},${y}`);
    }

    // Test test test test test test 
// for(let j=0;j<numPoints;j++) {
//   const x = padding+(j/(numPoints-1))* drawWidth;
//   // Gentle wave pattern
//   const y = padd

// }


    return points.join(" ");
  };

  return (
    <div
      className={`relative overflow-hidden rounded ${className}`}
      style={{ width, height }}
    >
      {/* Animated background */}
      <div className="absolute inset-0 bg-gray-100 animate-pulse" />

      {/* SVG with skeleton line */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0"
      >
        {/* Skeleton line path */}
        <path
          d={generateWavyPath()}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Shimmer overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
          animation: "shimmer 1.5s infinite",
          transform: "translateX(-100%)",
        }}
      />

      {/* Inline styles for animation */}
      <style>
        {`
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }
        `}
      </style>
    </div>
  );
};

SparklineSkeleton.propTypes = {
  /** Size variant: xs, sm, md, lg, xl */
  size: PropTypes.oneOf(["xs", "sm", "md", "lg", "xl"]),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default SparklineSkeleton;
