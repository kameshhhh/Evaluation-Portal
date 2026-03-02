// ================================================================
// SCORE COMPARISON TOOL — SRS 4.1.2 Last Month vs Current
// ================================================================
// Side-by-side comparison of last month's vs current evaluation
// scores for faculty / judges. Shows delta and trend arrows.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from "lucide-react";
import { getScoreComparison } from "../../../services/projectEnhancementApi";

const ScoreComparisonTool = ({ projectId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getScoreComparison(projectId);
        setData(res.data);
      } catch (err) {
        console.error("Failed to load comparison:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const TrendIcon = ({ delta }) => {
    if (delta > 0) return <TrendingUp size={14} className="text-green-500" />;
    if (delta < 0) return <TrendingDown size={14} className="text-red-500" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const deltaColor = (d) => {
    if (d > 0) return "text-green-600";
    if (d < 0) return "text-red-600";
    return "text-gray-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading score comparison...
      </div>
    );
  }

  if (!data || (!data.previous && !data.current)) {
    return (
      <div className="text-center py-8 text-gray-500">
        <BarChart3 size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">
          Not enough data for comparison yet. At least two evaluation sessions
          are needed.
        </p>
      </div>
    );
  }

  const prev = data.previous || {};
  const curr = data.current || {};
  const criteria = [
    ...new Set([
      ...Object.keys(prev.criteria || {}),
      ...Object.keys(curr.criteria || {}),
    ]),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-blue-600" />
        <h3 className="font-semibold text-gray-900">Score Comparison</h3>
      </div>

      {/* Overall Score Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Previous</p>
          <p className="text-2xl font-bold text-gray-700">
            {prev.overall != null ? prev.overall : "—"}
          </p>
          {prev.session_date && (
            <p className="text-xs text-gray-400 mt-1">
              {new Date(prev.session_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-200">
          <p className="text-xs text-blue-600 mb-1">Current</p>
          <p className="text-2xl font-bold text-blue-700">
            {curr.overall != null ? curr.overall : "—"}
          </p>
          {curr.session_date && (
            <p className="text-xs text-blue-400 mt-1">
              {new Date(curr.session_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg p-4 text-center border">
          <p className="text-xs text-gray-500 mb-1">Change</p>
          {prev.overall != null && curr.overall != null ? (
            <>
              <div className="flex items-center justify-center gap-1">
                <TrendIcon delta={curr.overall - prev.overall} />
                <p
                  className={`text-2xl font-bold ${deltaColor(curr.overall - prev.overall)}`}
                >
                  {curr.overall - prev.overall > 0 ? "+" : ""}
                  {(curr.overall - prev.overall).toFixed(1)}
                </p>
              </div>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </div>
      </div>

      {/* Criteria Breakdown Table */}
      {criteria.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">
                  Criteria
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Previous
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Current
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => {
                const pVal = prev.criteria?.[c];
                const cVal = curr.criteria?.[c];
                const delta = pVal != null && cVal != null ? cVal - pVal : null;
                return (
                  <tr key={c} className="border-b last:border-b-0">
                    <td className="px-4 py-2 text-gray-700 capitalize">
                      {c.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">
                      {pVal != null ? pVal : "—"}
                    </td>
                    <td className="px-4 py-2 text-center font-medium text-gray-900">
                      {cVal != null ? cVal : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {delta != null ? (
                        <span
                          className={`inline-flex items-center gap-1 ${deltaColor(delta)}`}
                        >
                          <TrendIcon delta={delta} />
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ScoreComparisonTool;
