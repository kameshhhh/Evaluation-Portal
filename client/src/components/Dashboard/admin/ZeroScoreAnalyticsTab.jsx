// ============================================================
// ZERO SCORE ANALYTICS TAB — Admin View for Zero-Score Patterns
// ============================================================
// SRS §4.1.5 / §8.2 — Admin analytics for evaluator-provided
// zero-score classifications.
//
// Shows:
//   - Total counts and unique evaluator/session/target metrics
//   - Distribution chart (classification × evaluation type)
//   - Top evaluators by zero-score volume
//   - Daily trends (last 30 days)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Users,
  Target,
  Calendar,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Eye,
} from "lucide-react";
import api from "../../../services/api";

// ============================================================
// CLASSIFICATION DISPLAY CONFIG
// ============================================================
const CLASSIFICATION_CONFIG = {
  scarcity_driven: {
    label: "Scarcity Driven",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    barColor: "bg-blue-500",
    icon: "📊",
  },
  below_expectation: {
    label: "Below Expectation",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    barColor: "bg-amber-500",
    icon: "📋",
  },
  insufficient_observation: {
    label: "Insufficient Observation",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    barColor: "bg-gray-500",
    icon: "👁️",
  },
};

// ============================================================
// ZeroScoreAnalyticsTab Component
// ============================================================
const ZeroScoreAnalyticsTab = () => {
  const [analytics, setAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (filterType !== "all") params.evaluationType = filterType;

      const response = await api.get("/zero-score/analytics", { params });
      if (response.data.success) {
        setAnalytics(response.data.data);
      } else {
        setError(response.data.error || "Failed to load analytics");
      }
    } catch (err) {
      setError(err.message || "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading zero-score analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <AlertTriangle className="h-4 w-4 inline mr-2" />
        {error}
      </div>
    );
  }

  if (!analytics) return null;

  const { totals, distribution, topEvaluators, dailyTrends } = analytics;
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* ---- Header + Filter ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-600" />
            Zero-Score Reason Analytics
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Evaluator-provided classifications for zero-point allocations (SRS
            §4.1.5)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="all">All Types</option>
            <option value="scarcity">Scarcity Only</option>
            <option value="comparative">Comparative Only</option>
          </select>
          <button
            onClick={fetchAnalytics}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ---- Summary Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={BarChart3}
          label="Total Reasons"
          value={totals.totalReasons}
          color="amber"
        />
        <SummaryCard
          icon={Users}
          label="Unique Evaluators"
          value={totals.uniqueEvaluators}
          color="blue"
        />
        <SummaryCard
          icon={Target}
          label="Unique Targets"
          value={totals.uniqueTargets}
          color="green"
        />
        <SummaryCard
          icon={Calendar}
          label="Unique Sessions"
          value={totals.uniqueSessions}
          color="purple"
        />
      </div>

      {/* ---- Distribution ---- */}
      {totals.totalReasons > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              Classification Distribution
            </h3>
            <div className="space-y-3">
              {distribution.map((d, idx) => {
                const config =
                  CLASSIFICATION_CONFIG[d.classification] ||
                  CLASSIFICATION_CONFIG.scarcity_driven;
                const pct = Math.round((d.count / maxCount) * 100);

                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-44 flex items-center gap-2">
                      <span>{config.icon}</span>
                      <span className="text-sm text-gray-700 truncate">
                        {config.label}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${config.color}`}
                    >
                      {d.evaluationType}
                    </span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${config.barColor} rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-10 text-right">
                      {d.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- Top Evaluators ---- */}
          {topEvaluators.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                Top Evaluators by Zero-Score Volume
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Evaluator ID</th>
                      <th className="py-2 pr-4 text-right">Total Reasons</th>
                      <th className="py-2 text-right">
                        Classification Variety
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEvaluators.map((ev, idx) => (
                      <tr
                        key={ev.evaluatorId}
                        className="border-b border-gray-50"
                      >
                        <td className="py-2 pr-4 text-gray-400">{idx + 1}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-gray-600">
                          {ev.evaluatorId.slice(0, 8)}...
                        </td>
                        <td className="py-2 pr-4 text-right font-medium">
                          {ev.totalReasons}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              ev.classificationVariety >= 3
                                ? "bg-green-100 text-green-700"
                                : ev.classificationVariety >= 2
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {ev.classificationVariety}/3
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Daily Trends ---- */}
          {dailyTrends.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Eye className="h-4 w-4 text-gray-500" />
                Daily Trends (Last 30 Days)
              </h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {dailyTrends.map((trend, idx) => {
                  const config =
                    CLASSIFICATION_CONFIG[trend.classification] ||
                    CLASSIFICATION_CONFIG.scarcity_driven;
                  return (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 w-24 text-xs">
                        {new Date(trend.day).toLocaleDateString()}
                      </span>
                      <span>{config.icon}</span>
                      <span className="text-gray-600 flex-1">
                        {config.label}
                      </span>
                      <span className="font-medium text-gray-800">
                        {trend.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No zero-score reasons recorded yet</p>
          <p className="text-sm mt-1">
            Data will appear here once evaluators submit allocations with zero
            scores.
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================
// SUMMARY CARD — Reusable stat card
// ============================================================
function SummaryCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    green: "bg-green-50 text-green-600 border-green-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  };

  const iconColorMap = {
    amber: "text-amber-500",
    blue: "text-blue-500",
    green: "text-green-500",
    purple: "text-purple-500",
  };

  return (
    <div
      className={`rounded-xl border p-4 ${colorMap[color] || colorMap.amber}`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className={`h-5 w-5 ${iconColorMap[color]}`} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-75">{label}</div>
    </div>
  );
}

export default ZeroScoreAnalyticsTab;
