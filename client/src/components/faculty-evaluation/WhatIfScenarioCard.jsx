// ============================================================
// WHAT-IF SCENARIO CARD — Display a saved scenario
// ============================================================
// SRS §4.4.3 — Shows saved simulation result with comparison.
// Displays weight configuration, score diff, and quick-apply.
// ============================================================

import React from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Trash2,
  Play,
} from "lucide-react";

const WhatIfScenarioCard = ({ scenario, onApply, onDelete }) => {
  if (!scenario) return null;

  const diff = parseFloat(scenario.score_difference) || 0;
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  const Icon = isPositive ? ArrowUpRight : isNeutral ? Minus : ArrowDownRight;
  const diffColor = isPositive
    ? "text-emerald-600"
    : isNeutral
      ? "text-gray-500"
      : "text-red-500";
  const diffBg = isPositive
    ? "bg-emerald-50 border-emerald-200"
    : isNeutral
      ? "bg-gray-50 border-gray-200"
      : "bg-red-50 border-red-200";

  const sw = parseFloat(scenario.alt_sessions_weight) || 0;
  const hw = parseFloat(scenario.alt_hours_weight) || 0;
  const rw = parseFloat(scenario.alt_role_weight) || 0;

  return (
    <div
      className={`border rounded-xl p-4 ${diffBg} transition-all hover:shadow-sm`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 truncate">
            {scenario.scenario_name || "Unnamed Scenario"}
          </h4>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {new Date(scenario.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onApply && (
            <button
              onClick={() => onApply(scenario)}
              className="p-1.5 rounded-md hover:bg-white/60 text-gray-500 hover:text-violet-600 transition-colors"
              title="Apply these weights"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(scenario.id)}
              className="p-1.5 rounded-md hover:bg-white/60 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete scenario"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Score comparison */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-center">
          <p className="text-[10px] text-gray-400">Original</p>
          <p className="text-lg font-bold text-gray-700">
            {parseFloat(scenario.original_score || 0).toFixed(2)}
          </p>
        </div>
        <div className="text-gray-300">→</div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400">Simulated</p>
          <p className="text-lg font-bold text-violet-700">
            {parseFloat(scenario.alternative_score || 0).toFixed(2)}
          </p>
        </div>
        <div className="flex-1" />
        <div className={`flex items-center gap-0.5 ${diffColor}`}>
          <Icon className="h-4 w-4" />
          <span className="text-sm font-bold">
            {diff > 0 ? "+" : ""}
            {diff.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Weight distribution mini-bar */}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
          <div className="bg-blue-500" style={{ width: `${sw * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${hw * 100}%` }} />
          <div className="bg-violet-500" style={{ width: `${rw * 100}%` }} />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-gray-400">
          <span>S:{(sw * 100).toFixed(0)}%</span>
          <span>H:{(hw * 100).toFixed(0)}%</span>
          <span>R:{(rw * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

export default WhatIfScenarioCard;
