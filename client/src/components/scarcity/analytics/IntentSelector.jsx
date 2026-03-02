// ============================================================
// INTENT SELECTOR — Evaluation Intent Mode Picker + Report
// ============================================================
// Implements SRS Section 6.2: Intent-Aware Evaluation UI
//
// Allows faculty/admin to select an evaluation intent mode
// (growth, excellence, leadership, comparative) and view how
// it affects the interpretation of scores.
//
// Shows the intent-adjusted evaluation report for a target person
// with breakdown of how each data dimension contributes.
//
// PROPS:
//   targetId  — UUID of the person being evaluated
//   sessionId — Optional session context
//
// DOES NOT modify any existing components.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Target,
  TrendingUp,
  Award,
  Crown,
  GitCompare,
  Loader2,
  AlertCircle,
  ChevronRight,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import { listIntents, getIntentReport } from "../../../services/analyticsApi";

// ============================================================
// Intent mode visual config
// ============================================================
const INTENT_VISUALS = {
  growth: {
    icon: TrendingUp,
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    activeColor: "bg-emerald-500 text-white border-emerald-500",
    barColor: "bg-emerald-400",
    description: "Focus on improvement trajectory",
  },
  excellence: {
    icon: Award,
    color: "bg-blue-50 border-blue-200 text-blue-700",
    activeColor: "bg-blue-500 text-white border-blue-500",
    barColor: "bg-blue-400",
    description: "Focus on absolute capability",
  },
  leadership: {
    icon: Crown,
    color: "bg-purple-50 border-purple-200 text-purple-700",
    activeColor: "bg-purple-500 text-white border-purple-500",
    barColor: "bg-purple-400",
    description: "Focus on influence and impact",
  },
  comparative: {
    icon: GitCompare,
    color: "bg-gray-50 border-gray-200 text-gray-700",
    activeColor: "bg-gray-700 text-white border-gray-700",
    barColor: "bg-gray-500",
    description: "Focus on relative standing",
  },
};

// ============================================================
// IntentSelector Component
// ============================================================
const IntentSelector = ({ targetId, sessionId = null }) => {
  const [intents, setIntents] = useState([]);
  const [selectedIntent, setSelectedIntent] = useState("comparative");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingIntents, setLoadingIntents] = useState(true);
  const [error, setError] = useState(null);

  // Fetch available intents on mount
  useEffect(() => {
    const fetchIntents = async () => {
      try {
        const response = await listIntents();
        setIntents(response.data || []);
      } catch (err) {
        // Use defaults if API fails
        setIntents([
          { intent_code: "growth", label: "Growth" },
          { intent_code: "excellence", label: "Excellence" },
          { intent_code: "leadership", label: "Leadership" },
          { intent_code: "comparative", label: "Comparative" },
        ]);
      } finally {
        setLoadingIntents(false);
      }
    };
    fetchIntents();
  }, []);

  // Fetch intent report when intent or target changes
  const fetchReport = useCallback(async () => {
    if (!targetId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getIntentReport(
        targetId,
        selectedIntent,
        sessionId,
      );
      setReport(response.data);
    } catch (err) {
      setError(err.message || "Failed to load intent report");
    } finally {
      setLoading(false);
    }
  }, [targetId, selectedIntent, sessionId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-500" />
          Intent-Aware Evaluation
          <span className="text-xs font-normal text-gray-400 ml-1">
            SRS §6.2
          </span>
        </h3>
      </div>

      {/* Intent mode selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {(loadingIntents
          ? [
              { intent_code: "growth" },
              { intent_code: "excellence" },
              { intent_code: "leadership" },
              { intent_code: "comparative" },
            ]
          : intents
        ).map((intent) => {
          const code = intent.intent_code;
          const visual = INTENT_VISUALS[code] || INTENT_VISUALS.comparative;
          const Icon = visual.icon;
          const isActive = selectedIntent === code;

          return (
            <button
              key={code}
              onClick={() => setSelectedIntent(code)}
              className={`p-3 rounded-lg border text-center transition-all ${
                isActive ? visual.activeColor : visual.color
              } hover:shadow-sm`}
            >
              <Icon
                className={`w-5 h-5 mx-auto mb-1 ${isActive ? "text-white" : ""}`}
              />
              <div
                className={`text-xs font-medium capitalize ${isActive ? "text-white" : ""}`}
              >
                {intent.label || code}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected intent description */}
      <div className="text-xs text-gray-500 mb-4 flex items-center gap-1">
        <ChevronRight className="w-3 h-3" />
        {INTENT_VISUALS[selectedIntent]?.description ||
          "Select an evaluation intent"}
      </div>

      {/* Report loading/error states */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">
            Computing intent-adjusted scores...
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 p-3 bg-red-50 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {/* Intent report */}
      {!loading && !error && report && (
        <div className="space-y-4">
          {/* Adjusted score headline */}
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-3xl font-bold text-gray-900">
              {(report.adjustedScore * 100).toFixed(1)}
              <span className="text-sm font-normal text-gray-400 ml-1">
                / 100
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Intent-Adjusted Score ({report.intentLabel})
            </div>
          </div>

          {/* Score breakdown by dimension */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <BarChart3 className="w-4 h-4" />
              Score Breakdown
            </h4>
            {report.scoreBreakdown &&
              Object.entries(report.scoreBreakdown).map(([dim, info]) => {
                const visual =
                  INTENT_VISUALS[selectedIntent] || INTENT_VISUALS.comparative;
                const barWidth = Math.max(3, (info.raw || 0) * 100);

                return (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="w-32 text-xs text-gray-500 text-right capitalize">
                      {dim.replace(/_/g, " ")}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${visual.barColor} transition-all duration-300`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="w-12 text-xs text-gray-500 text-right">
                      ×{info.weight?.toFixed(2)}
                    </span>
                    <span className="w-12 text-xs font-medium text-gray-700 text-right">
                      {info.contribution?.toFixed(3)}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Trait profile (if person vector available) */}
          {report.traitProfile && (
            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Intent-Weighted Trait Profile
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(report.traitProfile).map(([trait, value]) => (
                  <div key={trait} className="text-center">
                    <div className="h-16 relative bg-gray-100 rounded-md overflow-hidden mb-1">
                      <div
                        className={`absolute bottom-0 w-full ${
                          INTENT_VISUALS[selectedIntent]?.barColor ||
                          "bg-gray-400"
                        } transition-all duration-500`}
                        style={{ height: `${Math.min(100, value * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 capitalize block truncate">
                      {trait.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data source availability */}
          {report.dataSources && (
            <div className="pt-3 border-t border-gray-100">
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.dataSources).map(([src, available]) => (
                  <span
                    key={src}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${
                      available
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    {available ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {src
                      .replace(/^has/, "")
                      .replace(/([A-Z])/g, " $1")
                      .trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IntentSelector;
