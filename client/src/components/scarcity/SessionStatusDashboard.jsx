// ============================================================
// SESSION STATUS DASHBOARD — Session Governance UI
// ============================================================
// Admin-facing dashboard for managing session lifecycle.
// Shows session status, readiness indicators, and governance actions.
//
// FEATURES:
//   - Session status card with key metrics
//   - Finalization readiness checklist (admin only)
//   - Finalize / Aggregate action buttons
//   - Aggregation summary when complete
//   - Auto-refresh every 30 seconds
//
// STATES DISPLAYED:
//   open       → Shows readiness checklist + Finalize button
//   locked     → Shows Aggregate button
//   aggregated → Shows results summary + View Results link
//
// SRS REFERENCES:
//   4.2.2 — Aggregation requires LOCKED session
//   8.2   — Transparency (rules visible, judgments private)
//
// DEPENDENCIES:
//   - scarcityApi (getSessionStatus, finalizeSession, aggregateSession)
//   - lucide-react (icons)
//   - tailwindcss (styling)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Lock,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Users,
  Target,
  Zap,
  ShieldCheck,
} from "lucide-react";
import {
  getSessionStatus,
  finalizeSession,
  aggregateSession,
} from "../../services/scarcityApi";
import useAuth from "../../hooks/useAuth";

