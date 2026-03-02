// ============================================================
// EXPOSURE INDICATOR — Visual badge for exposure level
// ============================================================
// SRS §4.4.3 — Shows how much exposure a faculty member has
// (sessions conducted, contact hours, role type).
// Color-coded: green (high), amber (medium), red (low).
// Tooltip with exact values on hover.
// ============================================================

import React, { useState } from "react";
import { Eye, Clock, BookOpen } from "lucide-react";

/**
 * @param {Object} props
 * @param {Object} props.exposure - { sessions_conducted, contact_hours, role_type, exposure_factor }
 * @param {string} props.size - 'sm' | 'md' (default: 'sm')
 * @param {boolean} props.showTooltip - Show detail on hover (default: true)
 */
const ExposureIndicator = React.memo(function ExposureIndicator({
  exposure,
  size = "sm",
  showTooltip = true,
}) {
  const [hovered, setHovered] = useState(false);

  if (!exposure) return null;

  const factor = exposure.exposure_factor ?? exposure.exposureFactor ?? 0;
  const level = factor >= 0.7 ? "high" : factor >= 0.4 ? "medium" : "low";

  const config = {
    high: {
      label: "High",
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      border: "border-emerald-200",
      dot: "bg-emerald-500",
    },
    medium: {
      label: "Medium",
      bg: "bg-amber-100",
      text: "text-amber-700",
      border: "border-amber-200",
      dot: "bg-amber-500",
    },
    low: {
      label: "Low",
      bg: "bg-red-100",
      text: "text-red-700",
      border: "border-red-200",
      dot: "bg-red-500",
    },
  }[level];

  const sizeClasses =
    size === "md"
      ? "px-2.5 py-1 text-xs gap-1.5"
      : "px-1.5 py-0.5 text-[10px] gap-1";

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className={`
          inline-flex items-center rounded-full border font-medium
          ${config.bg} ${config.text} ${config.border} ${sizeClasses}
        `}
        aria-label={`Exposure: ${config.label} (${(factor * 100).toFixed(0)}%)`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>

      {/* Tooltip */}
      {showTooltip && hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-48 bg-gray-900 text-white rounded-lg p-3 shadow-xl text-xs">
          <p className="font-semibold mb-2">Exposure Detail</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-3 w-3 text-gray-400" />
              <span>Sessions: {exposure.sessions_conducted ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-gray-400" />
              <span>Hours: {exposure.contact_hours ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-gray-400" />
              <span className="capitalize">
                Role: {exposure.role_type ?? "—"}
              </span>
            </div>
            <hr className="border-gray-700" />
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Factor:</span>
              <span className="font-bold">{(factor * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-gray-900 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
});

export default ExposureIndicator;
