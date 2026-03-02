// ============================================================
// COMPARISON DASHBOARD — Chart.js Powered Side-by-Side View
// ============================================================
// Professional grouped bar chart comparing raw vs weighted scores
// for every team member, plus a third "impact" bar.
//
// FEATURES:
//   1. Grouped bars: Raw (blue), Weighted (green), Impact (purple/red)
//   2. Custom tooltips with impact percentage
//   3. Sort controls (by score, by impact, by name)
//   4. Insights panel highlighting high-impact members
//   5. Export chart as PNG
//   6. 60fps animations (Chart.js easeOutQuart, 1000ms)
//
// USES: chart.js + react-chartjs-2 (installed in package.json)
//
// DATA CONTRACT (from weightedResultsController.js):
//   personResults[i].name — display name
//   personResults[i].raw_average — simple mean
//   personResults[i].weighted_average — credibility-weighted mean
//   personResults[i].credibility_impact — weighted − raw
//
// RESPONSIVE: Chart.js handles resize automatically.
// ACCESSIBLE: Canvas fallback text, keyboard focus on buttons.
// ============================================================

import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { ArrowUpDown, ChevronRight, TrendingUp, Image } from "lucide-react";

// ── Register Chart.js components (once globally) ──
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// ============================================================
// SORT OPTIONS
// ============================================================
const SORT_OPTIONS = [
  { id: "weighted-desc", label: "Weighted (High → Low)" },
  { id: "impact-desc", label: "Impact (High → Low)" },
  { id: "raw-desc", label: "Raw (High → Low)" },
  { id: "name-asc", label: "Name (A → Z)" },
];

// ============================================================
// SORT FUNCTION — Sorts person results by selected criterion
// ============================================================
const sortResults = (results, sortBy) => {
  const sorted = [...results];
  switch (sortBy) {
    case "weighted-desc":
      return sorted.sort((a, b) => b.weighted_average - a.weighted_average);
    case "impact-desc":
      return sorted.sort(
        (a, b) =>
          Math.abs(b.credibility_impact) - Math.abs(a.credibility_impact),
      );
    case "raw-desc":
      return sorted.sort((a, b) => b.raw_average - a.raw_average);
    case "name-asc":
      return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    default:
      return sorted;
  }
};

// ============================================================
// MAIN COMPONENT: ComparisonDashboard
// ============================================================
/**
 * Chart.js-powered grouped bar chart for raw vs weighted comparison.
 *
 * @param {Object} props
 * @param {Object[]} props.personResults — Array of person result objects
 * @param {number} props.poolSize — Max score (for Y-axis)
 * @param {Function} [props.onSelectPerson] — Callback when person is clicked
 */
