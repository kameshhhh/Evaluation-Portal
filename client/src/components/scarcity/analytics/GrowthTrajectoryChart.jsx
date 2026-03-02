// ============================================================
// GROWTH TRAJECTORY CHART — Temporal Growth Visualization
// ============================================================
// Implements SRS Section 6: Temporal Growth Tracking UI
//
// Displays a person's score growth trajectory over academic
// periods using a line chart with growth category indicators.
//
// FEATURES:
//   • Line chart showing month-over-month score progression
//   • Growth category badges (significant_growth → significant_decline)
//   • Overall trend indicator (improving, stable, declining)
//   • Period-over-period delta highlights
//
// PROPS:
//   personId — UUID of the person to display growth for
//
// DOES NOT modify any existing components.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  Activity,
  Calendar,
} from "lucide-react";
import { getGrowthHistory } from "../../../services/analyticsApi";

// ============================================================
// Growth category color mapping (SRS 6)
// ============================================================
const GROWTH_COLORS = {
  significant_growth: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-300",
  },
  moderate_growth: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-300",
  },
  stable: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-300",
  },
  moderate_decline: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-300",
  },
  significant_decline: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-300",
  },
};

const GROWTH_ICONS = {
  significant_growth: TrendingUp,
  moderate_growth: ArrowUpRight,
  stable: Minus,
  moderate_decline: ArrowDownRight,
  significant_decline: TrendingDown,
};

// ============================================================
// GrowthTrajectoryChart Component
// ============================================================
const GrowthTrajectoryChart = ({ personId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch growth history on mount
  const fetchData = useCallback(async () => {
    if (!personId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getGrowthHistory(personId, 12);
      setData(response.data);
    } catch (err) {
      setError(err.message || "Failed to load growth data");
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">
            Loading growth data...
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // No data state
  if (!data || !data.trajectory || data.trajectory.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          <Activity className="w-5 h-5 inline mr-2" />
          Growth Trajectory
        </h3>
        <p className="text-sm text-gray-500">
          No growth data available. Data appears after at least two evaluation
          periods.
        </p>
      </div>
    );
  }

  // Render chart
  const trajectory = data.trajectory || [];
  const overallTrend = data.overallTrend || "stable";
  const maxScore = Math.max(
    ...trajectory.map((t) => parseFloat(t.score_to || t.current_score || 0)),
    1,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" />
          Growth Trajectory
          <span className="text-xs font-normal text-gray-400 ml-1">SRS §6</span>
        </h3>

        {/* Overall trend badge */}
        <TrendBadge trend={overallTrend} />
      </div>

      {/* SRS Bar-based trajectory visualization */}
      <div className="space-y-3 mb-6">
        {trajectory.map((point, idx) => {
          const score = parseFloat(point.score_to || point.current_score || 0);
          const barWidth = Math.max(5, (score / maxScore) * 100);
          const growth = parseFloat(point.growth_percentage || 0);
          const category = point.growth_category || "stable";
          const colors = GROWTH_COLORS[category] || GROWTH_COLORS.stable;
          const GrowthIcon = GROWTH_ICONS[category] || Minus;

          return (
            <div key={idx} className="flex items-center gap-3">
              {/* Period label */}
              <div className="w-24 flex-shrink-0 text-right">
                <span className="text-xs text-gray-500 flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3" />
                  {point.period_label || `P${idx + 1}`}
                </span>
              </div>

              {/* Score bar */}
              <div className="flex-1 h-7 bg-gray-50 rounded-lg overflow-hidden relative">
                <div
                  className={`h-full rounded-lg transition-all duration-500 ${
                    growth >= 0 ? "bg-indigo-400" : "bg-amber-400"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-gray-700">
                  {score.toFixed(1)}
                </span>
              </div>

              {/* Growth delta */}
              <div
                className={`w-24 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${colors.bg} ${colors.text}`}
              >
                <GrowthIcon className="w-3 h-3" />
                {growth > 0 ? "+" : ""}
                {growth.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      {data.summaries && data.summaries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-100">
          <StatCard
            label="Avg Growth"
            value={`${(data.summaries.reduce((s, r) => s + parseFloat(r.growth_percentage || 0), 0) / data.summaries.length).toFixed(1)}%`}
            positive
          />
          <StatCard label="Periods" value={trajectory.length} />
          <StatCard
            label="Trend"
            value={overallTrend.replace("_", " ")}
            capitalize
          />
        </div>
      )}
    </div>
  );
};

// ============================================================
// TrendBadge — Displays overall trend with icon and color
// ============================================================
const TrendBadge = ({ trend }) => {
  const config = {
    improving: {
      icon: TrendingUp,
      color: "bg-emerald-100 text-emerald-700",
      label: "Improving",
    },
    stable: {
      icon: Minus,
      color: "bg-gray-100 text-gray-600",
      label: "Stable",
    },
    declining: {
      icon: TrendingDown,
      color: "bg-red-100 text-red-700",
      label: "Declining",
    },
    volatile: {
      icon: Activity,
      color: "bg-amber-100 text-amber-700",
      label: "Volatile",
    },
  };

  const { icon: Icon, color, label } = config[trend] || config.stable;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

// ============================================================
// StatCard — Small metric display card
// ============================================================
const StatCard = ({ label, value, positive, capitalize }) => (
  <div className="text-center">
    <div
      className={`text-sm font-semibold ${positive ? "text-indigo-600" : "text-gray-900"} ${capitalize ? "capitalize" : ""}`}
    >
      {value}
    </div>
    <div className="text-xs text-gray-400">{label}</div>
  </div>
);

export default GrowthTrajectoryChart;
