// ================================================================
// IMPROVEMENT INDICATOR — SRS 4.1.2 Trend Analysis
// ================================================================
// Visualizes improvement metrics across score, productivity, and
// consistency. Shows bar indicators and a textual summary.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  Loader2,
  Activity,
  Zap,
  Target,
} from "lucide-react";
import { getImprovementSummary } from "../../../services/projectEnhancementApi";

const MetricCard = ({ label, value, icon: Icon, description }) => {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const bgClass = isPositive
    ? "bg-green-50 border-green-200"
    : isNegative
      ? "bg-red-50 border-red-200"
      : "bg-gray-50 border-gray-200";

  const textClass = isPositive
    ? "text-green-700"
    : isNegative
      ? "text-red-700"
      : "text-gray-600";

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  // Normalize to 0-100 for bar width
  const barWidth = Math.min(Math.abs(value) * 10, 100);

  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className={textClass} />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className={`flex items-center gap-1 font-bold ${textClass}`}>
          <TrendIcon size={16} />
          {isPositive ? "+" : ""}
          {value != null ? value.toFixed(1) : "—"}%
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-white rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isPositive
              ? "bg-green-500"
              : isNegative
                ? "bg-red-400"
                : "bg-gray-300"
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {description && (
        <p className="text-xs text-gray-500 mt-2">{description}</p>
      )}
    </div>
  );
};

const ImprovementIndicator = ({ projectId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getImprovementSummary(projectId);
        setData(res.data);
      } catch (err) {
        console.error("Failed to load improvement data:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading improvement data...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">
          No improvement data available yet. Data will appear after multiple
          evaluations.
        </p>
      </div>
    );
  }

  const overallTrend =
    (data.score_improvement || 0) +
    (data.productivity_improvement || 0) +
    (data.consistency_improvement || 0);
  const overallLabel =
    overallTrend > 3
      ? "Strong Improvement"
      : overallTrend > 0
        ? "Slight Improvement"
        : overallTrend < -3
          ? "Declining"
          : overallTrend < 0
            ? "Slight Decline"
            : "Stable";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            Improvement Indicators
          </h3>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            overallTrend > 0
              ? "bg-green-100 text-green-700"
              : overallTrend < 0
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {overallLabel}
        </span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Score"
          value={data.score_improvement || 0}
          icon={Target}
          description="Change in evaluation score vs prior review"
        />
        <MetricCard
          label="Productivity"
          value={data.productivity_improvement || 0}
          icon={Zap}
          description="Change in logged hours and deliverables"
        />
        <MetricCard
          label="Consistency"
          value={data.consistency_improvement || 0}
          icon={Activity}
          description="Regularity of work log entries over time"
        />
      </div>

      {/* Member-level breakdown (if available) */}
      {data.members && data.members.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Member
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Score
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Productivity
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Consistency
                </th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.person_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-gray-700">
                    {m.display_name || m.person_id}
                  </td>
                  {["score", "productivity", "consistency"].map((metric) => {
                    const val = m[`${metric}_improvement`] || 0;
                    return (
                      <td
                        key={metric}
                        className={`px-4 py-2 text-center font-medium ${
                          val > 0
                            ? "text-green-600"
                            : val < 0
                              ? "text-red-600"
                              : "text-gray-400"
                        }`}
                      >
                        {val > 0 ? "+" : ""}
                        {val.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h5 className="text-xs font-medium text-blue-700 mb-1">
            Recommendations
          </h5>
          <ul className="list-disc list-inside text-sm text-blue-800 space-y-0.5">
            {data.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ImprovementIndicator;
