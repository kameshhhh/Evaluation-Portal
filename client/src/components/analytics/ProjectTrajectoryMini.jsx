// ============================================================
// PROJECT TRAJECTORY MINI CHART
// ============================================================
// SRS §6.1: Team performance trajectory visualization
//
// 100x40px sparkline showing team average scores over time
// Used in project headers and analytics cards
//
// Features:
// - Pure SVG-based, no external dependencies
// - Shows 3-6 months of team performance
// - Color-coded based on trend
// - Hover tooltip with monthly breakdown
//
// USAGE:
// <ProjectTrajectoryMini
//   projectId="uuid"
//   width={100}
//   height={40}
// />
// ============================================================

import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useProjectTrajectory } from "../../hooks/useProjectTrajectory";

// ============================================================
// PROJECT TRAJECTORY MINI COMPONENT
// ============================================================
const ProjectTrajectoryMini = ({
  projectId,
  width = 100,
  height = 40,
  showTrendIndicator = true,
  className = "",
}) => {
  const [tooltipData, setTooltipData] = useState(null);

  const {
    trajectory,
    isLoading,
    hasData,
    summary,
    generateSparklinePath,
    getPointPositions,
  } = useProjectTrajectory(projectId, { limit: 6 });

  // Get chart color based on trend
  const getChartColor = useCallback(() => {
    if (summary?.overall_trend === "up") return "#10B981"; // green
    if (summary?.overall_trend === "down") return "#EF4444"; // red
    return "#3B82F6"; // blue
  }, [summary]);

  // Handle mouse move for tooltip
  const handleMouseMove = useCallback(
    (e) => {
      if (!trajectory?.trajectory?.length) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const positions = getPointPositions(width, height);

      // Find closest point
      let closestIndex = 0;
      let closestDistance = Infinity;

      positions.forEach((pos, index) => {
        const distance = Math.abs(x - pos.x);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setTooltipData(positions[closestIndex]);
    },
    [trajectory, getPointPositions, width, height],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipData(null);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{ width, height }}
        className={`bg-gray-100 rounded animate-pulse ${className}`}
      />
    );
  }

  // No data state
  if (!hasData || !trajectory?.trajectory?.length) {
    return (
      <div
        style={{ width, height }}
        className={`flex items-center justify-center bg-gray-50 rounded border border-gray-200 ${className}`}
      >
        <span className="text-xs text-gray-400">No team history</span>
      </div>
    );
  }

  const chartColor = getChartColor();
  const pathData = generateSparklinePath(width, height);
  const points = getPointPositions(width, height);

  // Generate fill path (area under curve)
  const fillPath = pathData
    ? `${pathData} L ${width},${height} L 0,${height} Z`
    : null;

  return (
    <div
      className={`relative ${className}`}
      style={{ width, height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* SVG Chart */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="cursor-pointer"
        aria-label={`Team trajectory chart showing ${summary?.overall_trend} trend`}
      >
        {/* Background area fill */}
        {fillPath && <path d={fillPath} fill={chartColor} fillOpacity="0.1" />}

        {/* Main line */}
        {pathData && (
          <path
            d={pathData}
            fill="none"
            stroke={chartColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {points.map((point, index) => {
          const isHovered =
            tooltipData && Math.abs(point.x - tooltipData.x) < 1;
          const isLast = index === points.length - 1;

          return (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={isHovered ? 3.5 : isLast ? 3 : 2}
              fill={isLast ? chartColor : "white"}
              stroke={chartColor}
              strokeWidth={isLast ? 1.5 : 2}
              style={{ transition: "r 0.1s ease" }}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="absolute z-20 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: Math.min(tooltipData.x + 10, width - 100),
            top: Math.max(tooltipData.y - 45, -30),
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">{tooltipData.month}</span>
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-white"
              style={{
                backgroundColor: chartColor,
                fontSize: "10px",
              }}
            >
              {tooltipData.score?.toFixed(1)}
            </span>
          </div>
          <div className="text-gray-300" style={{ fontSize: "10px" }}>
            {tooltipData.session}
          </div>
          {/* Arrow pointer */}
          <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}

      {/* Trend indicator overlay */}
      {showTrendIndicator && summary && (
        <div
          className="absolute bottom-0 right-0 flex items-center space-x-0.5 px-1 bg-white bg-opacity-90 rounded"
          style={{ color: chartColor, fontSize: "10px" }}
        >
          {summary.overall_trend === "up" && <TrendingUp className="h-3 w-3" />}
          {summary.overall_trend === "down" && (
            <TrendingDown className="h-3 w-3" />
          )}
          {summary.overall_trend === "stable" && <Minus className="h-3 w-3" />}
          <span className="font-medium">
            {summary.overall_delta > 0 ? "+" : ""}
            {summary.overall_delta?.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
};

ProjectTrajectoryMini.propTypes = {
  projectId: PropTypes.string.isRequired,
  width: PropTypes.number,
  height: PropTypes.number,
  showTrendIndicator: PropTypes.bool,
  className: PropTypes.string,
};

export default ProjectTrajectoryMini;
