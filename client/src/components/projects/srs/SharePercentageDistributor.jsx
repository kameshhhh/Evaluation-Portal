// ================================================================
// SHARE PERCENTAGE DISTRIBUTOR — SRS 4.1.1 Contribution Allocation
// ================================================================
// Allows the project lead / faculty to distribute share percentages
// among team members. Total must equal 100%.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useMemo } from "react";
import { PieChart, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { updateSharePercentages } from "../../../services/projectEnhancementApi";

const SharePercentageDistributor = ({ projectId, members = [], onUpdate }) => {
  const initial = {};
  members.forEach((m) => {
    initial[m.person_id] = parseFloat(m.declared_share_percentage || 0);
  });

  const [shares, setShares] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const total = useMemo(
    () => Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [shares],
  );

  const isValid = Math.abs(total - 100) < 0.01;

  const handleChange = (personId, value) => {
    const num = value === "" ? 0 : parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    setShares({ ...shares, [personId]: num });
    setError(null);
    setSaved(false);
  };

  const distributeEvenly = () => {
    const count = members.length;
    if (count === 0) return;
    const even = parseFloat((100 / count).toFixed(2));
    const updated = {};
    members.forEach((m, i) => {
      updated[m.person_id] =
        i === count - 1
          ? parseFloat((100 - even * (count - 1)).toFixed(2))
          : even;
    });
    setShares(updated);
    setError(null);
  };

  const handleSave = async () => {
    if (!isValid) {
      setError("Total must equal 100%");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = Object.entries(shares).map(([person_id, share]) => ({
        person_id,
        declared_share_percentage: share,
      }));
      await updateSharePercentages(projectId, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      if (onUpdate) onUpdate(shares);
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const getBarColor = (pct) => {
    if (pct >= 40) return "bg-blue-600";
    if (pct >= 25) return "bg-blue-500";
    if (pct >= 15) return "bg-blue-400";
    return "bg-blue-300";
  };

  return (
    <div className="bg-white rounded-lg border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Share % Distribution</h3>
        </div>
        <button
          onClick={distributeEvenly}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Distribute Evenly
        </button>
      </div>

      {/* Members List */}
      <div className="space-y-3">
        {members.map((m) => {
          const pct = shares[m.person_id] || 0;
          return (
            <div key={m.person_id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {m.display_name || m.person_id}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={pct}
                    onChange={(e) => handleChange(m.person_id, e.target.value)}
                    className="w-20 text-right border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(pct)}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Indicator */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium ${
          isValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
        }`}
      >
        <span>Total</span>
        <div className="flex items-center gap-1">
          {isValid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{total.toFixed(1)}%</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={14} />
          {error}
        </p>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !isValid}
        className={`inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
          saved
            ? "bg-green-600 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
        } disabled:opacity-50`}
      >
        <Save size={14} />
        {saving ? "Saving..." : saved ? "Saved!" : "Save Distribution"}
      </button>
    </div>
  );
};

export default SharePercentageDistributor;
