// ============================================================
// CREDIBILITY IMPACT CHART — Visualize Credibility Influence
// ============================================================
// Renders two visualizations:
//   1. Impact Bar Chart — Shows the credibility impact (positive/
//      negative shift) for each person
//   2. Evaluator Credibility Distribution — Shows how credibility
//      scores map to influence weights
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Makes visible the "invisible hand" of credibility weighting.
//   Users can see exactly how much credibility shifts each score.
//
// MATHEMATICAL BASIS:
//   impact = weighted_average − raw_average
//   Positive impact = high-credibility evaluators gave higher scores
//   Negative impact = high-credibility evaluators gave lower scores
//
// IMPLEMENTATION:
//   Pure CSS-based charts (no external charting library dependency).
//   Uses Tailwind utility classes for responsive sizing.
//
// PERFORMANCE: O(n) rendering where n = persons + evaluators.
// ============================================================

import React from "react";
import { Shield, Activity } from "lucide-react";

// ============================================================
// MAIN COMPONENT: CredibilityImpactChart
// ============================================================
/**
 * Two-panel visualization of credibility impact.
 *
 * @param {Object} props
 * @param {Object} props.visualization — Pre-formatted visualization data
 * @param {Object[]} props.evaluatorAnalysis — Per-evaluator analysis
 */
const CredibilityImpactChart = ({ visualization, evaluatorAnalysis = [] }) => {
  const impactData = visualization?.impact_chart;
  const credData = visualization?.credibility_distribution;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ────────────────────────────────────────── */}
      {/* PANEL 1: Credibility Impact Per Person     */}
      {/* ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-purple-500" />
          Credibility Impact by Person
        </h3>
        <p className="text-[10px] text-gray-400 mb-4">
          How credibility weighting shifts each person's score. Green = score
          increased, Red = score decreased.
        </p>

        {impactData ? (
          <div className="space-y-3">
            {impactData.labels.map((label, idx) => {
              const impact = impactData.impacts[idx] || 0;
              const direction = impactData.directions[idx] || "neutral";

              // Calculate bar width as percentage of max impact
              const maxImpact = Math.max(
                ...impactData.impacts.map((i) => Math.abs(i)),
                0.001,
              );
              const barWidth = (Math.abs(impact) / maxImpact) * 100;

              return (
                <div key={label + idx} className="group">
                  {/* Label row */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600 font-medium truncate max-w-[140px]">
                      {label}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-medium ${
                        direction === "positive"
                          ? "text-green-600"
                          : direction === "negative"
                            ? "text-red-600"
                            : "text-gray-400"
                      }`}
                    >
                      {impact > 0 ? "+" : ""}
                      {impact.toFixed(3)}
                    </span>
                  </div>

                  {/* Bidirectional impact bar */}
                  <div className="relative h-4 bg-gray-50 rounded-full overflow-hidden">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 w-px h-full bg-gray-200 z-10" />

                    {/* Impact bar */}
                    {direction === "positive" ? (
                      <div
                        className="absolute top-0 left-1/2 h-full bg-green-400 rounded-r-full transition-all"
                        style={{ width: `${barWidth / 2}%` }}
                      />
                    ) : direction === "negative" ? (
                      <div
                        className="absolute top-0 h-full bg-red-400 rounded-l-full transition-all"
                        style={{
                          width: `${barWidth / 2}%`,
                          right: "50%",
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-xs">
            No impact data available
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────── */}
      {/* PANEL 2: Credibility Band Distribution     */}
      {/* SRS 7.2 compliant — bands only, no names   */}
      {/* ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-blue-500" />
          Credibility Band Distribution
        </h3>
        <p className="text-[10px] text-gray-400 mb-4">
          How evaluator credibility bands contribute to weighted results. Higher
          bands have more influence.
        </p>

        {credData ? (
          <div className="space-y-4">
            {/* Aggregate by band */}
            {(() => {
              const bandAgg = {
                HIGH: { count: 0, totalWeight: 0 },
                MEDIUM: { count: 0, totalWeight: 0 },
                LOW: { count: 0, totalWeight: 0 },
              };
              credData.bands.forEach((band, idx) => {
                const b = band || "MEDIUM";
                if (bandAgg[b]) {
                  bandAgg[b].count++;
                  bandAgg[b].totalWeight += credData.weights_applied[idx] || 0;
                }
              });

              const bandConfig = {
                HIGH: {
                  barColor: "bg-green-400",
                  badgeBg: "bg-green-100",
                  text: "text-green-700",
                },
                MEDIUM: {
                  barColor: "bg-amber-400",
                  badgeBg: "bg-amber-100",
                  text: "text-amber-700",
                },
                LOW: {
                  barColor: "bg-red-400",
                  badgeBg: "bg-red-100",
                  text: "text-red-700",
                },
              };

              return ["HIGH", "MEDIUM", "LOW"].map((band) => {
                const { count, totalWeight } = bandAgg[band];
                const config = bandConfig[band];
                const influencePct = totalWeight * 100;

                return (
                  <div key={band}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${config.badgeBg} ${config.text}`}
                        >
                          {band}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {count} evaluator{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-600">
                        {influencePct.toFixed(0)}% influence
                      </span>
                    </div>

                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${config.barColor} rounded-full transition-all`}
                        style={{ width: `${Math.min(influencePct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-xs">
            No credibility data available
          </div>
        )}
      </div>
    </div>
  );
};

export default CredibilityImpactChart;