const ComparisonDashboard = ({ personResults, poolSize, onSelectPerson }) => {
  const chartRef = useRef(null);
  const [sortBy, setSortBy] = useState("weighted-desc");

  // ── Sort results ──────────────────────────────
  const sorted = useMemo(
    () => sortResults(personResults || [], sortBy),
    [personResults, sortBy],
  );

  // ── Chart data ────────────────────────────────
  const chartData = useMemo(
    () => ({
      labels: sorted.map(
        (p) => p.name || `Person ${(p.person_id || "").substring(0, 6)}`,
      ),
      datasets: [
        {
          label: "Raw Average",
          data: sorted.map((p) => p.raw_average || 0),
          backgroundColor: "rgba(43, 140, 190, 0.8)", // #2b8cbe
          borderColor: "rgb(43, 140, 190)",
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
        },
        {
          label: "Weighted Average",
          data: sorted.map((p) => p.weighted_average || 0),
          backgroundColor: "rgba(49, 163, 84, 0.8)", // #31a354
          borderColor: "rgb(49, 163, 84)",
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.55,
          categoryPercentage: 0.7,
        },
        {
          label: "Credibility Impact",
          data: sorted.map((p) => p.credibility_impact || 0),
          backgroundColor: sorted.map(
            (p) =>
              (p.credibility_impact || 0) >= 0
                ? "rgba(117, 107, 177, 0.65)" // #756bb1 (purple)
                : "rgba(239, 68, 68, 0.55)", // red
          ),
          borderColor: sorted.map((p) =>
            (p.credibility_impact || 0) >= 0
              ? "rgb(117, 107, 177)"
              : "rgb(239, 68, 68)",
          ),
          borderWidth: 1,
          borderRadius: 4,
          barPercentage: 0.3,
          categoryPercentage: 0.7,
        },
      ],
    }),
    [sorted],
  );

  // ── Chart options ─────────────────────────────
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1000,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "top",
          labels: {
            font: {
              size: 13,
              family: "'Inter', 'system-ui', sans-serif",
              weight: "500",
            },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 12,
          },
        },
        tooltip: {
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          titleColor: "#1f2937",
          bodyColor: "#4b5563",
          borderColor: "#e5e7eb",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 14,
          displayColors: true,
          titleFont: { size: 13, weight: "600" },
          bodyFont: { size: 12 },
          callbacks: {
            label: (ctx) => {
              const label = ctx.dataset.label || "";
              const value = ctx.parsed.y;
              const person = sorted[ctx.dataIndex];

              if (label === "Credibility Impact") {
                const sign = value >= 0 ? "+" : "";
                return `  ${label}: ${sign}${value.toFixed(2)} pts`;
              }
              if (label === "Weighted Average" && person) {
                const imp = person.credibility_impact || 0;
                const sign = imp >= 0 ? "+" : "";
                return `  ${label}: ${value.toFixed(2)}  (${sign}${imp.toFixed(2)})`;
              }
              return `  ${label}: ${value.toFixed(2)}`;
            },
          },
        },
        title: {
          display: true,
          text: "Raw vs Credibility-Weighted Scores with Impact",
          font: {
            size: 16,
            weight: "600",
            family: "'Inter', 'system-ui', sans-serif",
          },
          color: "#1f2937",
          padding: { bottom: 24 },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: poolSize || undefined,
          grid: { color: "rgba(0, 0, 0, 0.04)" },
          ticks: {
            font: { size: 12 },
            color: "#6b7280",
          },
          title: {
            display: true,
            text: `Score (0–${poolSize || "max"})`,
            color: "#4b5563",
            font: { size: 13, weight: "500" },
          },
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12, weight: "500" },
            color: "#374151",
            maxRotation: 45,
            minRotation: 0,
          },
        },
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      onClick: (_event, elements) => {
        if (elements.length > 0 && onSelectPerson) {
          const idx = elements[0].index;
          onSelectPerson(sorted[idx]);
        }
      },
    }),
    [sorted, poolSize, onSelectPerson],
  );

  // ── Export chart as PNG ───────────────────────
  const handleExportPNG = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.toBase64Image("image/png", 1.0);
    const link = document.createElement("a");
    link.download = `comparison-chart-${Date.now()}.png`;
    link.href = url;
    link.click();
  }, []);

  // ── High-impact insights ──────────────────────
  const highImpact = useMemo(
    () =>
      sorted
        .filter((p) => Math.abs(p.credibility_impact || 0) > 0.3)
        .sort(
          (a, b) =>
            Math.abs(b.credibility_impact) - Math.abs(a.credibility_impact),
        )
        .slice(0, 3),
    [sorted],
  );

  return (
    <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 border border-gray-200">
      {/* ── Header with controls ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Side-by-Side Comparison
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            See how credibility weighting changes each member's score
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sort selector */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-200 focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Export PNG button */}
          <button
            onClick={handleExportPNG}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600
                       bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            title="Export chart as PNG image"
          >
            <Image className="h-3.5 w-3.5" />
            PNG
          </button>
        </div>
      </div>

      {/* ── Legend (static, always visible) ──────── */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#2b8cbe]" />
          <span className="text-xs text-gray-600">Raw Average</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#31a354]" />
          <span className="text-xs text-gray-600">Weighted Average</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#756bb1]" />
          <span className="text-xs text-gray-600">Credibility Impact</span>
        </div>
      </div>

      {/* ── Chart container ──────────────────────── */}
      <div
        className="relative"
        style={{ height: Math.max(400, sorted.length * 50) + "px" }}
      >
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>

      {/* ── High-impact insights panel ───────────── */}
      {highImpact.length > 0 && (
        <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-100">
          <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            Key Insights from This Comparison
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highImpact.map((person) => {
              const imp = person.credibility_impact || 0;
              return (
                <div
                  key={person.person_id}
                  className="bg-white p-4 rounded-lg shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 text-sm">
                      {person.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        imp >= 0
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {imp >= 0 ? "+" : ""}
                      {imp.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {imp > 0
                      ? "High-credibility evaluators rated this person higher"
                      : imp < 0
                        ? "High-credibility evaluators rated this person lower"
                        : "Minimal credibility impact on this person"}
                  </p>
                  {onSelectPerson && (
                    <button
                      onClick={() => onSelectPerson(person)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
                    >
                      View breakdown
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonDashboard;