// ============================================================
// MAIN COMPONENT: SessionStatusDashboard
// ============================================================
// Props:
//   sessionId {string} — UUID of the evaluation session (optional, uses URL param)
//   isAdmin {boolean}  — Whether the current user has admin role (optional, auto-detected)
// ============================================================
const SessionStatusDashboard = ({
  sessionId: propSessionId,
  isAdmin: propIsAdmin,
}) => {
  // Get sessionId from URL params if not passed as prop
  const { sessionId: routeSessionId } = useParams();
  const sessionId = propSessionId || routeSessionId;

  // Auto-detect admin role from auth context if not passed as prop
  const { user } = useAuth();
  const isAdmin =
    propIsAdmin !== undefined
      ? propIsAdmin
      : user?.role === "admin" || user?.role === "faculty";
  // ── State ──
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState(null);

  // ── Load session status (with auto-refresh) ──
  const loadStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await getSessionStatus(sessionId);
      if (response.success) {
        setStatus(response.data);
      }
    } catch (err) {
      setError(err.message || "Failed to load session status");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial load + 30-second polling
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // ── Action: Finalize Session ──
  const handleFinalize = async () => {
    if (
      !window.confirm(
        "Finalize session? This will prevent any further submissions and lock the data.",
      )
    ) {
      return;
    }

    setActionInProgress(true);
    try {
      await finalizeSession(sessionId, {
        reason: "Manual finalization by admin",
      });
      await loadStatus();
    } catch (err) {
      alert(
        `Finalization failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setActionInProgress(false);
    }
  };

  // ── Action: Aggregate Session ──
  const handleAggregate = async () => {
    setActionInProgress(true);
    try {
      await aggregateSession(sessionId);
      await loadStatus();
    } catch (err) {
      alert(
        `Aggregation failed: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setActionInProgress(false);
    }
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="bg-gray-200 h-48 rounded-xl"></div>
        <div className="bg-gray-200 h-32 rounded-xl"></div>
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
  if (!status) return null;

  const { session, readiness, aggregation, actions } = status;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────── */}
      {/* STATUS HEADER CARD                               */}
      {/* ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Session Governance
            </h2>
            <div className="flex items-center gap-4 mt-2">
              {/* Status badge */}
              <StatusBadge status={session.status} />

              {/* Evaluator count */}
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>{session.activeEvaluators} evaluators</span>
              </div>

              {/* Target count */}
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Target className="w-4 h-4" />
                <span>{session.evaluatedTargets} targets</span>
              </div>
            </div>
          </div>

          {/* State icon */}
          <StateIcon status={session.status} />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Evaluation mode */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Evaluation Mode</div>
            <div className="font-medium capitalize">
              {session.evaluationMode?.replace("_", " ") || "—"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Intent: {session.intent || "—"}
            </div>
          </div>

          {/* Pool size */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Pool Size</div>
            <div className="text-2xl font-bold text-gray-900">
              {session.poolSize ?? "—"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Total scarcity points
            </div>
          </div>

          {/* Deadline */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Deadline</div>
            <div className="font-medium">
              {session.deadline
                ? new Date(session.deadline).toLocaleDateString()
                : "No deadline"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {session.deadline && new Date(session.deadline) > new Date()
                ? "Active"
                : "Passed"}
            </div>
          </div>
        </div>

        {/* Sealed indicator */}
        {session.sealed && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg mb-4">
            <ShieldCheck className="w-4 h-4" />
            <span>
              Cryptographically sealed at{" "}
              {session.finalizedAt
                ? new Date(session.finalizedAt).toLocaleString()
                : "—"}
            </span>
          </div>
        )}

        {/* ──────────────────────────────────────────────── */}
        {/* ADMIN ACTIONS                                     */}
        {/* ──────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-medium mb-3">Session Governance</h3>
            <div className="flex flex-wrap gap-2">
              {/* Finalize button — shown when session is OPEN */}
              {(session.status === "open" ||
                session.status === "in_progress") && (
                <button
                  onClick={handleFinalize}
                  disabled={actionInProgress}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  <Lock className="w-4 h-4" />
                  {actionInProgress ? "Finalizing..." : "Finalize Session"}
                </button>
              )}

              {/* Aggregate button — shown when session is LOCKED */}
              {session.status === "locked" && (
                <button
                  onClick={handleAggregate}
                  disabled={actionInProgress}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  {actionInProgress ? "Aggregating..." : "Aggregate Results"}
                </button>
              )}

              {/* View results link — shown when AGGREGATED */}
              {session.status === "aggregated" && (
                <div className="flex items-center gap-2">
                  <a
                    href={`/scarcity/results/${sessionId}`}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    View Aggregated Results
                  </a>
                  <a
                    href={`/scarcity/weighted-results/${sessionId}`}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Weighted Results
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* FINALIZATION READINESS PANEL (admin + open)      */}
      {/* ──────────────────────────────────────────────── */}
      {isAdmin &&
        readiness &&
        ["open", "in_progress"].includes(session.status) && (
          <ReadinessPanel readiness={readiness} session={session} />
        )}

      {/* ──────────────────────────────────────────────── */}
      {/* AGGREGATION SUMMARY (aggregated sessions)        */}
      {/* ──────────────────────────────────────────────── */}
      {session.status === "aggregated" && aggregation && (
        <AggregationSummary aggregation={aggregation} />
      )}
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: StatusBadge
// ============================================================
// Renders a colored pill showing the session state.
// ============================================================
const StatusBadge = ({ status }) => {
  // Map status to Tailwind color classes
  const colors = {
    draft: "bg-gray-100 text-gray-800",
    scheduled: "bg-indigo-100 text-indigo-800",
    open: "bg-green-100 text-green-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    closed: "bg-orange-100 text-orange-800",
    locked: "bg-blue-100 text-blue-800",
    aggregated: "bg-purple-100 text-purple-800",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium uppercase ${
        colors[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status?.replace("_", " ")}
    </span>
  );
};

// ============================================================
// SUB-COMPONENT: StateIcon
// ============================================================
// Renders a contextual icon for the session's current state.
// ============================================================
const StateIcon = ({ status }) => {
  switch (status) {
    case "open":
    case "in_progress":
      return <Clock className="w-6 h-6 text-yellow-500" />;
    case "closed":
    case "locked":
      return <Lock className="w-6 h-6 text-blue-500" />;
    case "aggregated":
      return <BarChart3 className="w-6 h-6 text-purple-500" />;
    default:
      return null;
  }
};

// ============================================================
// SUB-COMPONENT: ReadinessPanel
// ============================================================
// Shows a checklist of finalization readiness criteria.
// Each check shows a green/red/yellow icon.
// ============================================================
const ReadinessPanel = ({ readiness, session }) => (
  <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
      <Zap className="w-5 h-5 text-yellow-500" />
      Finalization Readiness
    </h3>

    <div className="space-y-3">
      {/* Min evaluators check */}
      <ReadinessRow
        label="Minimum Evaluators"
        value={`${readiness.evaluatorCount} / ${session.minEvaluators || 1}`}
        passed={readiness.evaluatorCount >= (session.minEvaluators || 1)}
      />

      {/* Target coverage check */}
      <ReadinessRow
        label="Target Coverage"
        value={`${(readiness.targetCoverage * 100).toFixed(0)}%`}
        passed={readiness.targetCoverage >= 0.8}
        warn={readiness.targetCoverage >= 0.5 && readiness.targetCoverage < 0.8}
      />

      {/* Deadline check */}
      <ReadinessRow
        label="Deadline Status"
        value={readiness.deadlineStatus}
        passed={readiness.deadlineStatus === "Deadline passed"}
        warn={readiness.deadlineStatus === "No deadline set"}
      />

      {/* Overall readiness message */}
      <div
        className={`mt-4 p-3 rounded-lg border ${
          readiness.canFinalize
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div
          className={`font-medium ${
            readiness.canFinalize ? "text-green-700" : "text-red-700"
          }`}
        >
          {readiness.reason}
        </div>
        {!readiness.canFinalize && (
          <p className="text-sm text-gray-600 mt-1">
            Use force finalize to override these checks
          </p>
        )}
      </div>
    </div>
  </div>
);

// ============================================================
// SUB-COMPONENT: ReadinessRow
// ============================================================
// A single row in the readiness checklist with pass/warn/fail icon.
// ============================================================
const ReadinessRow = ({ label, value, passed, warn = false }) => (
  <div className="flex items-center justify-between">
    <span className="text-gray-700">{label}</span>
    <div className="flex items-center gap-2">
      <span className="font-medium">{value}</span>
      {passed ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : warn ? (
        <AlertCircle className="w-4 h-4 text-yellow-500" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-500" />
      )}
    </div>
  </div>
);

// ============================================================
// SUB-COMPONENT: AggregationSummary
// ============================================================
// Shows key metrics when session is in AGGREGATED state.
// ============================================================
const AggregationSummary = ({ aggregation }) => (
  <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
      <BarChart3 className="w-5 h-5 text-purple-500" />
      Aggregation Complete
    </h3>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Targets analyzed */}
      <div className="bg-purple-50 p-3 rounded-lg">
        <div className="text-sm text-purple-700">Targets Analyzed</div>
        <div className="text-xl font-bold">{aggregation.targetCount}</div>
      </div>

      {/* Average consensus */}
      <div className="bg-green-50 p-3 rounded-lg">
        <div className="text-sm text-green-700">Avg Consensus</div>
        <div className="text-xl font-bold">
          {(aggregation.avgConsensus * 100).toFixed(0)}%
        </div>
      </div>

      {/* Total zeros */}
      <div className="bg-blue-50 p-3 rounded-lg">
        <div className="text-sm text-blue-700">Zero Allocations</div>
        <div className="text-xl font-bold">{aggregation.totalZeros}</div>
      </div>

      {/* Average variance */}
      <div className="bg-yellow-50 p-3 rounded-lg">
        <div className="text-sm text-yellow-700">Avg Variance</div>
        <div className="text-xl font-bold">
          {aggregation.avgVariance?.toFixed(2) ?? "—"}
        </div>
      </div>
    </div>
  </div>
);

export default SessionStatusDashboard;
