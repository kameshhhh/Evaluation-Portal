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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import {
  checkAppealEligibility,
  fileAppeal,
  getMyAppeals,
} from "../../services/appealsApi";
import { getMyEvaluator } from "../../services/sessionPlannerApi";
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
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  AlertTriangle,
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
  const [evaluatorRows, setEvaluatorRows] = useState([]);
  const [expandedSessions, setExpandedSessions] = useState(new Set());

  // Appeal state
  const [myAppeals, setMyAppeals] = useState([]); // appeals already filed
  const [appealModal, setAppealModal] = useState(null); // sessionId being appealed
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealError, setAppealError] = useState(null);

  // ---------------------------------------------------------
  // FETCH STUDENT'S OWN RESULTS
  // ---------------------------------------------------------
  const loadResults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch basic results + rich evaluator data in parallel
      const [basicRes, evalRes] = await Promise.allSettled([
        api.get("/scarcity/sessions/my-results"),
        getMyEvaluator(),
      ]);

      // Process basic results
      if (basicRes.status === "fulfilled" && basicRes.value.data?.success) {
        setResults(basicRes.value.data.data || []);
      } else if (basicRes.status === "rejected" && basicRes.reason?.response?.status === 404) {
        setResults([]);
      } else {
        setResults([]);
        setError("Failed to load your results.");
      }

      // Process evaluator data (non-critical — don't block on failure)
      if (evalRes.status === "fulfilled" && evalRes.value?.data) {
        setEvaluatorRows(evalRes.value.data);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to load your results.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
    // Load any existing appeals
    getMyAppeals()
      .then((res) => setMyAppeals(res.data || []))
      .catch(() => {});
  }, [loadResults]);

  // ---------------------------------------------------------
  // APPEAL: Check eligibility & submit
  // ---------------------------------------------------------
  const handleAppealClick = async (sessionId) => {
    try {
      const res = await checkAppealEligibility(sessionId);
      if (res.data?.eligible) {
        setAppealModal(sessionId);
        setAppealReason("");
        setAppealError(null);
      } else {
        alert(res.data?.reasons?.join(' ') || "You are not eligible to file an appeal for this session.");
      }
    } catch (err) {
      alert(err.response?.data?.error || "Could not check appeal eligibility.");
    }
  };

  const handleAppealSubmit = async () => {
    if (!appealReason.trim()) {
      setAppealError("Please provide a reason for your appeal.");
      return;
    }
    try {
      setAppealSubmitting(true);
      setAppealError(null);
      await fileAppeal(appealModal, appealReason.trim());
      // Refresh appeals list
      const res = await getMyAppeals();
      setMyAppeals(res.data || []);
      setAppealModal(null);
      setAppealReason("");
    } catch (err) {
      setAppealError(err.response?.data?.error || "Failed to submit appeal.");
    } finally {
      setAppealSubmitting(false);
    }
  };

  const getAppealForSession = (sessionId) =>
    myAppeals.find((a) => a.session_id === sessionId);

  const APPEAL_STATUS_BADGE = {
    pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock, label: "Appeal Pending" },
    accepted: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle, label: "Appeal Approved" },
    rejected: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Appeal Rejected" },
  };

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

  // ---------------------------------------------------------
  // EVALUATOR DATA — Group by session for rich breakdowns
  // ---------------------------------------------------------
  const evaluatorBySession = useMemo(() => {
    const map = {};
    for (const row of evaluatorRows) {
      const sid = row.session_id;
      if (!map[sid]) map[sid] = { rows: [], title: row.session_title, rubricNameMap: row.rubric_name_map || {} };
      map[sid].rows.push(row);
      // Merge rubric name maps (they're the same across rows in same session)
      if (row.rubric_name_map) Object.assign(map[sid].rubricNameMap, row.rubric_name_map);
    }
    return map;
  }, [evaluatorRows]);

  const toggleSession = (sessionId) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
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
              const evalData = evaluatorBySession[result.sessionId];
              const sessionTitle = evalData?.title;
              const isExpanded = expandedSessions.has(result.sessionId);
              // Get weighted score from evaluator data
              const weightedScore = evalData?.rows?.[0]?.display_score ?? evalData?.rows?.[0]?.normalized_score;
              const confidence = evalData?.rows?.[0]?.confidence_score;
              const scaleMax = evalData?.rows?.[0]?.scale_max || 100;

              return (
                <div
                  key={result.sessionId || index}
                  className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden hover:border-indigo-200 transition-colors"
                >
                  <div className="p-5">
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-indigo-500" />
                          {sessionTitle || result.sessionType?.replace("_", " ") || "Evaluation Session"}
                          {result.source === "live" && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                              Live
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">
                          {result.sessionType?.replace("_", " ") || "N/A"}
                          {result.intent && ` • Intent: ${result.intent}`}
                          {result.evaluationMode &&
                            ` • Mode: ${result.evaluationMode.replace("_", " ")}`}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${perf.color}`}>
                        {perf.label}
                      </span>
                    </div>

                    {/* Weighted Score Banner (from evaluator data) */}
                    {weightedScore != null && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wide">Final Weighted Score</p>
                            <p className="text-2xl font-bold text-indigo-700">
                              {Number(weightedScore).toFixed(2)}
                              <span className="text-sm font-normal text-indigo-400 ml-1">/ {scaleMax}</span>
                            </p>
                          </div>
                          {confidence != null && (
                            <div className="text-right">
                              <p className="text-[10px] text-gray-500 font-medium">Confidence</p>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                confidence >= 0.8 ? "bg-green-100 text-green-700" :
                                confidence >= 0.5 ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {(confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

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
                        {result.avgMean > 0 && result.poolSize > 0 && (
                          <div
                            className="absolute top-0 h-full w-0.5 bg-gray-400 z-10"
                            style={{
                              left: `${(result.avgMean / result.poolSize) * 100}%`,
                            }}
                            title={`Average: ${result.avgMean.toFixed(1)}`}
                          />
                        )}
                        <div
                          className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all"
                          style={{
                            width: `${result.poolSize ? (result.meanScore / result.poolSize) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Date footer + Expand button + Appeal */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-3">
                        {result.windowEnd && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Completed:{" "}
                              {new Date(result.windowEnd).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {evalData && (
                          <button
                            onClick={() => toggleSession(result.sessionId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-full transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Hide Breakdown
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                View Breakdown
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      {/* Appeal badge or button */}
                      {(() => {
                        const existingAppeal = getAppealForSession(result.sessionId);
                        if (existingAppeal) {
                          const badge = APPEAL_STATUS_BADGE[existingAppeal.status] || APPEAL_STATUS_BADGE.pending;
                          const BadgeIcon = badge.icon;
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                              <BadgeIcon className="h-3 w-3" />
                              {badge.label}
                            </span>
                          );
                        }
                        if (result.status === "finalized" || result.source !== "live") {
                          return (
                            <button
                              onClick={() => handleAppealClick(result.sessionId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full transition-colors"
                            >
                              <MessageSquare className="h-3 w-3" />
                              Appeal Score
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* ====================================================== */}
                  {/* EXPANDED: Detailed Breakdown Panel */}
                  {/* ====================================================== */}
                  {isExpanded && evalData && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-4">

                      {/* --- Per-Rubric Breakdown --- */}
                      {(() => {
                        const rubricMap = evalData.rubricNameMap || {};
                        // Aggregate rubric marks across all judges
                        const rubricAgg = {};
                        evalData.rows.forEach((row) => {
                          if (row.rubric_marks && typeof row.rubric_marks === "object") {
                            Object.entries(row.rubric_marks).forEach(([rubricId, score]) => {
                              if (!rubricAgg[rubricId]) rubricAgg[rubricId] = { scores: [], name: rubricMap[rubricId] || rubricId };
                              rubricAgg[rubricId].scores.push({ judge: row.faculty_name, score: Number(score) });
                            });
                          }
                        });
                        const rubricEntries = Object.entries(rubricAgg);
                        if (rubricEntries.length === 0) return null;

                        return (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                              <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                              Rubric-Wise Breakdown
                            </h4>
                            <div className="space-y-3">
                              {rubricEntries.map(([rubricId, data]) => {
                                const avg = data.scores.reduce((s, x) => s + x.score, 0) / data.scores.length;
                                return (
                                  <div key={rubricId} className="bg-white rounded-xl p-3 border border-gray-100">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-gray-800">{data.name}</span>
                                      <span className="text-xs font-bold text-indigo-600">{avg.toFixed(1)}</span>
                                    </div>
                                    {/* Per-judge marks */}
                                    <div className="space-y-1.5">
                                      {data.scores.map((entry, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                          <span className="text-[10px] text-gray-500 w-24 truncate">{entry.judge}</span>
                                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${
                                                entry.score === 0 ? "bg-red-400" : "bg-indigo-400"
                                              }`}
                                              style={{ width: `${Math.min((entry.score / (scaleMax || 10)) * 100, 100)}%` }}
                                            />
                                          </div>
                                          <span className={`text-[10px] font-semibold w-6 text-right ${
                                            entry.score === 0 ? "text-red-500" : "text-gray-600"
                                          }`}>{entry.score}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* --- Per-Judge Overall Marks --- */}
                      {evalData.rows.some((r) => r.marks != null) && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-indigo-500" />
                            Per-Judge Overall Marks
                          </h4>
                          <div className="grid gap-2">
                            {evalData.rows.filter((r) => r.marks != null).map((row, i) => (
                              <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-700">{row.faculty_name}</span>
                                <span className="text-sm font-bold text-indigo-600">{Number(row.marks).toFixed(1)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* --- Zero-Marks Feedback --- */}
                      {evalData.rows.some((r) => r.zero_feedback && Object.keys(r.zero_feedback).length > 0) && (
                        <div>
                          <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Zero-Mark Feedback
                          </h4>
                          <div className="space-y-2">
                            {evalData.rows.map((row, i) => {
                              if (!row.zero_feedback || typeof row.zero_feedback !== "object") return null;
                              const entries = Object.entries(row.zero_feedback);
                              if (entries.length === 0) return null;
                              return entries.map(([rubricId, reason]) => (
                                <div key={`${i}-${rubricId}`} className="bg-red-50 border border-red-200 rounded-xl p-3">
                                  <p className="text-[10px] text-red-500 font-semibold mb-0.5">
                                    {evalData.rubricNameMap[rubricId] || "Rubric"} — {row.faculty_name}
                                  </p>
                                  <p className="text-xs text-red-800">{reason}</p>
                                </div>
                              ));
                            })}
                          </div>
                        </div>
                      )}

                      {/* --- Faculty Feedback --- */}
                      {evalData.rows.some((r) => r.feedback) && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                            Faculty Feedback
                          </h4>
                          <div className="space-y-2">
                            {evalData.rows.filter((r) => r.feedback).map((row, i) => (
                              <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
                                <p className="text-[10px] text-indigo-500 font-semibold mb-1">{row.faculty_name}</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{row.feedback}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ====================================================== */}
        {/* APPEAL MODAL */}
        {/* ====================================================== */}
        {appealModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
                <MessageSquare className="h-5 w-5 text-amber-500" />
                Appeal Score
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Please explain why you believe your evaluation score should be reviewed.
                Appeals are reviewed by faculty administrators.
              </p>
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Describe your reason for appealing (minimum 10 characters)..."
                rows={4}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
              {appealError && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {appealError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={() => { setAppealModal(null); setAppealError(null); }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAppealSubmit}
                  disabled={appealSubmitting || appealReason.trim().length < 10}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {appealSubmitting ? "Submitting..." : "Submit Appeal"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentResultsView;
