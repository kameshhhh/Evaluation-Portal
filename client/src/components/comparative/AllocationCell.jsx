// ============================================================
// ALLOCATION CELL — Single cell in the matrix grid
// ============================================================
// Represents one (criterion × project) intersection.
// Number input with +/- buttons, follows AllocationInput.jsx pattern.
// Consumes context via useComparativeEvaluation (no prop drilling).
// ============================================================

import React, { useCallback, useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { useComparativeEvaluation } from "../../hooks/useComparativeEvaluation";

const STEP = 0.5;

export default function AllocationCell({
  criterionKey,
  projectId,
  criterionPool,
  criterionAllocated,
}) {
  const { allocationMatrix, setAllocation, session } =
    useComparativeEvaluation();

  const isEditable =
    session && ["draft", "in_progress"].includes(session.status);

  // Current value for this cell
  const points = useMemo(() => {
    return (allocationMatrix[criterionKey] || {})[projectId] || 0;
  }, [allocationMatrix, criterionKey, projectId]);

  // Max value: remaining pool for this criterion + currentValue
  const maxValue = useMemo(() => {
    const otherAllocated = criterionAllocated - points;
    return criterionPool - otherAllocated;
  }, [criterionPool, criterionAllocated, points]);

  // Handlers
  const handleChange = useCallback(
    (e) => {
      const raw = e.target.value;
      if (raw === "" || raw === ".") {
        setAllocation(criterionKey, projectId, 0);
        return;
      }
      const val = parseFloat(raw);
      if (!isNaN(val)) {
        setAllocation(
          criterionKey,
          projectId,
          Math.min(Math.max(0, val), maxValue),
        );
      }
    },
    [criterionKey, projectId, maxValue, setAllocation],
  );

  const handleIncrement = useCallback(() => {
    const newVal = Math.min(points + STEP, maxValue);
    setAllocation(criterionKey, projectId, newVal);
  }, [criterionKey, projectId, points, maxValue, setAllocation]);

  const handleDecrement = useCallback(() => {
    const newVal = Math.max(points - STEP, 0);
    setAllocation(criterionKey, projectId, newVal);
  }, [criterionKey, projectId, points, setAllocation]);

  // Visual states
  const isZero = points === 0;
  const isAtMax = points >= maxValue;

  return (
    <td className="text-center p-2">
      <div
        className={`inline-flex items-center gap-0.5 rounded-lg border transition-colors ${
          isZero
            ? "border-amber-200 bg-amber-50/50"
            : isAtMax
              ? "border-green-200 bg-green-50/50"
              : "border-gray-200 bg-white"
        }`}
      >
        {/* Decrement */}
        <button
          onClick={handleDecrement}
          disabled={!isEditable || points <= 0}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          tabIndex={-1}
        >
          <Minus className="w-3 h-3" />
        </button>

        {/* Number input */}
        <input
          type="number"
          value={points}
          onChange={handleChange}
          disabled={!isEditable}
          min={0}
          max={maxValue}
          step={STEP}
          className={`w-12 text-center text-sm font-medium bg-transparent border-0 focus:outline-none focus:ring-0 
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            ${isZero ? "text-amber-600" : "text-gray-800"}
            disabled:cursor-not-allowed disabled:text-gray-400`}
        />

        {/* Increment */}
        <button
          onClick={handleIncrement}
          disabled={!isEditable || points >= maxValue}
          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          tabIndex={-1}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </td>
  );
}
