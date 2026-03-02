// ============================================================
// RESULTS DISPLAY — Aggregated Session Evaluation Results
// ============================================================
// Renders the statistical output of the Step 4 Aggregation Engine.
// Three view modes:
//   1. Summary Table — ranked targets with mean, range, consensus
//   2. Distribution  — visual breakdown of score distribution
//   3. Detailed View — expandable per-target deep-dive
//
// Data is fetched from:
//   GET /api/scarcity/sessions/:sessionId/results
//
// Stateless component — all data fetched on mount via sessionId prop.
// No writes — this is a READ-ONLY results display.
//
// SRS 4.2.2: Aggregated results presentation
// ============================================================

// React core
import React, { useState, useEffect, useCallback } from "react";

// Router hooks for URL params and navigation
import { useParams, useNavigate } from "react-router-dom";

// API service for aggregation results
import {
  getSessionResults,
  getTargetResults,
} from "../../services/scarcityApi";

// Lucide icons for visual elements
import {
  ArrowLeft,
  BarChart3,
  Users,
  Target,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Award,
  Minus,
  Info,
  Scale,
} from "lucide-react";

// Route constants for navigation
import { ROUTES } from "../../utils/constants";

// ============================================================
// HELPER FUNCTIONS — Pure math on the results array
// ============================================================

/**
 * Compute the overall average mean across all targets.
 * @param {Object[]} results — result rows from the API
 * @returns {number}
 */
const calcAvgMean = (results) => {
  if (!results || results.length === 0) return 0;
  const sum = results.reduce((t, r) => t + (r.meanScore || 0), 0);
  return sum / results.length;
};

/**
 * Compute the overall average consensus across all targets.
 * @param {Object[]} results
 * @returns {number}
 */
const calcAvgConsensus = (results) => {
  if (!results || results.length === 0) return 0;
  const sum = results.reduce((t, r) => t + (r.consensusScore || 0), 0);
  return sum / results.length;
};

/**
 * Count total zero allocations across all targets.
 * @param {Object[]} results
 * @returns {number}
 */
const calcTotalZeros = (results) => {
  if (!results || results.length === 0) return 0;
  return results.reduce((t, r) => t + (r.zeroCount || 0), 0);
};

