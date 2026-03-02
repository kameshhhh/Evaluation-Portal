// ============================================================
// INTERACTIVE DEMO — Hands-on Credibility Weighting Explorer
// ============================================================
// Lets users adjust evaluator credibility sliders and see
// how weighted scores change IN REAL TIME. No backend call —
// all math is performed client-side for instant feedback.
//
// SHOWCASE VALUE:
//   "In 30 seconds, anyone understands WHY credibility weighting
//    matters." — Faculty can use this in committee presentations.
//
// FEATURES:
//   1. Slider per evaluator to set credibility (0–100%)
//   2. Real-time weighted average recalculation
//   3. Before/After visual with animated bars
//   4. Quick scenario presets (Expert-Heavy, Novice-Heavy, etc.)
//   5. Weight distribution breakdown
//   6. Insight cards explaining the math
//
// MATHEMATICAL BASIS (SRS 5.2):
//   weighted_mean = Σ(cred_i × score_i) / Σ(cred_i)
//   impact = weighted_mean − raw_mean
//
// PERFORMANCE: All calculations on every slider change are O(n)
//   where n = evaluator count (typically 3–8). No debounce needed.
// ============================================================

import React, { useState, useCallback, useMemo } from "react";
import { Sliders, Scale, Shield, TrendingUp, RotateCcw } from "lucide-react";

// ============================================================
// DEFAULT EVALUATOR DATA — Sample case showing maximum impact
// ============================================================
const DEFAULT_EVALUATORS = [
  { id: 1, name: "Dr. Smith", credibility: 0.92, scoreGiven: 8.5 },
  { id: 2, name: "Prof. Jones", credibility: 0.71, scoreGiven: 6.0 },
  { id: 3, name: "Ms. Taylor", credibility: 0.38, scoreGiven: 9.5 },
  { id: 4, name: "Mr. Davis", credibility: 0.55, scoreGiven: 7.0 },
];

// ============================================================
// PRESET SCENARIOS — One-click demos
// ============================================================
const SCENARIOS = {
  default: {
    label: "Default",
    evaluators: DEFAULT_EVALUATORS,
  },
  expertHeavy: {
    label: "Expert-Heavy",
    evaluators: [
      { id: 1, name: "Expert A", credibility: 0.95, scoreGiven: 8.0 },
      { id: 2, name: "Expert B", credibility: 0.88, scoreGiven: 7.5 },
      { id: 3, name: "Novice C", credibility: 0.25, scoreGiven: 3.0 },
      { id: 4, name: "Novice D", credibility: 0.2, scoreGiven: 4.0 },
    ],
  },
  noviceHeavy: {
    label: "Novice-Heavy",
    evaluators: [
      { id: 1, name: "Expert A", credibility: 0.9, scoreGiven: 7.0 },
      { id: 2, name: "Novice B", credibility: 0.3, scoreGiven: 9.5 },
      { id: 3, name: "Novice C", credibility: 0.25, scoreGiven: 9.0 },
      { id: 4, name: "Novice D", credibility: 0.28, scoreGiven: 8.5 },
    ],
  },
  balanced: {
    label: "Balanced Team",
    evaluators: [
      { id: 1, name: "Member A", credibility: 0.72, scoreGiven: 7.5 },
      { id: 2, name: "Member B", credibility: 0.68, scoreGiven: 7.0 },
      { id: 3, name: "Member C", credibility: 0.75, scoreGiven: 7.8 },
      { id: 4, name: "Member D", credibility: 0.7, scoreGiven: 7.2 },
    ],
  },
  controversial: {
    label: "Controversial",
    evaluators: [
      { id: 1, name: "Senior A", credibility: 0.85, scoreGiven: 4.0 },
      { id: 2, name: "Senior B", credibility: 0.8, scoreGiven: 9.0 },
      { id: 3, name: "Junior C", credibility: 0.45, scoreGiven: 2.0 },
      { id: 4, name: "Junior D", credibility: 0.4, scoreGiven: 10.0 },
    ],
  },
};

