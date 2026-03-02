// ============================================================
// RubricPoolDisplay — Per-rubric pool usage bars
// ============================================================
// Shows how many points have been allocated in each rubric
// and the grand total. Color-coded: green → yellow → red.
//
// Props:
//   rubrics       — Array of { headId, headName, poolSize }
//   allocationsByHead — Object { [headId]: allocatedPoints }
//   totalPool     — Grand total pool (team_size × 5)
// ============================================================

import React from "react";

// Pool bar colors based on utilisation percentage
function getBarColor(pct) {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 80) return "bg-yellow-400";
  if (pct >= 50) return "bg-blue-400";
  return "bg-gray-300";
}

function getTextColor(pct) {
  if (pct >= 100) return "text-green-700";
  if (pct >= 80) return "text-yellow-700";
  return "text-gray-500";
}

// ============================================================
// PoolBar — Single rubric pool bar
// ============================================================
const PoolBar = ({ label, allocated, pool, isGrandTotal = false }) => {
  const pct = pool > 0 ? Math.min((allocated / pool) * 100, 100) : 0;
  const remaining = pool - allocated;
  const exceeded = allocated > pool;

  return (
    <div className={`${isGrandTotal ? "pt-3 border-t border-gray-200" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-xs font-medium ${
            isGrandTotal ? "text-gray-800 font-semibold" : "text-gray-600"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-xs font-semibold ${
            exceeded
              ? "text-red-600"
              : pct >= 100
              ? "text-green-600"
              : getTextColor(pct)
          }`}
        >
          {allocated}/{pool}
          {exceeded && (
            <span className="ml-1 text-red-500">⚠ Exceeded!</span>
          )}
          {pct >= 100 && !exceeded && (
            <span className="ml-1 text-green-500">✓</span>
          )}
        </span>
      </div>
      {/* Bar track */}
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            exceeded ? "bg-red-500" : getBarColor(pct)
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {!isGrandTotal && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {remaining >= 0 ? `${remaining} remaining` : `${Math.abs(remaining)} over limit`}
        </p>
      )}
    </div>
  );
};

// ============================================================
// RubricPoolDisplay — Main export
// ============================================================
const RubricPoolDisplay = ({ rubrics = [], allocationsByHead = {}, totalPool = 0 }) => {
  const grandAllocated = rubrics.reduce(
    (sum, r) => sum + (allocationsByHead[r.headId] || 0),
    0
  );

  const allRubricsComplete = rubrics.every(
    (r) => (allocationsByHead[r.headId] || 0) >= r.poolSize
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
          Pool Status
        </h4>
        {allRubricsComplete && (
          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            All Complete ✓
          </span>
        )}
      </div>

      {/* Per-rubric bars */}
      <div className="space-y-2">
        {rubrics.map((r) => (
          <PoolBar
            key={r.headId}
            label={r.headName}
            allocated={allocationsByHead[r.headId] || 0}
            pool={r.poolSize}
          />
        ))}
      </div>

      {/* Grand total bar */}
      <PoolBar
        label="Grand Total"
        allocated={grandAllocated}
        pool={totalPool}
        isGrandTotal
      />
    </div>
  );
};

export default RubricPoolDisplay;
