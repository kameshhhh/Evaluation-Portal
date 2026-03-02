// ============================================================
// FACULTY RESULTS DASHBOARD — Normalized results & trends
// ============================================================
// SRS §4.4.3 — Exposure normalization transparency view.
// Faculty see: normalized scores per session, trend over time,
// how normalization was applied, and department context.
// Admin see: all faculty + department rankings + export.
// SRS §7.2 — "No raw ranking exposure. Only trends, percentiles, bands"
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Users,
  Award,
  AlertCircle,
  Eye,
  Layers,
  Calculator,
  FlaskConical,
} from "lucide-react";
import useFacultyAnalytics from "../../hooks/useFacultyAnalytics";
import {
  getAllFacultyEvalSessions,
  exportSessionData,
} from "../../services/facultyEvaluationApi";
import ExposureIndicator from "./ExposureIndicator";
import FacultyScoreCard from "./FacultyScoreCard";

const FacultyResultsDashboard = ({ isAdmin = false }) => {
  const { sessionId: paramSessionId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(
    paramSessionId || null,
  );
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [expandedFaculty, setExpandedFaculty] = useState(null);
  const [exporting, setExporting] = useState(false);

  const {
    normalizedResults,
    resultsLoading,
    fetchNormalizedResults,
    overview,
    overviewLoading,
    fetchOverview,
    trend,
    trendLoading,
    fetchTrend,
    explanation,
    explanationLoading,
    fetchExplanation,
    rankings,
    rankingsLoading,
    fetchRankings,
    responseRate,
    responseRateLoading,
    fetchResponseRate,
    error,
  } = useFacultyAnalytics(selectedSessionId, {
    autoLoad: false,
  });

  // Load sessions list
  useEffect(() => {
    let cancelled = false;
    const loadSessions = async () => {
      try {
        const result = await getAllFacultyEvalSessions();
        if (!cancelled && result.success) {
          const closed = (result.data || []).filter(
            (s) => s.status === "closed" || s.status === "completed",
          );
          setSessions(closed);
          if (!selectedSessionId && closed.length > 0) {
            setSelectedSessionId(closed[0].id);
          }
        }
      } catch {
        // Non-critical
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    };
    loadSessions();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  // Load data when session changes
  useEffect(() => {
    if (!selectedSessionId) return;
    fetchOverview(selectedSessionId);
    fetchNormalizedResults(selectedSessionId);
    if (isAdmin) {
      fetchRankings(selectedSessionId);
      fetchResponseRate(selectedSessionId);
    }
  }, [
    selectedSessionId,
    isAdmin,
    fetchOverview,
    fetchNormalizedResults,
    fetchRankings,
    fetchResponseRate,
  ]);

  // Toggle faculty detail & load normalization explanation
  const toggleFacultyDetail = useCallback(
    (facultyId) => {
      if (expandedFaculty === facultyId) {
        setExpandedFaculty(null);
      } else {
        setExpandedFaculty(facultyId);
        if (selectedSessionId) {
          fetchExplanation(selectedSessionId, facultyId);
        }
      }
    },
    [expandedFaculty, selectedSessionId, fetchExplanation],
  );

  // Export handler
  const handleExport = async () => {
    if (!selectedSessionId) return;
    setExporting(true);
    try {
      const result = await exportSessionData(selectedSessionId);
      if (result.success) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `faculty-eval-${selectedSessionId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // handled by hook error
    } finally {
      setExporting(false);
    }
  };

  // Trend icon
  const TrendIcon =
    trend?.classification === "improving"
      ? TrendingUp
      : trend?.classification === "declining"
        ? TrendingDown
        : Minus;

  const trendColor =
    trend?.classification === "improving"
      ? "text-emerald-600"
      : trend?.classification === "declining"
        ? "text-red-500"
        : "text-gray-500";

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* ── Header ──────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-violet-100 rounded-xl">
            <BarChart3 className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isAdmin
                ? "Faculty Results & Analytics"
                : "My Evaluation Results"}
            </h1>
            <p className="text-sm text-gray-500">
              {isAdmin
                ? "Normalized scores, rankings, and response rates"
                : "See how your evaluations compare after exposure normalization"}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={handleExport}
            disabled={!selectedSessionId || exporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export"}
          </button>
        )}
      </div>

      {/* ── Session Selector ────────────────────── */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Session:</label>
          <select
            value={selectedSessionId || ""}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.academic_year} {s.semester}
              </option>
            ))}
          </select>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Layers className="h-16 w-16 text-gray-300 mx-auto" />
          <p className="text-lg text-gray-500">No completed sessions yet</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Overview Stats ──────────────────────── */}
      {overview && !overviewLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Points"
            value={overview.totalPoints || 0}
            icon={<Award className="h-5 w-5 text-amber-500" />}
          />
          <StatCard
            label="Faculty Evaluated"
            value={overview.uniqueFaculty || 0}
            icon={<Users className="h-5 w-5 text-blue-500" />}
          />
          <StatCard
            label="Student Responses"
            value={overview.totalStudents || 0}
            icon={<Eye className="h-5 w-5 text-indigo-500" />}
          />
          <StatCard
            label="Avg Score"
            value={
              overview.scoreDistribution?.average != null
                ? overview.scoreDistribution.average.toFixed(2)
                : "—"
            }
            subtitle={
              overview.scoreDistribution?.stddev != null
                ? `σ ${overview.scoreDistribution.stddev.toFixed(2)}`
                : ""
            }
            icon={<BarChart3 className="h-5 w-5 text-violet-500" />}
          />
        </div>
      )}

      {/* ── Normalized Results Table ────────────── */}
      {selectedSessionId && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Normalized Faculty Scores
            </h2>
            <span className="text-xs text-gray-400">
              Scores adjusted for teaching exposure
            </span>
          </div>

          {resultsLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : normalizedResults.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No normalized scores available for this session
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {normalizedResults.map((r) => (
                <div key={r.faculty_id}>
                  <FacultyScoreCard
                    result={r}
                    isExpanded={expandedFaculty === r.faculty_id}
                    onToggle={() => toggleFacultyDetail(r.faculty_id)}
                    showRawScore={isAdmin}
                  />

                  {/* Normalization explanation panel */}
                  {expandedFaculty === r.faculty_id && (
                    <div>
                      <NormalizationDetail
                        explanation={explanation}
                        loading={explanationLoading}
                      />
                      {/* B-02: Quick links to detailed views */}
                      {!explanationLoading && explanation && (
                        <div className="px-6 py-3 bg-violet-50/50 border-t border-violet-100 flex items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/normalization/breakdown/${selectedSessionId}/${r.faculty_id}`,
                              )
                            }
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-lg hover:bg-violet-200 transition-colors"
                          >
                            <Calculator className="h-3.5 w-3.5" />
                            Full Breakdown
                          </button>
                          <button
                            onClick={() =>
                              navigate(
                                `/normalization/what-if/${selectedSessionId}`,
                              )
                            }
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            <FlaskConical className="h-3.5 w-3.5" />
                            What-If Simulator
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Response Rate (Admin only) ─────────── */}
      {isAdmin && responseRate && !responseRateLoading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Response Rate by Faculty
          </h2>
          <div className="space-y-3">
            {(responseRate.faculty || []).map((f) => (
              <div key={f.faculty_id} className="flex items-center gap-4">
                <span className="text-sm text-gray-700 w-40 truncate">
                  {f.faculty_name || f.faculty_id}
                </span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min((f.evaluator_count / (responseRate.totalStudents || 1)) * 100, 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-20 text-right">
                  {f.evaluator_count} / {responseRate.totalStudents || "?"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Stat Card ──────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
  label,
  value,
  subtitle,
  icon,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
});

// ── Normalization Detail Panel ─────────────────────────────

const NormalizationDetail = React.memo(function NormalizationDetail({
  explanation,
  loading,
}) {
  if (loading) {
    return (
      <div className="px-6 py-4 bg-violet-50 border-t border-violet-100">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-violet-200 rounded w-3/4" />
          <div className="h-3 bg-violet-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!explanation) {
    return (
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-sm text-gray-500">
        No normalization data available
      </div>
    );
  }

  return (
    <div className="px-6 py-4 bg-violet-50 border-t border-violet-100 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-violet-800">
        <Info className="h-4 w-4" />
        How this score was calculated
      </div>

      {/* Step-by-step breakdown */}
      {explanation.steps && (
        <ol className="space-y-2 text-sm text-gray-700">
          {explanation.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-800 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Exposure data */}
      {explanation.exposure && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white rounded-lg p-2 text-center">
            <p className="text-gray-500">Sessions</p>
            <p className="font-bold text-gray-800">
              {explanation.exposure.sessions_conducted ?? "—"}
            </p>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <p className="text-gray-500">Contact Hours</p>
            <p className="font-bold text-gray-800">
              {explanation.exposure.contact_hours ?? "—"}
            </p>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <p className="text-gray-500">Role Type</p>
            <p className="font-bold text-gray-800 capitalize">
              {explanation.exposure.role_type ?? "—"}
            </p>
          </div>
        </div>
      )}

      {/* Final formula */}
      {explanation.formula && (
        <div className="bg-white rounded-lg p-3 text-xs text-gray-600 font-mono">
          {explanation.formula}
        </div>
      )}
    </div>
  );
});

export default FacultyResultsDashboard;
