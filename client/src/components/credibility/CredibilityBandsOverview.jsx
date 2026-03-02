// ============================================================
// CREDIBILITY BANDS OVERVIEW — SRS-Compliant Admin View
// ============================================================
// SRS 5.3: "Statistical dilution only, no explicit punishment"
// SRS 7.2: "No raw ranking exposure, only bands"
//
// Shows ONLY band distribution (HIGH/MEDIUM/LOW counts).
// No exact scores. No individual evaluator data. No alerts.
// No monitoring. No recommendations. No goals.
//
// Credibility works silently in the background — it only
// affects weighted score calculations. This page is a
// read-only summary for admin awareness, nothing more.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  ArrowLeft,
  RefreshCw,
  Users,
  CheckCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  getCredibilityBands,
  recalculateCredibility,
} from "../../services/scarcityApi";

// ============================================================
// Band Display Card — shows one band with count
// ============================================================
const BandCard = ({ label, count, total, color, description }) => {
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;

  const colorMap = {
    green: {
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-800",
      bar: "bg-green-500",
      badge: "bg-green-100 text-green-700",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      bar: "bg-amber-500",
      badge: "bg-amber-100 text-amber-700",
    },
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-800",
      bar: "bg-red-500",
      badge: "bg-red-100 text-red-700",
    },
  };

  const c = colorMap[color] || colorMap.green;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3
          className={`text-sm font-semibold uppercase tracking-wider ${c.text}`}
        >
          {label}
        </h3>
        <span
          className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${c.badge}`}
        >
          {pct}%
        </span>
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-2">
        {count}
        <span className="text-sm font-normal text-gray-400 ml-1.5">
          evaluator{count !== 1 ? "s" : ""}
        </span>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-gray-200/60 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${c.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================
const CredibilityBandsOverview = () => {
  const navigate = useNavigate();
  const [bands, setBands] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  const loadBands = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCredibilityBands();
      if (res?.success) setBands(res.data);
    } catch (err) {
      setError(err.message || "Failed to load credibility bands");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBands();
  }, [loadBands]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await recalculateCredibility();
      await loadBands(); // Refresh after recalculation
    } catch (err) {
      console.warn("Recalculation failed:", err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const total = bands
    ? bands.bands.HIGH + bands.bands.MEDIUM + bands.bands.LOW
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* ====== Header ====== */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600" />
                Evaluator Credibility
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Band distribution — statistical weighting overview
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`}
              />
              {recalculating ? "Recalculating…" : "Recalculate"}
            </button>
          </div>
        </div>
      </header>

      {/* ====== Content ====== */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
            <span className="ml-3 text-gray-500">
              Loading credibility bands…
            </span>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-700">{error}</p>
            <button
              onClick={loadBands}
              className="mt-3 text-sm text-red-600 underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Total evaluators */}
            <div className="bg-white rounded-xl border p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-lg">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">
                    Total Evaluators Tracked
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{total}</p>
                </div>
              </div>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>

            {/* Band Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BandCard
                label="High Credibility"
                count={bands?.bands?.HIGH || 0}
                total={total}
                color="green"
                description="Evaluations from these evaluators carry maximum weight in final score calculations."
              />
              <BandCard
                label="Medium Credibility"
                count={bands?.bands?.MEDIUM || 0}
                total={total}
                color="amber"
                description="Evaluations carry moderate weight — scores are partially diluted in calculations."
              />
              <BandCard
                label="Low Credibility"
                count={bands?.bands?.LOW || 0}
                total={total}
                color="red"
                description="Evaluations are statistically diluted — low influence on final weighted scores."
              />
            </div>

            {/* Explanation — SRS 5.3 compliant */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 text-sm text-blue-800">
                  <p className="font-semibold">
                    How credibility weighting works
                  </p>
                  <p>
                    The system automatically calculates a credibility score for
                    every evaluator based on their consistency across sessions
                    and alignment with peer consensus. This score determines how
                    much weight their evaluations carry in final score
                    calculations.
                  </p>
                  <p>
                    <strong>This process is fully automatic.</strong>{" "}
                    Low-credibility evaluations are statistically diluted — they
                    still count, but with less influence. No evaluator is
                    punished or alerted. The system self-corrects
                    mathematically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CredibilityBandsOverview;
