// ============================================================
// TRADEOFF VISUALIZER — Point Distribution Visual Feedback
// ============================================================
// Shows a horizontal bar chart of how points are distributed
// across targets, making the scarcity trade-offs visually obvious.
//
// This component makes the zero-sum nature of scarcity tangible:
// giving more to one target visually shrinks what's available
// for others. The SRS calls this "forced trade-off feedback."
//
// SRS 4.1.3: "Scarcity forces judges to make trade-offs"
// ============================================================

// Import React for JSX rendering
import React from "react";

// ============================================================
// TradeoffVisualizer Component
// ============================================================
/**
 * Horizontal bar chart showing point distribution across targets.
 *
 * @param {Object} props - Component props
 * @param {Array<Object>} props.targets - Target persons { target_id, display_name }
 * @param {Object} props.allocations - Allocation map { targetId → points }
 * @param {number} props.poolSize - Total pool size (for scaling)
 */
const TradeoffVisualizer = ({ targets, allocations, poolSize }) => {
  // Don't render if no targets or no pool
  if (!targets || targets.length === 0 || !poolSize) {
    return null;
  }

  // Find the maximum allocation for bar scaling
  const maxAllocation = Math.max(
    ...targets.map((t) => allocations[t.target_id] || 0),
    1, // Prevent division by zero
  );

  return (
    // Visualizer container
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
      {/* Section header */}
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Point Distribution
      </h3>

      {/* Horizontal bars — one per target */}
      <div className="space-y-3">
        {targets.map((target) => {
          // Points for this target
          const points = allocations[target.target_id] || 0;

          // Bar width as percentage of pool (capped at 100%)
          const barPercent = poolSize > 0 ? (points / poolSize) * 100 : 0;

          // Color coding based on allocation level
          const barColor =
            points === 0
              ? "bg-gray-200" // Zero — subdued gray
              : points >= maxAllocation * 0.8
                ? "bg-blue-500" // High allocation — strong blue
                : "bg-blue-300"; // Normal allocation — light blue

          return (
            <div key={target.target_id} className="group">
              {/* Label row — name and points */}
              <div className="flex items-center justify-between mb-1">
                {/* Target name (truncated) */}
                <span className="text-xs text-gray-600 truncate max-w-[60%]">
                  {target.display_name || "Unknown"}
                </span>
                {/* Points value */}
                <span
                  className={`text-xs font-bold ${
                    points === 0 ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  {points.toFixed(1)} pts
                </span>
              </div>

              {/* Horizontal bar */}
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                  style={{ width: `${Math.min(barPercent, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — Pool usage summary */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>0</span>
          <span>Pool: {poolSize} points</span>
          <span>{poolSize}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Export the TradeoffVisualizer component
// ============================================================
export default TradeoffVisualizer;
