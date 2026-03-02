// ============================================================
// WEIGHTED RESULTS DASHBOARD — Multi-Judge Credibility-Weighted UI
// ============================================================
// Top-level component for displaying credibility-weighted
// aggregation results. Provides three view modes:
//   1. Comparison — Side-by-side raw vs weighted bars + impact
//   2. Detailed   — Per-person deep-dive with evaluator breakdown
//   3. Evaluator  — Evaluator credibility profiles + influence
//
// Data is fetched from:
//   GET /api/scarcity/sessions/:sessionId/weighted-results
//
// SRS 4.2.2: "Final score per person = credibility-weighted average"
//
// COMPONENT TREE:
//   WeightedResultsDashboard
//   ├── DashboardHeader (session info + controls)
//   ├── SummaryCards (top-level metric cards)
//   ├── ComparisonView (raw vs weighted bar chart)
//   ├── DetailedBreakdown (per-person expandable cards)
//   ├── EvaluatorInsightsPanel (evaluator credibility analysis)
//   ├── CredibilityImpactChart (impact visualization)
//   ├── ScoreDistributionChart (histogram per person)
//   ├── ConsensusMeter (agreement gauge)
//   └── ExportDropdown (CSV/JSON export)
//
// DEPENDENCIES:
//   - scarcityApi (getWeightedSessionResults)
//   - lucide-react (icons)
//   - tailwindcss (styling)
//
// RESPONSIVE: Mobile-first, breakpoints at sm/md/lg/xl
// ACCESSIBILITY: ARIA labels, keyboard navigation, focus management
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

// API service for weighted results
import { getWeightedSessionResults } from "../../services/scarcityApi";

// Sub-components (original weighted views)
import ComparisonView from "./weighted/ComparisonView";
import DetailedBreakdown from "./weighted/DetailedBreakdown";
import EvaluatorInsightsPanel from "./weighted/EvaluatorInsightsPanel";
import CredibilityImpactChart from "./weighted/CredibilityImpactChart";
import ConsensusMeter from "./weighted/ConsensusMeter";
import ExportDropdown from "./weighted/ExportDropdown";

// Showcase components (visual impact — Part 4.5)
import CredibilityHero from "./showcase/CredibilityHero";
import ComparisonDashboard from "./showcase/ComparisonDashboard";
import ProfessionalReport from "./showcase/ProfessionalReport";

// Route constants
import { ROUTES } from "../../utils/constants";

// Lucide icons for visual elements
import {
  ArrowLeft,
  BarChart3,
  Users,
  Target,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertCircle,
  RefreshCw,
  Loader2,
  Info,
  Shield,
  Activity,
  Eye,
  Sparkles,
  FileText,
} from "lucide-react";

// ============================================================
// MAIN COMPONENT: WeightedResultsDashboard
// ============================================================
/**
 * Comprehensive display of multi-judge weighted results.
 * Fetches enriched data from the backend weighted-results endpoint
 * and renders it through multiple specialized view components.
 *
 * BUSINESS CONTEXT: This is the "final destination" view for evaluation
 * results. It shows how credibility weighting affects scores compared
 * to naive averaging, making the SRS 4.2.2 requirement visible to users.
 *
 * @param {Object} props
 * @param {string} [props.sessionId] — UUID of the evaluation session
 *   If not provided, reads from URL params (:sessionId)
 */
