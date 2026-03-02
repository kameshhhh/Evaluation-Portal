// ============================================================
// SPARKLINE CHART COMPONENT
// ============================================================
// SRS §6.1: Trajectory Analysis - Visual Performance Trends
//
// Ultra-lightweight SVG sparkline with NO external dependencies
// 5 sizes: xs (40x20), sm (60x30), md (80x40), lg (100x50), xl (120x60)
//
// Features:
// - SVG-based, no canvas, no chart libraries (100% self-contained)
// - Color-coded: green (improving), red (declining), blue (stable)
// - Tooltip on hover with exact scores and dates
// - Click to open detailed history modal
// - Responsive within parent container
// - Loading skeleton
// - Empty state for no data
//
// USAGE:
// <SparklineChart
//   memberId="uuid"
//   size="md"
//   showTooltip={true}
//   onClick={() => openModal()}
// />
// ============================================================

import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useSparkline } from "../../hooks/useSparkline";
import SparklineSkeleton from "./SparklineSkeleton";

// ============================================================
// SPARKLINE CHART COMPONENT
// ============================================================
const SparklineChart = forwardRef(
  (
    {
      memberId,
      projectId = null,
      size = "md",
      limit = 6,
      showTooltip = true,
      onClick,
      className = "",
      ...props
    },
    ref,
  ) => {
    const {
      data,
      isLoading,
      error,
      dimensions,
      getTrendText,
      getColorClass,
      generateSparklinePath,
      generateAreaPath,
      getPointPositions,
      isHovered,
      setIsHovered,
      hasData,
      scores,
      dates,
      color,
    } = useSparkline(memberId, { size, limit, projectId });

    // ----------------------------------------------------------
    // RENDER: Loading State
    // ----------------------------------------------------------
    if (isLoading) {
      return <SparklineSkeleton size={size} className={className} />;
    }

    // ----------------------------------------------------------
    // RENDER: Error State
    // ----------------------------------------------------------
    if (error) {
      return (
        <div
          className={`flex items-center justify-center bg-red-50 rounded border border-red-200 ${className}`}
          style={{ width: dimensions.width, height: dimensions.height }}
          title="Failed to load performance trend"
        >
          <span className="text-xs text-red-500">!</span>
        </div>
      );
    }

    // ----------------------------------------------------------
    // RENDER: No Data State
    // ----------------------------------------------------------
    if (!hasData || scores.length < 2) {
      return (
        <div
          className={`flex items-center justify-center bg-gray-50 rounded border border-gray-200 ${className}`}
          style={{ width: dimensions.width, height: dimensions.height }}
          title="No historical data available"
        >
          <span className="text-xs text-gray-400">—</span>
        </div>
      );
    }

    // ----------------------------------------------------------
    // COMPUTED VALUES
    // ----------------------------------------------------------
    const pathData = generateSparklinePath();
    const areaPath = generateAreaPath();
    const points = getPointPositions();
    const viewBox = `0 0 ${dimensions.width} ${dimensions.height}`;

    // Trend icon component
    const TrendIcon = () => {
      const iconClass = "h-3 w-3";
      switch (data.trend) {
        case "up":
          return <TrendingUp className={`${iconClass} text-green-600`} />;
        case "down":
          return <TrendingDown className={`${iconClass} text-red-600`} />;
        default:
          return <Minus className={`${iconClass} text-blue-600`} />;
      }
    };

    // ----------------------------------------------------------
    // RENDER: Sparkline Chart
    // ----------------------------------------------------------
    return (
      <div
        ref={ref}
        className={`relative inline-flex items-center cursor-pointer ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onClick?.();
          }
        }}
        aria-label={`Performance trend: ${getTrendText()}`}
        {...props}
      >
        {/* SVG Sparkline */}
        <svg
          width={dimensions.width}
          height={dimensions.height}
          viewBox={viewBox}
          className={`transition-opacity ${isHovered ? "opacity-100" : "opacity-90"}`}
          style={{ overflow: "visible" }}
        >
          {/* Background area (subtle fill) */}
          {areaPath && <path d={areaPath} fill={color} fillOpacity="0.1" />}

          {/* Main line */}
          {pathData && (
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={dimensions.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={isHovered ? dimensions.dotRadius + 0.5 : dimensions.dotRadius}
              fill="white"
              stroke={color}
              strokeWidth={dimensions.strokeWidth}
              style={{ transition: "r 0.1s ease" }}
            />
          ))}

          {/* Latest point highlight (larger, filled) */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={dimensions.dotRadius + 1}
              fill={color}
              stroke="white"
              strokeWidth="1.5"
            />
          )}
        </svg>

        {/* Hover Tooltip */}
        {showTooltip && isHovered && data && (
          <div
            className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50"
            style={{ minWidth: "140px" }}
          >
            {/* Trend header */}
            <div className="flex items-center space-x-2 mb-1">
              <TrendIcon />
              <span
                className={`font-medium ${
                  data.trend === "up"
                    ? "text-green-400"
                    : data.trend === "down"
                      ? "text-red-400"
                      : "text-blue-400"
                }`}
              >
                {data.trend === "up"
                  ? "Improving"
                  : data.trend === "down"
                    ? "Declining"
                    : "Stable"}
              </span>
              <span className="text-gray-400">
                Δ {data.delta > 0 ? "+" : ""}
                {data.delta}
              </span>
            </div>

            {/* Score details */}
            <div className="flex justify-between text-gray-300">
              <span>Latest: {scores[scores.length - 1]}</span>
              <span className="mx-2">•</span>
              <span>{dates[dates.length - 1]}</span>
            </div>

            {/* Hint text */}
            <div className="text-gray-500 text-[10px] mt-1">
              Click for full history
            </div>

            {/* Tooltip arrow */}
            <div
              className="absolute top-full left-1/2 transform -translate-x-1/2"
              style={{
                borderWidth: "4px",
                borderStyle: "solid",
                borderColor: "#1F2937 transparent transparent transparent",
              }}
            />
          </div>
        )}

        {/* Compact trend indicator for xs size */}
        {size === "xs" && (
          <div className={`ml-1 ${getColorClass()}`}>
            <TrendIcon />
          </div>
        )}
      </div>
    );
  },
);

SparklineChart.displayName = "SparklineChart";

SparklineChart.propTypes = {
  /** UUID of the student */
  memberId: PropTypes.string.isRequired,
  /** Optional project UUID for project-specific sparkline */
  projectId: PropTypes.string,
  /** Size variant: xs, sm, md, lg, xl */
  size: PropTypes.oneOf(["xs", "sm", "md", "lg", "xl"]),
  /** Number of data points to display */
  limit: PropTypes.number,
  /** Show tooltip on hover */
  showTooltip: PropTypes.bool,
  /** Click handler (typically opens history modal) */
  onClick: PropTypes.func,
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default SparklineChart;
