// ============================================================
// CRITERIA ROW — One row of the allocation matrix
// ============================================================
// Represents a single evaluation criterion (row).
// Columns = projects, each cell is an AllocationCell.
// Shows row total + criterion pool info.
// Consumes context via useComparativeEvaluation (no prop drilling).
// ============================================================

import React from "react";
import { useComparativeEvaluation } from "../../hooks/useComparativeEvaluation";
import AllocationCell from "./AllocationCell";

export default function CriteriaRow({ criterion, projects, isLast }) {
  const { allocationMatrix } = useComparativeEvaluation();

  // Row data
  const allocsForCriterion = allocationMatrix[criterion.key] || {};
  const rowTotal = Object.values(allocsForCriterion).reduce(
    (sum, v) => sum + v,
    0,
  );
  const isExceeded = rowTotal > criterion.pool;

  return (
    <tr
      className={`${
        isLast ? "" : "border-b border-gray-100"
      } hover:bg-gray-50/50 transition-colors`}
    >
      {/* Criterion label (sticky left) */}
      <td className="p-3 sticky left-0 bg-white z-10 border-r border-gray-100">
        <div className="min-w-[170px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">
              {criterion.name}
            </span>
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {criterion.weight}%
            </span>
          </div>
          {criterion.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
              {criterion.description}
            </p>
          )}
          {/* Mini pool bar */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isExceeded
                    ? "bg-red-500"
                    : criterion.utilization >= 75
                      ? "bg-amber-500"
                      : "bg-green-500"
                }`}
                style={{
                  width: `${Math.min(criterion.utilization || 0, 100)}%`,
                }}
              />
            </div>
            <span
              className={`text-xs ${
                isExceeded ? "text-red-500 font-medium" : "text-gray-400"
              }`}
            >
              {(criterion.remaining || 0).toFixed(1)} left
            </span>
          </div>
        </div>
      </td>

      {/* Allocation cells — one per project */}
      {projects.map((project) => (
        <AllocationCell
          key={`${criterion.key}-${project.project_id}`}
          criterionKey={criterion.key}
          projectId={project.project_id}
          criterionPool={criterion.pool}
          criterionAllocated={criterion.allocated || 0}
        />
      ))}

      {/* Row total */}
      <td className="text-center p-3">
        <span
          className={`text-sm font-semibold ${
            isExceeded ? "text-red-600" : "text-gray-700"
          }`}
        >
          {rowTotal.toFixed(1)}
        </span>
      </td>

      {/* Criterion pool */}
      <td className="text-center p-3">
        <span className="text-sm text-gray-500">
          {(criterion.pool || 0).toFixed(1)}
        </span>
      </td>
    </tr>
  );
}
