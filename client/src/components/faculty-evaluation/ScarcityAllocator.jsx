// ============================================================
// SCARCITY ALLOCATOR — Mode-specific allocation controls
// ============================================================
// SRS §4.4.1 — "Student receives limited points"
// SRS §4.4.2 — Three scoring modes with distinct UIs:
//   binary   → Radio/checkbox selection (select/unselect)
//   small_pool → +/- stepper controls (0-3 points each)
//   full_pool  → Slider + number input (0-4 points each)
//
// Validates in real-time via useFacultyScarcity hook.
// Shows budget bar, warnings, and scarcity education tooltip.
// WCAG 2.1 AA: keyboard controls, ARIA labels, focus management.
// ============================================================

import React, { useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Minus,
  Plus,
  X,
  Info,
} from "lucide-react";

/**
 * @param {Object} props
 * @param {string} props.mode - 'binary' | 'small_pool' | 'full_pool'
 * @param {Object} props.validation - From useFacultyScarcity
 * @param {Object} props.poolConfig - From useFacultyScarcity
 * @param {Object} props.allocations - { [facultyId]: { tier, points } }
 * @param {Function} props.onAllocate - (facultyId, tier) => void
 * @param {boolean} props.disabled - Submitted / locked
 * @param {Object|null} props.education - Scarcity education content
 * @param {Function} props.onLoadEducation - Load education on demand
 */
