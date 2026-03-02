// ============================================================
// CREDIBILITY DETAILS MODAL — SRS §5.1 Transparency Layer
// ============================================================
// Full breakdown of evaluator credibility score with:
//   1. Factor-by-factor analysis with progress bars
//   2. Historical trend chart
//   3. Actionable improvement tips
//
// Design Principles:
//   - Transparency: Users see exactly how score is calculated
//   - Actionable: Clear guidance on what affects credibility
//   - Non-punitive: Focus on improvement, not punishment
//   - Mobile-first: Works on all device sizes
// ============================================================

import React, { useState, useEffect, useRef, Suspense } from "react";
import PropTypes from "prop-types";
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  BarChart3,
  Lightbulb,
  Shield,
} from "lucide-react";

// Lazy load the chart component for performance
const CredibilityTrendChart = React.lazy(
  () => import("./CredibilityTrendChart"),
);

/**
 * CredibilityDetailsModal — Full transparency breakdown
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility state
 * @param {Function} props.onClose - Close handler
 * @param {Object} props.credibility - Credibility data object
 * @param {Array} [props.history] - Historical credibility data
 */
const CredibilityDetailsModal = ({
  isOpen,
  onClose,
  credibility,
  history = [],
}) => {
  const modalRef = useRef(null);
  const [activeTab, setActiveTab] = useState("breakdown");

  // Extract credibility values with defaults
  const {
    score = null,
    band = null,
    trend = "stable",
    delta = null,
    alignment = null,
    stability = null,
    discipline = null,
    totalSessions = 0,
    lastCalculated = null,
  } = credibility || {};

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden"; // Prevent background scroll
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Close when clicking backdrop
  const handleBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  // Get color scheme based on credibility band
  const getBandColors = (band) => {
    switch (band) {
      case "HIGH":
        return {
          bg: "bg-green-100",
          text: "text-green-600",
          border: "border-green-200",
          fill: "bg-green-500",
          label: "Excellent",
        };
      case "MEDIUM":
        return {
          bg: "bg-amber-100",
          text: "text-amber-600",
          border: "border-amber-200",
          fill: "bg-amber-500",
          label: "Good",
        };
      case "LOW":
        return {
          bg: "bg-red-100",
          text: "text-red-600",
          border: "border-red-200",
          fill: "bg-red-500",
          label: "Building",
        };
      default:
        return {
          bg: "bg-violet-100",
          text: "text-violet-600",
          border: "border-violet-200",
          fill: "bg-violet-500",
          label: "New",
        };
    }
  };

  // Get factor color based on score (0-1 decimal scale)
  const getFactorColor = (factorScore) => {
    if (factorScore === null || factorScore === undefined) return "bg-gray-300";
    if (factorScore >= 0.80) return "bg-green-500";
    if (factorScore >= 0.60) return "bg-amber-500";
    if (factorScore >= 0.40) return "bg-orange-500";
    return "bg-red-500";
  };

  // Get trend info
  const getTrendInfo = () => {
    if (trend === "improving" || (delta && delta > 0)) {
      return { icon: TrendingUp, color: "text-green-600", text: "Rising" };
    }
    if (trend === "declining" || (delta && delta < 0)) {
      return { icon: TrendingDown, color: "text-red-600", text: "Falling" };
    }
    return { icon: Minus, color: "text-gray-500", text: "Stable" };
  };

  // Get improvement tips based on factor scores
  const getImprovementTips = () => {
    const tips = [];

    if (alignment !== null && alignment < 0.70) {
      tips.push({
        factor: "Alignment",
        tip: "Review how your scores compare to the weighted consensus. Consider whether you're applying the rubric consistently with peers.",
        priority: alignment < 0.50 ? "high" : "medium",
      });
    }

    if (stability !== null && stability < 0.70) {
      tips.push({
        factor: "Stability",
        tip: "Your scoring patterns show some variance over time. Try to apply consistent criteria across all evaluation sessions.",
        priority: stability < 0.50 ? "high" : "medium",
      });
    }

    if (discipline !== null && discipline < 0.70) {
      tips.push({
        factor: "Discipline",
        tip: "Complete evaluations earlier before deadlines. Rushed evaluations tend to be less consistent.",
        priority: discipline < 0.50 ? "high" : "medium",
      });
    }

    if (totalSessions < 5) {
      tips.push({
        factor: "Experience",
        tip: "You're building your evaluation history. Credibility improves naturally as you complete more evaluations consistently.",
        priority: "info",
      });
    }

    if (tips.length === 0) {
      tips.push({
        factor: "Excellent Work",
        tip: "Your credibility is strong! Keep maintaining consistent, timely evaluations. Consider mentoring newer evaluators.",
        priority: "success",
      });
    }

    return tips;
  };

  const colors = getBandColors(band);
  const trendInfo = getTrendInfo();
  const TrendIcon = trendInfo.icon;
  const displayScore = score !== null ? parseFloat(score).toFixed(2) : "—";
  const isNewEvaluator = score === null;

  // Factor data for breakdown tab
  const factors = [
    {
      name: "Alignment",
      score: alignment,
      weight: "50%",
      description:
        "How closely your per-rubric evaluations match the credibility-weighted consensus",
    },
    {
      name: "Stability",
      score: stability,
      weight: "30%",
      description: "Consistency of your scoring patterns across sessions",
    },
    {
      name: "Discipline",
      score: discipline,
      weight: "20%",
      description: "Mark utilization, differentiation, and range usage across rubrics",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />

      {/* Modal Container */}
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Modal Content */}
        <div
          ref={modalRef}
          className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl transform transition-all"
          style={{ maxHeight: "90vh" }}
        >
          {/* ====================================================== */}
          {/* HEADER */}
          {/* ====================================================== */}
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${colors.bg}`}>
                <Shield className={`h-5 w-5 ${colors.text}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Credibility Score
                </h2>
                <p className="text-xs text-gray-500">
                  SRS §5.1 — Evaluator Reliability
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>

          {/* ====================================================== */}
          {/* SCORE DISPLAY */}
          {/* ====================================================== */}
          <div className="p-6 text-center border-b border-gray-100">
            <div
              className={`inline-flex items-center justify-center h-20 w-20 rounded-2xl ${colors.bg} ${colors.text} text-3xl font-bold mb-3`}
            >
              {displayScore}
            </div>

            <div className="flex items-center justify-center gap-2 text-sm">
              <span className={`font-medium ${colors.text}`}>
                {colors.label}
              </span>

              {!isNewEvaluator && delta !== null && delta !== 0 && (
                <>
                  <span className="text-gray-300">•</span>
                  <span
                    className={`flex items-center gap-1 ${trendInfo.color}`}
                  >
                    <TrendIcon className="h-4 w-4" />
                    {Math.abs(delta).toFixed(3)} {trendInfo.text.toLowerCase()}
                  </span>
                </>
              )}
            </div>

            {totalSessions > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Based on {totalSessions} evaluation
                {totalSessions !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* ====================================================== */}
          {/* TABS */}
          {/* ====================================================== */}
          <div className="border-b border-gray-100">
            <nav className="flex px-6">
              {[
                { id: "breakdown", label: "Breakdown", icon: BarChart3 },
                { id: "trend", label: "Trend", icon: TrendingUp },
                { id: "tips", label: "Tips", icon: Lightbulb },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      flex items-center gap-1.5 px-4 py-3 text-sm font-medium
                      border-b-2 transition-colors
                      ${
                        isActive
                          ? "border-violet-600 text-violet-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }
                    `}
                  >
                    <TabIcon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* ====================================================== */}
          {/* TAB CONTENT */}
          {/* ====================================================== */}
          <div
            className="p-6 overflow-y-auto"
            style={{ maxHeight: "calc(90vh - 320px)" }}
          >
            {/* BREAKDOWN TAB */}
            {activeTab === "breakdown" && (
              <div className="space-y-5">
                <p className="text-sm text-gray-600">
                  Your credibility score is calculated from three factors, each
                  weighted to reflect its importance in evaluation quality.
                </p>

                {factors.map((factor) => (
                  <div key={factor.name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">
                          {factor.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({factor.weight})
                        </span>
                      </div>
                      <span
                        className={`font-semibold ${
                          factor.score !== null
                            ? factor.score >= 0.70
                              ? "text-green-600"
                              : factor.score >= 0.50
                                ? "text-amber-600"
                                : "text-red-600"
                            : "text-gray-400"
                        }`}
                      >
                        {factor.score !== null ? parseFloat(factor.score).toFixed(2) : "—"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${getFactorColor(factor.score)}`}
                        style={{ width: `${(factor.score ?? 0) * 100}%` }}
                      />
                    </div>

                    <p className="text-xs text-gray-500">
                      {factor.description}
                    </p>
                  </div>
                ))}

                {/* Info box */}
                <div className="mt-6 p-4 bg-violet-50 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-violet-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-violet-800">
                        How is this calculated?
                      </p>
                      <p className="text-xs text-violet-700 mt-1">
                        Your score uses EMA (Exponential Moving Average)
                        smoothing, giving more weight to recent evaluations
                        while preserving historical patterns. This prevents
                        extreme swings from single sessions.
                      </p>
                      {lastCalculated && (
                        <p className="text-xs text-violet-600 mt-2">
                          Last updated:{" "}
                          {new Date(lastCalculated).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TREND TAB */}
            {activeTab === "trend" && (
              <div className="space-y-5">
                <p className="text-sm text-gray-600">
                  Your credibility over time. Consistent improvement indicates
                  reliable evaluation patterns.
                </p>

                {/* Trend Chart */}
                <Suspense
                  fallback={
                    <div className="h-[200px] bg-gray-50 rounded-xl animate-pulse flex items-center justify-center">
                      <span className="text-sm text-gray-400">
                        Loading chart...
                      </span>
                    </div>
                  }
                >
                  <CredibilityTrendChart
                    history={history}
                    currentScore={score}
                    height={200}
                  />
                </Suspense>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-1">Current</p>
                    <p className={`text-xl font-bold ${colors.text}`}>
                      {displayScore}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-1">Average</p>
                    <p className="text-xl font-bold text-gray-700">
                      {history.length > 0
                        ? (
                            history.reduce(
                              (acc, h) => acc + (h.score || 0),
                              0,
                            ) / history.length
                          ).toFixed(2)
                        : displayScore}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-1">Trend</p>
                    <div
                      className={`flex items-center justify-center gap-1 ${trendInfo.color}`}
                    >
                      <TrendIcon className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {trendInfo.text}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TIPS TAB */}
            {activeTab === "tips" && (
              <div className="space-y-4">
                {getImprovementTips().map((tip, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-xl ${
                      tip.priority === "high"
                        ? "bg-red-50 border border-red-100"
                        : tip.priority === "medium"
                          ? "bg-amber-50 border border-amber-100"
                          : tip.priority === "success"
                            ? "bg-green-50 border border-green-100"
                            : "bg-blue-50 border border-blue-100"
                    }`}
                  >
                    <p
                      className={`text-sm font-medium mb-1 ${
                        tip.priority === "high"
                          ? "text-red-800"
                          : tip.priority === "medium"
                            ? "text-amber-800"
                            : tip.priority === "success"
                              ? "text-green-800"
                              : "text-blue-800"
                      }`}
                    >
                      {tip.factor}
                    </p>
                    <p
                      className={`text-sm ${
                        tip.priority === "high"
                          ? "text-red-700"
                          : tip.priority === "medium"
                            ? "text-amber-700"
                            : tip.priority === "success"
                              ? "text-green-700"
                              : "text-blue-700"
                      }`}
                    >
                      {tip.tip}
                    </p>
                  </div>
                ))}

                {/* Why credibility matters */}
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
                  <p className="text-sm font-medium text-gray-800 mb-2">
                    💡 Why Credibility Matters
                  </p>
                  <p className="text-sm text-gray-600">
                    Your credibility score determines how much weight your
                    evaluations carry in final calculations. Higher credibility
                    means your assessments have greater influence on student
                    outcomes.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    <strong>The system is non-punitive</strong> — inconsistent
                    evaluations are statistically diluted rather than penalized.
                    Focus on improvement, not fear.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* FOOTER */}
          {/* ====================================================== */}
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

CredibilityDetailsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  credibility: PropTypes.shape({
    score: PropTypes.number,
    band: PropTypes.string,
    trend: PropTypes.string,
    delta: PropTypes.number,
    alignment: PropTypes.number,
    stability: PropTypes.number,
    discipline: PropTypes.number,
    totalSessions: PropTypes.number,
    lastCalculated: PropTypes.string,
  }),
  history: PropTypes.array,
};

export default CredibilityDetailsModal;
