// ============================================================
// FACULTY DASHBOARD — Mobile-First Violet Glassmorphism
// ============================================================
// Phase 1 Implementation: Entry point for faculty evaluators.
// Displays active sessions with subtle violet glass design.
// Mobile-first responsive layout with touch-optimized spacing.
//
// SRS REFERENCES:
//   §4.4   — Faculty evaluation workflow
//   §4.1.3 — Scarcity pool calculation (TeamSize × 5)
//   §5     — Credibility weighting system
//   §6.1   — Trajectory analysis
//
// ARCHITECTURE:
//   - Data fetched via facultyDashboardApi.js
//   - Uses modular components from ./faculty/
//   - Real-time pool calculations via useScarcityLogic hook
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  RefreshCw,
  AlertCircle,
  BarChart3,
  FlaskConical,
  Calculator,
  ClipboardList,
} from "lucide-react";

// Sub-components
import { DashboardHeader, SessionGrid } from "./faculty";

// Services & Hooks
import {
  fetchActiveSessions,
  fetchSessionProjects,
  fetchEvaluatorCredibility,
} from "../../services/facultyDashboardApi";
import useAuth from "../../hooks/useAuth";

/**
 * Faculty Dashboard — Main Container Component
 *
 * Displays:
 *   1. DashboardHeader — Evaluator info + quick stats
 *   2. SessionGrid — Expandable session cards with teams
 *
 * @param {Object} [props]
 * @param {Object} [props.data] - Pre-loaded data (optional)
 * @param {Function} [props.onRefresh] - External refresh callback
 */
