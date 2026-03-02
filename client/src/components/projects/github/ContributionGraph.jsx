// ================================================================
// CONTRIBUTION GRAPH — GitHub-Lite Heatmap
// ================================================================
// GitHub-style contribution heatmap showing daily activity
// intensity over the last ~6 months. Also shows activity summary.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect } from "react";
import { Calendar, Loader2, BarChart3 } from "lucide-react";
import {
  getContributionGraph,
  getActivitySummary,
} from "../../../services/gitRepoApi";

const DAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ContributionGraph = ({ projectId }) => {
  const [graph, setGraph] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [graphRes, summaryRes] = await Promise.all([
          getContributionGraph(projectId),
          getActivitySummary(projectId),
        ]);
        setGraph(graphRes.data || []);
        setSummary(summaryRes.data);
      } catch (err) {
        console.error("Failed to load contribution data:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId]);

  const getIntensity = (count) => {
    if (!count || count === 0) return "bg-gray-100";
    if (count <= 2) return "bg-green-200";
    if (count <= 5) return "bg-green-400";
    if (count <= 10) return "bg-green-500";
    return "bg-green-700";
  };

  // Build weeks grid from flat data
  const buildGrid = () => {
    if (graph.length === 0) return [];

    // Group by week
    const weeks = [];
    let currentWeek = [];
    graph.forEach((day, i) => {
      currentWeek.push(day);
      if (currentWeek.length === 7 || i === graph.length - 1) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    return weeks;
  };

  const weeks = buildGrid();

  // Compute month labels for column headers
  const monthLabels = [];
  if (graph.length > 0) {
    let lastMonth = -1;
    let weekIdx = 0;
    graph.forEach((day, i) => {
      if (i % 7 === 0) {
        const d = new Date(day.date);
        const m = d.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ month: MONTHS[m], weekIdx });
          lastMonth = m;
        }
        weekIdx++;
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading contributions...
      </div>
    );
  }

  const totalContributions = graph.reduce((s, d) => s + (d.count || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Contributions</h3>
          <span className="text-xs text-gray-500">
            {totalContributions} total activities
          </span>
        </div>
      </div>

      {/* Heatmap */}
      {graph.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No contribution data yet.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-4">
          {/* Month labels */}
          <div className="flex gap-0 ml-8 mb-1 text-xs text-gray-400">
            {monthLabels.map((ml, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  marginLeft:
                    i === 0
                      ? 0
                      : `${(ml.weekIdx - (monthLabels[i - 1]?.weekIdx || 0) - 1) * 14}px`,
                }}
              >
                {ml.month}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            {/* Day labels */}
            <div className="flex flex-col gap-1 mr-1">
              {DAYS.map((d, i) => (
                <div
                  key={i}
                  className="h-3 text-xs text-gray-400 leading-3 w-6 text-right"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex gap-0.5 overflow-x-auto">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`w-3 h-3 rounded-sm ${getIntensity(day.count)} cursor-pointer transition-colors`}
                      onMouseEnter={() => setHoveredCell(day)}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={`${day.date}: ${day.count || 0} activities`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Hover tooltip */}
          {hoveredCell && (
            <div className="mt-2 text-xs text-gray-600">
              <span className="font-medium">
                {new Date(hoveredCell.date).toLocaleDateString()}
              </span>
              : {hoveredCell.count || 0} activities
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-1 mt-3 text-xs text-gray-500 justify-end">
            <span>Less</span>
            <div className="w-3 h-3 bg-gray-100 rounded-sm" />
            <div className="w-3 h-3 bg-green-200 rounded-sm" />
            <div className="w-3 h-3 bg-green-400 rounded-sm" />
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <div className="w-3 h-3 bg-green-700 rounded-sm" />
            <span>More</span>
          </div>
        </div>
      )}

      {/* Activity Summary */}
      {summary && (
        <div className="bg-gray-50 border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={14} className="text-blue-600" />
            <h4 className="text-sm font-medium text-gray-700">
              Activity Summary
            </h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-blue-600">
                {summary.commits || 0}
              </p>
              <p className="text-xs text-gray-500">Commits</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">
                {summary.issues || 0}
              </p>
              <p className="text-xs text-gray-500">Issues</p>
            </div>
            <div>
              <p className="text-xl font-bold text-purple-600">
                {summary.pull_requests || 0}
              </p>
              <p className="text-xs text-gray-500">Pull Requests</p>
            </div>
            <div>
              <p className="text-xl font-bold text-orange-600">
                {summary.branches || 0}
              </p>
              <p className="text-xs text-gray-500">Branches</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContributionGraph;
