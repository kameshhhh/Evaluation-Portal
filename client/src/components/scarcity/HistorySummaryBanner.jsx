// ============================================================
// HISTORY SUMMARY BANNER — Session-Level Historical Context
// ============================================================
// SRS §4.1.2: Session-level historical context display
//
// Displays at the top of evaluation page showing:
// - Whether previous session data exists
// - How many members have historical data
// - Coverage percentage
// - Link to view detailed history comparison
//
// This banner gives evaluators immediate awareness that they're
// scoring in a growth-aware context, not in isolation.
// ============================================================

// Import React for JSX rendering
import React from "react";

// Import icons for visual elements
import {
  Calendar, // Period/date indicator
  TrendingUp, // Growth indicator
  Info, // First session info
  ChevronRight, // Link arrow
  BarChart3, // Analytics link
} from "lucide-react";

// ============================================================
// HistorySummaryBanner Component
// ============================================================
/**
 * Renders a banner showing historical data summary for the session.
 * Two rendering modes:
 * 1. No previous session — "First evaluation session" message
 * 2. Has previous session — Coverage stats and comparison link
 *
 * @param {Object} props - Component props
 * @param {Object} props.summary - History summary from API
 *   - hasPrevious: boolean — Whether previous session exists
 *   - previousSessionMonth: string — e.g., "October"
 *   - totalTargets: number — Total targets being evaluated
 *   - targetsWithHistory: number — Targets with previous scores
 *   - coveragePercentage: number — Percentage with history
 * @param {Object} props.session - Current session details
 *   - id: string — Session UUID
 *   - period: { monthName, monthIndex, semester }
 */
const HistorySummaryBanner = ({ summary, session }) => {
  // If summary is null or undefined, show nothing
  // This prevents flash of wrong content during loading
  if (!summary) return null;

  // ============================================================
  // RENDER — First Evaluation Session (no previous data)
  // ============================================================
  if (!summary.hasPrevious) {
    return (
      // Gray banner for first-time sessions
      <div className="bg-gray-50 border-l-4 border-gray-400 rounded-r-lg p-4 mb-6">
        <div className="flex items-center">
          {/* Info icon */}
          <Info className="h-5 w-5 text-gray-500 mr-3 flex-shrink-0" />

          {/* Message content */}
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">First evaluation session.</span> No
              previous month data available. Your scores will establish the
              baseline for future growth tracking.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER — Has Previous Session (history available)
  // ============================================================
  return (
    // Blue banner for sessions with historical context
    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 mb-6">
      <div className="flex items-start justify-between">
        {/* Left side — Icon and message */}
        <div className="flex items-start">
          {/* Trending up icon — visual indicator of growth awareness */}
          <TrendingUp className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />

          {/* Main content */}
          <div>
            {/* Title */}
            <p className="text-sm font-medium text-blue-800">
              Historical Comparison Available
            </p>

            {/* Description with coverage stats */}
            <p className="text-sm text-blue-700 mt-1">
              Comparing against{" "}
              <span className="font-medium">
                {summary.previousPeriodMonth || summary.previousSessionMonth}
              </span>{" "}
              session.
              {summary.targetsWithHistory > 0 && (
                <>
                  {" "}
                  {summary.targetsWithHistory} of {summary.totalTargets} members
                  have previous scores ({summary.coveragePercentage}% coverage).
                </>
              )}
            </p>

            {/* Legend explaining the visual indicators */}
            <p className="text-xs text-blue-600 mt-2">
              Previous scores shown in gray badges. Green{" "}
              <span className="text-green-600 font-medium">▲</span> =
              improvement, Red{" "}
              <span className="text-red-600 font-medium">▼</span> = decline.
            </p>
          </div>
        </div>

        {/* Right side — Optional: Link to comparison view */}
        {summary.previousSessionId && (
          <a
            href={`/analytics/session-comparison/${session?.id}/${summary.previousSessionId}`}
            className="flex items-center text-sm font-medium text-blue-700 
                       hover:text-blue-900 hover:underline transition-colors"
            title="Compare sessions side-by-side"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Compare Sessions
            <ChevronRight className="h-4 w-4 ml-0.5" />
          </a>
        )}
      </div>
    </div>
  );
};

// Export for use in evaluation pages
export default HistorySummaryBanner;
