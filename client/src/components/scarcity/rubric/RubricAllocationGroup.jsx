// ============================================================
// RubricAllocationGroup — Per-rubric scoring section
// ============================================================
// Renders one rubric (e.g., "Clarity") with:
//   - Rubric name + description
//   - Remaining pool bar for this rubric
//   - One AllocationInput per target student
//
// The parent (ScarcityEvaluationPage) passes all allocation
// state down. Each AllocationInput calls onChangeAllocation
// which the parent handles.
//
// SRS §4.1.4: "Judge distributes points across Members AND
//   Questions. System enforces global total AND per-rubric total."
// ============================================================

import React from "react";
import { BookOpen, CheckCircle2, AlertCircle } from "lucide-react";
import AllocationInput from "../AllocationInput";

// ============================================================
// RubricAllocationGroup Component
// ============================================================
/**
 * @param {Object}   props
 * @param {Object}   props.rubric           - { headId, headName, description, poolSize }
 * @param {Array}    props.targets          - Session targets (students)
 * @param {Object}   props.allocationsByHead - { [headId]: { [targetId]: points } }
 * @param {number}   props.rubricAllocated  - Total points used in this rubric
 * @param {boolean}  props.disabled         - Disable inputs (session closed etc.)
 * @param {Function} props.onChange         - (headId, targetId, points) => void
 */
const RubricAllocationGroup = ({
  rubric,
  targets = [],
  allocationsByHead = {},
  rubricAllocated = 0,
  disabled = false,
  onChange,
}) => {
  const { headId, headName, description, poolSize } = rubric;
  const remaining = poolSize - rubricAllocated;
  const isComplete = rubricAllocated >= poolSize;
  const isExceeded = rubricAllocated > poolSize;
  const pct = poolSize > 0 ? Math.min((rubricAllocated / poolSize) * 100, 100) : 0;

  // Per-target allocation for this rubric
  const rubricAllocations = allocationsByHead[headId] || {};

  // Max any single student can receive = remaining + what they already have
  const getMaxForTarget = (targetId) => {
    const currentPoints = rubricAllocations[targetId] || 0;
    return currentPoints + remaining;
  };

  return (
    <div
      className={`bg-white rounded-2xl border transition-all duration-200 ${
        isExceeded
          ? "border-red-300 shadow-sm"
          : isComplete
          ? "border-green-200 shadow-sm"
          : "border-gray-200"
      }`}
    >
      {/* ============================================== */}
      {/* RUBRIC HEADER                                   */}
      {/* ============================================== */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 p-2 rounded-xl ${
              isComplete ? "bg-green-100" : "bg-indigo-50"
            }`}
          >
            {isComplete ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <BookOpen className="h-4 w-4 text-indigo-600" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{headName}</h3>
            {description && (
              <p className="text-xs text-gray-500 mt-0.5 max-w-sm">{description}</p>
            )}
          </div>
        </div>

        {/* Pool indicator badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${
            isExceeded
              ? "bg-red-100 text-red-700"
              : isComplete
              ? "bg-green-100 text-green-700"
              : remaining === 0
              ? "bg-green-100 text-green-700"
              : "bg-indigo-50 text-indigo-700"
          }`}
        >
          {isExceeded ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : null}
          {rubricAllocated}/{poolSize} pts
        </div>
      </div>

      {/* Progress bar for this rubric */}
      <div className="px-5 pb-3">
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isExceeded
                ? "bg-red-500"
                : isComplete
                ? "bg-green-500"
                : pct >= 80
                ? "bg-yellow-400"
                : "bg-indigo-400"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">
          {remaining > 0
            ? `${remaining} point${remaining !== 1 ? "s" : ""} remaining in this rubric`
            : isComplete
            ? "Rubric pool fully used ✓"
            : ""}
        </p>
      </div>

      {/* ============================================== */}
      {/* ALLOCATION INPUTS — one per target student     */}
      {/* ============================================== */}
      <div className="px-5 pb-5 space-y-2">
        {targets.map((target) => {
          const targetId = target.target_id || target.personId || target.person_id;
          const currentPoints = rubricAllocations[targetId] || 0;

          return (
            <AllocationInput
              key={`${headId}-${targetId}`}
              target={target}
              points={currentPoints}
              maxPoints={getMaxForTarget(targetId)}
              disabled={disabled}
              onChange={(tid, pts) => onChange(headId, tid, pts)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RubricAllocationGroup;
