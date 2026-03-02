// ============================================================
// WEIGHT SLIDERS — Interactive 3-way linked weight controls
// ============================================================
// SRS §4.4.3 — Reusable weight adjuster for normalization.
// Used in What-If Simulator (faculty) and NormalizationConfig (admin).
// Three sliders that auto-balance to maintain sum = 1.0.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { TrendingUp, Clock, Users, RotateCcw, Info } from "lucide-react";

const PRESETS = [
  { id: "default", label: "Default", sessions: 0.3, hours: 0.5, role: 0.2 },
  {
    id: "balanced",
    label: "Balanced",
    sessions: 0.34,
    hours: 0.33,
    role: 0.33,
  },
  {
    id: "session",
    label: "Session-Focused",
    sessions: 0.6,
    hours: 0.2,
    role: 0.2,
  },
  { id: "hours", label: "Hours-Focused", sessions: 0.2, hours: 0.6, role: 0.2 },
  { id: "role", label: "Role-Focused", sessions: 0.2, hours: 0.2, role: 0.6 },
];

const WeightSliders = ({
  weights = { sessions: 0.3, hours: 0.5, role: 0.2 },
  onChange,
  disabled = false,
  showPresets = true,
  compact = false,
}) => {
  const [local, setLocal] = useState(weights);

  // Sync external changes
  useEffect(() => {
    setLocal(weights);
  }, [weights]);

  // Total validation
  const total = useMemo(
    () => Math.round((local.sessions + local.hours + local.role) * 100) / 100,
    [local],
  );
  const isValid = Math.abs(total - 1.0) < 0.02;

  // Emit on valid
  useEffect(() => {
    if (isValid) {
      onChange?.(local);
    }
  }, [local, isValid, onChange]);

  // Handle slider change — auto-balance other two sliders
  const handleChange = useCallback((key, rawValue) => {
    const value = Math.round(parseFloat(rawValue) * 100) / 100;
    if (isNaN(value) || value < 0 || value > 1) return;

    setLocal((prev) => {
      const otherKeys = ["sessions", "hours", "role"].filter((k) => k !== key);
      const remaining = Math.max(0, 1.0 - value);
      const otherSum = otherKeys.reduce((s, k) => s + prev[k], 0);

      const next = { ...prev, [key]: value };
      if (otherSum > 0) {
        otherKeys.forEach((k) => {
          next[k] = Math.round((prev[k] / otherSum) * remaining * 100) / 100;
        });
      } else {
        otherKeys.forEach((k) => {
          next[k] = Math.round((remaining / 2) * 100) / 100;
        });
      }

      // Fix rounding to ensure sum = 1.0
      const diff = 1.0 - (next.sessions + next.hours + next.role);
      if (Math.abs(diff) > 0.001) {
        next[otherKeys[0]] =
          Math.round((next[otherKeys[0]] + diff) * 100) / 100;
      }

      return next;
    });
  }, []);

  const applyPreset = (preset) => {
    setLocal({
      sessions: preset.sessions,
      hours: preset.hours,
      role: preset.role,
    });
  };

  const resetDefault = () => {
    setLocal({ sessions: 0.3, hours: 0.5, role: 0.2 });
  };

  const sliders = [
    {
      key: "sessions",
      label: "Sessions",
      desc: "Weight by number of sessions taught",
      icon: TrendingUp,
      color: "blue",
    },
    {
      key: "hours",
      label: "Contact Hours",
      desc: "Weight by total contact hours",
      icon: Clock,
      color: "emerald",
    },
    {
      key: "role",
      label: "Role Type",
      desc: "Weight by teaching role multiplier",
      icon: Users,
      color: "violet",
    },
  ];

  const colorMap = {
    blue: { bg: "bg-blue-600", text: "text-blue-700", light: "bg-blue-100" },
    emerald: {
      bg: "bg-emerald-600",
      text: "text-emerald-700",
      light: "bg-emerald-100",
    },
    violet: {
      bg: "bg-violet-600",
      text: "text-violet-700",
      light: "bg-violet-100",
    },
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {/* Distribution Bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">
            Weight Distribution
          </span>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              isValid
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {total.toFixed(2)} / 1.00
          </span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
          <div
            className="bg-blue-500 transition-all duration-200"
            style={{ width: `${local.sessions * 100}%` }}
          />
          <div
            className="bg-emerald-500 transition-all duration-200"
            style={{ width: `${local.hours * 100}%` }}
          />
          <div
            className="bg-violet-500 transition-all duration-200"
            style={{ width: `${local.role * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-gray-400">
          <span>Sessions {(local.sessions * 100).toFixed(0)}%</span>
          <span>Hours {(local.hours * 100).toFixed(0)}%</span>
          <span>Role {(local.role * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Sliders */}
      {sliders.map(({ key, label, desc, icon: Icon, color }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Icon className={`h-4 w-4 ${colorMap[color].text}`} />
              <span className="text-sm font-medium text-gray-700">{label}</span>
            </div>
            <span className={`text-sm font-bold ${colorMap[color].text}`}>
              {(local[key] * 100).toFixed(0)}%
            </span>
          </div>
          {!compact && (
            <p className="text-[11px] text-gray-400 mb-1.5">{desc}</p>
          )}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(local[key] * 100)}
            onChange={(e) =>
              handleChange(key, parseInt(e.target.value, 10) / 100)
            }
            disabled={disabled}
            className={`w-full h-1.5 rounded-full cursor-pointer accent-${color}-600 disabled:opacity-50`}
          />
        </div>
      ))}

      {/* Presets */}
      {showPresets && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Quick Presets
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                disabled={disabled}
                className="px-2.5 py-1 text-[11px] bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={resetDefault}
              disabled={disabled}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Invalid warning */}
      {!isValid && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Weights must sum to 1.0 (currently {total.toFixed(2)})
        </div>
      )}
    </div>
  );
};

export default WeightSliders;
