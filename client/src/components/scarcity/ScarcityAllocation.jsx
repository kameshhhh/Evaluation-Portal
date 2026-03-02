// ============================================================
// SCARCITY ALLOCATION — Main Evaluation Interface
// ============================================================
// The primary UI for evaluators to distribute scarce points
// across evaluation targets. This is the heart of the
// Scarcity Enforcement Engine frontend.
//
// LAYOUT:
//   ┌─────────────────────────────────────┐
//   │  Session Header (mode, intent)      │
//   ├─────────────────────────────────────┤
//   │  History Summary Banner (SRS 4.1.2) │  <-- NEW
//   ├─────────────────────────────────────┤
//   │  Pool Display (gauge + remaining)   │
//   ├─────────────────────────────────────┤
//   │  Target 1 [Prev:12] ──  [  5 ] [+]  │
//   │  Target 2 [Prev:8]  ──  [  8 ] [+]  │
//   │  Target 3 [NEW]     ──  [  2 ] [+]  │
//   ├─────────────────────────────────────┤
//   │  [Save Allocations]     [Discard]   │
//   └─────────────────────────────────────┘
//
// FEATURES:
//   - Real-time pool gauge updates as inputs change
//   - Zero allocation visual indicators (SRS 4.1.5)
//   - Previous month scores on each target (SRS 4.1.2)
//   - Improvement/decline indicators
//   - Disabled state for closed/locked sessions
//   - Optimistic UI with error recovery
//
// SRS REQUIREMENTS:
//   4.1.2 — Previous month scores display
//   4.1.3 — Scarcity pool constraint enforcement
//   4.1.5 — Zero-score semantic awareness
//   4.2.1 — Judge isolation (only own data visible)
// ============================================================

// Import React for JSX rendering
import React, { useCallback, useMemo } from "react";

// Import sub-components for the allocation interface
import PoolDisplay from "./PoolDisplay";
import AllocationInput from "./AllocationInput";
import HistorySummaryBanner from "./HistorySummaryBanner";

// Import Lucide icons for visual elements
import {
  ClipboardCheck, // Session header icon
  Save, // Save button icon
  RotateCcw, // Discard changes icon
  Loader2, // Spinner for loading states
  AlertCircle, // Error indicator
  CheckCircle2, // Success indicator
  Lock, // Session locked icon
  Target, // Evaluation target icon
} from "lucide-react";

// ============================================================
// ScarcityAllocation Component
// ============================================================
/**
 * Main scarcity evaluation interface.
 * Consumes the useScarcity hook state and actions.
 *
 * @param {Object} props - Component props
 * @param {Object} props.session - Session data from useScarcity
 * @param {Object} props.allocations - Allocation map { targetId → points }
 * @param {Object} props.poolInfo - Pool usage info { poolSize, allocatedTotal, remainingPool, utilization, isExceeded }
 * @param {Object} props.historySummary - SRS §4.1.2: Historical data summary
 * @param {boolean} props.isLoading - Whether session data is loading
 * @param {boolean} props.isSaving - Whether allocations are being submitted
 * @param {boolean} props.isDirty - Whether unsaved changes exist
 * @param {string|null} props.error - Error message or null
 * @param {Function} props.setAllocation - (targetId, points) => void
 * @param {Function} props.submitAllocations - () => Promise
 * @param {Function} props.refresh - () => void
 */
