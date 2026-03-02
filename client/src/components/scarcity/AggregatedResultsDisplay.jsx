// ============================================================
// AGGREGATED RESULTS DISPLAY — Scarcity Evaluation Results UI
// ============================================================
// Rich, sortable table for viewing aggregated evaluation results.
// Designed for admin review and transparent reporting.
//
// FEATURES:
//   - Sortable results table (mean, variance, consensus, zeros)
//   - Summary / Detailed view modes
//   - Consensus color coding (PERFECT → SPLIT)
//   - Zero semantic labels with color chips
//   - Distribution quartile display (Q1 / Median / Q3)
//   - Interpretation guide / legend
//
// SRS REFERENCES:
//   4.2.3 — Semantic zero analysis (NO_ZEROS … UNANIMOUS_ZERO)
//   4.2.4 — Consensus scoring and categorization
//   8.2   — Transparency: rules visible, individual judgments private
//
// DEPENDENCIES:
//   - scarcityApi (getGovernanceResults)
//   - lucide-react (icons)
//   - tailwindcss (styling)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getGovernanceResults } from "../../services/scarcityApi";

// ============================================================
// CONSTANTS: Color mappings for semantic categories
// ============================================================

// Consensus category → Tailwind classes + description
const CONSENSUS_COLORS = {
  PERFECT: {
    bg: "bg-green-100",
    text: "text-green-800",
    desc: "All evaluators agree",
  },
  HIGH: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    desc: "Strong agreement",
  },
  MODERATE: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    desc: "Reasonable agreement",
  },
  LOW: { bg: "bg-orange-100", text: "text-orange-800", desc: "Weak agreement" },
  SPLIT: { bg: "bg-red-100", text: "text-red-800", desc: "Major disagreement" },
};

// Zero semantic → Tailwind classes + description
const ZERO_SEMANTIC_COLORS = {
  NO_ZEROS: {
    bg: "bg-green-100",
    text: "text-green-800",
    desc: "All evaluators allocated points",
  },
  MINORITY_ZERO: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    desc: "< 30% gave zero",
  },
  PLURALITY_ZERO: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    desc: "30–50% gave zero",
  },
  MAJORITY_ZERO: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    desc: "> 50% gave zero",
  },
  UNANIMOUS_ZERO: {
    bg: "bg-red-100",
    text: "text-red-800",
    desc: "All evaluators gave zero",
  },
};

