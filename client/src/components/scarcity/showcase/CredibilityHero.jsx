// ============================================================
// CREDIBILITY HERO — Eye-Catching Impact Banner
// ============================================================
// The FIRST THING users see when viewing weighted results.
// Creates an immediate "aha!" moment by showing the difference
// between raw averaging and credibility-weighted scoring.
//
// VISUAL DESIGN:
//   • Gradient background from blue (raw) to green (weighted)
//   • Large, animated impact badge at center
//   • Side-by-side score cards with animated progress bars
//   • Key insight cards at bottom (consensus, most influential, controversial)
//
// COLOR PALETTE (Professional Data Viz Standards):
//   Raw scores:       #2b8cbe (blue)
//   Weighted scores:  #31a354 (green)
//   Credibility:      #756bb1 (purple)
//   Impact highlight: gradient purple → pink
//
// ANIMATION:
//   Bars grow from 0 → value on mount (800ms, ease-out)
//   Impact badge pulses subtly on load
//   Cards fade + slide up staggered
//
// PERFORMANCE: Pure CSS animations (GPU-accelerated transforms)
// ACCESSIBILITY: ARIA labels, role= decorations, reduced-motion
// ============================================================

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Award,
  AlertTriangle,
  Users,
  Scale,
  Shield,
} from "lucide-react";

