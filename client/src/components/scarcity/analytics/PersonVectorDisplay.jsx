// ============================================================
// PERSON VECTOR DISPLAY — Trait Radar/Bar Visualization
// ============================================================
// Implements SRS Section 7: Person Vector UI
//
// Displays the five latent traits of a person as a visual panel:
//   communication, leadership, consistency, trustworthiness, growth_potential
//
// SRS 7.2: "Used for MENTORING only, NOT labeling"
//   - Shows trait bands (low/medium/high), NOT raw numbers
//   - Shows confidence indicator
//   - Shows data source availability
//
// PROPS:
//   personId — UUID of the person to display
//
// DOES NOT modify any existing components.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Loader2,
  AlertCircle,
  MessageCircle,
  Crown,
  Shield,
  Heart,
  Zap,
  Info,
} from "lucide-react";
import { getPersonVector } from "../../../services/analyticsApi";

// ============================================================
// Trait configuration — icons, labels, colors
// ============================================================
const TRAIT_CONFIG = {
  communication: {
    icon: MessageCircle,
    label: "Communication",
    color: "bg-blue-400",
    description: "Ability to articulate ideas effectively",
  },
  leadership: {
    icon: Crown,
    label: "Leadership",
    color: "bg-purple-400",
    description: "Influence on team outcomes and decisions",
  },
  consistency: {
    icon: Shield,
    label: "Consistency",
    color: "bg-emerald-400",
    description: "Reliability across evaluation periods",
  },
  trustworthiness: {
    icon: Heart,
    label: "Trustworthiness",
    color: "bg-rose-400",
    description: "Alignment with peer perception",
  },
  growth_potential: {
    icon: Zap,
    label: "Growth Potential",
    color: "bg-amber-400",
    description: "Trajectory of improvement over time",
  },
};

// Band classification (SRS 7.2: bands, not raw numbers)
const classifyBand = (value) => {
  if (value >= 0.7)
    return {
      label: "High",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    };
  if (value >= 0.4)
    return { label: "Medium", color: "text-amber-600", bgColor: "bg-amber-50" };
  return { label: "Developing", color: "text-blue-600", bgColor: "bg-blue-50" };
};

// ============================================================
// PersonVectorDisplay Component
// ============================================================
const PersonVectorDisplay = ({ personId }) => {
  const [vector, setVector] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVector = useCallback(async () => {
    if (!personId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getPersonVector(personId);
      setVector(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setVector(null);
      } else {
        setError(err.message || "Failed to load person vector");
      }
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    fetchVector();
  }, [fetchVector]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">
            Loading person vector...
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

  // No vector state
  if (!vector) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          <User className="w-5 h-5 inline mr-2" />
          Person Vector
        </h3>
        <p className="text-sm text-gray-500">
          Vector not yet computed. Build the vector to see trait analysis.
        </p>
      </div>
    );
  }

  const confidence = parseFloat(vector.confidence_level || 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-500" />
          Person Vector
          <span className="text-xs font-normal text-gray-400 ml-1">SRS §7</span>
        </h3>

        {/* Confidence indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Confidence</span>
          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                confidence >= 0.7
                  ? "bg-emerald-400"
                  : confidence >= 0.4
                    ? "bg-amber-400"
                    : "bg-gray-400"
              }`}
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* SRS 7.2 Notice */}
      <div className="flex items-start gap-2 mb-5 p-3 bg-blue-50 rounded-lg border border-blue-100">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          Person vectors are used for <strong>mentoring guidance</strong> only,
          not for labeling or ranking individuals. Trait bands reflect aggregate
          patterns across multiple data sources.
        </p>
      </div>

      {/* Trait bars */}
      <div className="space-y-4">
        {Object.entries(TRAIT_CONFIG).map(([traitKey, config]) => {
          const value = parseFloat(vector[traitKey] || 0);
          const band = classifyBand(value);
          const Icon = config.icon;
          const barWidth = Math.max(5, value * 100);

          return (
            <div key={traitKey}>
              {/* Trait label + band */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {config.label}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${band.bgColor} ${band.color}`}
                >
                  {band.label}
                </span>
              </div>

              {/* Bar */}
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${config.color}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Description */}
              <p className="text-xs text-gray-400 mt-0.5">
                {config.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Data source indicators */}
      {vector.source_breakdown && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-400 block mb-2">Data Sources</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              typeof vector.source_breakdown === "string"
                ? JSON.parse(vector.source_breakdown)
                : vector.source_breakdown,
            ).map(([source, count]) => (
              <span
                key={source}
                className={`text-xs px-2 py-1 rounded-md ${
                  count > 0
                    ? "bg-indigo-50 text-indigo-600"
                    : "bg-gray-50 text-gray-400"
                }`}
              >
                {source.replace("_", " ")} ({count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonVectorDisplay;
