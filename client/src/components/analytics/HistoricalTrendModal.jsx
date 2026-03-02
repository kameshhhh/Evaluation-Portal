// ============================================================
// HISTORICAL TREND MODAL — SRS §6.1 Full Trajectory View
// ============================================================
// Full-screen modal showing detailed historical performance data
// Opened when clicking on a SparklineChart component.
//
// FEATURES:
//   - Large sparkline visualization
//   - Session-by-session score breakdown
//   - Trend analysis and statistics
//   - Delta indicators for each period
//
// USAGE:
// <HistoricalTrendModal
//   isOpen={isOpen}
//   onClose={() => setIsOpen(false)}
//   memberId="uuid"
//   memberName="John Doe"
// />
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from "react";
import PropTypes from "prop-types";
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from "lucide-react";
import { useSparkline } from "../../hooks/useSparkline";

// ============================================================
// HISTORICAL TREND MODAL COMPONENT
// ============================================================
const HistoricalTrendModal = ({
  isOpen,
  onClose,
  memberId,
  projectId = null,
  memberName = "Member",
  projectTitle = null,
}) => {
  const modalRef = useRef(null);

  // Fetch sparkline data with more data points for detailed view
  const {
    data,
    isLoading,
    error,
    hasData,
    scores,
    dates,
    trend,
    delta,
    color,
    minScore,
    maxScore,
    avgScore,
  } = useSparkline(memberId, { projectId, limit: 12, autoFetch: isOpen });

  // ----------------------------------------------------------
  // KEYBOARD AND BACKDROP HANDLERS
  // ----------------------------------------------------------
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  // ----------------------------------------------------------
  // COMPUTED VALUES
  // ----------------------------------------------------------
  const trendLabel = useMemo(() => {
    switch (trend) {
      case "up":
        return {
          text: "Improving",
          Icon: TrendingUp,
          colorClass: "text-green-600",
        };
      case "down":
        return {
          text: "Declining",
          Icon: TrendingDown,
          colorClass: "text-red-600",
        };
      default:
        return { text: "Stable", Icon: Minus, colorClass: "text-blue-600" };
    }
  }, [trend]);

  // Calculate session-by-session deltas
  const sessionDeltas = useMemo(() => {
    if (!scores || scores.length < 2) return [];

    return scores.slice(1).map((score, index) => {
      const prevScore = scores[index];
      const delta = parseFloat((score - prevScore).toFixed(1));
      return {
        from: dates[index],
        to: dates[index + 1],
        prevScore,
        currentScore: score,
        delta,
        isPositive: delta > 0,
        isNegative: delta < 0,
      };
    });
  }, [scores, dates]);

  // Generate larger SVG path
  const generateLargePath = () => {
    if (!hasData || scores.length < 2) return null;

    const width = 500;
    const height = 200;
    const padding = 30;
    const range = maxScore - minScore || 1;

    const points = scores.map((score, index) => {
      const x = padding + (index / (scores.length - 1)) * (width - padding * 2);
      const y =
        padding +
        (height - padding * 2) -
        ((score - minScore) / range) * (height - padding * 2);
      return { x, y, score, date: dates[index] };
    });

    const pathParts = points.map((point, index) =>
      index === 0 ? `M ${point.x},${point.y}` : `L ${point.x},${point.y}`,
    );

    return { path: pathParts.join(" "), points, width, height };
  };

  const chartData = generateLargePath();

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* ====================================================== */}
        {/* HEADER */}
        {/* ====================================================== */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Activity className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Performance Trajectory
              </h2>
              <p className="text-sm text-gray-500">
                {memberName}
                {projectTitle && ` • ${projectTitle}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* ====================================================== */}
        {/* CONTENT */}
        {/* ====================================================== */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" />
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* No Data State */}
          {!isLoading && !error && !hasData && (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-gray-900 font-medium mb-1">
                No History Available
              </h3>
              <p className="text-gray-500 text-sm">
                This member hasn't been evaluated in any completed sessions yet.
              </p>
            </div>
          )}

          {/* Sparkline Data */}
          {!isLoading && !error && hasData && (
            <>
              {/* Trend Summary Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Current Trend */}
                <div
                  className={`p-4 rounded-xl ${
                    trend === "up"
                      ? "bg-green-50"
                      : trend === "down"
                        ? "bg-red-50"
                        : "bg-blue-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <trendLabel.Icon
                      className={`h-4 w-4 ${trendLabel.colorClass}`}
                    />
                    <span
                      className={`text-sm font-medium ${trendLabel.colorClass}`}
                    >
                      {trendLabel.text}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </div>
                  <div className="text-xs text-gray-500">Overall Change</div>
                </div>

                {/* Average Score */}
                <div className="p-4 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-600">
                      Average
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {avgScore.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Mean Score</div>
                </div>

                {/* Sessions Count */}
                <div className="p-4 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-600">
                      Sessions
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {scores.length}
                  </div>
                  <div className="text-xs text-gray-500">Evaluations</div>
                </div>
              </div>

              {/* Large Sparkline Chart */}
              {chartData && (
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">
                    Score Trajectory
                  </h3>
                  <svg
                    viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                    className="w-full"
                    style={{ height: "200px" }}
                  >
                    {/* Grid lines */}
                    {[0.25, 0.5, 0.75].map((pct) => (
                      <line
                        key={pct}
                        x1="30"
                        y1={30 + pct * 140}
                        x2="470"
                        y2={30 + pct * 140}
                        stroke="#E5E7EB"
                        strokeDasharray="4,4"
                      />
                    ))}

                    {/* Area fill */}
                    <path
                      d={`${chartData.path} L ${chartData.points[chartData.points.length - 1].x},${chartData.height - 30} L 30,${chartData.height - 30} Z`}
                      fill={color}
                      fillOpacity="0.1"
                    />

                    {/* Main line */}
                    <path
                      d={chartData.path}
                      fill="none"
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Data points */}
                    {chartData.points.map((point, index) => (
                      <g key={index}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="6"
                          fill="white"
                          stroke={color}
                          strokeWidth="2"
                        />
                        {/* Score label */}
                        <text
                          x={point.x}
                          y={point.y - 12}
                          textAnchor="middle"
                          className="text-xs fill-gray-600 font-medium"
                        >
                          {point.score}
                        </text>
                        {/* Date label */}
                        <text
                          x={point.x}
                          y={chartData.height - 10}
                          textAnchor="middle"
                          className="text-xs fill-gray-400"
                        >
                          {point.date}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}

              {/* Session-by-Session Changes */}
              {sessionDeltas.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Period-over-Period Changes
                  </h3>
                  <div className="space-y-2">
                    {sessionDeltas.map((session, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            {session.from} → {session.to}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {session.prevScore} → {session.currentScore}
                          </span>
                          <span
                            className={`flex items-center text-sm font-medium ${
                              session.isPositive
                                ? "text-green-600"
                                : session.isNegative
                                  ? "text-red-600"
                                  : "text-gray-500"
                            }`}
                          >
                            {session.isPositive ? (
                              <ArrowUpRight className="h-4 w-4 mr-0.5" />
                            ) : session.isNegative ? (
                              <ArrowDownRight className="h-4 w-4 mr-0.5" />
                            ) : null}
                            {session.delta > 0 ? "+" : ""}
                            {session.delta}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ====================================================== */}
        {/* FOOTER */}
        {/* ====================================================== */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Historical data is based on completed evaluation sessions. Scores
            reflect credibility-weighted averages.
          </p>
        </div>
      </div>
    </div>
  );
};

HistoricalTrendModal.propTypes = {
  /** Modal open state */
  isOpen: PropTypes.bool.isRequired,
  /** Close handler */
  onClose: PropTypes.func.isRequired,
  /** Member UUID */
  memberId: PropTypes.string.isRequired,
  /** Optional project UUID for project-specific history */
  projectId: PropTypes.string,
  /** Member display name */
  memberName: PropTypes.string,
  /** Project title */
  projectTitle: PropTypes.string,
};

export default HistoricalTrendModal;
