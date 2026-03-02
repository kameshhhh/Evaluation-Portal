// ============================================================
// ALLOCATION INPUT — Individual Target Point Allocation Control
// ============================================================
// Renders a single row for allocating points to one target person.
// Shows the target name, role, and a point input with +/- controls.
//
// FEATURES:
//   - Real-time validation (no negative, shows remaining)
//   - Visual feedback for zero allocation (SRS 4.1.5 significance)
//   - Disabled state when session is not accepting allocations
//   - Previous month score badge (SRS §4.1.2)
//   - Improvement indicator showing delta vs previous
//
// SRS 4.1.3: "No per-member upper cap" — input allows any value
//            up to the total pool size.
// SRS 4.1.2: "Judges shall see: Last month's score (per member)"
// ============================================================

// Import React for JSX rendering
import React, { useCallback, useState } from "react";

// Import Lucide icons for visual elements
import {
  User, // Target person icon
  Plus, // Increment button
  Minus, // Decrement button
  AlertCircle, // Zero warning icon
  Clock, // Previous score indicator
  TrendingUp, // Improvement indicator
  TrendingDown, // Decline indicator
  Info, // Tooltip info
} from "lucide-react";

// Import SparklineChart for trajectory visualization (SRS §6.1)
import SparklineChart from "../analytics/SparklineChart";
// Import HistoricalTrendModal for detailed view on click
import HistoricalTrendModal from "../analytics/HistoricalTrendModal";

// ============================================================
// AllocationInput Component
// ============================================================
/**
 * Single target allocation input row with historical context.
 *
 * @param {Object} props - Component props
 * @param {Object} props.target - Target person data including history:
 *   - target_id: UUID
 *   - display_name: Display name
 *   - role_in_project: Role string
 *   - has_history: Boolean - whether previous score exists
 *   - previous_score: Number - previous month score
 *   - previous_total: Number - previous pool size
 *   - previous_percentage: Number - percentage of pool
 *   - previous_session_month: String - e.g., "October"
 * @param {number} props.points - Current points allocated to this target
 * @param {number} props.maxPoints - Maximum points this target could receive
 * @param {Function} props.onChange - Callback when points change
 * @param {boolean} props.disabled - Whether the input is disabled
 */
