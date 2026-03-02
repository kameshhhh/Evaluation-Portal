// ============================================================
// AUTO-ASSIGN MODAL — Rubric + Judge Count Selection
// ============================================================
// Shown when admin clicks "Test Auto-Assign" in SessionPlannerPage.
// Admin must:
//   1. Select exactly 3 rubrics from the 5 available
//   2. Choose 2 or 3 judges per student
// Then clicks "Run Auto-Assign" to proceed.
//
// SRS §4.1.4: Rubric-Based Distribution
// SRS §4.2:   Multi-Judge Evaluation
// ============================================================

import React, { useState, useEffect } from "react";
import {
  X,
  BookOpen,
  Check,
  Loader2,
  Users,
  Sparkles,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { listRubrics } from "../../services/rubricApi";

// ============================================================
// Colour palette — one accent per rubric name
// ============================================================
const RUBRIC_COLORS = {
  clarity:         { bg: "bg-blue-50",   border: "border-blue-200",   ring: "ring-blue-400",   icon: "text-blue-500",   badge: "bg-blue-100 text-blue-700"   },
  effort:          { bg: "bg-purple-50", border: "border-purple-200", ring: "ring-purple-400", icon: "text-purple-500", badge: "bg-purple-100 text-purple-700" },
  confidence:      { bg: "bg-green-50",  border: "border-green-200",  ring: "ring-green-400",  icon: "text-green-500",  badge: "bg-green-100 text-green-700"   },
  "technical skill":{ bg: "bg-orange-50",border: "border-orange-200", ring: "ring-orange-400", icon: "text-orange-500", badge: "bg-orange-100 text-orange-700" },
  leadership:      { bg: "bg-pink-50",   border: "border-pink-200",   ring: "ring-pink-400",   icon: "text-pink-500",   badge: "bg-pink-100 text-pink-700"     },
};

const getColor = (name = "") =>
  RUBRIC_COLORS[name.toLowerCase()] || {
    bg: "bg-indigo-50", border: "border-indigo-200", ring: "ring-indigo-400",
    icon: "text-indigo-500", badge: "bg-indigo-100 text-indigo-700",
  };

// ============================================================
// AutoAssignModal
// ============================================================
/**
 * @param {boolean}  isOpen      - Whether the modal is visible
 * @param {number}   poolSize    - Session pool size (for preview)
 * @param {Function} onConfirm   - (rubricIds: string[], minJudges: number) => void
 * @param {Function} onClose     - () => void
 */
const AutoAssignModal = ({ isOpen, poolSize = 0, onConfirm, onClose }) => {
  const [rubrics, setRubrics]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [fetchError, setFetchError]     = useState(null);
  const [selected, setSelected]         = useState(new Set());
  const [minJudges, setMinJudges]       = useState(2);
  const [submitting, setSubmitting]     = useState(false);

  // Fetch rubrics once modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setMinJudges(2);
    setFetchError(null);

    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await listRubrics();
        if (!cancelled) setRubrics(Array.isArray(data) ? data : (data?.data || []));
      } catch (err) {
        if (!cancelled) setFetchError(err?.response?.data?.message || err.message || "Failed to load rubrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [isOpen]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  const handleRun = async () => {
    if (selected.size !== 3) return;
    setSubmitting(true);
    try {
      await onConfirm([...selected], minJudges);
    } finally {
      setSubmitting(false);
    }
  };

  // Per-rubric pool preview
  const perRubricPool = poolSize > 0 ? Math.floor(poolSize / 3) : 0;
  const remainder     = poolSize > 0 ? poolSize % 3 : 0;

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal panel */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-bold text-gray-900">Auto-Assign Setup</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── STEP 1: JUDGE COUNT ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Step 1 — Judges per student
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinJudges(n)}
                  className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 transition-all font-medium text-sm ${
                    minJudges === n
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200"
                  }`}
                >
                  <span className="text-2xl font-bold">{n}</span>
                  <span className="text-xs">judge{n > 1 ? "s" : ""} each</span>
                  {minJudges === n && (
                    <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
                      <Check className="h-2.5 w-2.5" /> Selected
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── STEP 2: RUBRIC SELECTION ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Step 2 — Select exactly 3 rubrics
              </p>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  selected.size === 3
                    ? "bg-green-100 text-green-700"
                    : "bg-orange-100 text-orange-700"
                }`}
              >
                {selected.size}/3 selected
              </span>
            </div>

            {/* Fetch error */}
            {fetchError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200 mb-3">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {fetchError}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-2">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </div>
            )}

            {/* Rubric cards */}
            {!loading && (
              <div className="space-y-2">
                {rubrics.map((r) => {
                  const id         = r.head_id;
                  const isSelected = selected.has(id);
                  const isDisabled = !isSelected && selected.size >= 3;
                  const color      = getColor(r.head_name);

                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => toggle(id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? `${color.bg} ${color.border} ring-1 ${color.ring} shadow-sm`
                          : isDisabled
                          ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                          : `border-gray-200 bg-white hover:${color.bg} hover:${color.border}`
                      }`}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-indigo-500 border-indigo-500" : "border-gray-300"
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>

                      {/* Icon */}
                      <div className={`p-1.5 rounded-lg ${isSelected ? color.bg : "bg-gray-100"}`}>
                        <BookOpen className={`h-3.5 w-3.5 ${isSelected ? color.icon : "text-gray-400"}`} />
                      </div>

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.head_name}</p>
                        {r.description && (
                          <p className="text-xs text-gray-400 truncate">{r.description}</p>
                        )}
                      </div>

                      {/* Pool preview */}
                      {isSelected && poolSize > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${color.badge}`}>
                          {perRubricPool + (remainder > 0 ? 1 : 0)} pts
                          {/* First selected rubric gets the remainder — this is just a hint */}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── POOL PREVIEW ── */}
          {selected.size === 3 && poolSize > 0 && (
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 px-4 py-3">
              <p className="text-xs font-semibold text-indigo-700 mb-1">Pool distribution preview</p>
              <div className="flex gap-2 flex-wrap">
                {[...selected].map((id, i) => {
                  const r    = rubrics.find((x) => x.head_id === id);
                  const pts  = perRubricPool + (i < remainder ? 1 : 0);
                  const color = getColor(r?.head_name);
                  return (
                    <span key={id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${color.badge}`}>
                      {r?.head_name} — {pts} pts
                    </span>
                  );
                })}
              </div>
              <p className="text-[10px] text-indigo-500 mt-1.5">
                Total: {poolSize} pts ÷ 3 rubrics = {perRubricPool} pts each
                {remainder > 0 && `, first rubric +${remainder}`}
              </p>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={selected.size !== 3 || submitting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                Run Auto-Assign
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AutoAssignModal;
