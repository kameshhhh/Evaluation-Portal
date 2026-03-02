// ============================================================
// RUBRIC MANAGEMENT TAB — Admin Rubric Catalogue
// ============================================================
// SRS §4.1.4 — Rubric-Based Distribution
//
// Shows all active evaluation rubrics. Admin uses this tab to
// see what rubrics are available. The 5 default rubrics are
// seeded from the DB migration (046_rubric_based_distribution.sql).
//
// Future extension: allow admin to create custom rubrics.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  Sparkles,
  BarChart2,
  Shield,
  Zap,
  Star,
} from "lucide-react";
import { listRubrics } from "../../../services/rubricApi";

// ============================================================
// Icon map — one visual per default rubric name
// ============================================================
const RUBRIC_ICONS = {
  clarity: BookOpen,
  effort: BarChart2,
  confidence: Shield,
  "technical skill": Zap,
  leadership: Star,
};

const RUBRIC_COLORS = {
  clarity: "bg-blue-50 text-blue-600 border-blue-100",
  effort: "bg-purple-50 text-purple-600 border-purple-100",
  confidence: "bg-green-50 text-green-600 border-green-100",
  "technical skill": "bg-orange-50 text-orange-600 border-orange-100",
  leadership: "bg-pink-50 text-pink-600 border-pink-100",
};

const getRubricColor = (name = "") =>
  RUBRIC_COLORS[name.toLowerCase()] || "bg-indigo-50 text-indigo-600 border-indigo-100";

const getRubricIcon = (name = "") => {
  const key = name.toLowerCase();
  return RUBRIC_ICONS[key] || BookOpen;
};

// ============================================================
// RUBRIC CARD
// ============================================================
const RubricCard = ({ rubric }) => {
  const { head_name, description, applicable_entity, is_required } = rubric;
  const Icon = getRubricIcon(head_name);
  const colorClass = getRubricColor(head_name);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`p-3 rounded-xl border ${colorClass} shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{head_name}</h3>
            {is_required && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                <CheckCircle2 className="h-3 w-3" />
                Required
              </span>
            )}
          </div>

          {description && (
            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {applicable_entity && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                <Info className="h-3 w-3" />
                {applicable_entity}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const RubricManagementTab = () => {
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadRubrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRubrics();
      setRubrics(Array.isArray(data) ? data : (data?.data || []));
    } catch (err) {
      console.error("[RubricManagementTab] loadRubrics error:", err);
      setError(err?.response?.data?.message || err.message || "Failed to load rubrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRubrics();
  }, [loadRubrics]);

  return (
    <div className="space-y-6">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            Evaluation Rubrics
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            These rubrics define how judges distribute evaluation points across team members.
            Admins select exactly 3 per session during session creation.
          </p>
        </div>

        <button
          onClick={loadRubrics}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ========== HOW IT WORKS NOTICE ========== */}
      <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4 flex gap-3">
        <Info className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-sm text-indigo-700 space-y-1">
          <p className="font-medium">How Rubric-Based Distribution works (SRS §4.1.4)</p>
          <ul className="list-disc list-inside text-xs space-y-0.5 text-indigo-600">
            <li>During session creation, admin selects exactly <strong>3 rubrics</strong></li>
            <li>Team pool is split equally across rubrics — e.g., pool 15 → 5 pts per rubric</li>
            <li>Remainder is added to the first rubric — e.g., pool 10 → rubric 1 gets 4 pts, rubrics 2&amp;3 get 3 each</li>
            <li>Credibility-weighted averaging applied per-rubric + grand total unchanged</li>
          </ul>
        </div>
      </div>

      {/* ========== ERROR ========== */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ========== LOADING ========== */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========== RUBRIC CARDS ========== */}
      {!loading && rubrics.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {rubrics.length} rubric{rubrics.length !== 1 ? "s" : ""} available
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rubrics.map((rubric) => (
              <RubricCard key={rubric.head_id} rubric={rubric} />
            ))}
          </div>
        </>
      )}

      {/* ========== EMPTY STATE ========== */}
      {!loading && rubrics.length === 0 && !error && (
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No rubrics found</p>
          <p className="text-gray-400 text-sm mt-1">
            Run the DB migration (046_rubric_based_distribution.sql) to seed default rubrics.
          </p>
        </div>
      )}
    </div>
  );
};

export default RubricManagementTab;
