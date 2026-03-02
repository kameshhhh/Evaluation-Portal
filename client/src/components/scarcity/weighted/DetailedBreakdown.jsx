// ============================================================
// DETAILED BREAKDOWN — Per-Person Expandable Score Deep-Dive
// ============================================================
// Renders an expandable card for each evaluated person showing:
//   - Raw vs weighted average with impact badge
//   - Per-evaluator score breakdown with credibility weights
//   - Score distribution histogram
//   - Statistical summary (std dev, min, max, range)
//
// BUSINESS CONTEXT (SRS 4.2.2):
//   Provides full transparency into how each person's weighted
//   score was computed. Shows which evaluators contributed what
//   score and how their credibility weight influenced the result.
//
// MATHEMATICAL BASIS:
//   weighted_mean = Σ(normalized_weight_i × score_i)
//   normalized_weight_i = credibility_i / Σ(credibility_j)
//   deviation = score − raw_mean
//
// PERFORMANCE: O(n × m) where n = persons, m = evaluators per person.
//   Only expanded cards render evaluator details (lazy rendering).
//
// ACCESSIBILITY: Expandable sections use ARIA roles and keyboard nav.
// ============================================================

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  BarChart3,
  Shield,
} from "lucide-react";
import ScoreDistributionChart from "./ScoreDistributionChart";

// ============================================================
// MAIN COMPONENT: DetailedBreakdown
// ============================================================
/**
 * Renders expandable cards for each person with full score breakdown.
 *
 * @param {Object} props
 * @param {Object[]} props.personResults — Per-person result objects
 * @param {Object[]} props.evaluatorAnalysis — Per-evaluator analysis
 * @param {number} props.poolSize — Session pool size
 */
