// ============================================================
// COMPARATIVE SUBMITTED VIEW — Post-submission readonly view
// ============================================================
// Shown when session status is "submitted" or "locked".
// Displays final allocations in a read-only matrix with summary.
// ============================================================

import React from "react";
import { CheckCircle2, Lock, LayoutGrid } from "lucide-react";
import { useComparativeEvaluation } from "../../hooks/useComparativeEvaluation";

export default function ComparativeSubmittedView() {
  const { session, projects, allocationMatrix, criteriaPoolInfo, poolInfo } =
    useComparativeEvaluation();

  if (!session) return null;

  const criteria = session.criteria || [];
  const isLocked = session.status === "locked";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          {isLocked ? (
            <Lock className="w-8 h-8 text-green-600" />
          ) : (
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          Evaluation {isLocked ? "Locked" : "Submitted"}
        </h1>
        <p className="text-gray-500 mt-1">
          {session.round_name || "Comparative Evaluation"}
        </p>
        {session.submitted_at && (
          <p className="text-sm text-gray-400 mt-1">
            Submitted on {new Date(session.submitted_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-indigo-600">
            {projects.length}
          </span>
          <p className="text-xs text-gray-500 mt-1">Projects</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-indigo-600">
            {criteria.length}
          </span>
          <p className="text-xs text-gray-500 mt-1">Criteria</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-indigo-600">
            {(poolInfo.totalAllocated || 0).toFixed(1)}
          </span>
          <p className="text-xs text-gray-500 mt-1">Points Used</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <span className="text-2xl font-bold text-green-600">
            {(poolInfo.utilization || 0).toFixed(0)}%
          </span>
          <p className="text-xs text-gray-500 mt-1">Utilization</p>
        </div>
      </div>

      {/* Read-only Matrix */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">
            Final Allocations
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 text-sm font-semibold text-gray-600 min-w-[170px]">
                  Criteria
                </th>
                {projects.map((proj) => (
                  <th
                    key={proj.project_id}
                    className="text-center p-3 text-sm font-semibold text-gray-600 min-w-[120px]"
                  >
                    <div
                      className="truncate max-w-[120px]"
                      title={proj.project_name}
                    >
                      {proj.project_name || "Project"}
                    </div>
                  </th>
                ))}
                <th className="text-center p-3 text-sm font-semibold text-gray-500">
                  Total
                </th>
                <th className="text-center p-3 text-sm font-semibold text-gray-500">
                  Pool
                </th>
              </tr>
            </thead>

            <tbody>
              {criteriaPoolInfo.map((criterion, idx) => {
                const allocs = allocationMatrix[criterion.key] || {};
                const rowTotal = Object.values(allocs).reduce(
                  (sum, v) => sum + v,
                  0,
                );

                return (
                  <tr
                    key={criterion.key}
                    className={
                      idx < criteriaPoolInfo.length - 1
                        ? "border-b border-gray-100"
                        : ""
                    }
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          {criterion.name}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {criterion.weight}%
                        </span>
                      </div>
                    </td>
                    {projects.map((proj) => {
                      const val = allocs[proj.project_id] || 0;
                      return (
                        <td key={proj.project_id} className="text-center p-3">
                          <span
                            className={`inline-block w-12 py-1 rounded text-sm font-medium ${
                              val === 0
                                ? "text-gray-300"
                                : "text-gray-800 bg-indigo-50"
                            }`}
                          >
                            {val.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-center p-3 text-sm font-semibold text-gray-700">
                      {rowTotal.toFixed(1)}
                    </td>
                    <td className="text-center p-3 text-sm text-gray-500">
                      {(criterion.pool || 0).toFixed(1)}
                    </td>
                  </tr>
                );
              })}

              {/* Column totals */}
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td className="p-3 text-sm font-semibold text-gray-700">
                  Column Totals
                </td>
                {projects.map((proj) => {
                  const colTotal = criteriaPoolInfo.reduce((sum, c) => {
                    return (
                      sum +
                      ((allocationMatrix[c.key] || {})[proj.project_id] || 0)
                    );
                  }, 0);
                  return (
                    <td
                      key={proj.project_id}
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Criterion Utilization */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {criteriaPoolInfo.map((c) => (
          <div
            key={c.key}
            className="bg-white rounded-lg border border-gray-200 p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">{c.name}</span>
              <span className="text-xs text-gray-400">
                {(c.utilization || 0).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.min(c.utilization || 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {(c.allocated || 0).toFixed(1)} / {(c.pool || 0).toFixed(1)} pts
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