const ScarcityAllocator = React.memo(function ScarcityAllocator({
  mode,
  validation,
  poolConfig,
  allocations = {},
  onAllocate,
  disabled = false,
  education = null,
  onLoadEducation,
}) {
  const [showEducation, setShowEducation] = useState(false);

  if (!poolConfig) return null;

  const { budget, tierPoints } = poolConfig;
  const {
    totalPoints,
    remainingPoints,
    isValid,
    errors,
    warnings,
    isComplete,
  } = validation;

  // Budget utilization bar
  const utilization = budget > 0 ? totalPoints / budget : 0;
  const barColor = !isValid
    ? "bg-red-500"
    : isComplete
      ? "bg-emerald-500"
      : utilization > 0.8
        ? "bg-amber-500"
        : "bg-blue-500";

  return (
    <div className="space-y-4">
      {/* ── Budget Progress Bar ─────────────────── */}
      <div
        className={`rounded-xl border-2 p-4 transition-all duration-300 ${
          !isValid
            ? "border-red-300 bg-red-50"
            : isComplete
              ? "border-emerald-300 bg-emerald-50"
              : "border-gray-200 bg-white"
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">
            Point Budget
          </span>
          <span
            className={`text-sm font-bold ${
              !isValid
                ? "text-red-600"
                : isComplete
                  ? "text-emerald-600"
                  : "text-gray-600"
            }`}
          >
            {totalPoints} / {budget}
            {remainingPoints > 0 && (
              <span className="text-gray-400 font-normal ml-1">
                ({remainingPoints} left)
              </span>
            )}
          </span>
        </div>

        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(utilization * 100, 100)}%` }}
          />
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="mt-2 space-y-1">
            {errors.map((err, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs text-red-600"
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((warn, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs text-amber-600"
              >
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{warn}</span>
              </div>
            ))}
          </div>
        )}

        {/* Complete indicator */}
        {isComplete && isValid && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>All points allocated — ready to submit</span>
          </div>
        )}
      </div>

      {/* ── Scarcity Education Toggle ──────────── */}
      <button
        onClick={() => {
          if (!education && onLoadEducation) onLoadEducation();
          setShowEducation((s) => !s);
        }}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
        aria-expanded={showEducation}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Why can&apos;t I give everyone the same score?</span>
      </button>

      {showEducation && education && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 space-y-2">
          <div className="flex items-start justify-between">
            <p className="font-semibold text-blue-800">
              {education.title || "Why Scarcity Matters"}
            </p>
            <button
              onClick={() => setShowEducation(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p>{education.explanation}</p>
          {education.benefits && (
            <ul className="list-disc ml-5 space-y-1 text-xs text-gray-600">
              {education.benefits.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

// ── Mode-specific Control Widgets ──────────────────────────

/**
 * Binary mode: simple select/unselect toggle for a faculty member
 */
export const BinaryToggle = React.memo(function BinaryToggle({
  facultyId,
  isSelected,
  onToggle,
  disabled,
  remainingSelections,
}) {
  const canSelect = !isSelected && remainingSelections > 0;

  return (
    <button
      onClick={() =>
        !disabled && onToggle(facultyId, isSelected ? "unranked" : "selected")
      }
      disabled={disabled || (!isSelected && !canSelect)}
      className={`
        px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
        ${
          isSelected
            ? "bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
            : canSelect
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
              : "bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200"
        }
      `}
      aria-pressed={isSelected}
      aria-label={isSelected ? "Deselect faculty" : "Select faculty"}
    >
      {isSelected ? "✓ Selected" : "Select"}
    </button>
  );
});

/**
 * Small pool mode: +/- stepper for 0..3 points per faculty
 */
export const PointStepper = React.memo(function PointStepper({
  facultyId,
  points = 0,
  maxPoints = 3,
  onChangePoints,
  disabled,
  remainingBudget,
}) {
  const canIncrease = !disabled && points < maxPoints && remainingBudget > 0;
  const canDecrease = !disabled && points > 0;

  const tierForPoints = (p) => {
    if (p >= 3) return "tier1";
    if (p >= 2) return "tier2";
    if (p >= 1) return "tier3";
    return "unranked";
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          canDecrease && onChangePoints(facultyId, tierForPoints(points - 1))
        }
        disabled={!canDecrease}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center transition-all
          ${canDecrease ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-300 cursor-not-allowed"}
        `}
        aria-label={`Decrease points for faculty`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <span
        className={`
          w-8 text-center text-sm font-bold rounded
          ${points > 0 ? "text-blue-700" : "text-gray-400"}
        `}
        aria-live="polite"
      >
        {points}
      </span>

      <button
        onClick={() =>
          canIncrease && onChangePoints(facultyId, tierForPoints(points + 1))
        }
        disabled={!canIncrease}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center transition-all
          ${canIncrease ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 text-gray-300 cursor-not-allowed"}
        `}
        aria-label={`Increase points for faculty`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

/**
 * Full pool mode: slider + number input for 0..4 points per faculty
 */
export const PointSlider = React.memo(function PointSlider({
  facultyId,
  points = 0,
  maxPoints = 4,
  onChangePoints,
  disabled,
  remainingBudget,
}) {
  const effectiveMax = Math.min(maxPoints, points + remainingBudget);

  const tierForPoints = (p) => {
    if (p >= 4) return "tier1";
    if (p >= 2) return "tier2";
    if (p >= 1) return "tier3";
    return "unranked";
  };

  const handleSliderChange = useCallback(
    (e) => {
      const val = parseInt(e.target.value, 10);
      onChangePoints(facultyId, tierForPoints(val));
    },
    [facultyId, onChangePoints],
  );

  const sliderColor =
    points >= 4
      ? "accent-amber-500"
      : points >= 2
        ? "accent-gray-400"
        : points >= 1
          ? "accent-orange-400"
          : "accent-gray-300";

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <input
        type="range"
        min={0}
        max={effectiveMax}
        value={points}
        onChange={handleSliderChange}
        disabled={disabled}
        className={`flex-1 h-1.5 rounded-full cursor-pointer ${sliderColor} disabled:opacity-50`}
        aria-label={`Points for faculty: ${points}`}
      />
      <span
        className={`
          w-8 text-center text-sm font-bold
          ${points > 0 ? "text-blue-700" : "text-gray-400"}
        `}
      >
        {points}
      </span>
    </div>
  );
});

export default ScarcityAllocator;
