// ============================================================
// FACULTY SCORE CARD — Normalized score display row
// ============================================================
// SRS §4.4.3 — Shows one faculty member's normalized score
// with band classification. Expandable for normalization detail.
// Used in FacultyResultsDashboard results table.
// SRS §7.2 — "Only trends, percentiles, bands" — no raw ranking
// ============================================================

import React from "react";
import { ChevronDown, ChevronUp, Award } from "lucide-react";
import ExposureIndicator from "./ExposureIndicator";

const BAND_CONFIG = {
  EXCELLENT: {
    label: "Excellent",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-200",
  },
  GOOD: {
    label: "Good",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-200",
  },
  SATISFACTORY: {
    label: "Satisfactory",
    bg: "bg-amber-100",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  DEVELOPING: {
    label: "Developing",
    bg: "bg-gray-100",
    text: "text-gray-700",
    border: "border-gray-200",
  },
};

function getBand(normalizedScore) {
  if (normalizedScore >= 3.5) return "EXCELLENT";
  if (normalizedScore >= 2.5) return "GOOD";
  if (normalizedScore >= 1.5) return "SATISFACTORY";
  return "DEVELOPING";
}

/**
 * @param {Object} props
 * @param {Object} props.result - { faculty_id, faculty_name, raw_average_score, normalized_score, exposure_factor, student_count, department_percentile, exposure }
 * @param {boolean} props.isExpanded - Show detail section
 * @param {Function} props.onToggle - Toggle expand
 * @param {boolean} props.showRawScore - Show raw score column (admin only)
 */
const FacultyScoreCard = React.memo(function FacultyScoreCard({
  result,
  isExpanded,
  onToggle,
  showRawScore = false,
}) {
  const band = getBand(result.normalized_score ?? 0);
  const bandConfig = BAND_CONFIG[band];

  const initials = (result.faculty_name || "??")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={`px-6 py-4 flex items-center gap-4 transition-colors cursor-pointer hover:bg-gray-50 ${
        isExpanded ? "bg-violet-50/30" : ""
      }`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isExpanded}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        {initials}
      </div>

      {/* Name & department */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {result.faculty_name || `Faculty #${result.faculty_id}`}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {result.department && (
            <span className="text-xs text-gray-500">{result.department}</span>
          )}
          {result.exposure && (
            <ExposureIndicator
              exposure={{
                ...result.exposure,
                exposure_factor: result.exposure_factor,
              }}
              size="sm"
            />
          )}
        </div>
      </div>

      {/* Raw score (admin) */}
      {showRawScore && (
        <div className="text-center w-16">
          <p className="text-xs text-gray-400">Raw</p>
          <p className="text-sm font-medium text-gray-600">
            {result.raw_average_score != null
              ? parseFloat(result.raw_average_score).toFixed(2)
              : "—"}
          </p>
        </div>
      )}

      {/* Normalized score */}
      <div className="text-center w-20">
        <p className="text-xs text-gray-400">Normalized</p>
        <p className="text-lg font-bold text-gray-900">
          {result.normalized_score != null
            ? parseFloat(result.normalized_score).toFixed(2)
            : "—"}
        </p>
      </div>

      {/* Band badge */}
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${bandConfig.bg} ${bandConfig.text} ${bandConfig.border}`}
      >
        {bandConfig.label}
      </span>

      {/* Student count */}
      <div className="text-center w-12">
        <p className="text-xs text-gray-400">Eval</p>
        <p className="text-sm font-medium text-gray-700">
          {result.student_count ?? "—"}
        </p>
      </div>

      {/* Percentile */}
      {result.department_percentile != null && (
        <div className="text-center w-14">
          <p className="text-xs text-gray-400">%ile</p>
          <p className="text-sm font-medium text-violet-700">
            {Math.round(result.department_percentile)}
          </p>
        </div>
      )}

      {/* Expand toggle */}
      <div className="flex-shrink-0 text-gray-400">
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </div>
    </div>
  );
});

export default FacultyScoreCard;