const ScarcityAllocation = ({
  session,
  allocations,
  poolInfo,
  historySummary, // SRS §4.1.2: Historical data for banner
  isLoading,
  isSaving,
  isDirty,
  error,
  setAllocation,
  submitAllocations,
  refresh,
}) => {
  // ----------------------------------------------------------
  // COMPUTED — Whether the session accepts submissions
  // ----------------------------------------------------------
  const canSubmit = useMemo(() => {
    if (!session) return false;
    // Only open and in_progress sessions accept allocations
    const editableStates = ["open", "in_progress"];
    return editableStates.includes(session.status);
  }, [session]);

  // ----------------------------------------------------------
  // COMPUTED — Whether the save button should be enabled
  // ----------------------------------------------------------
  const canSave = useMemo(() => {
    return (
      canSubmit && // Session accepts submissions
      isDirty && // There are unsaved changes
      !isSaving && // Not currently saving
      !poolInfo.isExceeded // Pool is not exceeded
    );
  }, [canSubmit, isDirty, isSaving, poolInfo.isExceeded]);

  // ----------------------------------------------------------
  // HANDLER — Submit allocations
  // ----------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!canSave) return;
    try {
      await submitAllocations();
    } catch {
      // Error is handled by the hook — displayed in the UI
    }
  }, [canSave, submitAllocations]);

  // ----------------------------------------------------------
  // HANDLER — Discard changes (reload from server)
  // ----------------------------------------------------------
  const handleDiscard = useCallback(() => {
    if (isDirty) {
      refresh();
    }
  }, [isDirty, refresh]);

  // ----------------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-gray-500">Loading evaluation...</span>
      </div>
    );
  }

  // ----------------------------------------------------------
  // NO SESSION STATE
  // ----------------------------------------------------------
  if (!session) {
    return (
      <div className="text-center py-16 text-gray-400">
        <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Session not found or not accessible.</p>
      </div>
    );
  }

  // ----------------------------------------------------------
  // RENDER — Main allocation interface
  // ----------------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ====================================================== */}
      {/* SESSION HEADER — Mode, intent, and status */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          {/* Session title */}
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Scarcity Evaluation
          </h2>
          {/* Status badge */}
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${getStatusBadgeColor(session.status)}`}
          >
            {formatStatus(session.status)}
          </span>
        </div>

        {/* Session metadata */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {/* Evaluation mode */}
          <span className="capitalize">
            Mode: {session.evaluationMode?.replace("_", " ") || "—"}
          </span>
          {/* Intent */}
          <span className="capitalize">Intent: {session.intent || "—"}</span>
          {/* Isolation scope */}
          {session.accessScope === "own_only" && (
            <span className="flex items-center gap-1 text-blue-500">
              <Lock className="h-3 w-3" />
              Isolated
            </span>
          )}
        </div>
      </div>

      {/* ====================================================== */}
      {/* POOL DISPLAY — Visual gauge of point budget */}
      {/* ====================================================== */}
      <PoolDisplay
        poolSize={poolInfo.poolSize}
        allocatedTotal={poolInfo.allocatedTotal}
        remainingPool={poolInfo.remainingPool}
        utilization={poolInfo.utilization}
        isExceeded={poolInfo.isExceeded}
      />

      {/* ====================================================== */}
      {/* HISTORY SUMMARY BANNER — SRS §4.1.2 Monthly Review */}
      {/* ====================================================== */}
      {/* Shows whether previous month scores are available */}
      {/* Displayed before error section so it's visible even on error */}
      <HistorySummaryBanner summary={historySummary} session={session} />

      {/* ====================================================== */}
      {/* ERROR DISPLAY — Shown when submission/fetch fails */}
      {/* ====================================================== */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ====================================================== */}
      {/* ALLOCATION INPUTS — One row per target */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
        {/* Section header */}
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Target className="h-4 w-4 text-gray-500" />
          Distribute Points to Targets
        </h3>

        {/* Target allocation rows */}
        <div className="space-y-3">
          {session.targets && session.targets.length > 0 ? (
            session.targets.map((target) => {
              // Current points for this target
              const targetPoints = allocations[target.target_id] || 0;

              // Max points this target can receive:
              // remaining pool + what's already allocated to this target
              const maxForTarget = poolInfo.remainingPool + targetPoints;

              return (
                <AllocationInput
                  key={target.target_id}
                  target={target}
                  points={targetPoints}
                  maxPoints={maxForTarget}
                  onChange={setAllocation}
                  disabled={!canSubmit}
                />
              );
            })
          ) : (
            // Empty state — no targets
            <div className="text-center py-6 text-gray-400">
              <p className="text-sm">No evaluation targets found.</p>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================== */}
      {/* ACTION BUTTONS — Save and discard */}
      {/* ====================================================== */}
      {canSubmit && (
        <div className="flex items-center justify-between">
          {/* Left: Discard button */}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium 
                       text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Discard Changes
          </button>

          {/* Right: Save button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold
                       text-white bg-blue-600 rounded-xl hover:bg-blue-700 
                       disabled:bg-blue-300 disabled:cursor-not-allowed
                       shadow-sm transition-colors"
          >
            {isSaving ? (
              // Spinner during save
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              // Normal save state
              <>
                <Save className="h-4 w-4" />
                Save Allocations
              </>
            )}
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* SAVED SUCCESS INDICATOR — Shown after successful save */}
      {/* ====================================================== */}
      {!isDirty && !isLoading && session.myAllocations?.length > 0 && (
        <div className="flex items-center gap-2 justify-center text-green-600 py-2">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Allocations saved</span>
        </div>
      )}

      {/* ====================================================== */}
      {/* SESSION LOCKED NOTICE */}
      {/* ====================================================== */}
      {!canSubmit && session.status !== "open" && (
        <div className="flex items-center gap-2 justify-center text-gray-400 py-4">
          <Lock className="h-4 w-4" />
          <span className="text-sm">
            This evaluation session is{" "}
            <span className="font-medium">{session.status}</span> — changes are
            not accepted.
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// HELPER FUNCTIONS — Status formatting and colors
// ============================================================

/**
 * Get Tailwind badge color classes for session status.
 *
 * @param {string} status - Status from backend
 * @returns {string} Tailwind CSS classes
 */
const getStatusBadgeColor = (status) => {
  const colorMap = {
    draft: "bg-gray-100 text-gray-600",
    open: "bg-green-100 text-green-700",
    in_progress: "bg-blue-100 text-blue-700",
    closed: "bg-gray-100 text-gray-600",
    locked: "bg-purple-100 text-purple-700",
  };
  return colorMap[status] || "bg-gray-100 text-gray-600";
};

/**
 * Format snake_case status for display.
 *
 * @param {string} status - Status from backend
 * @returns {string} Human-readable text
 */
const formatStatus = (status) => {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

// ============================================================
// Export the ScarcityAllocation component
// ============================================================
export default ScarcityAllocation;
