// ============================================================
// NORMALIZATION EXPLANATION — Step-by-step transparency view
// ============================================================
// SRS §4.4.3 — Faculty see exactly how their score was normalized.
// Shows: raw score → exposure ratios → factors → final score.
// Plain language, no mathematical jargon.
// ============================================================

import React, { useState } from "react";
import {
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Calculator,
  Award,
  BarChart3,
} from "lucide-react";
import ExposureFactorChart from "./ExposureFactorChart";

const NormalizationExplanation = ({ report, onExport }) => {
  const [expandedSteps, setExpandedSteps] = useState({});

  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <Calculator className="h-14 w-14 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-1">
          No Normalization Data
        </h3>
        <p className="text-sm text-gray-400">
          Normalized scores will appear here after evaluations are processed.
        </p>
      </div>
    );
  }

  const toggleStep = (i) =>
    setExpandedSteps((prev) => ({ ...prev, [i]: !prev[i] }));

  // Determine trend icon for percentile
  const PercentileIcon =
    report.department_percentile && report.department_percentile <= 25
      ? TrendingUp
      : report.department_percentile && report.department_percentile >= 75
        ? TrendingDown
        : Minus;
  const percentileColor =
    report.department_percentile && report.department_percentile <= 25
      ? "text-emerald-600"
      : report.department_percentile && report.department_percentile >= 75
        ? "text-red-500"
        : "text-gray-500";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* ── Header ────────────────────────────────── */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-6 py-5 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Your Score Breakdown
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {report.faculty_name} • {report.department || "N/A"}
            </p>
          </div>
          {onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* ── Score Summary Cards ────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
        {/* Raw Score */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Raw Score
          </p>
          <p className="text-3xl font-bold text-gray-800">
            {report.raw_score?.toFixed(2) ?? "—"}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            From {report.student_count ?? 0} evaluations
          </p>
        </div>

        {/* Exposure Factor */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Exposure Factor
          </p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-3xl font-bold text-violet-700">
              ×{report.exposure_factor?.toFixed(3) ?? "—"}
            </p>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Adjusts for teaching load
          </p>
        </div>

        {/* Normalized Score */}
        <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
          <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider mb-1">
            Normalized Score
          </p>
          <p className="text-3xl font-bold text-violet-800">
            {report.normalized_score?.toFixed(2) ?? "—"}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <PercentileIcon className={`h-3.5 w-3.5 ${percentileColor}`} />
            <span className={`text-[11px] ${percentileColor}`}>
              {report.department_percentile
                ? `Top ${report.department_percentile}% in dept`
                : "Percentile N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Exposure Profile Chart ─────────────────── */}
      {report.exposure && (
        <div className="px-6 pb-4">
          <ExposureFactorChart exposure={report.exposure} />
        </div>
      )}

      {/* ── Step-by-Step Calculation ───────────────── */}
      <div className="px-6 py-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-violet-500" />
          Step-by-Step Calculation
        </h3>

        <div className="space-y-2">
          {(report.calculation_steps || []).map((step, i) => (
            <div
              key={i}
              className="border border-gray-100 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleStep(i)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 bg-violet-100 text-violet-700 rounded-full text-xs font-bold">
                    {step.step}
                  </span>
                  <span className="text-sm font-medium text-gray-700 text-left">
                    {step.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">
                    {step.result}
                  </span>
                  {expandedSteps[i] ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </button>
              {expandedSteps[i] && (
                <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-1.5">
                  <p className="text-sm text-gray-600">{step.description}</p>
                  <p className="text-xs font-mono bg-gray-50 text-gray-500 px-3 py-2 rounded">
                    {step.formula}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Department Benchmark (if available) ────── */}
      {report.department_benchmark && (
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Department Comparison
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat
              label="Dept Avg Raw"
              value={report.department_benchmark.avg_raw_score?.toFixed(2)}
            />
            <MiniStat
              label="Dept Avg Norm"
              value={report.department_benchmark.avg_normalized_score?.toFixed(
                2,
              )}
            />
            <MiniStat
              label="Faculty Count"
              value={report.department_benchmark.faculty_count}
            />
            <MiniStat
              label="Avg Sessions"
              value={report.department_benchmark.avg_sessions?.toFixed(1)}
            />
          </div>
        </div>
      )}

      {/* ── Weight Config Info ─────────────────────── */}
      <div className="px-6 py-3 border-t border-gray-100">
        <div className="flex items-start gap-2 text-xs text-gray-400">
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Config: {report.weight_config?.name || "Default"} v
            {report.weight_config?.version || 1}
            {report.weight_config?.use_log_scaling && " • Log scaling enabled"}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Mini stat card within benchmark section ─────────────────

function MiniStat({ label, value }) {
  return (
    <div className="bg-white rounded-lg p-2.5 border border-gray-100 text-center">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-lg font-bold text-gray-800 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

export default NormalizationExplanation;
