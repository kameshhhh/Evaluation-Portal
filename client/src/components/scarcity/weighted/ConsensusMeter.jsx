// ============================================================
// CONSENSUS METER — Visual Gauge for Evaluator Agreement
// ============================================================
// Renders a visual gauge showing how much evaluators agree.
// Available in two modes:
//   1. Compact — Single-line display for summary cards
//   2. Full    — Detailed gauge with label and description
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Consensus level tells faculty how much evaluators agreed.
//   High consensus + high credibility impact = some evaluators
//   are outliers (potentially concerning).
//   Low consensus + low impact = genuine disagreement.
//
// MATHEMATICAL BASIS:
//   consensus = 1 − (normalized_avg_std_dev)
//   0.0 = maximum disagreement
//   1.0 = perfect agreement (all evaluators gave same score)
//
//   Categories:
//     > 0.85 = Strong    (green)
//     > 0.65 = Good      (blue)
//     > 0.45 = Moderate  (amber)
//     > 0.25 = Weak      (orange)
//     ≤ 0.25 = Poor      (red)
//
// PERFORMANCE: O(1) rendering.
// ACCESSIBILITY: ARIA label with numeric percentage.
// ============================================================

import React from "react";

// ============================================================
// Consensus level categories
// ============================================================
const getConsensusCategory = (level) => {
  if (level > 0.85)
    return {
      label: "Strong",
      color: "green",
      desc: "Evaluators strongly agree",
    };
  if (level > 0.65)
    return { label: "Good", color: "blue", desc: "Good level of agreement" };
  if (level > 0.45)
    return {
      label: "Moderate",
      color: "amber",
      desc: "Some disagreement present",
    };
  if (level > 0.25)
    return { label: "Weak", color: "orange", desc: "Significant disagreement" };
  return { label: "Poor", color: "red", desc: "Evaluators strongly disagree" };
};

// Color mapping for Tailwind classes
const COLOR_MAP = {
  green: { bar: "bg-green-500", text: "text-green-700", bg: "bg-green-100" },
  blue: { bar: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-100" },
  amber: { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-100" },
  orange: {
    bar: "bg-orange-500",
    text: "text-orange-700",
    bg: "bg-orange-100",
  },
  red: { bar: "bg-red-500", text: "text-red-700", bg: "bg-red-100" },
};

// ============================================================
// MAIN COMPONENT: ConsensusMeter
// ============================================================
/**
 * Visual gauge for evaluator consensus level.
 *
 * @param {Object} props
 * @param {number} props.level — Consensus level (0–1)
 * @param {boolean} [props.compact=false] — Use compact display mode
 */
const ConsensusMeter = ({ level = 0, compact = false }) => {
  const pct = Math.round(level * 100);
  const category = getConsensusCategory(level);
  const colors = COLOR_MAP[category.color];

  // ──────────────────────────────────
  // COMPACT MODE — For summary cards
  // ──────────────────────────────────
  if (compact) {
    return (
      <div
        aria-label={`Consensus: ${pct}% — ${category.label}`}
        className="space-y-1"
      >
        <p className="text-xl font-bold text-purple-900">{pct}%</p>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // ──────────────────────────────────
  // FULL MODE — Detailed gauge
  // ──────────────────────────────────
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-4"
      aria-label={`Consensus: ${pct}% — ${category.label}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">
          Evaluator Consensus
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}
        >
          {category.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{category.desc}</span>
        <span className={`text-sm font-bold ${colors.text}`}>{pct}%</span>
      </div>

      {/* Scale markers */}
      <div className="flex justify-between mt-1 text-[8px] text-gray-300">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
    </div>
  );
};

export default ConsensusMeter;
