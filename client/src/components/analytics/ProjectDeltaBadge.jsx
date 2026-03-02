// ============================================================
// PROJECT DELTA BADGE
// ============================================================
// SRS §4.1.2: Month-over-month team improvement indicator
//
// Displays:
// - Team improvement percentage (▲ +12%)
// - Color-coded: green (improving), red (declining), blue (stable)
// - Hover tooltip with detailed distribution
// - Click to expand improvement breakdown
//
// SIZES:
// - sm: 60px - For project cards
// - md: 80px - Default
// - lg: 100px - For headers
//
// USAGE:
// <ProjectDeltaBadge
//   projectId="uuid"
//   sessionId="uuid"
//   size="sm"
//   onClick={() => showDetails()}
// />
//
// Or with pre-fetched data from bulk endpoint:
// <ProjectDeltaBadge
//   deltaData={preLoadedDelta}
//   size="sm"
// />
// ============================================================

import React, { useState } from "react";
import PropTypes from "prop-types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useProjectDelta } from "../../hooks/useProjectTrajectory";

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================
const SIZE_CLASSES = {
  sm: {
    container: "px-2 py-0.5 text-xs",
    icon: "h-3 w-3",
    text: "text-xs",
  },
  md: {
    container: "px-2.5 py-1 text-sm",
    icon: "h-3.5 w-3.5",
    text: "text-sm",
  },
  lg: {
    container: "px-3 py-1.5 text-base",
    icon: "h-4 w-4",
    text: "text-base",
  },
};

// ============================================================
// PROJECT DELTA BADGE COMPONENT
// ============================================================
/**
 * @param {Object} props
 * @param {string} props.projectId - UUID of project (for auto-fetching)
 * @param {string} props.sessionId - Current session for comparison
 * @param {Object} props.deltaData - Pre-fetched delta data (skips API call)
 * @param {string} props.size - 'sm', 'md', 'lg' (default: 'md')
 * @param {boolean} props.showIcon - Show trend icon (default: true)
 * @param {boolean} props.showPercentage - Show percentage (default: true)
 * @param {Function} props.onClick - Click handler
 */
const ProjectDeltaBadge = ({
  projectId,
  sessionId,
  deltaData: preloadedDelta,
  size = "md",
  showIcon = true,
  showPercentage = true,
  onClick,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Use pre-loaded data if available, otherwise fetch
  const shouldFetch = !preloadedDelta && projectId;

  const {
    delta: fetchedDelta,
    isLoading: isFetching,
    error: fetchError,
    hasData: fetchHasData,
    getBadgeColor: getFetchedBadgeColor,
  } = useProjectDelta(projectId, sessionId, { autoFetch: shouldFetch });

  // Use preloaded data or fetched data
  const delta = preloadedDelta || fetchedDelta;
  const isLoading = !preloadedDelta && isFetching;
  const error = !preloadedDelta && fetchError;
  const hasData = preloadedDelta?.has_data ?? fetchHasData;

  const selectedSize = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const improvementDistribution = delta?.improvement_distribution;

  // Get badge color based on trend
  const getBadgeColor = () => {
    if (!hasData) return "bg-gray-100 text-gray-600 border-gray-200";

    switch (delta?.trend) {
      case "up":
        return "bg-green-100 text-green-800 border-green-200";
      case "down":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-blue-100 text-blue-800 border-blue-200";
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`${selectedSize.container} bg-gray-100 rounded-full animate-pulse inline-flex items-center`}
      >
        <span className="opacity-0">Loading</span>
      </div>
    );
  }

  // Error or no data state
  if (error || !hasData) {
    return (
      <div
        className={`inline-flex items-center ${selectedSize.container} bg-gray-100 text-gray-600 rounded-full border border-gray-200`}
        title="No historical data available"
      >
        <Minus className={`${selectedSize.icon} mr-1`} />
        <span className={selectedSize.text}>No history</span>
      </div>
    );
  }

  // Determine icon component
  const IconComponent = () => {
    if (!showIcon) return null;

    switch (delta?.trend) {
      case "up":
        return <TrendingUp className={`${selectedSize.icon} mr-1`} />;
      case "down":
        return <TrendingDown className={`${selectedSize.icon} mr-1`} />;
      default:
        return <Minus className={`${selectedSize.icon} mr-1`} />;
    }
  };

  // Format display text
  const getDisplayText = () => {
    if (delta?.delta === 0 || delta?.delta === null) return "No change";

    const sign = delta.delta > 0 ? "+" : "";
    const deltaValue = Math.abs(delta.delta).toFixed(1);

    if (showPercentage && delta.delta_percentage !== null) {
      return `${sign}${deltaValue} (${sign}${delta.delta_percentage}%)`;
    }

    return `${sign}${deltaValue}`;
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Main Badge */}
      <button
        type="button"
        className={`inline-flex items-center ${selectedSize.container} ${getBadgeColor()} rounded-full border cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        onClick={onClick}
        aria-label={`Team improvement: ${getDisplayText()}`}
      >
        <IconComponent />
        <span className={`font-medium ${selectedSize.text}`}>
          {getDisplayText()}
        </span>
      </button>

      {/* Tooltip with Improvement Distribution */}
      {showTooltip && improvementDistribution && (
        <div className="absolute z-20 bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-4 py-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
          <div className="font-medium mb-2">Team Improvement</div>

          {/* Distribution breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Improved:</span>
              <span className="font-medium text-green-400 ml-4">
                {improvementDistribution.improved} members
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Declined:</span>
              <span className="font-medium text-red-400 ml-4">
                {improvementDistribution.declined} members
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Unchanged:</span>
              <span className="font-medium text-blue-400 ml-4">
                {improvementDistribution.unchanged} members
              </span>
            </div>
            {improvementDistribution.no_comparison > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-300">No history:</span>
                <span className="font-medium text-gray-400 ml-4">
                  {improvementDistribution.no_comparison} members
                </span>
              </div>
            )}
          </div>

          {/* Improvement rate */}
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Improvement rate:</span>
              <span className="font-bold text-green-400">
                {improvementDistribution.improvement_rate}%
              </span>
            </div>
          </div>

          {/* Arrow pointer */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

ProjectDeltaBadge.propTypes = {
  projectId: PropTypes.string,
  sessionId: PropTypes.string,
  deltaData: PropTypes.shape({
    has_data: PropTypes.bool,
    delta: PropTypes.number,
    delta_percentage: PropTypes.number,
    trend: PropTypes.string,
    display: PropTypes.shape({
      text: PropTypes.string,
      color: PropTypes.string,
      icon: PropTypes.string,
      badge_variant: PropTypes.string,
    }),
    improvement_distribution: PropTypes.shape({
      improved: PropTypes.number,
      declined: PropTypes.number,
      unchanged: PropTypes.number,
      no_comparison: PropTypes.number,
      improvement_rate: PropTypes.number,
    }),
  }),
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  showIcon: PropTypes.bool,
  showPercentage: PropTypes.bool,
  onClick: PropTypes.func,
};

export default ProjectDeltaBadge;