const WeightedResultsDashboard = ({ sessionId: propSessionId }) => {
  // Get sessionId from URL params if not passed as prop
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const sessionId = propSessionId || routeSessionId;

  // Ref for chart container (used by ProfessionalReport for PDF capture)
  const chartContainerRef = useRef(null);

  // ─────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────

  // Full weighted results payload from backend
  const [data, setData] = useState(null);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Error message
  const [error, setError] = useState(null);

  // Active view mode: 'comparison' | 'detailed' | 'evaluator'
  const [viewMode, setViewMode] = useState("comparison");

  // ─────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────
  /**
   * Fetch enriched weighted results from the backend.
   * The 'detailed' view param returns the most complete data,
   * which is then filtered client-side for each view mode.
   */
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch with 'detailed' view to get all data in one request
      const resp = await getWeightedSessionResults(sessionId, "detailed");

      // Store the payload (handles both { data: {...} } and direct shapes)
      setData(resp.data || resp);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Failed to load weighted results",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Fetch on mount and when sessionId changes
  useEffect(() => {
    if (sessionId) loadResults();
  }, [sessionId, loadResults]);

  // ─────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin mx-auto" />
          <p className="mt-4 text-sm text-gray-500">
            Computing credibility-weighted results...
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // ERROR STATE
  // ─────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-3 text-red-700">
            <AlertCircle className="h-6 w-6 flex-shrink-0" />
            <div>
              <p className="font-semibold">Error Loading Weighted Results</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={loadResults}
            className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // EMPTY STATE — No weighted data available
  // ─────────────────────────────────────────────────────
  if (!data || !data.person_results || data.person_results.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <Scale className="h-14 w-14 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">
            No Weighted Results Available
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Credibility-weighted results will appear here after the credibility
            engine has processed this session. Run credibility processing from
            the admin dashboard first.
          </p>
          {!data?.has_weighted_data && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 inline-block">
              <Info className="h-4 w-4 inline mr-1" />
              Credibility processing has not been run for this session yet.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Destructure data for convenient access
  const {
    session,
    summary,
    person_results,
    evaluator_analysis,
    visualization_data,
  } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ====================================================== */}
        {/* BACK NAVIGATION                                         */}
        {/* ====================================================== */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
          aria-label="Go back to previous page"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="space-y-6">
          {/* ====================================================== */}
          {/* CREDIBILITY HERO — Eye-catching impact banner (Part 4.5) */}
          {/* ====================================================== */}
          <CredibilityHero
            summary={summary}
            personResults={person_results}
            evaluatorAnalysis={evaluator_analysis}
            poolSize={session?.pool_size}
          />

          {/* ====================================================== */}
          {/* DASHBOARD HEADER — Session info + summary cards         */}
          {/* ====================================================== */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            {/* Title row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Credibility-Weighted Results
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {session?.type || "Evaluation"} · {session?.intent || ""}
                  {session?.submission_complete && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                      Finalized
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Evaluator count badge */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  {session?.evaluator_count || 0} evaluators
                </div>
                {/* Target count badge */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Target className="h-3.5 w-3.5" />
                  {person_results.length} targets
                </div>
                {/* Export dropdown */}
                <ExportDropdown data={data} sessionId={sessionId} />
                {/* Showcase page link */}
                <Link
                  to={ROUTES.SHOWCASE.replace(":sessionId", sessionId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-blue-500
                             text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md
                             hover:from-purple-600 hover:to-blue-600 transition-all"
                  title="Open presentation-ready showcase"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Showcase
                </Link>
                {/* Refresh button */}
                <button
                  onClick={loadResults}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Refresh weighted results"
                  aria-label="Refresh weighted results"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ────────────────────────────────────────────────── */}
            {/* SUMMARY CARDS — Top-level metric cards             */}
            {/* ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Weighted Average */}
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-[11px] text-blue-700 font-medium">
                  Weighted Avg
                </p>
                <p className="text-xl font-bold text-blue-900">
                  {(summary?.weighted_average_across_all || 0).toFixed(2)}
                </p>
                <p className="text-[10px] text-blue-500">
                  Credibility-adjusted
                </p>
              </div>

              {/* Raw Average */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200/50">
                <p className="text-[11px] text-gray-600 font-medium">Raw Avg</p>
                <p className="text-xl font-bold text-gray-800">
                  {(summary?.raw_average_across_all || 0).toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-400">Simple average</p>
              </div>

              {/* Credibility Impact */}
              <div
                className={`rounded-xl p-3 ${
                  (summary?.average_credibility_impact || 0) >= 0
                    ? "bg-green-50"
                    : "bg-red-50"
                }`}
              >
                <p
                  className={`text-[11px] font-medium ${
                    (summary?.average_credibility_impact || 0) >= 0
                      ? "text-green-700"
                      : "text-red-700"
                  }`}
                >
                  Cred. Impact
                </p>
                <p
                  className={`text-xl font-bold flex items-center gap-1 ${
                    (summary?.average_credibility_impact || 0) >= 0
                      ? "text-green-900"
                      : "text-red-900"
                  }`}
                >
                  {(summary?.average_credibility_impact || 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {(summary?.average_credibility_impact || 0) > 0 ? "+" : ""}
                  {(summary?.average_credibility_impact || 0).toFixed(3)}
                </p>
                <p
                  className={`text-[10px] ${
                    (summary?.average_credibility_impact || 0) >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  Weighted − Raw shift
                </p>
              </div>

              {/* Consensus Level */}
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-[11px] text-purple-700 font-medium">
                  Consensus
                </p>
                <ConsensusMeter level={summary?.consensus_level || 0} compact />
                <p className="text-[10px] text-purple-500">
                  Evaluator agreement
                </p>
              </div>

              {/* Pool Size */}
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-[11px] text-amber-700 font-medium">
                  Pool Size
                </p>
                <p className="text-xl font-bold text-amber-900">
                  {session?.pool_size || "—"}
                </p>
                <p className="text-[10px] text-amber-500">
                  Points per evaluator
                </p>
              </div>
            </div>
          </div>

          {/* ====================================================== */}
          {/* VIEW MODE TABS                                          */}
          {/* ====================================================== */}
          <div
            className="flex flex-wrap gap-1 bg-white rounded-xl shadow-sm border border-gray-200/50 p-1"
            role="tablist"
            aria-label="Results view mode"
          >
            {[
              { id: "comparison", label: "Raw vs Weighted", icon: BarChart3 },
              { id: "detailed", label: "Detailed Breakdown", icon: Eye },
              { id: "evaluator", label: "Evaluator Insights", icon: Activity },
              { id: "charts", label: "Charts", icon: Sparkles },
              { id: "report", label: "Report", icon: FileText },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  role="tab"
                  aria-selected={viewMode === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    viewMode === tab.id
                      ? "bg-blue-50 text-blue-700 border border-blue-200/50"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ====================================================== */}
          {/* VIEW CONTENT — Renders active view mode                 */}
          {/* ====================================================== */}
          <div role="tabpanel" id={`tabpanel-${viewMode}`}>
            {viewMode === "comparison" && (
              <div className="space-y-6">
                {/* Comparison bar chart + table */}
                <ComparisonView
                  personResults={person_results}
                  visualization={visualization_data}
                  poolSize={session?.pool_size}
                />
                {/* Credibility impact chart */}
                <CredibilityImpactChart
                  visualization={visualization_data}
                  evaluatorAnalysis={evaluator_analysis}
                />
              </div>
            )}

            {viewMode === "detailed" && (
              <DetailedBreakdown
                personResults={person_results}
                evaluatorAnalysis={evaluator_analysis}
                poolSize={session?.pool_size}
              />
            )}

            {viewMode === "evaluator" && (
              <EvaluatorInsightsPanel
                evaluatorAnalysis={evaluator_analysis}
                summary={summary}
              />
            )}

            {/* ── Showcase: Chart.js Comparison ──────────── */}
            {viewMode === "charts" && (
              <div className="space-y-6" ref={chartContainerRef}>
                <ComparisonDashboard
                  personResults={person_results}
                  poolSize={session?.pool_size}
                />
              </div>
            )}

            {/* ── Showcase: Professional PDF Report ──────── */}
            {viewMode === "report" && (
              <ProfessionalReport
                session={session}
                summary={summary}
                personResults={person_results}
                evaluatorAnalysis={evaluator_analysis}
                chartContainerRef={chartContainerRef}
              />
            )}
          </div>

          {/* ====================================================== */}
          {/* FOOTER NOTE                                             */}
          {/* ====================================================== */}
          <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
            <Shield className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Credibility-weighted results. Higher credibility evaluators have
              more influence on final scores. Individual evaluator identities
              are kept private.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default WeightedResultsDashboard;
