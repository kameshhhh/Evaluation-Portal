// ============================================================
// SCARCITY EVALUATION PAGE — Full Page Wrapper for Evaluation
// ============================================================
// This is the page-level component that wires together:
//   1. useScarcity hook (state management)
//   2. ScarcityAllocation (input interface)
//   3. TradeoffVisualizer (distribution feedback)
//
// This component serves as the integration point between the
// hook (data layer) and the visual components (presentation layer).
// It receives a sessionId from the route params or props and
// orchestrates the entire evaluation experience.
//
// SRS 4.1.3: Full scarcity evaluation workflow
// SRS 4.2.1: Evaluator isolation enforced via backend
// ============================================================

// Import React for JSX rendering
import React, { useState, useEffect, useCallback, useMemo } from "react";

// Import router hooks for URL params and navigation
import { useParams, useNavigate } from "react-router-dom";

// Import the scarcity hook — manages all state and API calls
import useScarcity from "../../hooks/useScarcity";

// Import auth hook — provides current user's person ID
import useAuth from "../../hooks/useAuth";

// Import sub-components for the evaluation interface
import ScarcityAllocation from "./ScarcityAllocation";
import TradeoffVisualizer from "./TradeoffVisualizer";
import ZeroScoreReasonDialog from "../Common/ZeroScoreReasonDialog";

// SRS §4.1.4 — Rubric-based evaluation components
import RubricAllocationGroup from "./rubric/RubricAllocationGroup";
import RubricPoolDisplay from "./rubric/RubricPoolDisplay";

// Direct API access for rubric submission
import api from "../../services/api";

// SRS §4.1.3: Session progress bar for visual allocation feedback
import SessionProgressBar from "./SessionProgressBar";
import SessionProgressCircle from "./SessionProgressCircle";

// Import Lucide icons for visual elements
import {
  ArrowLeft, // Back navigation
  RefreshCw, // Refresh button
  BarChart3, // Results icon
  Settings, // Session management icon
} from "lucide-react";

// SRS §4.2: Multi-Judge Status component
import MultiJudgeStatus from "./MultiJudgeStatus";

// ============================================================
// ScarcityEvaluationPage Component
// ============================================================
/**
 * Full evaluation page for a specific scarcity session.
 * Wires together the hook, allocation interface, and visualizer.
 *
 * @param {Object} props - Component props
 * @param {string} props.sessionId - UUID of the evaluation session
 * @param {Function} [props.onBack] - Callback to navigate back to dashboard
 */