const AllocationInput = ({ target, points, maxPoints, onChange, disabled }) => {
  // State for showing detailed tooltip
  const [showTooltip, setShowTooltip] = useState(false);
  // State for showing historical trend modal (SRS §6.1)
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // ----------------------------------------------------------
  // Handlers — Point adjustment controls
  // ----------------------------------------------------------

  /**
   * Handle direct numeric input change.
   * Clamps value to [0, maxPoints] range.
   */
  const handleInputChange = useCallback(
    (e) => {
      const rawValue = e.target.value;

      if (rawValue === "" || rawValue === undefined) {
        onChange(target.target_id, 0);
        return;
      }

      const numValue = parseFloat(rawValue);
      if (isNaN(numValue)) return;

      const clamped = Math.max(0, numValue);
      onChange(target.target_id, clamped);
    },
    [target.target_id, onChange],
  );

  /**
   * Increment points by 1.
   */
  const handleIncrement = useCallback(() => {
    if (points < maxPoints) {
      onChange(target.target_id, points + 1);
    }
  }, [target.target_id, points, maxPoints, onChange]);

  /**
   * Decrement points by 1.
   */
  const handleDecrement = useCallback(() => {
    if (points > 0) {
      onChange(target.target_id, points - 1);
    }
  }, [target.target_id, points, onChange]);

  // ----------------------------------------------------------
  // Computed — Previous score and improvement calculations
  // SRS §4.1.2: Display historical context
  // ----------------------------------------------------------
  const hasHistory = target.has_history && target.previous_score != null;

  // Calculate improvement/decline delta when we have history AND a current score
  const delta =
    hasHistory && points > 0
      ? Math.round((points - target.previous_score) * 10) / 10
      : null;

  const improvementPercentage =
    hasHistory && target.previous_score > 0 && points > 0
      ? Math.round((delta / target.previous_score) * 100)
      : null;

  // Get background color for previous score badge based on performance
  const getPreviousBadgeColor = () => {
    if (!hasHistory) return "bg-gray-100 text-gray-600";
    const pct =
      target.previous_percentage ||
      (target.previous_score / (target.previous_total || 15)) * 100;
    if (pct >= 80) return "bg-green-100 text-green-800";
    if (pct >= 60) return "bg-blue-100 text-blue-800";
    if (pct >= 40) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  // ----------------------------------------------------------
  // Visual state — Highlight zero allocations
  // ----------------------------------------------------------
  const isZero = points === 0;
  const borderClass = isZero
    ? "border-amber-200 bg-amber-50/30"
    : "border-gray-100 bg-white";

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border ${borderClass} transition-colors`}
    >
      {/* Left section — Target person info with history badge */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Avatar placeholder */}
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-blue-600" />
        </div>

        {/* Name, role, and historical context */}
        <div className="min-w-0 flex-1">
          {/* Target name row with previous score badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900 truncate">
              {target.display_name ||
                target.targetName ||
                target.name ||
                "Unknown"}
            </p>

            {/* Previous Score Badge — SRS §4.1.2 */}
            {hasHistory && (
              <div
                className="relative"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full 
                              text-xs font-medium ${getPreviousBadgeColor()} cursor-help`}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Prev: {target.previous_score}
                </span>

                {/* Detailed tooltip on hover */}
                {showTooltip && (
                  <div
                    className="absolute z-20 left-0 bottom-full mb-2 w-56 
                                  bg-white rounded-lg shadow-lg border border-gray-200 
                                  p-3 text-xs"
                  >
                    <div className="font-medium text-gray-900 mb-2">
                      Previous Month Score
                    </div>
                    <div className="space-y-1 text-gray-600">
                      <div className="flex justify-between">
                        <span>Score:</span>
                        <span className="font-medium">
                          {target.previous_score}/{target.previous_total || 15}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Percentage:</span>
                        <span className="font-medium">
                          {target.previous_percentage ||
                            Math.round(
                              (target.previous_score /
                                (target.previous_total || 15)) *
                                100,
                            )}
                          %
                        </span>
                      </div>
                      {target.previous_evaluator_count && (
                        <div className="flex justify-between">
                          <span>Evaluators:</span>
                          <span className="font-medium">
                            {target.previous_evaluator_count}
                          </span>
                        </div>
                      )}
                      {target.previous_session_month && (
                        <div className="flex justify-between">
                          <span>Period:</span>
                          <span className="font-medium">
                            {target.previous_session_month}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 text-gray-500 italic">
                      Credibility-weighted average
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sparkline — SRS §6.1 Trajectory Visualization */}
            {hasHistory && target.target_id && (
              <SparklineChart
                memberId={target.target_id}
                size="xs"
                limit={6}
                showTooltip={true}
                onClick={() => setShowHistoryModal(true)}
              />
            )}
          </div>

          {/* Role and improvement indicator row */}
          <div className="flex items-center gap-2 mt-0.5">
            {/* Target role */}
            {target.role_in_project && (
              <p className="text-xs text-gray-400 capitalize">
                {target.role_in_project}
              </p>
            )}

            {/* Improvement/Decline Indicator — SRS §4.1.2 */}
            {delta !== null && points > 0 && (
              <div
                className={`flex items-center text-xs ${
                  delta > 0
                    ? "text-green-600"
                    : delta < 0
                      ? "text-red-600"
                      : "text-gray-500"
                }`}
              >
                {delta > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    <span>▲ +{delta}</span>
                  </>
                ) : delta < 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                    <span>▼ {delta}</span>
                  </>
                ) : (
                  <span>● Same</span>
                )}
                {improvementPercentage !== null &&
                  improvementPercentage !== 0 && (
                    <span className="ml-1">
                      ({improvementPercentage > 0 ? "+" : ""}
                      {improvementPercentage}%)
                    </span>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right section — Point input controls */}
      <div className="flex items-center gap-2">
        {/* Zero allocation indicator */}
        {isZero && !disabled && (
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
        )}

        {/* Decrement button */}
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || points <= 0}
          className="h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 
                     disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label={`Decrease points for ${target.display_name}`}
        >
          <Minus className="h-3.5 w-3.5 text-gray-600" />
        </button>

        {/* Numeric input */}
        <input
          type="number"
          value={points}
          onChange={handleInputChange}
          disabled={disabled}
          min="0"
          step="0.5"
          className="w-16 h-8 text-center text-sm font-bold text-gray-900 
                     border border-gray-200 rounded-lg 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                     disabled:bg-gray-50 disabled:text-gray-400
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none 
                     [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`Points for ${target.display_name}`}
        />

        {/* Increment button */}
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || points >= maxPoints}
          className="h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40
                     disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          aria-label={`Increase points for ${target.display_name}`}
        >
          <Plus className="h-3.5 w-3.5 text-gray-600" />
        </button>
      </div>

      {/* Historical Trend Modal — SRS §6.1 */}
      <HistoricalTrendModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        memberId={target.target_id}
        memberName={
          target.display_name || target.targetName || target.name || "Member"
        }
      />
    </div>
  );
};

// ============================================================
// Export the AllocationInput component
// ============================================================
export default AllocationInput;
