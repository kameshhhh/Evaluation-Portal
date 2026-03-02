// ============================================================
// RESPONSE RATE CHART — Visual response rate display
// ============================================================
// SRS §4.4.3 — Shows evaluation response rates per faculty.
// Horizontal bar chart with percentage labels.
// Used in admin analytics views.
// ============================================================

import React from "react";
import { Users, BarChart2 } from "lucide-react";

/**
 * @param {Object} props
 * @param {Array} props.data - [{faculty_id, faculty_name, evaluator_count}]
 * @param {number} props.totalStudents - Total eligible students
 * @param {string} props.title - Widget title (default: "Response Rates")
 */
const ResponseRateChart = React.memo(function ResponseRateChart({
  data = [],
  totalStudents = 0,
  title = "Response Rates",
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
        No response data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.evaluator_count), 1);

  // Overall rate
  const overallResponses = data.reduce((sum, d) => sum + d.evaluator_count, 0);
  const overallRate =
    totalStudents > 0 && data.length > 0
      ? ((overallResponses / (totalStudents * data.length)) * 100).toFixed(1)
      : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Users className="h-3.5 w-3.5" />
          <span>
            {totalStudents} eligible student{totalStudents !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-300">|</span>
          <span className="font-medium text-indigo-600">
            {overallRate}% overall
          </span>
        </div>
      </div>

      {/* Bars */}
      <div className="p-6 space-y-3">
        {data.map((faculty) => {
          const rate =
            totalStudents > 0
              ? (faculty.evaluator_count / totalStudents) * 100
              : 0;
          const barWidth =
            maxCount > 0 ? (faculty.evaluator_count / maxCount) * 100 : 0;

          const barColor =
            rate >= 75
              ? "bg-emerald-500"
              : rate >= 50
                ? "bg-blue-500"
                : rate >= 25
                  ? "bg-amber-500"
                  : "bg-red-400";

          return (
            <div key={faculty.faculty_id} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 w-36 truncate flex-shrink-0">
                {faculty.faculty_name || `#${faculty.faculty_id}`}
              </span>

              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right font-mono flex-shrink-0">
                  {faculty.evaluator_count}/{totalStudents}
                </span>
                <span
                  className={`text-xs font-semibold w-12 text-right flex-shrink-0 ${
                    rate >= 75
                      ? "text-emerald-600"
                      : rate >= 50
                        ? "text-blue-600"
                        : rate >= 25
                          ? "text-amber-600"
                          : "text-red-500"
                  }`}
                >
                  {rate.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ResponseRateChart;