// ============================================================
// MAIN COMPONENT: AggregatedResultsDisplay
// ============================================================
// Props:
//   sessionId {string} — UUID of the evaluation session
//   viewMode  {string} — "summary" | "detailed" (default: "summary")
// ============================================================
const AggregatedResultsDisplay = ({
  sessionId,
  viewMode: initialViewMode = "summary",
}) => {
  // ── State ──
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [sortField, setSortField] = useState("mean_score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [showGuide, setShowGuide] = useState(false);

  // ── Fetch results from governance endpoint ──
  const loadResults = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const response = await getGovernanceResults(
        sessionId,
        viewMode === "detailed" ? "detailed" : "summary",
        false,
      );
      if (response.success) {
        setData(response.data);
      }
    } catch (err) {
      setError(err.message || "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [sessionId, viewMode]);

  // Reload when session or view mode changes
  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // ── Sort handler ──
  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle direction on same field
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // ── Sort results ──
  const getSortedTargets = () => {
    if (!data?.targets) return [];
    const targets = [...data.targets];
    targets.sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    return targets;
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-gray-200 h-12 rounded-lg"></div>
        <div className="bg-gray-200 h-64 rounded-lg"></div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // ── No data ──
  if (!data) return null;

  const sortedTargets = getSortedTargets();

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────── */}
      {/* HEADER: Title + View Mode Toggle                 */}
      {/* ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              Aggregated Results
            </h2>
          </div>

          {/* View mode toggle + legend toggle */}
          <div className="flex items-center gap-2">
            {/* Summary / Detailed toggle */}
            <div className="bg-gray-100 rounded-lg p-1 flex">
              <button
                onClick={() => setViewMode("summary")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "summary"
                    ? "bg-white shadow text-gray-900"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setViewMode("detailed")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "detailed"
                    ? "bg-white shadow text-gray-900"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Detailed
              </button>
            </div>

            {/* Legend toggle */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Interpretation guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Session insights row */}
        {data.insights && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <InsightCard
              label="Targets"
              value={data.insights.targetCount}
              color="purple"
            />
            <InsightCard
              label="Avg Consensus"
              value={`${((data.insights.averageConsensus ?? 0) * 100).toFixed(0)}%`}
              color="green"
            />
            <InsightCard
              label="Total Zeros"
              value={data.insights.totalZeros ?? 0}
              color="blue"
            />
            <InsightCard
              label="Avg Evaluators"
              value={(data.insights.averageEvaluators ?? 0).toFixed(1)}
              color="yellow"
            />
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* INTERPRETATION GUIDE (collapsible)               */}
      {/* ──────────────────────────────────────────────── */}
      {showGuide && <InterpretationGuide />}

      {/* ──────────────────────────────────────────────── */}
      {/* RESULTS TABLE                                    */}
      {/* ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Table header */}
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  Target
                </th>
                <SortHeader
                  label="Mean"
                  field="mean_score"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                {/* Show extra columns in detailed mode */}
                {viewMode === "detailed" && (
                  <>
                    <SortHeader
                      label="Median"
                      field="median"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                      Distribution (Q1/Med/Q3)
                    </th>
                  </>
                )}
                <SortHeader
                  label="Variance"
                  field="variance"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Consensus"
                  field="consensus_score"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Zeros"
                  field="zero_count"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  Zero Semantic
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  Evaluators
                </th>
              </tr>
            </thead>

            {/* Table body */}
            <tbody className="divide-y divide-gray-100">
              {sortedTargets.map((target) => (
                <TargetRow
                  key={target.target_id}
                  target={target}
                  viewMode={viewMode}
                />
              ))}
            </tbody>
          </table>

          {/* Empty state */}
          {sortedTargets.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No aggregated results available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: SortHeader
// ============================================================
// Clickable column header with sort indicator arrows.
// ============================================================
const SortHeader = ({ label, field, sortField, sortDirection, onSort }) => (
  <th
    className="px-4 py-3 text-center text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none transition-colors"
    onClick={() => onSort(field)}
  >
    <div className="flex items-center justify-center gap-1">
      {label}
      {sortField === field ? (
        sortDirection === "asc" ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 text-gray-400" />
      )}
    </div>
  </th>
);

// ============================================================
// SUB-COMPONENT: TargetRow
// ============================================================
// A single row in the results table for one evaluation target.
// ============================================================
const TargetRow = ({ target, viewMode }) => {
  // Expand/collapse for detailed raw allocations
  const [expanded, setExpanded] = useState(false);

  // Extract consensus styling
  const consensusStyle =
    CONSENSUS_COLORS[target.consensus_category] || CONSENSUS_COLORS.MODERATE;

  // Extract zero semantic styling
  const zeroStyle =
    ZERO_SEMANTIC_COLORS[target.zero_semantic] || ZERO_SEMANTIC_COLORS.NO_ZEROS;

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        {/* Target name / ID */}
        <td className="px-4 py-3 text-sm font-medium text-gray-900">
          <div className="flex items-center gap-2">
            {/* Expand/collapse toggle in detailed mode */}
            {viewMode === "detailed" && target.rawAllocations && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-gray-400 hover:text-gray-600"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
            <span className="truncate max-w-[200px]">
              {target.target_name || target.target_id}
            </span>
          </div>
        </td>

        {/* Mean score */}
        <td className="px-4 py-3 text-center text-sm font-bold">
          {(target.mean_score ?? 0).toFixed(2)}
        </td>

        {/* Detailed columns */}
        {viewMode === "detailed" && (
          <>
            {/* Median */}
            <td className="px-4 py-3 text-center text-sm">
              {(target.median ?? 0).toFixed(2)}
            </td>

            {/* Distribution bar (Q1 / Median / Q3) */}
            <td className="px-4 py-3">
              <DistributionBar target={target} />
            </td>
          </>
        )}

        {/* Variance */}
        <td className="px-4 py-3 text-center text-sm">
          {(target.variance ?? 0).toFixed(3)}
        </td>

        {/* Consensus score + category badge */}
        <td className="px-4 py-3 text-center">
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium">
              {((target.consensus_score ?? 0) * 100).toFixed(0)}%
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${consensusStyle.bg} ${consensusStyle.text}`}
            >
              {target.consensus_category}
            </span>
          </div>
        </td>

        {/* Zero count */}
        <td className="px-4 py-3 text-center text-sm">
          {target.zero_count ?? 0}
          <span className="text-gray-400 text-xs ml-1">
            ({((target.zero_ratio ?? 0) * 100).toFixed(0)}%)
          </span>
        </td>

        {/* Zero semantic badge */}
        <td className="px-4 py-3 text-center">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${zeroStyle.bg} ${zeroStyle.text}`}
          >
            {target.zero_semantic?.replace(/_/g, " ")}
          </span>
        </td>

        {/* Evaluator count */}
        <td className="px-4 py-3 text-center text-sm">
          {target.evaluator_count}
        </td>
      </tr>

      {/* Expanded raw allocations (detailed mode) */}
      {expanded && target.rawAllocations && (
        <tr>
          <td colSpan={viewMode === "detailed" ? 9 : 7} className="bg-gray-50">
            <div className="px-6 py-3">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Individual Allocations (anonymized)
              </div>
              <div className="flex flex-wrap gap-2">
                {target.rawAllocations.map((alloc, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded text-xs font-mono ${
                      alloc.points === 0
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {alloc.points}
                  </span>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ============================================================
// SUB-COMPONENT: DistributionBar
// ============================================================
// Visual representation of Q1 / Median / Q3 spread relative to
// the min–max range of the target's allocations.
// ============================================================
const DistributionBar = ({ target }) => {
  const min = target.min_score ?? 0;
  const max = target.max_score ?? 0;
  const range = max - min || 1; // avoid division by zero

  // Calculate positions as percentages
  const q1Pct = ((target.q1 ?? min) - min) / range;
  const medianPct = ((target.median ?? min) - min) / range;
  const q3Pct = ((target.q3 ?? max) - min) / range;

  return (
    <div className="flex items-center gap-2">
      {/* Min label */}
      <span className="text-xs text-gray-500 w-8 text-right">
        {min.toFixed(1)}
      </span>

      {/* Visual bar */}
      <div className="flex-grow h-4 bg-gray-200 rounded relative">
        {/* IQR range (Q1 to Q3) */}
        <div
          className="absolute h-full bg-blue-200 rounded"
          style={{
            left: `${q1Pct * 100}%`,
            width: `${(q3Pct - q1Pct) * 100}%`,
          }}
        />
        {/* Median marker */}
        <div
          className="absolute w-0.5 h-full bg-blue-600"
          style={{ left: `${medianPct * 100}%` }}
        />
      </div>

      {/* Max label */}
      <span className="text-xs text-gray-500 w-8">{max.toFixed(1)}</span>
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: InsightCard
// ============================================================
// Small metric card for session-level insights.
// ============================================================
const InsightCard = ({ label, value, color }) => {
  const bg = `bg-${color}-50`;
  const textColor = `text-${color}-700`;

  return (
    <div className={`${bg} p-3 rounded-lg`}>
      <div className={`text-sm ${textColor}`}>{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: InterpretationGuide
// ============================================================
// Collapsible legend explaining consensus + zero semantic colors.
// ============================================================
const InterpretationGuide = () => (
  <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
      <HelpCircle className="w-5 h-5 text-gray-500" />
      Interpretation Guide
    </h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Consensus categories */}
      <div>
        <h4 className="text-sm font-semibold text-gray-600 mb-2">
          Consensus Categories
        </h4>
        <div className="space-y-2">
          {Object.entries(CONSENSUS_COLORS).map(([key, style]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
              >
                {key}
              </span>
              <span className="text-sm text-gray-600">{style.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zero semantics */}
      <div>
        <h4 className="text-sm font-semibold text-gray-600 mb-2">
          Zero Semantics
        </h4>
        <div className="space-y-2">
          {Object.entries(ZERO_SEMANTIC_COLORS).map(([key, style]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
              >
                {key.replace(/_/g, " ")}
              </span>
              <span className="text-sm text-gray-600">{style.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Key metric explanations */}
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h4 className="text-sm font-semibold text-gray-600 mb-2">Key Metrics</h4>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="font-medium text-gray-700">Variance</dt>
          <dd className="text-gray-500">
            How much evaluators disagree. Lower = more agreement.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-700">Consensus Score</dt>
          <dd className="text-gray-500">
            0–1 scale. 1.0 = perfect agreement among all evaluators.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-700">
            Distribution (Q1/Med/Q3)
          </dt>
          <dd className="text-gray-500">
            Blue bar = middle 50% of scores. Line = median value.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-gray-700">Zero Ratio</dt>
          <dd className="text-gray-500">
            Percentage of evaluators who allocated zero points.
          </dd>
        </div>
      </dl>
    </div>
  </div>
);

export default AggregatedResultsDisplay;