const FacultyDashboard = ({ data: preloadedData, onRefresh }) => {
  // ============================================================
  // STATE
  // ============================================================
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [projectsBySession, setProjectsBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Derived stats
  const [stats, setStats] = useState({
    activeSessions: 0,
    pendingEvaluations: 0,
    totalTeams: 0,
    totalPool: 0,
  });

  // Credibility score state (SRS §5.1)
  const [credibility, setCredibility] = useState(null);

  // ============================================================
  // DATA FETCHING
  // ============================================================
  const loadDashboardData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        // Get evaluator ID from user context
        const evaluatorId = user?.personId;
        if (!evaluatorId) {
          throw new Error("User not authenticated or missing personId");
        }

        // Fetch active sessions and credibility in parallel
        const [sessionsData, credibilityData] = await Promise.all([
          fetchActiveSessions(evaluatorId),
          fetchEvaluatorCredibility(evaluatorId),
        ]);

        // Debug log to see session data structure
        console.log("Fetched sessions:", sessionsData);
        sessionsData?.forEach((s, i) => {
          console.log(`Session ${i}:`, {
            id: s.id,
            status: s.status,
            title: s.title,
          });
        });

        // Set credibility state (may be null for new evaluators)
        setCredibility(credibilityData);
        setSessions(sessionsData);

        // If no sessions, we're done
        if (!sessionsData || sessionsData.length === 0) {
          setProjectsBySession({});
          setStats({
            activeSessions: 0,
            pendingEvaluations: 0,
            totalTeams: 0,
            totalPool: 0,
          });
          return;
        }

        // Fetch projects for each session in parallel (errors are handled gracefully)
        const projectPromises = sessionsData.map(async (session) => {
          const projects = await fetchSessionProjects(session.id, evaluatorId);
          return { sessionId: session.id, projects };
        });

        const projectResults = await Promise.all(projectPromises);

        // Build projectsBySession map
        const projectsMap = {};
        let totalTeamsCount = 0;
        let totalPoolCount = 0;

        projectResults.forEach(({ sessionId, projects }) => {
          projectsMap[sessionId] = projects;
          totalTeamsCount += projects.length;
          // SRS 4.1.3: Pool = sum of (member_count × 5) for each team
          totalPoolCount += projects.reduce(
            (sum, p) => sum + (p.member_count || 2) * 5,
            0,
          );
        });

        setProjectsBySession(projectsMap);

        // Update stats
        setStats({
          activeSessions: sessionsData.filter((s) => s.status === "active")
            .length,
          pendingEvaluations: totalTeamsCount, // Simplified; refine as needed
          totalTeams: totalTeamsCount,
          totalPool: totalPoolCount,
        });
      } catch (err) {
        console.error("FacultyDashboard load error:", err);
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.personId],
  );

  // Initial load - wait for user to be available
  useEffect(() => {
    if (user?.personId) {
      loadDashboardData();
    }
  }, [loadDashboardData, user?.personId]);

  // Handle refresh
  const handleRefresh = () => {
    loadDashboardData(true);
    onRefresh?.();
  };

  // ============================================================
  // ERROR STATE — Mobile-first spacing
  // ============================================================
  if (error && !loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-md mx-auto pt-10 sm:pt-20">
          <div
            className="
              rounded-2xl p-8 sm:p-12 text-center
              bg-white/60 backdrop-blur-sm
            "
            style={{
              border: "0.5px solid #E0D9FF",
              boxShadow: "0 4px 24px rgba(139, 92, 246, 0.05)",
            }}
          >
            <div
              className="
                w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-5 sm:mb-6 rounded-2xl
                flex items-center justify-center
              "
              style={{ backgroundColor: "#F5F3FF" }}
            >
              <AlertCircle
                className="h-5 w-5 sm:h-6 sm:w-6"
                style={{ color: "#7C3AED" }}
              />
            </div>
            <h2
              className="text-base sm:text-lg font-semibold mb-2 tracking-tight"
              style={{ color: "#1E1E1E" }}
            >
              Unable to Load Dashboard
            </h2>
            <p
              className="mb-6 sm:mb-8 text-[13px] sm:text-sm"
              style={{ color: "#6B7280" }}
            >
              {error}
            </p>
            <button
              onClick={handleRefresh}
              className="
                inline-flex items-center gap-2 px-6 py-3
                bg-white/50 backdrop-blur-sm
                rounded-full font-medium text-[15px] sm:text-base
                transition-all duration-200
                hover:bg-[#F5F3FF]
                active:scale-95
                min-h-[44px]
              "
              style={{
                color: "#7C3AED",
                border: "1px solid #7C3AED",
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER — Mobile-First Violet Glassmorphism
  // ============================================================
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Mobile-first padding: 16px on mobile, generous on desktop */}
      <div className="w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* ====================================================== */}
        {/* HEADER — Welcome card + Metrics */}
        {/* ====================================================== */}
        <DashboardHeader
          user={user}
          credibilityScore={credibility?.score}
          credibilityBand={credibility?.band}
          credibilityTrend={credibility?.trend}
          credibilityDelta={credibility?.delta}
          credibility={credibility}
          credibilityHistory={credibility?.history || []}
          stats={stats}
        />

        {/* ====================================================== */}
        {/* SESSION PLANNER — Quick access button */}
        {/* ====================================================== */}
        {/* Session Planner — always visible */}
        <div className="mt-4 sm:mt-5">
          <button
            onClick={() => navigate("/session-planner")}
            className="
              w-full flex items-center justify-between gap-3 p-4 sm:p-5
              bg-white/60 backdrop-blur-sm rounded-2xl
              hover:bg-violet-50 transition-all duration-200 group
            "
            style={{
              border: "2px solid #DDD6FE",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.08)",
              background:
                "linear-gradient(135deg, rgba(139, 92, 246, 0.04) 0%, white 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-violet-200 rounded-xl">
                <ClipboardList className="h-5 w-5 text-violet-700" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">
                  Session Planner
                </p>
                <p className="text-xs text-gray-500">
                  View assigned sessions & manage evaluations
                </p>
              </div>
            </div>
            <span className="text-violet-400 group-hover:text-violet-600 transition-colors text-lg">
              →
            </span>
          </button>
        </div>

        {/* ====================================================== */}
        {/* SECTION HEADER — Evaluation Sessions */}
        {/* ====================================================== */}
        <div className="flex items-center justify-between mt-5 sm:mt-6 mb-3 sm:mb-4">
          <h2
            className="text-base sm:text-lg font-semibold tracking-tight"
            style={{ color: "#1E1E1E" }}
          >
            Evaluation Sessions
          </h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="
              inline-flex items-center gap-2 px-3 sm:px-4 py-2
              text-[13px] sm:text-sm font-medium
              bg-white/50 backdrop-blur-sm rounded-full
              transition-all duration-200
              disabled:opacity-50
              hover:bg-[#F5F3FF]
              active:scale-95
              min-h-[44px] sm:min-h-0
            "
            style={{
              color: "#6B7280",
              border: "0.5px solid #E0D9FF",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.03)",
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {refreshing ? "Refreshing..." : "Refresh"}
            </span>
          </button>
        </div>

        {/* ====================================================== */}
        {/* MY RESULTS — Link to faculty evaluation results */}
        {/* ====================================================== */}
        <div className="mt-4 sm:mt-5">
          <button
            onClick={() => navigate("/faculty-results")}
            className="
              w-full flex items-center justify-between gap-3 p-4 sm:p-5
              bg-white/60 backdrop-blur-sm rounded-2xl
              hover:bg-violet-50 transition-all duration-200
              group
            "
            style={{
              border: "1px solid #E0D9FF",
              boxShadow: "0 2px 12px rgba(139, 92, 246, 0.04)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-violet-100 rounded-xl">
                <BarChart3 className="h-5 w-5 text-violet-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900">
                  My Evaluation Results
                </p>
                <p className="text-xs text-gray-500">
                  See normalized scores from student evaluations
                </p>
              </div>
            </div>
            <span className="text-violet-400 group-hover:text-violet-600 transition-colors text-lg">
              →
            </span>
          </button>

          {/* ── B-02 Quick Links ─────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {/* What-If Simulator */}
            <button
              onClick={() => navigate("/normalization/what-if")}
              className="
                flex items-center gap-3 p-4
                bg-white/60 backdrop-blur-sm rounded-2xl
                hover:bg-blue-50 transition-all duration-200
                group
              "
              style={{
                border: "1px solid #E0D9FF",
                boxShadow: "0 2px 12px rgba(139, 92, 246, 0.04)",
              }}
            >
              <div className="p-2 bg-blue-100 rounded-xl">
                <FlaskConical className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  What-If Simulator
                </p>
                <p className="text-xs text-gray-500">
                  Experiment with weight configurations
                </p>
              </div>
              <span className="text-blue-400 group-hover:text-blue-600 transition-colors text-lg">
                →
              </span>
            </button>

            {/* Score Breakdown */}
            <button
              onClick={() => navigate("/normalization/breakdown")}
              className="
                flex items-center gap-3 p-4
                bg-white/60 backdrop-blur-sm rounded-2xl
                hover:bg-emerald-50 transition-all duration-200
                group
              "
              style={{
                border: "1px solid #E0D9FF",
                boxShadow: "0 2px 12px rgba(139, 92, 246, 0.04)",
              }}
            >
              <div className="p-2 bg-emerald-100 rounded-xl">
                <Calculator className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  Score Breakdown
                </p>
                <p className="text-xs text-gray-500">
                  Step-by-step normalization details
                </p>
              </div>
              <span className="text-emerald-400 group-hover:text-emerald-600 transition-colors text-lg">
                →
              </span>
            </button>
          </div>
        </div>

        {/* ====================================================== */}
        {/* SESSION GRID — Mobile stacked, desktop 2-col */}
        {/* ====================================================== */}
        <SessionGrid
          sessions={sessions}
          projectsBySession={projectsBySession}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default FacultyDashboard;
