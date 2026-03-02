// ============================================================
// EVALUATOR INSIGHTS PANEL — Aggregate Credibility Band Analysis
// ============================================================
// SRS-COMPLIANT: Shows ONLY aggregate band distributions and
// patterns. No individual evaluator names, no exact credibility
// scores, no identity-credibility pairing.
//
// SRS 7.2: "No raw ranking exposure, only trends/percentiles/bands"
// SRS 5.3: "No explicit punishment, statistical dilution only"
// SRS 8.2: "Individual judgments remain private"
//
// Displays:
//   1. Band distribution (HIGH/MEDIUM/LOW counts)
//   2. Evaluation pattern distribution (strict/balanced/lenient)
//   3. Aggregate influence by band
//   4. Consensus level
//
// PERFORMANCE: O(n) aggregation where n = evaluator count.
// ACCESSIBILITY: Grid layout with screen-reader labels.
// ============================================================

import React, { useMemo } from "react";
import { Shield, Activity, BarChart3, Scale } from "lucide-react";

// ============================================================
// Band style config (colors only — no scores exposed)
// ============================================================
const BAND_CONFIG = {
  HIGH: {
    bg: "bg-green-50",
    border: "border-green-200",
    barColor: "bg-green-400",
    badgeBg: "bg-green-100",
    text: "text-green-700",
    label: "High",
    description: "Consistent, well-aligned evaluators",
  },
  MEDIUM: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    barColor: "bg-amber-400",
    badgeBg: "bg-amber-100",
    text: "text-amber-700",
    label: "Medium",
    description: "Moderate consistency and alignment",
  },
  LOW: {
    bg: "bg-red-50",
    border: "border-red-200",
    barColor: "bg-red-400",
    badgeBg: "bg-red-100",
    text: "text-red-700",
    label: "Low",
    description: "Needs improvement in evaluation consistency",
  },
};

const PATTERN_CONFIG = {
  strict: { bg: "bg-blue-100", text: "text-blue-700", label: "Strict" },
  balanced: { bg: "bg-green-100", text: "text-green-700", label: "Balanced" },
  lenient: { bg: "bg-amber-100", text: "text-amber-700", label: "Lenient" },
};

// ============================================================
// MAIN COMPONENT: EvaluatorInsightsPanel
// ============================================================
/**
 * Aggregate-only evaluator credibility analysis.
 * SRS-compliant — no individual evaluator identity exposure.
 *
 * @param {Object} props
 * @param {Object[]} props.evaluatorAnalysis — Per-evaluator analysis objects
 * @param {Object} props.summary — Session summary metrics
 */