const DetailedBreakdown = ({
  personResults = [],
  evaluatorAnalysis = [],
  poolSize,
}) => {
  // Track which person card is expanded (null = none)
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (personId) => {
    setExpandedId(expandedId === personId ? null : personId);
  };

  return (
    <div className="space-y-3">
      {personResults.map((person, idx) => {
        const isExpanded = expandedId === person.person_id;
        const impact = person.credibility_impact || 0;
        const isPositive = impact > 0.001;
        const isNegative = impact < -0.001;

        return (
          <div
            key={person.person_id}
            className="bg-white rounded-xl border border-gray-200/50 shadow-sm overflow-hidden"
          >
            {/* ────────────────────────────────── */}
            {/* COLLAPSED HEADER — Summary row     */}
            {/* ────────────────────────────────── */}
            <button
              onClick={() => toggleExpand(person.person_id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors text-left"
              aria-expanded={isExpanded}
              aria-controls={`detail-${person.person_id}`}
            >
              <div className="flex items-center gap-4">
                {/* Rank badge */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                    idx === 0
                      ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                      : idx === 1
                        ? "bg-gray-100 text-gray-700 border-gray-300"
                        : idx === 2
                          ? "bg-orange-100 text-orange-800 border-orange-300"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {idx + 1}
                </div>

                {/* Person info */}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {person.name}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Raw: {person.raw_average.toFixed(2)} · Weighted:{" "}
                    <span className="font-medium text-gray-600">
                      {person.weighted_average.toFixed(2)}
                    </span>
                    {" · "}
                    {person.evaluator_count} evaluator
                    {person.evaluator_count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Impact badge */}
                <span
                  className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-[10px] font-medium ${
                    isPositive
                      ? "bg-green-100 text-green-700"
                      : isNegative
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : isNegative ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                  {isPositive ? "+" : ""}
                  {impact.toFixed(3)}
                </span>

                {/* Expand/collapse icon */}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* ────────────────────────────────── */}
            {/* EXPANDED DETAIL PANEL              */}
            {/* ────────────────────────────────── */}
            {isExpanded && (
              <div
                id={`detail-${person.person_id}`}
                className="border-t border-gray-100 px-5 py-5 bg-gray-50/30"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT: Evaluator score breakdown */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      Evaluator Breakdown
                    </h4>

                    <div className="space-y-2">
                      {(person.score_breakdown?.evaluator_scores || []).map(
                        (evalScore, idx) => (
                          <div
                            key={evalScore.evaluator_id}
                            className="bg-white rounded-lg border border-gray-100 p-3"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-800">
                                  Evaluator {idx + 1}
                                </span>
                                <CredibilityBandBadge
                                  band={evalScore.credibility_band}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {evalScore.score_given}
                                <span className="text-[10px] text-gray-400 font-normal ml-0.5">
                                  pts
                                </span>
                              </span>
                            </div>

                            {/* Weight bar — band-relative, no exact % */}
                            <div className="flex items-center gap-2 text-[10px]">
                              <span
                                className={`w-14 font-medium ${
                                  evalScore.credibility_band === "HIGH"
                                    ? "text-green-600"
                                    : evalScore.credibility_band === "LOW"
                                      ? "text-red-600"
                                      : "text-amber-600"
                                }`}
                              >
                                {evalScore.credibility_band || "MEDIUM"}
                              </span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    evalScore.credibility_band === "HIGH"
                                      ? "bg-green-400"
                                      : evalScore.credibility_band === "LOW"
                                        ? "bg-red-400"
                                        : "bg-amber-400"
                                  }`}
                                  style={{
                                    width: `${(evalScore.normalized_weight * 100).toFixed(1)}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={`${
                                  evalScore.deviation_from_mean > 0
                                    ? "text-green-600"
                                    : evalScore.deviation_from_mean < 0
                                      ? "text-red-600"
                                      : "text-gray-400"
                                }`}
                              >
                                {evalScore.deviation_from_mean > 0 ? "+" : ""}
                                {evalScore.deviation_from_mean.toFixed(2)} dev
                              </span>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Statistics + Distribution */}
                  <div className="space-y-4">
                    {/* Statistics grid */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Statistics
                      </h4>

                      <div className="grid grid-cols-2 gap-2">
                        {[
                          [
                            "Raw Average",
                            person.raw_average.toFixed(3),
                            "blue",
                          ],
                          [
                            "Weighted Avg",
                            person.weighted_average.toFixed(3),
                            "green",
                          ],
                          [
                            "Std Deviation",
                            (
                              person.score_breakdown?.statistics
                                ?.standard_deviation || 0
                            ).toFixed(3),
                            "purple",
                          ],
                          [
                            "Range",
                            `${person.score_breakdown?.statistics?.min_score || 0} – ${person.score_breakdown?.statistics?.max_score || 0}`,
                            "amber",
                          ],
                        ].map(([label, value, color]) => (
                          <div
                            key={label}
                            className={`bg-${color}-50 rounded-lg px-3 py-2`}
                          >
                            <p
                              className={`text-[10px] text-${color}-600 font-medium`}
                            >
                              {label}
                            </p>
                            <p
                              className={`text-sm font-bold text-${color}-900`}
                            >
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Score distribution histogram */}
                    <ScoreDistributionChart
                      distribution={
                        person.score_breakdown?.statistics
                          ?.score_distribution || []
                      }
                      poolSize={poolSize}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================
// SUB-COMPONENT: CredibilityBandBadge
// ============================================================
/**
 * Color-coded badge showing evaluator's credibility band.
 * HIGH = green, MEDIUM = amber, LOW = red
 *
 * @param {Object} props
 * @param {string} props.band — 'HIGH' | 'MEDIUM' | 'LOW'
 */
const CredibilityBandBadge = ({ band }) => {
  const styles = {
    HIGH: "bg-green-100 text-green-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
        styles[band] || styles.MEDIUM
      }`}
    >
      <Shield className="h-2.5 w-2.5" />
      {band || "MEDIUM"}
    </span>
  );
};

export default DetailedBreakdown;
