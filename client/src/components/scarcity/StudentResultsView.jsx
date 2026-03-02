// ============================================================
// STUDENT RESULTS VIEW — Student Sees Own Evaluation Scores
// ============================================================
// Displays the authenticated student's scores from all sessions
// where they were a target. Shows per-session results with rank,
// mean score, and how they compare to the pool average.
//
// Route: /my-results
// Access: Student (protected)
// Data: GET /api/scarcity/sessions/my-results
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import {
  ArrowLeft,
  Award,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertCircle,
  RefreshCw,
  Target,
  Calendar,
  Star,
  ChevronRight,
} from "lucide-react";

// ============================================================
// StudentResultsView Component
// ============================================================
const StudentResultsView = () => {
  const navigate = useNavigate();

  // State
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---------------------------------------------------------
  // FETCH STUDENT'S OWN RESULTS
  // ---------------------------------------------------------
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch the student's own results from all sessions
      const response = await api.get("/scarcity/sessions/my-results");

      if (response.data?.success) {
        setResults(response.data.data || []);
      } else {
        setResults(response.data?.data || response.data || []);
      }
    } catch (err) {
      // If 404 or no data, just show empty state
      if (err.response?.status === 404) {
        setResults([]);
      } else {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load your results.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // ---------------------------------------------------------
  // HELPER: Trend indicator
  // ---------------------------------------------------------
  const getTrendIcon = (score, avgScore) => {
    if (!score || !avgScore)
      return <Minus className="h-3.5 w-3.5 text-gray-400" />;
    const diff = score - avgScore;
    if (diff > 1) return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
    if (diff < -1) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  };

  // ---------------------------------------------------------
  // HELPER: Rank badge color
  // ---------------------------------------------------------
  const getRankColor = (rank, total) => {
    if (rank === 1) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    if (rank === 2) return "bg-gray-100 text-gray-700 border-gray-300";
    if (rank === 3) return "bg-orange-100 text-orange-800 border-orange-300";
    if (rank <= Math.ceil(total * 0.25))
      return "bg-green-50 text-green-700 border-green-200";
    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  // ---------------------------------------------------------
  // HELPER: Performance label
  // ---------------------------------------------------------
  const getPerformanceLabel = (rank, total) => {
    if (!rank || !total) return { label: "N/A", color: "text-gray-400" };
    const pct = (rank / total) * 100;
    if (pct <= 10) return { label: "Outstanding", color: "text-yellow-600" };
    if (pct <= 25) return { label: "Excellent", color: "text-green-600" };
    if (pct <= 50) return { label: "Above Average", color: "text-blue-600" };
    if (pct <= 75) return { label: "Average", color: "text-gray-600" };
    return { label: "Needs Improvement", color: "text-amber-600" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* ====================================================== */}
        {/* PAGE HEADER */}
        {/* ====================================================== */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={loadResults}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Award className="h-7 w-7 text-indigo-600" />
            My Evaluation Results
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Your scores and rankings from completed evaluation sessions.
          </p>
        </div>

        {/* ====================================================== */}
        {/* LOADING STATE */}
        {/* ====================================================== */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading your results...</span>
          </div>
        )}

        {/* ====================================================== */}
        {/* ERROR STATE */}
        {/* ====================================================== */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800">{error}</span>
          </div>
        )}

        {/* ====================================================== */}
        {/* EMPTY STATE */}
        {/* ====================================================== */}
        {!loading && !error && results.length === 0 && (
          <div className="text-center py-16">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              No evaluation results yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Results will appear here once evaluation sessions you participate
              in are completed.
            </p>
          </div>
        )}

        {/* ====================================================== */}
        {/* RESULTS LIST */}
        {/* ====================================================== */}
        {!loading && !error && results.length > 0 && (
          <div className="space-y-4">
            {/* Summary stats at top */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4 text-center">
                <p className="text-xs text-gray-500 font-medium">Sessions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {results.length}
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4 text-center">
                <p className="text-xs text-gray-500 font-medium">Avg Score</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {results.length > 0
                    ? (
                        results.reduce((s, r) => s + (r.meanScore || 0), 0) /
                        results.length
                      ).toFixed(1)
                    : "—"}
                </p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4 text-center">
                <p className="text-xs text-gray-500 font-medium">Best Rank</p>
                <p className="text-2xl font-bold text-yellow-600">
                  #
                  {results.reduce(
                    (best, r) => Math.min(best, r.rank || 999),
                    999,
                  ) === 999
                    ? "—"
                    : results.reduce(
                        (best, r) => Math.min(best, r.rank || 999),
                        999,
                      )}
                </p>
              </div>
            </div>

            {/* Individual session result cards */}
            {results.map((result, index) => {
              const perf = getPerformanceLabel(
                result.rank,
                result.totalTargets,
              );
              return (
                <div
                  key={result.sessionId || index}
                  className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-5 hover:border-indigo-200 transition-colors"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        <Target className="h-4 w-4 text-indigo-500" />
                        {result.sessionType?.replace("_", " ") ||
                          "Evaluation Session"}
                        {/* Live badge — shown for scores from raw allocations */}
                        {/* (before official finalize+aggregate governance) */}
                        {result.source === "live" && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                            Live
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        Intent: {result.intent || "N/A"}
                        {result.evaluationMode &&
                          ` • Mode: ${result.evaluationMode.replace("_", " ")}`}
                      </p>
                    </div>
                    <span className={`text-xs font-bold ${perf.color}`}>
                      {perf.label}
                    </span>
                  </div>

                  {/* Score row */}
                  <div className="grid grid-cols-4 gap-3">
                    {/* Your Rank */}
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 font-medium uppercase mb-1">
                        Rank
                      </p>
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto text-sm font-bold border-2 ${getRankColor(result.rank, result.totalTargets)}`}
                      >
                        {result.rank || "—"}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        of {result.totalTargets || "?"}
                      </p>
                    </div>

                    {/* Your Mean Score */}
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 font-medium uppercase mb-1">
                        Your Score
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {(result.meanScore || 0).toFixed(1)}
                      </p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {getTrendIcon(result.meanScore, result.avgMean)}
                        <span className="text-[10px] text-gray-400">
                          avg: {(result.avgMean || 0).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Consensus */}
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 font-medium uppercase mb-1">
                        Consensus
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {result.consensusScore != null
                          ? `${(result.consensusScore * 100).toFixed(0)}%`
                          : "—"}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {result.consensusScore > 0.7
                          ? "High agreement"
                          : result.consensusScore > 0.4
                            ? "Moderate"
                            : "Low agreement"}
                      </p>
                    </div>

                    {/* Evaluators */}
                    <div className="text-center">
                      <p className="text-[10px] text-gray-500 font-medium uppercase mb-1">
                        Evaluators
                      </p>
                      <p className="text-xl font-bold text-gray-900">
                        {result.judgeCount || "—"}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">judges</p>
                    </div>
                  </div>

                  {/* Score bar visualization */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>0</span>
                      <span>Pool: {result.poolSize || "?"}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden relative">
                      {/* Average marker */}
                      {result.avgMean > 0 && result.poolSize > 0 && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-gray-400 z-10"
                          style={{
                            left: `${(result.avgMean / result.poolSize) * 100}%`,
                          }}
                          title={`Average: ${result.avgMean.toFixed(1)}`}
                        />
                      )}
                      {/* Your score bar */}
                      <div
                        className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all"
                        style={{
                          width: `${result.poolSize ? (result.meanScore / result.poolSize) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Date footer */}
                  {result.windowEnd && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-3">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Completed:{" "}
                        {new Date(result.windowEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentResultsView;