const EvaluatorInsightsPanel = ({ evaluatorAnalysis = [], summary }) => {
  // Aggregate band distribution
  const bandDist = useMemo(() => {
    const dist = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    evaluatorAnalysis.forEach((e) => {
      const band = e.credibility_band || "MEDIUM";
      if (dist[band] !== undefined) dist[band]++;
    });
    return dist;
  }, [evaluatorAnalysis]);

  // Aggregate pattern distribution
  const patternDist = useMemo(() => {
    const dist = { strict: 0, balanced: 0, lenient: 0 };
    evaluatorAnalysis.forEach((e) => {
      const label = e.evaluation_pattern?.label || "balanced";
      if (dist[label] !== undefined) dist[label]++;
    });
    return dist;
  }, [evaluatorAnalysis]);

  // Aggregate influence by band
  const bandInfluence = useMemo(() => {
    const inf = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    evaluatorAnalysis.forEach((e) => {
      const band = e.credibility_band || "MEDIUM";
      inf[band] += e.impact_on_results?.total_influence || 0;
    });
    return inf;
  }, [evaluatorAnalysis]);

  const total = evaluatorAnalysis.length;
  const consensus = summary?.consensus_level || 0;

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────── */}
      {/* OVERVIEW BAR — Aggregate only      */}
      {/* ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-purple-500" />
          Evaluator Overview
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Total evaluators */}
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-[10px] text-purple-600 font-medium">
              Total Evaluators
            </p>
            <p className="text-lg font-bold text-purple-900">{total}</p>
          </div>

          {/* HIGH band count */}
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-[10px] text-green-600 font-medium">
              High Credibility
            </p>
            <p className="text-lg font-bold text-green-900">
              {bandDist.HIGH}
              <span className="text-xs font-normal text-green-600 ml-1">
                evaluator{bandDist.HIGH !== 1 ? "s" : ""}
              </span>
            </p>
          </div>

          {/* MEDIUM band count */}
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-[10px] text-amber-600 font-medium">
              Medium Credibility
            </p>
            <p className="text-lg font-bold text-amber-900">
              {bandDist.MEDIUM}
              <span className="text-xs font-normal text-amber-600 ml-1">
                evaluator{bandDist.MEDIUM !== 1 ? "s" : ""}
              </span>
            </p>
          </div>

          {/* Consensus */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-[10px] text-blue-600 font-medium">
              Consensus Level
            </p>
            <p className="text-lg font-bold text-blue-900">
              {(consensus * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────── */}
      {/* BAND DISTRIBUTION CARDS            */}
      {/* ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["HIGH", "MEDIUM", "LOW"].map((band) => {
          const config = BAND_CONFIG[band];
          const count = bandDist[band];
          const pct = total > 0 ? (count / total) * 100 : 0;
          const influence = (bandInfluence[band] * 100).toFixed(0);

          return (
            <div
              key={band}
              className={`rounded-xl border p-5 ${config.bg} ${config.border} transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${config.badgeBg} ${config.text}`}
                >
                  <Shield className="h-3 w-3" />
                  {config.label}
                </span>
                <span className="text-2xl font-bold text-gray-900">
                  {count}
                </span>
              </div>

              <p className="text-[10px] text-gray-500 mb-3">
                {config.description}
              </p>

              {/* Proportion bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>Proportion</span>
                  <span>{pct.toFixed(0)}% of evaluators</span>
                </div>
                <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.barColor} rounded-full transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Aggregate influence */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>Combined Influence</span>
                  <span>{influence}% of total weight</span>
                </div>
                <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${config.barColor} rounded-full transition-all opacity-70`}
                    style={{
                      width: `${Math.min(parseFloat(influence), 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ────────────────────────────────── */}
      {/* EVALUATION PATTERN DISTRIBUTION    */}
      {/* ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-indigo-500" />
          Evaluation Pattern Distribution
        </h3>
        <p className="text-[10px] text-gray-400 mb-4">
          Aggregate view of evaluator scoring tendencies. No individual
          evaluator identities are shown.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {Object.entries(PATTERN_CONFIG).map(([key, style]) => {
            const count = patternDist[key];
            const pct = total > 0 ? (count / total) * 100 : 0;

            return (
              <div key={key} className="text-center">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} mb-2`}
                >
                  {style.label}
                </span>
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-[10px] text-gray-400">
                  {pct.toFixed(0)}% of evaluators
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ────────────────────────────────── */}
      {/* INFLUENCE BY BAND — Aggregate      */}
      {/* ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <Scale className="h-4 w-4 text-blue-500" />
          Influence by Credibility Band
        </h3>
        <p className="text-[10px] text-gray-400 mb-3">
          How each credibility band contributes to the overall weighted result.
          Higher-band evaluators have proportionally more influence per SRS
          4.2.2.
        </p>

        <div className="space-y-3">
          {["HIGH", "MEDIUM", "LOW"].map((band) => {
            const config = BAND_CONFIG[band];
            const influence = bandInfluence[band] * 100;
            const count = bandDist[band];

            return (
              <div key={band} className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium w-20 justify-center ${config.badgeBg} ${config.text}`}
                >
                  <Shield className="h-2.5 w-2.5" />
                  {config.label}
                </span>
                <span className="text-[10px] text-gray-500 w-24">
                  {count} evaluator{count !== 1 ? "s" : ""}
                </span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${config.barColor}`}
                    style={{
                      width: `${Math.min(influence, 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-gray-500 w-16 text-right">
                  {influence.toFixed(0)}% weight
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ────────────────────────────────── */}
      {/* PRIVACY NOTE                       */}
      {/* ────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
        <Shield className="h-3.5 w-3.5 flex-shrink-0" />
        <span>
          Individual evaluator identities and exact credibility scores are kept
          private per SRS 7.2 and 8.2. Only aggregate band distributions are
          shown.
        </span>
      </div>
    </div>
  );
};

export default EvaluatorInsightsPanel;
