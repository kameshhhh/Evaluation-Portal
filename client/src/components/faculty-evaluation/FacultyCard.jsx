// ============================================================
// FACULTY CARD — Draggable faculty member card
// ============================================================
// SRS §4.4.1 — Represents one faculty member in the tier ranking.
// Supports HTML5 drag (desktop) and tap-to-select (mobile).
// Shows faculty name, department, evaluation count, exposure badge.
// WCAG 2.1 AA: ARIA labels, keyboard nav, focus indicators.
// ============================================================

import React from "react";
import { GripVertical, Award } from "lucide-react";

/**
 * @param {Object} props
 * @param {Object} props.faculty - { person_id, display_name, department_code, evaluation_count, exposure }
 * @param {boolean} props.selected - Is this card selected (mobile tap mode)
 * @param {string} props.tierColor - Current tier color for accent
 * @param {Function} props.onDragStart - (e, facultyId) => void
 * @param {Function} props.onClick - (facultyId) => void
 * @param {boolean} props.disabled - If evaluation is submitted
 */
const FacultyCard = React.memo(function FacultyCard({
  faculty,
  selected,
  tierColor,
  onDragStart,
  onClick,
  disabled,
}) {
  const initials = (faculty.display_name || "??")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarColors = {
    gold: "from-amber-500 to-yellow-400",
    silver: "from-gray-400 to-slate-300",
    bronze: "from-orange-400 to-amber-300",
    gray: "from-indigo-500 to-purple-500",
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) return;
        e.dataTransfer.setData("text/plain", faculty.person_id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => !disabled && onClick(faculty.person_id)}
      className={`
        flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200
        select-none group
        ${disabled ? "opacity-60 cursor-default" : "cursor-grab active:cursor-grabbing"}
        ${
          selected
            ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50 shadow-md"
            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
        }
      `}
      role="option"
      aria-selected={selected}
      aria-label={`${faculty.display_name}, ${faculty.department_code || "General"}, ${faculty.evaluation_count || 0} evaluations`}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(faculty.person_id);
        }
      }}
    >
      {/* Drag handle */}
      {!disabled && (
        <GripVertical className="h-4 w-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
      )}

      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full bg-gradient-to-br ${
          avatarColors[tierColor] || avatarColors.gray
        } flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">
          {faculty.display_name}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {faculty.department_code || "General Department"}
        </p>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Evaluation count badge */}
        {faculty.evaluation_count > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full"
            title={`Evaluated you ${faculty.evaluation_count} time(s)`}
          >
            <Award className="h-3 w-3" />
            {faculty.evaluation_count}
          </span>
        )}

        {/* Exposure badge */}
        {faculty.exposure?.sessions > 0 && (
          <span
            className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full"
            title={`${faculty.exposure.sessions} sessions, ${faculty.exposure.hours}h contact`}
          >
            {faculty.exposure.sessions}s
          </span>
        )}
      </div>
    </div>
  );
});

export default FacultyCard;
