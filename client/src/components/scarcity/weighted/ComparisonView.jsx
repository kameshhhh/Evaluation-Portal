// ============================================================
// COMPARISON VIEW — Side-by-Side Raw vs Weighted Results
// ============================================================
// Renders a dual-view comparison:
//   1. Visual bar chart comparing raw and weighted averages
//   2. Sortable data table with impact indicators
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Shows exactly how credibility weighting shifts scores compared
//   to naive averaging. Positive impact = high-credibility evaluators
//   pulled the score up; negative = high-credibility pulled it down.
//
// MATHEMATICAL BASIS:
//   impact = weighted_average − raw_average
//   bar_width = (score / pool_size) × 100%
//
// PERFORMANCE: O(n) rendering where n = person count.
//   React key-based diffing ensures only changed rows re-render.
//
// VISUALIZATION LINK:
//   visualization.comparison_chart → bar chart labels/scores
//   person_results → data table rows
// ============================================================

import React, { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from "lucide-react";

// ============================================================
// ImpactBadge — Color-coded +/- impact indicator
// ============================================================
/**
 * Small badge showing the credibility impact value with color coding.
 * Green for positive, red for negative, gray for neutral.
 *
 * @param {Object} props
 * @param {number} props.impact — Credibility impact value
 */
const ImpactBadge = ({ impact }) => {
  const absImpact = Math.abs(impact || 0);
  const isPositive = impact > 0.001;
  const isNegative = impact < -0.001;

  if (absImpact < 0.001) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
        <Minus className="h-2.5 w-2.5" />
        0.000
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
        isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {isPositive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {isPositive ? "+" : ""}
      {(impact || 0).toFixed(3)}
    </span>
  );
};

// ============================================================
// ComparisonBar — Dual horizontal bar (raw + weighted)
// ============================================================
/**
 * Renders two overlapping horizontal bars for raw (blue) and
 * weighted (green) scores on a common scale.
 *
 * @param {Object} props
 * @param {number} props.raw — Raw average score
 * @param {number} props.weighted — Weighted average score
 * @param {number} props.poolSize — Maximum score (for scaling)
 */
const ComparisonBar = ({ raw, weighted, poolSize }) => {
  const maxVal = poolSize || Math.max(raw, weighted, 1);
  const rawPct = (raw / maxVal) * 100;
  const weightedPct = (weighted / maxVal) * 100;

  return (
    <div className="space-y-1.5">
      {/* Raw bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-14 text-right">Raw</span>
        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(rawPct, 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-gray-600 w-10 text-right">
          {raw.toFixed(2)}
        </span>
      </div>
      {/* Weighted bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-green-600 w-14 text-right font-medium">
          Weighted
        </span>
        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(weightedPct, 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-green-700 w-10 text-right font-medium">
          {weighted.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT: ComparisonView
// ============================================================
/**
 * Side-by-side comparison of raw vs weighted results.
 *
 * @param {Object} props
 * @param {Object[]} props.personResults — Array of person result objects
 * @param {Object} props.visualization — Pre-formatted visualization data
 * @param {number} props.poolSize — Session pool size
 */
const ComparisonView = ({ personResults = [], visualization, poolSize }) => {
  // Sort state
  const [sortField, setSortField] = useState("weighted_average");
  const [sortDir, setSortDir] = useState("desc");

  // Sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Apply sort
  const sorted = [...personResults].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  // Sort indicator icon
  const SortIcon = ({ field }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────────────────────── */}
      {/* VISUAL COMPARISON CHART — Horizontal dual bars     */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          Raw vs Weighted Comparison
        </h3>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-400" />
            <span className="text-gray-500">Raw Average</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span className="text-gray-500">Weighted Average</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ImpactBadge impact={0.5} />
            <span className="text-gray-500">Credibility Impact</span>
          </div>
        </div>

        {/* Bar chart */}
        <div className="space-y-4">
          {sorted.map((person, idx) => (
            <div key={person.person_id} className="group">
              {/* Person label + impact badge */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-mono w-5">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]">
                    {person.name}
                  </span>
                </div>
                <ImpactBadge impact={person.credibility_impact} />
              </div>

              {/* Dual comparison bars */}
              <ComparisonBar
                raw={person.raw_average}
                weighted={person.weighted_average}
                poolSize={poolSize}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* DATA TABLE — Sortable comparison table             */}
      {/* ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
                Rank
              </th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
                Person
              </th>
              <th
                className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("raw_average")}
              >
                <div className="flex items-center justify-center gap-1">
                  Raw Avg <SortIcon field="raw_average" />
                </div>
              </th>
              <th
                className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("weighted_average")}
              >
                <div className="flex items-center justify-center gap-1">
                  Weighted Avg <SortIcon field="weighted_average" />
                </div>
              </th>
              <th
                className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase cursor-pointer hover:text-gray-700"
                onClick={() => handleSort("credibility_impact")}
              >
                <div className="flex items-center justify-center gap-1">
                  Impact <SortIcon field="credibility_impact" />
                </div>
              </th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase">
                Judges
              </th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium text-xs uppercase">
                Percentile
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((person, idx) => (
              <tr
                key={person.person_id}
                className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              >
                {/* Rank */}
                <td className="py-3 px-4">
                  <RankBadge rank={idx + 1} />
                </td>

                {/* Person name */}
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900 text-xs truncate max-w-[180px]">
                    {person.name}
                  </p>
                </td>

                {/* Raw average */}
                <td className="py-3 px-4 text-center">
                  <span className="text-sm text-gray-700">
                    {person.raw_average.toFixed(2)}
                  </span>
                </td>

                {/* Weighted average */}
                <td className="py-3 px-4 text-center">
                  <span className="text-sm font-bold text-gray-900">
                    {person.weighted_average.toFixed(2)}
                  </span>
                </td>

                {/* Impact badge */}
                <td className="py-3 px-4 text-center">
                  <ImpactBadge impact={person.credibility_impact} />
                </td>

                {/* Judge count */}
                <td className="py-3 px-4 text-center text-xs text-gray-500">
                  {person.evaluator_count}
                </td>

                {/* Percentile */}
                <td className="py-3 px-4 text-center">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      person.percentile >= 75
                        ? "bg-green-100 text-green-700"
                        : person.percentile >= 50
                          ? "bg-blue-100 text-blue-700"
                          : person.percentile >= 25
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                    }`}
                  >
                    P{person.percentile}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: RankBadge — Color-coded ranking circle
// ============================================================
const RankBadge = ({ rank }) => {
  const colorMap = {
    1: "bg-yellow-100 text-yellow-800 border-yellow-300",
    2: "bg-gray-100 text-gray-700 border-gray-300",
    3: "bg-orange-100 text-orange-800 border-orange-300",
  };
  const cls = colorMap[rank] || "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center
                  text-[10px] font-bold border ${cls}`}
    >
      {rank}
    </div>
  );
};

export default ComparisonView;