// ============================================================
// RANK BADGE — Color-coded ranking circle
// ============================================================
const RankBadge = ({ rank }) => {
  // Top 3 get special colours — gold, silver, bronze
  const colorMap = {
    1: "bg-yellow-100 text-yellow-800 border-yellow-300",
    2: "bg-gray-100 text-gray-700 border-gray-300",
    3: "bg-orange-100 text-orange-800 border-orange-300",
  };

  // Default: muted blue for ranks beyond 3
  const cls = colorMap[rank] || "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center
                  text-xs font-bold border ${cls}`}
    >
      {rank}
    </div>
  );
};

// ============================================================
// CONSENSUS BAR — Visual progress bar for consensus score
// ============================================================
const ConsensusBar = ({ score }) => {
  // Colour breakpoints: green > 0.7, amber > 0.4, red otherwise
  const pct = Math.round((score || 0) * 100);
  const barColor =
    score > 0.7 ? "bg-green-500" : score > 0.4 ? "bg-amber-500" : "bg-red-500";
  const trackColor =
    score > 0.7 ? "bg-green-100" : score > 0.4 ? "bg-amber-100" : "bg-red-100";

  return (
    <div className="flex items-center gap-2">
      {/* Track */}
      <div className={`w-16 h-2 rounded-full ${trackColor} overflow-hidden`}>
        {/* Fill */}
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Percentage label */}
      <span className="text-xs font-medium text-gray-600">{pct}%</span>
    </div>
  );
};

// ============================================================
// SUMMARY TABLE VIEW — Ranked targets with core metrics
// ============================================================
const SummaryTable = ({ results, poolSize }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 overflow-hidden">
    <table className="w-full text-sm">
      {/* Column headers */}
      <thead>
        <tr className="bg-gray-50/80 border-b border-gray-100">
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Rank
          </th>
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Target
          </th>
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Mean Score
          </th>
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Range
          </th>
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Consensus
          </th>
          <th className="text-left py-3 px-4 text-gray-500 font-medium text-xs uppercase">
            Judges
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((row, idx) => (
          <tr
            key={row.targetId}
            className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
          >
            {/* Rank badge */}
            <td className="py-3 px-4">
              <RankBadge rank={idx + 1} />
            </td>

            {/* Target ID (truncated) */}
            <td className="py-3 px-4">
              <p className="font-medium text-gray-900 text-xs">
                {row.targetName ||
                  `Target ${(row.targetId || "").substring(0, 8)}...`}
              </p>
              {/* Edge-case flag if present */}
              {row.edgeCaseFlag && (
                <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                  {row.edgeCaseFlag}
                </span>
              )}
            </td>

            {/* Mean score with min/max subtitle */}
            <td className="py-3 px-4">
              <p className="text-lg font-bold text-gray-900">
                {(row.meanScore || 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-gray-400">
                Min {(row.minScore || 0).toFixed(1)} · Max{" "}
                {(row.maxScore || 0).toFixed(1)}
              </p>
            </td>

            {/* Range bar */}
            <td className="py-3 px-4">
              <div className="flex items-center gap-2">
                {/* Visual range bar */}
                <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                    style={{
                      width: `${poolSize ? ((row.range || 0) / poolSize) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {(row.range || 0).toFixed(1)}
                </span>
              </div>
            </td>

            {/* Consensus indicator */}
            <td className="py-3 px-4">
              <ConsensusBar score={row.consensusScore} />
            </td>

            {/* Judge count */}
            <td className="py-3 px-4 text-xs text-gray-500">
              {row.judgeCount || 0} judges
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ============================================================
// DISTRIBUTION VIEW — Per-target horizontal score bars
// ============================================================
const DistributionView = ({ results, poolSize }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6 space-y-4">
    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
      <BarChart3 className="h-4 w-4 text-blue-500" />
      Score Distribution Across Targets
    </h3>

    {results.map((row, idx) => {
      // Mean as percentage of pool size
      const meanPct = poolSize ? ((row.meanScore || 0) / poolSize) * 100 : 0;
      // Range band position
      const minPct = poolSize ? ((row.minScore || 0) / poolSize) * 100 : 0;
      const maxPct = poolSize ? ((row.maxScore || 0) / poolSize) * 100 : 0;

      return (
        <div key={row.targetId} className="space-y-1">
          {/* Target label + mean */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-medium">
              #{idx + 1}{" "}
              {row.targetName ||
                `Target ${(row.targetId || "").substring(0, 8)}`}
            </span>
            <span className="font-bold text-gray-800">
              {(row.meanScore || 0).toFixed(2)}
            </span>
          </div>

          {/* Horizontal bar with range overlay */}
          <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
            {/* Range band (min to max) — lighter background */}
            <div
              className="absolute top-0 h-full bg-blue-100 rounded-full"
              style={{
                left: `${minPct}%`,
                width: `${Math.max(maxPct - minPct, 1)}%`,
              }}
            />
            {/* Mean indicator — solid bar */}
            <div
              className="absolute top-0 h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${meanPct}%` }}
            />
            {/* Mean label inside bar */}
            {meanPct > 15 && (
              <span className="absolute left-2 top-0.5 text-[10px] font-bold text-white">
                {(row.meanScore || 0).toFixed(1)}
              </span>
            )}
          </div>

          {/* Zero count note */}
          {(row.zeroCount || 0) > 0 && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1">
              <Minus className="h-3 w-3" />
              {row.zeroCount} zero allocation{row.zeroCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      );
    })}
  </div>
);

// ============================================================
// DETAILED VIEW — Expandable per-target deep-dive
// ============================================================
const DetailedView = ({ results, sessionId }) => {
  // Track which target's detail panel is expanded
  const [expanded, setExpanded] = useState(null);
  // Detail data fetched on demand
  const [detail, setDetail] = useState(null);
  // Loading flag for detail fetch
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * Toggle a target's detail panel.
   * Fetches full per-target data from the backend on first expand.
   */
  const toggle = async (targetId) => {
    // Collapse if already expanded
    if (expanded === targetId) {
      setExpanded(null);
      return;
    }

    setExpanded(targetId);
    setDetailLoading(true);

    try {
      // Fetch detailed per-target results from backend
      const resp = await getTargetResults(sessionId, targetId);
      setDetail(resp.data || resp);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {results.map((row) => {
        const isOpen = expanded === row.targetId;

        return (
          <div
            key={row.targetId}
            className="bg-white rounded-xl border border-gray-200/50 shadow-sm overflow-hidden"
          >
            {/* Clickable header row */}
            <button
              onClick={() => toggle(row.targetId)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {row.targetName ||
                    `Target ${(row.targetId || "").substring(0, 8)}...`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Mean: {(row.meanScore || 0).toFixed(2)} · Variance:{" "}
                  {(row.variance || 0).toFixed(3)}
                </p>
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            {/* Expanded detail panel */}
            {isOpen && (
              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/50">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                    <span className="ml-2 text-sm text-gray-500">
                      Loading details...
                    </span>
                  </div>
                ) : detail ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Statistics column */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-gray-500 uppercase">
                        Statistics
                      </h5>
                      {[
                        ["Mean", detail.statistics?.mean],
                        ["Median", detail.statistics?.median],
                        ["Std Dev", detail.statistics?.stdDev],
                        ["Variance", detail.statistics?.variance],
                        ["Skewness", detail.statistics?.skewness],
                        ["Kurtosis", detail.statistics?.kurtosis],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="flex justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100"
                        >
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium text-gray-800">
                            {val != null ? Number(val).toFixed(3) : "N/A"}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Distribution column */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-gray-500 uppercase">
                        Distribution
                      </h5>
                      {[
                        ["Judge Count", detail.distribution?.judgeCount],
                        ["Zero Allocations", detail.distribution?.zeroCount],
                        [
                          "Consensus",
                          detail.distribution?.consensusScore != null
                            ? `${(detail.distribution.consensusScore * 100).toFixed(0)}%`
                            : null,
                        ],
                        [
                          "Edge Case",
                          detail.distribution?.edgeCaseFlag || "None",
                        ],
                      ].map(([label, val]) => (
                        <div
                          key={label}
                          className="flex justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100"
                        >
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium text-gray-800">
                            {val ?? "N/A"}
                          </span>
                        </div>
                      ))}

                      {/* Raw allocations list */}
                      {detail.allocations && detail.allocations.length > 0 && (
                        <div className="mt-3">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                            Raw Allocations ({detail.allocations.length})
                          </h5>
                          {detail.allocations.map((a, i) => (
                            <div
                              key={i}
                              className="flex justify-between text-xs bg-white rounded-lg px-3 py-1.5 border border-gray-100 mb-1"
                            >
                              <span className="text-gray-500">
                                Evaluator{" "}
                                {(a.evaluatorId || "").substring(0, 6)}...
                              </span>
                              <span className="font-bold text-gray-800">
                                {a.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-3">
                    Failed to load details
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================
// MAIN COMPONENT: ResultsDisplay
// ============================================================
/**
 * Top-level aggregation results viewer.
 * Fetches session results on mount, provides 3 view modes.
 *
 * @param {Object} props
 * @param {string} props.sessionId — UUID of the evaluation session
 */
const ResultsDisplay = ({ sessionId: propSessionId }) => {
  // Get sessionId from URL params if not passed as prop
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const sessionId = propSessionId || routeSessionId;
  // ---------------------------------------------------------
  // STATE
  // ---------------------------------------------------------

  // Full results payload from backend
  const [data, setData] = useState(null);

  // Loading flag
  const [loading, setLoading] = useState(true);

  // Error message
  const [error, setError] = useState(null);

  // Active view mode: 'summary' | 'distribution' | 'detailed'
  const [viewMode, setViewMode] = useState("summary");

  // ---------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch aggregated results from the backend
      const resp = await getSessionResults(sessionId, false);

      // Store the payload — handles both { data: { ... } } and flat shapes
      setData(resp.data || resp);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Failed to load results",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Fetch on mount and when sessionId changes
  useEffect(() => {
    if (sessionId) loadResults();
  }, [sessionId, loadResults]);

  // ---------------------------------------------------------
  // LOADING STATE
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-gray-500">
          Loading aggregation results...
        </span>
      </div>
    );
  }

  // ---------------------------------------------------------
  // ERROR STATE
  // ---------------------------------------------------------
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">Error:</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // EMPTY STATE
  // ---------------------------------------------------------
  if (!data || !data.results || data.results.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No evaluation results available</p>
        <p className="text-xs mt-1">Results appear after the session closes</p>
      </div>
    );
  }

  // Sort results by mean score descending (highest first)
  const sorted = [...data.results].sort(
    (a, b) => (b.meanScore || 0) - (a.meanScore || 0),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Back navigation */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="space-y-6">
          {/* ====================================================== */}
          {/* SESSION HEADER — Summary stats cards */}
          {/* ====================================================== */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            {/* Title row */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Aggregation Results
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.sessionType || "Evaluation"} · {data.intent || ""}
                  {data.isLive && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                      Live
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Evaluator count */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  {data.totalEvaluators || 0} evaluators
                </div>
                {/* Target count */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Target className="h-3.5 w-3.5" />
                  {data.totalTargets || 0} targets
                </div>
                {/* Refresh button */}
                <button
                  onClick={loadResults}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Refresh results"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {/* View Weighted Results — navigate to Step 5 dashboard */}
                <button
                  onClick={() =>
                    navigate(
                      ROUTES.WEIGHTED_RESULTS.replace(":sessionId", sessionId),
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-purple-700 bg-purple-50 border border-purple-200/50
                             rounded-lg hover:bg-purple-100 transition-colors"
                  title="View credibility-weighted results (Step 5)"
                >
                  <Scale className="h-3.5 w-3.5" />
                  Weighted Results
                </button>
              </div>
            </div>

            {/* Stats cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Pool Size */}
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 font-medium">
                  Pool Size
                </p>
                <p className="text-xl font-bold text-blue-900">
                  {data.poolSize || "—"}
                </p>
                <p className="text-[10px] text-blue-500">
                  Total points per evaluator
                </p>
              </div>

              {/* Average Mean */}
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-[11px] text-green-700 font-medium">
                  Avg Score
                </p>
                <p className="text-xl font-bold text-green-900">
                  {calcAvgMean(sorted).toFixed(2)}
                </p>
                <p className="text-[10px] text-green-500">Across all targets</p>
              </div>

              {/* Average Consensus */}
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-[11px] text-purple-700 font-medium">
                  Avg Consensus
                </p>
                <p className="text-xl font-bold text-purple-900">
                  {(calcAvgConsensus(sorted) * 100).toFixed(0)}%
                </p>
                <p className="text-[10px] text-purple-500">
                  Evaluator agreement
                </p>
              </div>

              {/* Zero Allocations */}
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-[11px] text-amber-700 font-medium">
                  Zero Allocs
                </p>
                <p className="text-xl font-bold text-amber-900">
                  {calcTotalZeros(sorted)}
                </p>
                <p className="text-[10px] text-amber-500">Across all targets</p>
              </div>
            </div>
          </div>

          {/* ====================================================== */}
          {/* VIEW MODE TABS */}
          {/* ====================================================== */}
          <div className="flex gap-1 bg-white rounded-xl shadow-sm border border-gray-200/50 p-1">
            {[
              { id: "summary", label: "Summary Table" },
              { id: "distribution", label: "Distribution" },
              { id: "detailed", label: "Detailed View" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                  viewMode === tab.id
                    ? "bg-blue-50 text-blue-700 border border-blue-200/50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ====================================================== */}
          {/* VIEW CONTENT — Renders active view mode */}
          {/* ====================================================== */}
          {viewMode === "summary" && (
            <SummaryTable results={sorted} poolSize={data.poolSize} />
          )}

          {viewMode === "distribution" && (
            <DistributionView results={sorted} poolSize={data.poolSize} />
          )}

          {viewMode === "detailed" && (
            <DetailedView results={sorted} sessionId={sessionId} />
          )}

          {/* ====================================================== */}
          {/* FOOTER NOTE */}
          {/* ====================================================== */}
          <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Raw aggregated results (Step 4).{" "}
              <button
                onClick={() =>
                  navigate(
                    ROUTES.WEIGHTED_RESULTS.replace(":sessionId", sessionId),
                  )
                }
                className="text-purple-500 hover:text-purple-700 underline underline-offset-2"
              >
                View credibility-weighted results (Step 5)
              </button>{" "}
              for final scores adjusted by evaluator credibility.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

// ============================================================
// Export ResultsDisplay for use in ScarcityEvaluationPage
// ============================================================
export default ResultsDisplay;
