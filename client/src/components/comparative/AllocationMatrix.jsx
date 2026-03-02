// ============================================================
// ALLOCATION MATRIX — SRS §4.3 Core Grid Component
// ============================================================
// Matrix layout: Rows = Criteria, Columns = Projects
// Each cell = AllocationCell (number input)
// Shows per-criterion pool gauges + overall pool gauge.
//
// Context: Consumes ComparativeProvider via useComparativeEvaluation
// Design: useReducer + useContext (no prop drilling for cell callbacks)
// SRS §4.1.2, §6.1: Project Delta Visualization integration
// ============================================================

import React, { useState, useCallback, useMemo } from "react";
import {
  Save,
  Send,
  Camera,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useComparativeEvaluation } from "../../hooks/useComparativeEvaluation";
import CriteriaRow from "./CriteriaRow";

// SRS §4.1.2, §6.1: Project Improvement Delta Visualization
import ProjectDeltaBadge from "../analytics/ProjectDeltaBadge";
import { useSessionProjectDeltas } from "../../hooks/useProjectTrajectory";

// ============================================================
// POOL GAUGE — Visual budget indicator for a criterion or total
// ============================================================
function PoolGauge({
  label,
  pool,
  allocated,
  remaining,
  utilization,
  isExceeded,
  compact = false,
}) {
  const barColor = isExceeded
    ? "bg-red-500"
    : utilization >= 75
      ? "bg-amber-500"
      : "bg-green-500";

  const textColor = isExceeded
    ? "text-red-600"
    : utilization >= 75
      ? "text-amber-600"
      : "text-green-600";

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">{label}:</span>
        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
        <span className={`font-medium ${textColor}`}>
          {allocated.toFixed(1)}/{pool.toFixed(1)}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>
          {remaining.toFixed(1)} remaining
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-400">
          {allocated.toFixed(1)} / {pool.toFixed(1)} pts
        </span>
        <span className="text-xs text-gray-400">{utilization.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN ALLOCATION MATRIX
// ============================================================
export default function AllocationMatrix() {
  const {
    session,
    projects,
    criteriaPoolInfo,
    poolInfo,
    isDirty,
    canSave,
    canSubmit,
    isSaving,
    error,
    saveAll,
    submit,
    snapshot,
  } = useComparativeEvaluation();

  // SRS §4.1.2: Bulk prefetch project deltas (N+1 prevention)
  const { deltasMap } = useSessionProjectDeltas(session?.session_id);

  const [saveMessage, setSaveMessage] = useState(null);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [criteriaExpanded, setCriteriaExpanded] = useState(true);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaveMessage(null);
    const result = await saveAll();
    if (result.success) {
      setSaveMessage({ type: "success", text: "Allocations saved" });
      setTimeout(() => setSaveMessage(null), 3000);
    } else {
      setSaveMessage({ type: "error", text: result.error || "Save failed" });
    }
  }, [saveAll]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    const result = await submit();
    if (result.deferred) {
      // Zero-score dialog will be shown — submission deferred
      setShowConfirmSubmit(false);
      return;
    }
    if (result.success) {
      setShowConfirmSubmit(false);
    } else {
      setSaveMessage({ type: "error", text: result.error || "Submit failed" });
    }
  }, [submit]);

  // Snapshot handler
  const handleSnapshot = useCallback(async () => {
    const result = await snapshot();
    if (result.success) {
      setSaveMessage({ type: "success", text: "Snapshot saved" });
      setTimeout(() => setSaveMessage(null), 2000);
    }
  }, [snapshot]);

  if (!session) return null;

  const criteria = session.criteria || [];

  return (
    <div className="space-y-4">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {session.round_name || "Comparative Evaluation"}
            </h2>
            <p className="text-sm text-gray-500">
              Distribute points across {projects.length} projects ×{" "}
              {criteria.length} criteria
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSnapshot}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Save snapshot"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              canSave
                ? "bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            Save
          </button>

          <button
            onClick={() => setShowConfirmSubmit(true)}
            disabled={!canSubmit}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              canSubmit
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
            Submit
          </button>
        </div>
      </div>

      {/* ---- Status messages ---- */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {saveMessage && (
        <div
          className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
            saveMessage.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {saveMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {saveMessage.text}
        </div>
      )}

      {isDirty && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700 text-center">
          Unsaved changes
        </div>
      )}

      {/* ---- Overall Pool Gauge ---- */}
      <PoolGauge
        label="Total Budget"
        pool={poolInfo.totalPool || 0}
        allocated={poolInfo.totalAllocated || 0}
        remaining={poolInfo.remaining || 0}
        utilization={poolInfo.utilization || 0}
        isExceeded={poolInfo.isExceeded || false}
      />

      {/* ---- Per-Criterion Pool Gauges (collapsible) ---- */}
      <div>
        <button
          onClick={() => setCriteriaExpanded(!criteriaExpanded)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          {criteriaExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          Criteria Pools
        </button>

        {criteriaExpanded && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {criteriaPoolInfo.map((c) => (
              <PoolGauge
                key={c.key}
                label={c.name}
                pool={c.pool}
                allocated={c.allocated}
                remaining={c.remaining}
                utilization={c.utilization}
                isExceeded={c.isExceeded}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- THE MATRIX ---- */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Column headers: Projects with Delta Badges (SRS §4.1.2) */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left p-3 text-sm font-semibold text-gray-700 min-w-[180px] sticky left-0 bg-gray-50 z-10">
                  Criteria
                </th>
                {projects.map((project) => (
                  <th
                    key={project.project_id}
                    className="text-center p-3 text-sm font-semibold text-gray-700 min-w-[140px]"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="truncate max-w-[140px]"
                        title={project.project_name}
                      >
                        {project.project_name || "Project"}
                      </div>
                      {/* SRS §4.1.2: Project improvement delta */}
                      <ProjectDeltaBadge
                        projectId={project.project_id}
                        deltaData={deltasMap[project.project_id]}
                        size="sm"
                        showDistribution={false}
                      />
                    </div>
                  </th>
                ))}
                <th className="text-center p-3 text-sm font-semibold text-gray-500 min-w-[100px]">
                  Row Total
                </th>
                <th className="text-center p-3 text-sm font-semibold text-gray-500 min-w-[100px]">
                  Pool
                </th>
              </tr>
            </thead>

            <tbody>
              {criteria.map((criterion, idx) => (
                <CriteriaRow
                  key={criterion.key}
                  criterion={criteriaPoolInfo[idx] || criterion}
                  projects={projects}
                  isLast={idx === criteria.length - 1}
                />
              ))}

              {/* Column totals row */}
              <ColumnTotalsRow
                projects={projects}
                criteriaPoolInfo={criteriaPoolInfo}
                poolInfo={poolInfo}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Submit Confirmation Modal ---- */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Submit Evaluation?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will finalize your comparative allocations. You won't be able
              to modify them after submission.
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
              {criteriaPoolInfo.map((c) => (
                <div key={c.key} className="flex justify-between text-sm">
                  <span className="text-gray-600">{c.name}</span>
                  <span className="font-medium">
                    {c.allocated.toFixed(1)} / {c.pool.toFixed(1)}
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-1 mt-1 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>
                  {(poolInfo.totalAllocated || 0).toFixed(1)} /{" "}
                  {(poolInfo.totalPool || 0).toFixed(1)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "Submitting..." : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COLUMN TOTALS ROW
// ============================================================
function ColumnTotalsRow({ projects, criteriaPoolInfo, poolInfo }) {
  const { allocationMatrix } = useComparativeEvaluation();

  return (
    <tr className="bg-gray-50 border-t-2 border-gray-300">
      <td className="p-3 text-sm font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">
        Column Totals
      </td>
      {projects.map((project) => {
        // Sum all criteria for this project
        const colTotal = criteriaPoolInfo.reduce((sum, c) => {
          const val = (allocationMatrix[c.key] || {})[project.project_id] || 0;
          return sum + val;
        }, 0);

        return (
          <td
            key={project.project_id}
            className="text-center p-3 text-sm font-semibold text-gray-700"
          >
            {colTotal.toFixed(1)}
          </td>
        );
      })}
      <td className="text-center p-3 text-sm font-bold text-indigo-700">
        {(poolInfo.totalAllocated || 0).toFixed(1)}
      </td>
      <td className="text-center p-3 text-sm font-bold text-gray-500">
        {(poolInfo.totalPool || 0).toFixed(1)}
      </td>
    </tr>
  );
}
