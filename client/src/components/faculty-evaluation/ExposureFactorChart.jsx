// ============================================================
// EXPOSURE FACTOR CHART — Visual breakdown of 3 exposure dims
// ============================================================
// SRS §4.4.3 — Faculty exposure profile visualization.
// Shows sessions, hours, role as horizontal bars with weights.
// ============================================================

import React from "react";
import { TrendingUp, Clock, Users } from "lucide-react";

const ExposureFactorChart = ({ exposure }) => {
  if (!exposure) return null;

  const bars = [
    {
      key: "sessions",
      label: "Sessions Taught",
      icon: TrendingUp,
      yourValue: exposure.sessions?.your_value ?? 0,
      maxValue: exposure.sessions?.dept_max ?? 1,
      ratio: exposure.sessions?.ratio ?? 0,
      weight: exposure.sessions?.weight ?? 0.3,
      contribution: exposure.sessions?.contribution ?? 0,
      color: "blue",
    },
    {
      key: "hours",
      label: "Contact Hours",
      icon: Clock,
      yourValue: exposure.hours?.your_value ?? 0,
      maxValue: exposure.hours?.dept_max ?? 1,
      ratio: exposure.hours?.ratio ?? 0,
      weight: exposure.hours?.weight ?? 0.5,
      contribution: exposure.hours?.contribution ?? 0,
      color: "emerald",
    },
    {
      key: "role",
      label: `Role: ${exposure.role?.type || "lecture"}`,
      icon: Users,
      yourValue: exposure.role?.multiplier ?? 1.0,
      maxValue: 1.0,
      ratio: exposure.role?.multiplier ?? 1.0,
      weight: exposure.role?.weight ?? 0.2,
      contribution: exposure.role?.contribution ?? 0,
      color: "violet",
    },
  ];

  const colorMap = {
    blue: {
      bar: "bg-blue-500",
      bg: "bg-blue-100",
      text: "text-blue-700",
      lightBg: "bg-blue-50",
    },
    emerald: {
      bar: "bg-emerald-500",
      bg: "bg-emerald-100",
      text: "text-emerald-700",
      lightBg: "bg-emerald-50",
    },
    violet: {
      bar: "bg-violet-500",
      bg: "bg-violet-100",
      text: "text-violet-700",
      lightBg: "bg-violet-50",
    },
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
        Your Exposure Profile
      </h4>

      <div className="space-y-4">
        {bars.map(
          ({
            key,
            label,
            icon: Icon,
            yourValue,
            maxValue,
            ratio,
            weight,
            contribution,
            color,
          }) => (
            <div key={key}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className={`p-1 rounded ${colorMap[color].bg}`}>
                    <Icon className={`h-3 w-3 ${colorMap[color].text}`} />
                  </div>
                  <span className="text-xs font-medium text-gray-600">
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-gray-400">
                    Weight: {(weight * 100).toFixed(0)}%
                  </span>
                  <span className={`font-bold ${colorMap[color].text}`}>
                    {key === "role"
                      ? `×${ratio.toFixed(2)}`
                      : `${yourValue} / ${maxValue}`}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${colorMap[color].bar} rounded-full transition-all duration-500`}
                  style={{
                    width: `${Math.min(ratio * 100, 100)}%`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-gray-700 drop-shadow-sm">
                    {(ratio * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Contribution */}
              <p className="text-[10px] text-gray-400 mt-0.5 text-right">
                Contribution: {contribution.toFixed(3)}
              </p>
            </div>
          ),
        )}
      </div>

      {/* Total exposure factor */}
      <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">
          Combined Exposure Factor
        </span>
        <span className="text-sm font-bold text-violet-700">
          {bars.reduce((s, b) => s + b.contribution, 0).toFixed(3)}
        </span>
      </div>
    </div>
  );
};

export default ExposureFactorChart;
