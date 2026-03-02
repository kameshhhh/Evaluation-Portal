// ============================================================
// PROJECT IMPROVEMENT BREAKDOWN
// ============================================================
// SRS §4.1.2: Detailed team improvement visualization
//
// Shows:
// - Individual member contributions to team improvement
// - Who improved the most
// - Who declined
// - Distribution visualization with progress bars
//
// Used in: Project details modal, analytics dashboard,
//          expanded view in ProjectEvaluationCard
//
// USAGE:
// <ProjectImprovementBreakdown
//   distribution={deltaData.improvement_distribution}
//   teamSize={4}
// />
// ============================================================

import React from "react";
import PropTypes from "prop-types";
import { TrendingUp, TrendingDown, Minus, Users } from "lucide-react";

// ============================================================
// PROJECT IMPROVEMENT BREAKDOWN COMPONENT
// ============================================================
const ProjectImprovementBreakdown = ({ distribution, teamSize }) => {
  if (!distribution) {
    return (
      <div className="text-center py-4 text-gray-500">
        No improvement data available
      </div>
    );
  }

  const { improved, declined, unchanged, no_comparison, improvement_rate } =
    distribution;

  // Calculate percentages for visual bars
  const total = teamSize || improved + declined + unchanged + no_comparison;
  const improvedPercent = (improved / total) * 100;
  const declinedPercent = (declined / total) * 100;
  const unchangedPercent = (unchanged / total) * 100;

  // Determine improvement rate color
  const getImprovementRateColor = () => {
    if (improvement_rate >= 50) return "bg-green-100 text-green-800";
    if (improvement_rate >= 30) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Users className="h-5 w-5 text-gray-500 mr-2" />
          <h4 className="text-sm font-medium text-gray-700">
            Team Improvement Distribution
          </h4>
        </div>
        <div
          className={`px-2 py-1 rounded-full text-xs font-medium ${getImprovementRateColor()}`}
        >
          {improvement_rate}% Improvement Rate
        </div>
      </div>

      {/* Visual Distribution Bars */}
      <div className="space-y-3">
        {/* Improved bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center">
              <TrendingUp className="h-3.5 w-3.5 text-green-600 mr-1" />
              <span className="text-gray-600">Improved</span>
            </div>
            <span className="font-medium text-gray-900">
              {improved} member{improved !== 1 ? "s" : ""} (
              {Math.round(improvedPercent)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${improvedPercent}%` }}
            />
          </div>
        </div>

        {/* Declined bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center">
              <TrendingDown className="h-3.5 w-3.5 text-red-600 mr-1" />
              <span className="text-gray-600">Declined</span>
            </div>
            <span className="font-medium text-gray-900">
              {declined} member{declined !== 1 ? "s" : ""} (
              {Math.round(declinedPercent)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${declinedPercent}%` }}
            />
          </div>
        </div>

        {/* Unchanged bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center">
              <Minus className="h-3.5 w-3.5 text-blue-600 mr-1" />
              <span className="text-gray-600">Unchanged</span>
            </div>
            <span className="font-medium text-gray-900">
              {unchanged} member{unchanged !== 1 ? "s" : ""} (
              {Math.round(unchangedPercent)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${unchangedPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* No comparison note */}
      {no_comparison > 0 && (
        <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-500">
          {no_comparison} member{no_comparison !== 1 ? "s" : ""}{" "}
          {no_comparison === 1 ? "does" : "do"} not have previous month data for
          comparison
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{improved}</p>
          <p className="text-xs text-gray-500">Improved</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{declined}</p>
          <p className="text-xs text-gray-500">Declined</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{unchanged}</p>
          <p className="text-xs text-gray-500">Unchanged</p>
        </div>
      </div>

      {/* Visual indicator row */}
      <div className="flex items-center justify-center space-x-1 pt-2">
        {Array.from({ length: improved }).map((_, i) => (
          <div
            key={`up-${i}`}
            className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center"
            title="Improved"
          >
            <TrendingUp className="w-2 h-2 text-white" />
          </div>
        ))}
        {Array.from({ length: declined }).map((_, i) => (
          <div
            key={`down-${i}`}
            className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center"
            title="Declined"
          >
            <TrendingDown className="w-2 h-2 text-white" />
          </div>
        ))}
        {Array.from({ length: unchanged }).map((_, i) => (
          <div
            key={`same-${i}`}
            className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center"
            title="Unchanged"
          >
            <Minus className="w-2 h-2 text-white" />
          </div>
        ))}
        {Array.from({ length: no_comparison }).map((_, i) => (
          <div
            key={`na-${i}`}
            className="w-3 h-3 rounded-full bg-gray-300"
            title="No history"
          />
        ))}
      </div>
    </div>
  );
};

ProjectImprovementBreakdown.propTypes = {
  distribution: PropTypes.shape({
    improved: PropTypes.number.isRequired,
    declined: PropTypes.number.isRequired,
    unchanged: PropTypes.number.isRequired,
    no_comparison: PropTypes.number,
    improvement_rate: PropTypes.number,
  }),
  teamSize: PropTypes.number,
};

export default ProjectImprovementBreakdown;