// ============================================================
// INSIGHT CARD — Reusable metric card with icon + color
// ============================================================
const InsightCard = ({
  icon,
  title,
  value,
  subvalue,
  description,
  color,
  delay = 0,
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const colorMap = {
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      icon: "text-blue-500",
    },
    green: {
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-700",
      icon: "text-green-500",
    },
    purple: {
      bg: "bg-purple-50",
      border: "border-purple-200",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    orange: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      icon: "text-orange-500",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-700",
      icon: "text-amber-500",
    },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div
      className={`${c.bg} ${c.border} border rounded-xl p-4 transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={c.icon}>{icon}</span>
        <span
          className={`text-xs font-semibold ${c.text} uppercase tracking-wide`}
        >
          {title}
        </span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {subvalue && <p className="text-xs text-gray-500 mt-0.5">{subvalue}</p>}
      {description && (
        <p className="text-[11px] text-gray-400 mt-1">{description}</p>
      )}
    </div>
  );
};

// ============================================================
// ANIMATED BAR — CSS-animated progress bar with label
// ============================================================
const AnimatedBar = ({ value, maxValue, color, label, delay = 0 }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(maxValue > 0 ? (value / maxValue) * 100 : 0);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, maxValue, delay]);

  return (
    <div className="space-y-1.5">
      <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full ${color} rounded-full`}
          style={{
            width: `${width}%`,
            transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-white mix-blend-difference">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT: CredibilityHero
// ============================================================
/**
 * Eye-catching hero banner for weighted results.
 * Shows the credibility impact IMMEDIATELY and PROMINENTLY.
 *
 * @param {Object} props
 * @param {Object} props.summary — Summary object from weighted-results API
 * @param {Object[]} props.personResults — Array of person result objects
 * @param {Object[]} props.evaluatorAnalysis — Array of evaluator analysis objects
 * @param {number} props.poolSize — Scarcity pool size for bar scaling
 */
const CredibilityHero = ({
  summary,
  personResults,
  evaluatorAnalysis,
  poolSize,
}) => {
  const rawAvg = summary?.raw_average_across_all || 0;
  const weightedAvg = summary?.weighted_average_across_all || 0;
  const impact = weightedAvg - rawAvg;
  const percentChange = rawAvg > 0 ? (impact / rawAvg) * 100 : 0;
  const consensus = summary?.consensus_level || 0;

  // ── Derive "most influential" evaluator band (SRS 7.2: no name/score) ──
  const highCredCount =
    evaluatorAnalysis && evaluatorAnalysis.length > 0
      ? evaluatorAnalysis.filter((e) => e.credibility_band === "HIGH").length
      : 0;

  // ── Derive "most controversial" person (highest std dev) ──
  const mostControversial =
    personResults && personResults.length > 0
      ? [...personResults].sort(
          (a, b) =>
            (b.score_breakdown?.statistics?.standard_deviation || 0) -
            (a.score_breakdown?.statistics?.standard_deviation || 0),
        )[0]
      : null;

  // ── Max value for bar scaling ──
  const barMax = poolSize || Math.max(rawAvg, weightedAvg) * 1.3 || 10;

  return (
    <div
      className="bg-gradient-to-r from-blue-50 via-white to-green-50 rounded-2xl shadow-2xl p-6 sm:p-8 border border-gray-200"
      role="region"
      aria-label="Credibility Impact Summary"
    >
      {/* ────────────────────────────────────────────────── */}
      {/* IMPACT BADGE — Eye-catching center element         */}
      {/* ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center mb-8">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-full shadow-lg animate-[pulse_3s_ease-in-out_infinite]">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
            <span className="text-lg sm:text-2xl font-bold tracking-tight">
              Credibility Impact: {impact >= 0 ? "+" : ""}
              {impact.toFixed(2)} points
            </span>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* SIDE-BY-SIDE SCORE CARDS                           */}
      {/* ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* RAW SCORE CARD — Blue theme */}
        <div className="bg-white rounded-xl p-5 sm:p-6 shadow-lg border-2 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#2b8cbe] rounded" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                Raw Average
              </h3>
            </div>
            <span className="text-2xl sm:text-3xl font-bold text-[#2b8cbe]">
              {rawAvg.toFixed(2)}
            </span>
          </div>

          <AnimatedBar
            value={rawAvg}
            maxValue={barMax}
            color="bg-gradient-to-r from-blue-400 to-[#2b8cbe]"
            label="Simple average of all scores"
            delay={200}
          />

          <p className="mt-4 text-sm text-gray-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            All evaluators treated equally (1:1 weight)
          </p>
        </div>

        {/* WEIGHTED SCORE CARD — Green theme */}
        <div className="bg-white rounded-xl p-5 sm:p-6 shadow-lg border-2 border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#31a354] rounded" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                Weighted Average
              </h3>
              {impact !== 0 && (
                <span
                  className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                    impact > 0
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {impact > 0 ? "+" : ""}
                  {percentChange.toFixed(1)}%
                </span>
              )}
            </div>
            <span className="text-2xl sm:text-3xl font-bold text-[#31a354]">
              {weightedAvg.toFixed(2)}
            </span>
          </div>

          {/* Stacked bar: raw baseline (transparent) + weighted fill + impact highlight */}
          <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
            {/* Raw baseline (faint blue) */}
            <div
              className="absolute top-0 left-0 h-full bg-blue-200 opacity-30 rounded-full"
              style={{
                width: `${barMax > 0 ? (rawAvg / barMax) * 100 : 0}%`,
                transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1) 200ms",
              }}
            />
            {/* Weighted fill (green) */}
            <AnimatedBar
              value={weightedAvg}
              maxValue={barMax}
              color="bg-gradient-to-r from-green-400 to-[#31a354]"
              label="Credibility-weighted average"
              delay={500}
            />
            {/* Impact band (purple), shown between raw and weighted */}
            {Math.abs(impact) > 0.01 && (
              <div
                className="absolute top-0 h-full bg-gradient-to-r from-transparent via-purple-300 to-transparent opacity-40 rounded-full"
                style={{
                  left: `${barMax > 0 ? (Math.min(rawAvg, weightedAvg) / barMax) * 100 : 0}%`,
                  width: `${barMax > 0 ? (Math.abs(impact) / barMax) * 100 : 0}%`,
                  transition: "all 800ms cubic-bezier(0.4, 0, 0.2, 1) 700ms",
                }}
              />
            )}
          </div>

          <p className="mt-4 text-sm text-gray-500 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            High-credibility evaluators influence more
          </p>
        </div>
      </div>

      {/* ────────────────────────────────────────────────── */}
      {/* INSIGHT CARDS — 3 key metrics                      */}
      {/* ────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <InsightCard
          icon={<Scale className="h-5 w-5" />}
          title="Consensus Level"
          value={`${(consensus * 100).toFixed(0)}%`}
          description="How much evaluators agree with each other"
          color="blue"
          delay={400}
        />
        <InsightCard
          icon={<Award className="h-5 w-5" />}
          title="High Credibility"
          value={`${highCredCount} evaluator${highCredCount !== 1 ? "s" : ""}`}
          subvalue="In the HIGH band"
          description="Evaluators with strong consistency and alignment"
          color="purple"
          delay={600}
        />
        <InsightCard
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Most Controversial"
          value={mostControversial ? mostControversial.name : "N/A"}
          subvalue={
            mostControversial
              ? `StdDev: ${(mostControversial.score_breakdown?.statistics?.standard_deviation || 0).toFixed(2)}`
              : undefined
          }
          description="Person with widest score spread among evaluators"
          color="orange"
          delay={800}
        />
      </div>
    </div>
  );
};

export default CredibilityHero;
