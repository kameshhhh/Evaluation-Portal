// ============================================================
// POOL SUMMARY — Real-time scarcity budget tracker
// ============================================================
// SRS §4.4.1 — "Student receives limited points"
// SRS §8.2a — "Rules are visible" — clearly shows allocation rules
// Shows: total budget, used points, remaining, progress bar.
// Turns red when budget exceeded.
// ============================================================

import React from "react";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";

/**
 * @param {Object} props
 * @param {Object} props.pool - { total, used, remaining, isExceeded, utilization }
 * @param {string} props.mode - 'binary' | 'small_pool' | 'full_pool'
 * @param {number} props.facultyCount - Number of eligible faculty
 * @param {boolean} props.saving - Is auto-save in progress
 * @param {Date|null} props.lastSaved - Timestamp of last save
 * @param {boolean} props.submitted - Has been submitted
 */
const PoolSummary = React.memo(function PoolSummary({
  pool,
  mode,
  facultyCount,
  saving,
  lastSaved,
  submitted,
}) {
  const modeLabels = {
    binary: "Binary (0/1)",
    small_pool: "Small Pool (1-3 pts)",
    full_pool: "Full Pool (10 pts)",
  };

  const modeDescriptions = {
    binary: `Select up to ${pool.total} faculty (30% of ${facultyCount})`,
    small_pool: `Distribute ${pool.total} points across faculty (1.5× count)`,
    full_pool: `Distribute 10 points total across all faculty`,
  };

  const barColor = pool.isExceeded
    ? "bg-red-500"
    : pool.utilization > 0.8
      ? "bg-amber-500"
      : "bg-emerald-500";

  const barWidth = Math.min(pool.utilization * 100, 100);

  return (
    <div
      className={`rounded-2xl border-2 p-5 transition-all duration-300 ${
        pool.isExceeded
          ? "border-red-400 bg-red-50"
          : submitted
            ? "border-emerald-400 bg-emerald-50"
            : "border-gray-200 bg-white"
      }`}
      role="status"
      aria-live="polite"
      aria-label={`Budget: ${pool.used} of ${pool.total} points used. ${pool.remaining} remaining.`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 text-sm">Point Budget</h3>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
          {modeLabels[mode]}
        </span>
      </div>

      {/* Description — SRS §8.2a: Rules are visible */}
      <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        {modeDescriptions[mode]}
      </p>

      {/* Numbers */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <span
            className={`text-3xl font-bold ${pool.isExceeded ? "text-red-600" : "text-gray-900"}`}
          >
            {pool.used}
          </span>
          <span className="text-gray-400 text-lg"> / {pool.total}</span>
        </div>
        <div
          className={`text-sm font-semibold ${
            pool.isExceeded
              ? "text-red-600"
              : pool.remaining === 0
                ? "text-emerald-600"
                : "text-gray-500"
          }`}
        >
          {pool.isExceeded
            ? `${Math.abs(pool.remaining)} over!`
            : `${pool.remaining} left`}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Status indicators */}
      <div className="flex items-center justify-between text-xs">
        {pool.isExceeded ? (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Budget exceeded — remove faculty from tiers
          </span>
        ) : submitted ? (
          <span className="flex items-center gap-1 text-emerald-600 font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Evaluation submitted successfully
          </span>
        ) : (
          <span className="text-gray-400">
            {saving
              ? "Saving draft..."
              : lastSaved
                ? `Draft saved ${lastSaved.toLocaleTimeString()}`
                : "Auto-saves every 30s"}
          </span>
        )}
      </div>
    </div>
  );
});

export default PoolSummary;
