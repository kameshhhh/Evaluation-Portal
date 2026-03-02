// ============================================================
// DASHBOARD HEADER — Mobile-First Violet Glassmorphism
// ============================================================
// Responsive design: Horizontal scroll metrics on mobile,
// stacked welcome card. Desktop: Full layout.
// ============================================================

import React, { useState, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  ClipboardList,
  Gem,
  ArrowRight,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
} from "lucide-react";

import { getInitials } from "../../../utils/helpers";
import { ROUTES } from "../../../utils/constants";

// Lazy load the modal for performance (code-split)
const CredibilityDetailsModal = lazy(
  () => import("../../credibility/CredibilityDetailsModal"),
);

/**
 * CSS Keyframes for breathing effect + hide scrollbar
 */
const globalStyles = `
  @keyframes violetBreathing {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  
  .scroll-snap-x {
    scroll-snap-type: x mandatory;
  }
  
  .snap-start {
    scroll-snap-align: start;
  }
`;

/**
 * Single Metric Card — Mobile-optimized Glass Design
 */
const MetricCard = ({
  icon: Icon,
  label,
  value,
  suffix = "",
  isPending = false,
}) => {
  return (
    <div
      className="
        snap-start flex-shrink-0
        w-[160px] sm:w-auto sm:flex-1
        p-4 sm:p-5 rounded-2xl
        bg-white/70 backdrop-blur-sm
        relative overflow-hidden
        active:scale-[0.98] sm:hover:translate-y-[-2px]
        transition-all duration-300
        group
      "
      style={{
        border: "0.5px solid #E0D9FF",
        boxShadow: "0 8px 20px rgba(139, 92, 246, 0.04)",
      }}
    >
      {/* Corner accent */}
      <div
        className="absolute top-3 right-3 w-[6px] h-[6px] rounded-full"
        style={{ backgroundColor: "rgba(124, 58, 237, 0.3)" }}
      />

      <div className="flex items-start gap-3 sm:gap-4">
        {/* Icon container */}
        <div
          className="p-2.5 sm:p-3 rounded-xl flex-shrink-0"
          style={{ backgroundColor: "rgba(124, 58, 237, 0.1)" }}
        >
          <Icon
            className="h-4 w-4 sm:h-5 sm:w-5"
            style={{ color: "#7C3AED" }}
          />
        </div>

        <div className="min-w-0">
          {/* Number */}
          <p
            className="text-2xl sm:text-3xl font-semibold tracking-tight"
            style={{
              color: isPending ? "#7C3AED" : "#1E1E1E",
              animation: isPending
                ? "violetBreathing 2s ease-in-out infinite"
                : "none",
            }}
          >
            {value}
            {suffix && (
              <span
                className="text-sm sm:text-base font-medium ml-0.5"
                style={{ color: "#9CA3AF" }}
              >
                {suffix}
              </span>
            )}
          </p>
          {/* Label */}
          <p
            className="text-xs sm:text-[13px] font-medium mt-0.5 truncate"
            style={{ color: "#6B7280" }}
          >
            {label}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Credibility Metric Card — SRS §5.1 Evaluator Credibility Display
 * Shows score with trend arrow and color-coded based on band.
 *
 * Color Legend:
 *   HIGH (80-100): Green — Excellent reliability
 *   MEDIUM (50-79): Amber — Moderate reliability
 *   LOW (0-49): Red — Needs improvement
 */
const CredibilityMetricCard = ({ score, band, trend, delta, onClick }) => {
  // Determine colors based on credibility band (SRS §5.1)
  const getBandColors = (band) => {
    switch (band) {
      case "HIGH":
        return {
          bg: "rgba(34, 197, 94, 0.1)", // green-500/10
          iconBg: "rgba(34, 197, 94, 0.15)",
          text: "#16A34A", // green-600
          label: "Excellent",
        };
      case "MEDIUM":
        return {
          bg: "rgba(245, 158, 11, 0.1)", // amber-500/10
          iconBg: "rgba(245, 158, 11, 0.15)",
          text: "#D97706", // amber-600
          label: "Good",
        };
      case "LOW":
        return {
          bg: "rgba(239, 68, 68, 0.1)", // red-500/10
          iconBg: "rgba(239, 68, 68, 0.15)",
          text: "#DC2626", // red-600
          label: "Building",
        };
      default:
        // New evaluator or no data — use violet theme
        return {
          bg: "rgba(124, 58, 237, 0.1)",
          iconBg: "rgba(124, 58, 237, 0.15)",
          text: "#7C3AED",
          label: "New",
        };
    }
  };

  // Get trend indicator
  const getTrendIndicator = () => {
    if (!trend || trend === "stable") {
      return { icon: Minus, color: "#9CA3AF", text: "Stable" };
    }
    if (trend === "improving" || (delta && delta > 0)) {
      return { icon: TrendingUp, color: "#16A34A", text: "Rising" };
    }
    if (trend === "declining" || (delta && delta < 0)) {
      return { icon: TrendingDown, color: "#DC2626", text: "Falling" };
    }
    return { icon: Minus, color: "#9CA3AF", text: "Stable" };
  };

  const colors = getBandColors(band);
  const trendInfo = getTrendIndicator();
  const TrendIcon = trendInfo.icon;

  // Get score from profile if provided as full object, otherwise use score prop
  const actualScore = score?.credibility_score !== undefined ? score.credibility_score : score;

  // New evaluator check
  const isNewEvaluator = actualScore === null || actualScore === undefined;

  // Format score for display (expecting 0-1 decimal from service)
  const displayScore = !isNewEvaluator ? parseFloat(actualScore).toFixed(2) : "—";

  return (
    <button
      onClick={onClick}
      className="
        snap-start flex-shrink-0
        w-[160px] sm:w-auto sm:flex-1
        p-4 sm:p-5 rounded-2xl
        bg-white/70 backdrop-blur-sm
        relative overflow-hidden
        active:scale-[0.98] sm:hover:translate-y-[-2px]
        transition-all duration-300
        group cursor-pointer text-left
        focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2
      "
      style={{
        border: "0.5px solid #E0D9FF",
        boxShadow: "0 8px 20px rgba(139, 92, 246, 0.04)",
      }}
      aria-label="View credibility details"
    >
      {/* Corner accent — colored by band */}
      <div
        className="absolute top-3 right-3 w-[6px] h-[6px] rounded-full"
        style={{ backgroundColor: colors.text, opacity: 0.5 }}
      />

      <div className="flex items-start gap-3 sm:gap-4">
        {/* Icon container — Shield for credibility */}
        <div
          className="p-2.5 sm:p-3 rounded-xl flex-shrink-0"
          style={{ backgroundColor: colors.iconBg }}
        >
          <Shield
            className="h-4 w-4 sm:h-5 sm:w-5"
            style={{ color: colors.text }}
          />
        </div>

        <div className="min-w-0 flex-1">
          {/* Score with trend arrow */}
          <div className="flex items-baseline gap-1.5">
            <p
              className="text-2xl sm:text-3xl font-semibold tracking-tight"
              style={{ color: colors.text }}
            >
              {displayScore}
            </p>

            {/* Trend arrow with delta */}
            {!isNewEvaluator && (
              <div
                className="flex items-center gap-0.5"
                style={{ color: trendInfo.color }}
              >
                <TrendIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {delta !== null && delta !== undefined && delta !== 0 && (
                  <span className="text-xs sm:text-sm font-medium">
                    {Math.abs(parseFloat(delta)).toFixed(3)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Label with trend text */}
          <p
            className="text-xs sm:text-[13px] font-medium mt-0.5 truncate"
            style={{ color: "#6B7280" }}
          >
            Credibility{" "}
            {!isNewEvaluator && (
              <span style={{ color: trendInfo.color }}>· {trendInfo.text}</span>
            )}
          </p>
        </div>
      </div>
    </button>
  );
};

/**
 * Dashboard Header Component — Mobile-First Design
 */
const DashboardHeader = ({
  user,
  credibilityScore,
  credibilityBand,
  credibilityTrend,
  credibilityDelta,
  credibility, // Full credibility object for modal
  credibilityHistory = [], // Historical data for trend chart
  stats = {},
}) => {
  // Modal state
  const [isCredibilityModalOpen, setIsCredibilityModalOpen] = useState(false);
  const navigate = useNavigate();

  const {
    activeSessions = 0,
    pendingEvaluations = 0,
    totalTeams = 0,
    totalPool = 0,
  } = stats;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Inject global styles */}
      <style>{globalStyles}</style>

      {/* ====================================================== */}
      {/* WELCOME SECTION — Mobile: Simplified, Desktop: Full */}
      {/* ====================================================== */}
      <div
        className="
          relative p-4 sm:p-6 rounded-2xl
          bg-white/70 backdrop-blur-sm
          overflow-hidden
        "
        style={{
          border: "0.5px solid #E0D9FF",
          boxShadow: "0 8px 20px rgba(139, 92, 246, 0.04)",
        }}
      >
        {/* Violet corner accent */}
        <div
          className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, rgba(124, 58, 237, 0.08) 50%)",
          }}
        />

        {/* Mobile Layout: Vertical stack */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 relative">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Profile circle */}
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user?.name || "User"}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex-shrink-0"
                style={{ border: "2px solid #E0D9FF" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="
                  h-12 w-12 sm:h-14 sm:w-14 rounded-full flex-shrink-0
                  flex items-center justify-center
                  text-base sm:text-lg font-semibold text-white
                "
                style={{
                  background:
                    "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)",
                }}
              >
                {getInitials(user?.name || user?.email || "U")}
              </div>
            )}

            <div className="min-w-0">
              <p className="text-xs sm:text-sm" style={{ color: "#6B7280" }}>
                Welcome back,
              </p>
              {/* Mobile: Name only, Desktop: Name + Role */}
              <h1
                className="text-lg sm:text-2xl font-semibold tracking-tight truncate"
                style={{ color: "#1E1E1E" }}
              >
                {user?.name?.toUpperCase() || "EVALUATOR"}
              </h1>
              {/* Role badge — mobile only shows compact version */}
              <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
                <span
                  className="px-2 py-0.5 text-[11px] font-medium rounded-full"
                  style={{ backgroundColor: "#F5F3FF", color: "#7C3AED" }}
                >
                  Faculty Evaluator
                </span>
              </div>
              {/* Desktop role display */}
              <div className="hidden sm:flex items-center gap-2 mt-0.5">
                <span style={{ color: "#7C3AED" }}>◆</span>
                <span className="text-base" style={{ color: "#6B7280" }}>
                  Faculty Evaluator
                </span>
                <button
                  onClick={() => navigate(`${ROUTES.SCOPE_SETUP}?edit=true`)}
                  className="
                    ml-3 flex items-center gap-1.5 px-3 py-1 
                    bg-violet-50 text-violet-600 rounded-full 
                    text-xs font-semibold hover:bg-violet-100 
                    transition-all border border-violet-100
                  "
                >
                  <Settings className="h-3 w-3" />
                  Edit Search Scope
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Start Review button — Full width on mobile */}
        {pendingEvaluations > 0 && (
          <button
            className="
                inline-flex items-center justify-center gap-2 
                w-full sm:w-auto
                px-5 py-3 sm:px-6 sm:py-3
                bg-white/50 backdrop-blur-sm
                text-sm font-medium rounded-full
                transition-all duration-200
                active:scale-[0.98] sm:hover:bg-[#F5F3FF]
              "
            style={{
              color: "#7C3AED",
              border: "1px solid #7C3AED",
            }}
          >
            Start Review
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ====================================================== */}
      {/* METRICS — Horizontal scroll on mobile, row on desktop */}
      {/* ====================================================== */}
      <div className="relative">
        {/* Fade indicators for scroll on mobile */}
        <div
          className="sm:hidden absolute left-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
          style={{
            background: "linear-gradient(to right, white, transparent)",
          }}
        />
        <div
          className="sm:hidden absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
          style={{
            background: "linear-gradient(to left, white, transparent)",
          }}
        />

        {/* Scrollable container on mobile, flex row on desktop */}
        <div
          className="
            flex gap-3 sm:gap-5
            overflow-x-auto sm:overflow-visible
            hide-scrollbar scroll-snap-x
            -mx-4 px-4 sm:mx-0 sm:px-0
            pb-1
          "
        >
          <MetricCard
            icon={Clock}
            label="Active Sessions"
            value={activeSessions}
          />
          <MetricCard
            icon={ClipboardList}
            label="Pending Evaluations"
            value={pendingEvaluations}
            isPending={pendingEvaluations > 0}
          />
          <MetricCard
            icon={Gem}
            label="Scarcity Pool"
            value={totalPool}
            suffix=" pts"
          />
          {/* Credibility Score — SRS §5.1 */}
          <CredibilityMetricCard
            score={credibilityScore}
            band={credibilityBand}
            trend={credibilityTrend}
            delta={credibilityDelta}
            onClick={() => setIsCredibilityModalOpen(true)}
          />
        </div>
      </div>

      {/* Credibility Details Modal — Lazy loaded */}
      {
        isCredibilityModalOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white p-6 rounded-2xl shadow-xl">
                  <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full mx-auto" />
                  <p className="text-sm text-gray-500 mt-3">Loading...</p>
                </div>
              </div>
            }
          >
            <CredibilityDetailsModal
              isOpen={isCredibilityModalOpen}
              onClose={() => setIsCredibilityModalOpen(false)}
              credibility={
                credibility || {
                  score: credibilityScore,
                  band: credibilityBand,
                  trend: credibilityTrend,
                  delta: credibilityDelta,
                }
              }
              history={credibilityHistory}
            />
          </Suspense>
        )
      }
    </div >
  );
};

export default DashboardHeader;
