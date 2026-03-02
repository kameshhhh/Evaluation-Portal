// ============================================================
// NORMALIZATION CONFIG — Admin weight management
// ============================================================
// SRS §4.4.3 — Admin can configure exposure normalization weights.
// Three exposure dimensions: sessions, hours, role type.
// Four role sub-weights: lecture, lab, tutorial, seminar.
// Weights must sum to 1.0 for each group.
// Live preview of how weight changes affect a sample calculation.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Info,
  Sliders,
} from "lucide-react";
import {
  getNormalizationWeights,
  updateNormalizationWeights,
} from "../../services/facultyEvaluationApi";

const DEFAULT_WEIGHTS = {
  sessions_weight: 0.3,
  hours_weight: 0.5,
  role_weight: 0.2,
  lecture_weight: 1.0,
  lab_weight: 0.8,
  tutorial_weight: 0.7,
  seminar_weight: 0.9,
};

const NormalizationConfig = () => {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [savedWeights, setSavedWeights] = useState(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load current weights
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getNormalizationWeights();
        if (!cancelled && result.success && result.data) {
          const w = {
            sessions_weight: parseFloat(result.data.sessions_weight) || 0.3,
            hours_weight: parseFloat(result.data.hours_weight) || 0.5,
            role_weight: parseFloat(result.data.role_weight) || 0.2,
            lecture_weight: parseFloat(result.data.lecture_weight) || 1.0,
            lab_weight: parseFloat(result.data.lab_weight) || 0.8,
            tutorial_weight: parseFloat(result.data.tutorial_weight) || 0.7,
            seminar_weight: parseFloat(result.data.seminar_weight) || 0.9,
          };
          setWeights(w);
          setSavedWeights(w);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load normalization weights");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Validation
  const exposureSum = useMemo(
    () =>
      Math.round(
        (weights.sessions_weight + weights.hours_weight + weights.role_weight) *
          100,
      ) / 100,
    [weights.sessions_weight, weights.hours_weight, weights.role_weight],
  );

  const isExposureSumValid = Math.abs(exposureSum - 1.0) < 0.01;
  const isDirty = JSON.stringify(weights) !== JSON.stringify(savedWeights);

  // Update a single weight
  const updateWeight = useCallback((key, value) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 1) return;
    setWeights((prev) => ({ ...prev, [key]: Math.round(num * 100) / 100 }));
    setSuccess(false);
    setError(null);
  }, []);

  // Save weights
  const handleSave = async () => {
    if (!isExposureSumValid) {
      setError("Exposure weights must sum to 1.0");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateNormalizationWeights(weights);
      if (result.success) {
        setSavedWeights(weights);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || "Failed to save");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset to saved values
  const handleReset = () => {
    setWeights(savedWeights);
    setError(null);
    setSuccess(false);
  };

  // Sample calculation preview
  const samplePreview = useMemo(() => {
    const rawScore = 3.5;
    const sampleExposure = {
      sessionRatio: 0.8,
      hoursRatio: 0.6,
      roleMultiplier: weights.lecture_weight,
    };

    const exposureFactor =
      weights.sessions_weight * sampleExposure.sessionRatio +
      weights.hours_weight * sampleExposure.hoursRatio +
      weights.role_weight * sampleExposure.roleMultiplier;

    const adjustedFactor = Math.max(exposureFactor, 0.3);
    const normalizedScore = Math.round(rawScore * adjustedFactor * 100) / 100;

    return { rawScore, exposureFactor: adjustedFactor, normalizedScore };
  }, [weights]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Normalization Weights
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || !isExposureSumValid || saving}
            className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Weights"}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-600">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            Weights saved successfully. Scores will be recalculated.
          </div>
        )}

        {/* ── Exposure Dimension Weights ─────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Exposure Dimension Weights
            </h3>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded ${
                isExposureSumValid
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              Sum: {exposureSum.toFixed(2)} / 1.00
            </span>
          </div>

          <div className="space-y-4">
            <WeightSlider
              label="Sessions Conducted"
              description="Weight based on number of teaching sessions"
              value={weights.sessions_weight}
              onChange={(v) => updateWeight("sessions_weight", v)}
            />
            <WeightSlider
              label="Contact Hours"
              description="Weight based on total student contact hours"
              value={weights.hours_weight}
              onChange={(v) => updateWeight("hours_weight", v)}
            />
            <WeightSlider
              label="Role Type"
              description="Weight based on teaching role multiplier"
              value={weights.role_weight}
              onChange={(v) => updateWeight("role_weight", v)}
            />
          </div>
        </section>

        {/* ── Role Type Multipliers ──────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Role Type Multipliers
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Higher values mean that role has more expected student contact.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <RoleMultiplier
              label="Lecture"
              value={weights.lecture_weight}
              onChange={(v) => updateWeight("lecture_weight", v)}
            />
            <RoleMultiplier
              label="Seminar"
              value={weights.seminar_weight}
              onChange={(v) => updateWeight("seminar_weight", v)}
            />
            <RoleMultiplier
              label="Lab"
              value={weights.lab_weight}
              onChange={(v) => updateWeight("lab_weight", v)}
            />
            <RoleMultiplier
              label="Tutorial"
              value={weights.tutorial_weight}
              onChange={(v) => updateWeight("tutorial_weight", v)}
            />
          </div>
        </section>

        {/* ── Sample Calculation Preview ─────────── */}
        <section className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              Sample Calculation Preview
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Raw Score</p>
              <p className="text-xl font-bold text-gray-800">
                {samplePreview.rawScore}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Exposure Factor</p>
              <p className="text-xl font-bold text-violet-600">
                ×{samplePreview.exposureFactor.toFixed(2)}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Normalized</p>
              <p className="text-xl font-bold text-emerald-600">
                {samplePreview.normalizedScore}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Lecture instructor, 80% session coverage, 60% hours coverage
          </p>
        </section>
      </div>
    </div>
  );
};

// ── Weight Slider ──────────────────────────────────────────

const WeightSlider = React.memo(function WeightSlider({
  label,
  description,
  value,
  onChange,
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {description && (
            <p className="text-xs text-gray-400">{description}</p>
          )}
        </div>
        <input
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-16 text-right text-sm font-mono px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
        />
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(value * 100)}
        onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
        className="w-full h-1.5 rounded-full accent-violet-600 cursor-pointer"
      />
    </div>
  );
});

// ── Role Multiplier ────────────────────────────────────────

const RoleMultiplier = React.memo(function RoleMultiplier({
  label,
  value,
  onChange,
}) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-3 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <input
        type="number"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 text-right text-sm font-mono px-1.5 py-0.5 border border-gray-300 rounded focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
      />
    </div>
  );
});

export default NormalizationConfig;
