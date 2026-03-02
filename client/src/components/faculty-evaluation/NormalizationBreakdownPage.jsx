// ============================================================
// NORMALIZATION BREAKDOWN PAGE — Full transparency view
// ============================================================
// SRS §4.4.3 — Full-page step-by-step normalization explanation.
// Faculty see exactly how their score was calculated.
// Wraps NormalizationExplanation component with session selection.
// ============================================================

import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Calculator,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import {
  getAllFacultyEvalSessions,
  getEnhancedTransparencyReport,
} from "../../services/facultyEvaluationApi";
import NormalizationExplanation from "./NormalizationExplanation";
import useAuth from "../../hooks/useAuth";
import { ROUTES } from "../../utils/constants";

const NormalizationBreakdownPage = () => {
  const { sessionId: paramSession, facultyId: paramFaculty } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";
  const targetFaculty = paramFaculty || user?.personId;

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(paramSession || null);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getAllFacultyEvalSessions();
        if (!cancelled && result.success) {
          const completed = (result.data || []).filter(
            (s) => s.status === "closed" || s.status === "completed",
          );
          setSessions(completed);
          if (!selectedSession && completed.length > 0) {
            setSelectedSession(completed[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

  // Load transparency report when session changes
  useEffect(() => {
    if (!selectedSession || !targetFaculty) return;
    let cancelled = false;

    const loadReport = async () => {
      setReportLoading(true);
      setError(null);
      try {
        const result = await getEnhancedTransparencyReport(
          selectedSession,
          targetFaculty,
        );
        if (!cancelled) {
          if (result.success) {
            setReport(result.data);
          } else {
            setError(result.error || "Failed to load transparency report");
            setReport(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || err.message);
          setReport(null);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    };

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [selectedSession, targetFaculty]);

  // Export handler
  const handleExport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `normalization-report-${selectedSession}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ── Header ───────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="p-2.5 bg-violet-100 rounded-xl">
            <Calculator className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Score Breakdown
            </h1>
            <p className="text-sm text-gray-500">
              Detailed normalization calculation for your score
            </p>
          </div>
        </div>

        {/* Link to What-If Simulator */}
        <Link
          to={
            selectedSession
              ? ROUTES.WHAT_IF_SIMULATOR.replace(":sessionId", selectedSession)
              : ROUTES.WHAT_IF_SIMULATOR_BASE
          }
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
        >
          <FlaskConical className="h-4 w-4" />
          What-If Simulator
        </Link>
      </div>

      {/* ── Session Selector ─────────────────────── */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Session:</label>
          <select
            value={selectedSession || ""}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-300"
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
        <div className="text-center py-16">
          <Calculator className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No completed sessions available</p>
        </div>
      )}

      {/* ── Error ────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading ──────────────────────────────── */}
      {reportLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      )}

      {/* ── Transparency Report ──────────────────── */}
      {!reportLoading && (
        <NormalizationExplanation report={report} onExport={handleExport} />
      )}

      {/* Mobile What-If Link */}
      <div className="sm:hidden">
        <Link
          to={
            selectedSession
              ? ROUTES.WHAT_IF_SIMULATOR.replace(":sessionId", selectedSession)
              : ROUTES.WHAT_IF_SIMULATOR_BASE
          }
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors"
        >
          <FlaskConical className="h-4 w-4" />
          Try What-If Simulator
        </Link>
      </div>
    </div>
  );
};

export default NormalizationBreakdownPage;