// ============================================================
// INSIGHT CARD — Small card at bottom of demo
// ============================================================
const InsightCard = ({ icon, title, description }) => (
  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-purple-500">{icon}</span>
      <span className="text-sm font-semibold text-gray-900">{title}</span>
    </div>
    <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
  </div>
);

// ============================================================
// MAIN COMPONENT: InteractiveDemo
// ============================================================
/**
 * Self-contained interactive demo for credibility weighting.
 * No props required — uses built-in sample data.
 * Can also accept live evaluator data if provided.
 *
 * @param {Object} [props]
 * @param {Object[]} [props.initialEvaluators] — Override default sample data
 */
const InteractiveDemo = ({ initialEvaluators }) => {
  const [evaluators, setEvaluators] = useState(
    initialEvaluators || DEFAULT_EVALUATORS,
  );
  const [activeScenario, setActiveScenario] = useState("default");

  // ── Computed values (recalculated on every slider change) ──
  const rawAverage = useMemo(
    () => evaluators.reduce((s, e) => s + e.scoreGiven, 0) / evaluators.length,
    [evaluators],
  );

  const weightedAverage = useMemo(() => {
    const totalCred = evaluators.reduce((s, e) => s + e.credibility, 0);
    if (totalCred === 0) return rawAverage;
    return evaluators.reduce(
      (s, e) => s + e.scoreGiven * (e.credibility / totalCred),
      0,
    );
  }, [evaluators, rawAverage]);

  const impact = weightedAverage - rawAverage;
  const percentChange = rawAverage > 0 ? (impact / rawAverage) * 100 : 0;

  // ── Handlers ──────────────────────────────────
  const handleCredibilityChange = useCallback((id, newCred) => {
    setEvaluators((prev) =>
      prev.map((e) => (e.id === id ? { ...e, credibility: newCred } : e)),
    );
  }, []);

  const handleScenarioChange = useCallback((key) => {
    setActiveScenario(key);
    setEvaluators(SCENARIOS[key].evaluators.map((e) => ({ ...e })));
  }, []);

  const handleReset = useCallback(() => {
    handleScenarioChange("default");
  }, [handleScenarioChange]);

  // ── Weight distribution (for the weight bars) ──
  const totalCred = evaluators.reduce((s, e) => s + e.credibility, 0);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-2xl p-5 sm:p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full mb-4">
          <Sliders className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Interactive Credibility Demo
        </h2>
        <p className="text-sm sm:text-base text-gray-600 mt-2 max-w-xl mx-auto">
          Drag the sliders to adjust evaluator credibility and watch the
          weighted score change in real time
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* ════════════════════════════════════════ */}
        {/* LEFT: Controls Panel                     */}
        {/* ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl p-5 sm:p-6 shadow-lg">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-gray-900">
              Adjust Evaluator Credibility
            </h3>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title="Reset to default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          {/* ── Evaluator sliders ────────────── */}
          <div className="space-y-6">
            {evaluators.map((evaluator) => (
              <div key={evaluator.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 text-sm">
                    {evaluator.name}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">
                    Score: {evaluator.scoreGiven}/10
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Credibility</span>
                    <span className="font-bold text-purple-600">
                      {(evaluator.credibility * 100).toFixed(0)}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(evaluator.credibility * 100)}
                    onChange={(e) =>
                      handleCredibilityChange(
                        evaluator.id,
                        e.target.value / 100,
                      )
                    }
                    className="w-full h-2 bg-gradient-to-r from-gray-200 to-purple-300 rounded-lg
                               appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:h-5
                               [&::-webkit-slider-thumb]:w-5
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-gradient-to-r
                               [&::-webkit-slider-thumb]:from-purple-600
                               [&::-webkit-slider-thumb]:to-pink-600
                               [&::-webkit-slider-thumb]:shadow-md
                               [&::-webkit-slider-thumb]:cursor-pointer"
                    aria-label={`${evaluator.name} credibility: ${(evaluator.credibility * 100).toFixed(0)}%`}
                  />

                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Low (0%)</span>
                    <span>High (100%)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Scenario presets ──────────────── */}
          <div className="mt-6 pt-5 border-t border-gray-200">
            <h4 className="font-semibold text-gray-800 text-sm mb-3">
              Quick Scenarios
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SCENARIOS)
                .filter(([k]) => k !== "default")
                .map(([key, scenario]) => (
                  <button
                    key={key}
                    onClick={() => handleScenarioChange(key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      activeScenario === key
                        ? "bg-purple-100 border-purple-300 text-purple-800 shadow-sm"
                        : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {scenario.label}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════ */}
        {/* RIGHT: Real-time Results                 */}
        {/* ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl p-5 sm:p-6 shadow-lg">
          <h3 className="text-lg font-bold text-gray-900 mb-5">
            Real-Time Impact Visualization
          </h3>

          <div className="space-y-7">
            {/* ── Impact number ──────────────── */}
            <div className="text-center p-5 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-100">
              <div
                className={`text-4xl sm:text-5xl font-bold mb-1 ${
                  impact >= 0 ? "text-green-700" : "text-red-700"
                }`}
              >
                {impact >= 0 ? "+" : ""}
                {impact.toFixed(2)}
              </div>
              <div className="text-sm font-semibold text-gray-700">
                Credibility Impact
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                ({percentChange >= 0 ? "+" : ""}
                {percentChange.toFixed(1)}% change from raw average)
              </div>
            </div>

            {/* ── Raw average bar ────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#2b8cbe]" />
                  <span className="font-medium text-gray-900 text-sm">
                    Raw Average
                  </span>
                </div>
                <div className="text-xl font-bold text-[#2b8cbe]">
                  {rawAverage.toFixed(2)}
                </div>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-[#2b8cbe] rounded-full"
                  style={{
                    width: `${(rawAverage / 10) * 100}%`,
                    transition: "width 300ms ease-out",
                  }}
                />
              </div>
            </div>

            {/* ── Weighted average bar ───────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#31a354]" />
                  <span className="font-medium text-gray-900 text-sm">
                    Weighted Average
                  </span>
                  {Math.abs(impact) > 0.01 && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                        impact >= 0
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {impact >= 0 ? "+" : ""}
                      {percentChange.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-[#31a354]">
                  {weightedAverage.toFixed(2)}
                </div>
              </div>
              <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                {/* Raw baseline (faint) */}
                <div
                  className="absolute top-0 left-0 h-full bg-blue-200 opacity-40 rounded-full"
                  style={{
                    width: `${(rawAverage / 10) * 100}%`,
                    transition: "width 300ms ease-out",
                  }}
                />
                {/* Weighted fill */}
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-[#31a354] rounded-full"
                  style={{
                    width: `${(weightedAverage / 10) * 100}%`,
                    transition: "width 300ms ease-out",
                  }}
                />
              </div>
            </div>

            {/* ── Weight distribution ────────── */}
            <div>
              <h4 className="font-semibold text-gray-800 text-sm mb-3">
                Credibility Weight Distribution
              </h4>
              <div className="space-y-2">
                {evaluators.map((evaluator) => {
                  const weight =
                    totalCred > 0
                      ? evaluator.credibility / totalCred
                      : 1 / evaluators.length;
                  return (
                    <div key={evaluator.id} className="flex items-center gap-3">
                      <div className="w-20 text-xs font-medium text-gray-600 truncate">
                        {evaluator.name}
                      </div>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full"
                          style={{
                            width: `${weight * 100}%`,
                            transition: "width 300ms ease-out",
                          }}
                        />
                      </div>
                      <div className="w-10 text-right text-xs font-bold text-purple-700">
                        {(weight * 100).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Insight cards ──────────────────────── */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <InsightCard
          icon={<Scale className="h-5 w-5" />}
          title="Fair Weighting"
          description="High-credibility evaluators influence outcomes more, rewarding consistent and reliable judgment"
        />
        <InsightCard
          icon={<Shield className="h-5 w-5" />}
          title="Outlier Protection"
          description="Novice or inconsistent evaluators have less impact, protecting against anomalous scores"
        />
        <InsightCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="Continuous Improvement"
          description="Evaluators build credibility over time through consistent, aligned, disciplined judgments"
        />
      </div>
    </div>
  );
};

export default InteractiveDemo;