const ScarcityEvaluationPage = ({ sessionId: propSessionId, onBack }) => {
  // Get sessionId from URL params if not passed as prop
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const sessionId = propSessionId || routeSessionId;

  // Use navigate(-1) as default back handler when used as route
  const handleBack = onBack || (() => navigate(-1));

  // Get the current user from auth context
  const { user } = useAuth();

  // The evaluator ID is the user's person_id from auth
  const evaluatorId = user?.personId || user?.person_id || null;

  // Initialize the scarcity hook with session and evaluator IDs
  const {
    session,
    allocations,
    poolInfo,
    historySummary, // SRS §4.1.2: Historical data for banner display
    isLoading,
    isSaving,
    isDirty,
    error,
    setAllocation,
    submitAllocations,
    refresh,
    showZeroReasonDialog,
    setShowZeroReasonDialog,
    pendingZeroAllocations,
  } = useScarcity(sessionId, evaluatorId);

  // ============================================================
  // RUBRIC STATE — SRS §4.1.4
  // Only active when session.isRubricSession === true.
  // { [headId]: { [targetId]: points } }
  // ============================================================
  const [rubricAllocations, setRubricAllocations] = useState({});
  const [rubricSaving, setRubricSaving] = useState(false);
  const [rubricError, setRubricError] = useState(null);
  const [rubricSubmitted, setRubricSubmitted] = useState(false);

  // Initialize rubric allocation map when session loads
  useEffect(() => {
    if (!session?.isRubricSession || !session?.rubrics?.length) return;
    const init = {};
    session.rubrics.forEach(({ headId }) => {
      init[headId] = {};
      (session.targets || []).forEach((t) => {
        init[headId][t.target_id] = 0;
      });
    });
    // Hydrate from existing allocations if any (head_id present)
    if (session.myAllocations) {
      session.myAllocations.forEach((a) => {
        if (a.headId && init[a.headId]) {
          init[a.headId][a.targetId] = a.points || 0;
        }
      });
    }
    setRubricAllocations(init);
  }, [session]);

  // Per-rubric totals: { [headId]: number }
  const rubricTotals = useMemo(() => {
    const totals = {};
    Object.entries(rubricAllocations).forEach(([headId, byTarget]) => {
      totals[headId] = Object.values(byTarget).reduce((s, v) => s + (Number(v) || 0), 0);
    });
    return totals;
  }, [rubricAllocations]);

  // Handle a single rubric allocation change
  const handleRubricAllocate = useCallback((headId, targetId, pts) => {
    setRubricAllocations((prev) => ({
      ...prev,
      [headId]: { ...(prev[headId] || {}), [targetId]: Math.max(0, Number(pts) || 0) },
    }));
  }, []);

  // Submit all rubric allocations to backend
  const handleRubricSubmit = useCallback(async () => {
    setRubricSaving(true);
    setRubricError(null);
    try {
      // Flatten: [{targetId, points, headId}]
      const flat = [];
      Object.entries(rubricAllocations).forEach(([headId, byTarget]) => {
        Object.entries(byTarget).forEach(([targetId, points]) => {
          flat.push({ targetId, points: Number(points) || 0, headId });
        });
      });
      await api.post(`/scarcity/sessions/${sessionId}/allocate`, {
        evaluatorId,
        allocations: flat,
      });
      setRubricSubmitted(true);
      refresh();
    } catch (err) {
      setRubricError(err?.response?.data?.message || err.message || "Failed to submit rubric allocations");
    } finally {
      setRubricSaving(false);
    }
  }, [rubricAllocations, sessionId, evaluatorId, refresh]);

  return (
    // Page container with gradient background (matches existing pages)
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Page content wrapper — centered with max width */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* ====================================================== */}
        {/* PAGE HEADER — Back button and refresh */}
        {/* ====================================================== */}
        <div className="flex items-center justify-between mb-6">
          {/* Left: Back navigation */}
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm text-gray-500 
                       hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>

          {/* Right: Refresh button */}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm 
                       text-gray-600 hover:text-blue-600 hover:bg-blue-50 
                       rounded-xl transition-colors disabled:opacity-40"
            title="Refresh session data"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* ====================================================== */}
        {/* STICKY PROGRESS BAR — SRS §4.1.3 Visual Feedback */}
        {/* Shows allocation progress at a glance above content */}
        {/* ====================================================== */}
        {session && !isLoading && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 px-5 py-4 mb-6">
            <div className="flex items-center gap-4">
              {/* Desktop: full progress bar */}
              <div className="hidden sm:block flex-1">
                <SessionProgressBar
                  allocated={poolInfo.allocatedTotal}
                  maxPool={poolInfo.poolSize}
                  size="md"
                  variant="default"
                  showLabel={true}
                  showStatusIcon={true}
                  animate={true}
                  celebrate={true}
                />
              </div>
              {/* Mobile: circular progress */}
              <div className="sm:hidden flex items-center gap-3 w-full">
                <SessionProgressCircle
                  allocated={poolInfo.allocatedTotal}
                  maxPool={poolInfo.poolSize}
                  size={44}
                  strokeWidth={4}
                />
                <div className="flex-1 min-w-0">
                  <SessionProgressBar
                    allocated={poolInfo.allocatedTotal}
                    maxPool={poolInfo.poolSize}
                    size="sm"
                    variant="compact"
                    showLabel={false}
                    animate={true}
                  />
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {poolInfo.allocatedTotal?.toFixed?.(1) || 0} /{" "}
                    {poolInfo.poolSize || 0} points
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* TWO-COLUMN LAYOUT — Allocation + Visualization */}
        {/* ====================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column (2/3) — Main allocation interface */}
          <div className="lg:col-span-2 space-y-4">
            {/* ============================================ */}
            {/* RUBRIC MODE (SRS §4.1.4)                    */}
            {/* ============================================ */}
            {session?.isRubricSession ? (
              <>
                {/* Per-rubric pool overview */}
                <RubricPoolDisplay
                  rubrics={session.rubrics || []}
                  allocationsByHead={rubricTotals}
                  totalPool={poolInfo.poolSize}
                />

                {/* One allocation group per rubric */}
                {(session.rubrics || []).map((rubric) => (
                  <RubricAllocationGroup
                    key={rubric.headId}
                    rubric={rubric}
                    targets={session.targets || []}
                    allocationsByHead={rubricAllocations}
                    rubricAllocated={rubricTotals[rubric.headId] || 0}
                    disabled={rubricSaving || rubricSubmitted}
                    onChange={handleRubricAllocate}
                  />
                ))}

                {/* Rubric error */}
                {rubricError && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200 text-red-700 text-sm">
                    {rubricError}
                  </div>
                )}

                {/* Submit rubrics button */}
                <button
                  onClick={handleRubricSubmit}
                  disabled={rubricSaving || rubricSubmitted}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-50 shadow-lg shadow-indigo-200"
                >
                  {rubricSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : rubricSubmitted ? (
                    "✓ Submitted"
                  ) : (
                    "Submit Rubric Evaluations"
                  )}
                </button>
              </>
            ) : (
              /* STANDARD MODE */
              <ScarcityAllocation
                session={session}
                allocations={allocations}
                poolInfo={poolInfo}
                historySummary={historySummary} // SRS §4.1.2: Historical data
                isLoading={isLoading}
                isSaving={isSaving}
                isDirty={isDirty}
                error={error}
                setAllocation={setAllocation}
                submitAllocations={submitAllocations}
                refresh={refresh}
              />
            )}
          </div>

          {/* Right column (1/3) — Tradeoff visualization */}
          <div className="space-y-6">
            {/* SRS §4.2: Multi-Judge Status Panel */}
            {sessionId && (
              <MultiJudgeStatus sessionId={sessionId} onSubmit={refresh} />
            )}

            {session && session.targets && (
              <TradeoffVisualizer
                targets={session.targets}
                allocations={allocations}
                poolSize={poolInfo.poolSize}
              />
            )}

            {/* ====================================================== */}
            {/* INFO CARD — Explain scarcity rules to the evaluator */}
            {/* ====================================================== */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                How It Works
              </h3>
              <ul className="space-y-2 text-xs text-gray-500">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5">•</span>
                  <span>
                    You have a <strong>fixed pool</strong> of{" "}
                    {poolInfo.poolSize || "—"} points to distribute.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5">•</span>
                  <span>
                    Distribute points based on each person's contribution.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5">•</span>
                  <span>
                    Giving <strong>zero</strong> is valid — it has specific
                    meaning to the system.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5">•</span>
                  <span>
                    You <strong>cannot exceed</strong> the total pool — budget
                    wisely.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold mt-0.5">•</span>
                  <span>
                    Your scores are <strong>private</strong> — other evaluators
                    cannot see them.
                  </span>
                </li>
              </ul>
            </div>

            {/* ====================================================== */}
            {/* SESSION ACTIONS — View Results and Manage Session */}
            {/* ====================================================== */}
            {session && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Session Actions
                </h3>
                {/* View Results — navigates to results page */}
                <button
                  onClick={() => navigate(`/scarcity/results/${sessionId}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors text-sm font-medium"
                >
                  <BarChart3 className="h-4 w-4" />
                  View Results
                </button>
                {/* Manage Session — navigates to session status dashboard */}
                <button
                  onClick={() => navigate(`/sessions/status/${sessionId}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <Settings className="h-4 w-4" />
                  Manage Session
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* SRS §4.1.5 — Zero-Score Reason Dialog (shown before submit) */}
      <ZeroScoreReasonDialog
        isOpen={showZeroReasonDialog}
        onConfirm={(reasons) => submitAllocations(reasons)}
        onCancel={() => setShowZeroReasonDialog(false)}
        zeroAllocations={pendingZeroAllocations}
        evaluationType="scarcity"
      />
    </div>
  );
};

// ============================================================
// Export the ScarcityEvaluationPage component
// ============================================================
export default ScarcityEvaluationPage;
