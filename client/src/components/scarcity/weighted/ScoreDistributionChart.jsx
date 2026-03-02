// ============================================================
// SCORE DISTRIBUTION CHART — Histogram of Score Bins
// ============================================================
// Renders a simple CSS-based histogram showing how evaluator
// scores are distributed across 5 bins for a given person.
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Helps users understand score spread at a glance. A uniform
//   distribution suggests disagreement; a peaked distribution
//   suggests consensus.
//
// MATHEMATICAL BASIS:
//   bins[i] = count of scores in range [i×binWidth, (i+1)×binWidth)
//   binWidth = poolSize / 5
//   barHeight = bins[i] / max(bins) × 100%
//
// PERFORMANCE: O(1) rendering (5 fixed bins).
// ============================================================

import React from "react";
import { BarChart3 } from "lucide-react";

// ============================================================
// MAIN COMPONENT: ScoreDistributionChart
// ============================================================
/**
 * Histogram showing score distribution for one person.
 *
 * @param {Object} props
 * @param {number[]} props.distribution — Array of 5 bin counts
 * @param {number} props.poolSize — Session pool size (for bin labels)
 */
const ScoreDistributionChart = ({ distribution = [], poolSize = 10 }) => {
  if (!distribution || distribution.length === 0) {
    return null;
  }

  const maxBin = Math.max(...distribution, 1);
  const binWidth = poolSize / distribution.length;

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5" />
        Score Distribution
      </h4>

      {/* Histogram bars */}
      <div className="flex items-end gap-1 h-20">
        {distribution.map((count, idx) => {
          const heightPct = (count / maxBin) * 100;
          const binStart = (idx * binWidth).toFixed(0);
          const binEnd = ((idx + 1) * binWidth).toFixed(0);

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center"
              title={`${binStart}–${binEnd}: ${count} evaluator${count !== 1 ? "s" : ""}`}
            >
              {/* Count label */}
              {count > 0 && (
                <span className="text-[9px] font-bold text-gray-600 mb-0.5">
                  {count}
                </span>
              )}
              {/* Bar */}
              <div
                className="w-full bg-blue-400 rounded-t-sm transition-all"
                style={{
                  height: `${Math.max(heightPct, count > 0 ? 8 : 0)}%`,
                  minHeight: count > 0 ? "4px" : "0",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bin labels */}
      <div className="flex gap-1 mt-1">
        {distribution.map((_, idx) => {
          const binStart = (idx * binWidth).toFixed(0);
          const binEnd = ((idx + 1) * binWidth).toFixed(0);

          return (
            <div
              key={idx}
              className="flex-1 text-center text-[8px] text-gray-400"
            >
              {binStart}–{binEnd}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScoreDistributionChart;
