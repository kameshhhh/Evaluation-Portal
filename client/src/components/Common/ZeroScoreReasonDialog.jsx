// ============================================================
// ZERO SCORE REASON DIALOG — Batch Reason Capture at Submit Time
// ============================================================
// SRS §4.1.5 — Zero-Score Reason Capture
//
// Shows a dialog BEFORE submit that lists all zero-point
// allocations and asks the evaluator to classify each one.
//
// Three classifications (non-punitive language):
//   1. "Limited points available"    → scarcity_driven
//   2. "Didn't meet requirements"    → below_expectation
//   3. "Haven't seen enough work"    → insufficient_observation
//
// FEATURES:
//   - Batch mode: one dialog for ALL zeros in the session
//   - "Apply to all" quick action for uniform classification
//   - Optional free-text context note per zero
//   - Tracks decision time per reason for analytics
//   - Non-punitive, analytical tone throughout
//   - Escape key or backdrop click cancels submit
//
// USAGE (Scarcity):
//   If submit has zero allocations → show this dialog first
//   On confirm → pass reasons along with allocations
//
// USAGE (Comparative):
//   If matrix has zero cells → show this dialog first
//   On confirm → pass reasons along with submit request
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

// ============================================================
// CLASSIFICATION OPTIONS — Maps to server CLASSIFICATIONS constant
// ============================================================
const CLASSIFICATION_OPTIONS = [
  {
    value: "scarcity_driven",
    label: "Limited points available",
    description: "Would have given points if the budget were larger",
    icon: "📊",
    color: "blue",
  },
  {
    value: "below_expectation",
    label: "Didn't meet requirements",
    description: "Performance did not reach the minimum threshold",
    icon: "📋",
    color: "amber",
  },
  {
    value: "insufficient_observation",
    label: "Haven't seen enough work",
    description: "Not enough visibility to make a fair judgment",
    icon: "👁️",
    color: "gray",
  },
];

// ============================================================
// ZeroScoreReasonDialog Component
// ============================================================
/**
 * Batch dialog for capturing zero-score classifications.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the dialog is visible
 * @param {Function} props.onConfirm - Called with array of reason objects
 * @param {Function} props.onCancel - Called when user cancels (no submit)
 * @param {Array<Object>} props.zeroAllocations - Targets with zero points
 *   Each: { targetId, targetName, criterionKey?, criterionName? }
 * @param {string} props.evaluationType - 'scarcity' or 'comparative'
 */
const ZeroScoreReasonDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  zeroAllocations = [],
  evaluationType = "scarcity",
}) => {
  // ----------------------------------------------------------
  // STATE — Track classification for each zero allocation
  // ----------------------------------------------------------
  // reasons: { [targetId + criterionKey]: { classification, contextNote, startTime } }
  const [reasons, setReasons] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const dialogRef = useRef(null);
  const startTimeRef = useRef(null);

  // Build unique key for each zero allocation
  const getKey = useCallback(
    (allocation) =>
      allocation.criterionKey
        ? `${allocation.targetId}_${allocation.criterionKey}`
        : allocation.targetId,
    [],
  );

  // ----------------------------------------------------------
  // INITIALIZE — Set default reasons when dialog opens
  // ----------------------------------------------------------
  useEffect(() => {
    if (isOpen && zeroAllocations.length > 0) {
      startTimeRef.current = Date.now();
      const initial = {};
      for (const alloc of zeroAllocations) {
        const key = getKey(alloc);
        initial[key] = {
          classification: "",
          contextNote: "",
          startTime: Date.now(),
        };
      }
      setReasons(initial);
      setExpandedNotes({});
    }
  }, [isOpen, zeroAllocations, getKey]);

  // ----------------------------------------------------------
  // KEYBOARD — Escape to cancel
  // ----------------------------------------------------------
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onCancel]);

  // ----------------------------------------------------------
  // HANDLERS
  // ----------------------------------------------------------
  const setClassification = useCallback((key, classification) => {
    setReasons((prev) => ({
      ...prev,
      [key]: { ...prev[key], classification },
    }));
  }, []);

  const setContextNote = useCallback((key, contextNote) => {
    setReasons((prev) => ({
      ...prev,
      [key]: { ...prev[key], contextNote },
    }));
  }, []);

  const toggleNote = useCallback((key) => {
    setExpandedNotes((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // "Apply to all" — set the same classification for all unset items
  const applyToAll = useCallback((classification) => {
    setReasons((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (!updated[key].classification) {
          updated[key] = { ...updated[key], classification };
        }
      }
      return updated;
    });
  }, []);

  // Check if all reasons are classified
  const allClassified = Object.values(reasons).every(
    (r) => r.classification !== "",
  );
  const classifiedCount = Object.values(reasons).filter(
    (r) => r.classification !== "",
  ).length;

  // ----------------------------------------------------------
  // CONFIRM — Build reason objects and call onConfirm
  // ----------------------------------------------------------
  const handleConfirm = useCallback(() => {
    const now = Date.now();
    const reasonList = zeroAllocations.map((alloc) => {
      const key = getKey(alloc);
      const r = reasons[key] || {};
      return {
        targetId: alloc.targetId,
        criterionKey: alloc.criterionKey || null,
        classification: r.classification || "scarcity_driven",
        contextNote: r.contextNote || null,
        decisionTimeMs: r.startTime ? now - r.startTime : null,
        wasDefault: !r.classification,
      };
    });
    onConfirm(reasonList);
  }, [zeroAllocations, reasons, getKey, onConfirm]);

  // ----------------------------------------------------------
  // SKIP — Submit without providing reasons (all defaults)
  // ----------------------------------------------------------
  const handleSkip = useCallback(() => {
    const reasonList = zeroAllocations.map((alloc) => ({
      targetId: alloc.targetId,
      criterionKey: alloc.criterionKey || null,
      classification: "scarcity_driven",
      contextNote: null,
      decisionTimeMs: null,
      wasDefault: true,
    }));
    onConfirm(reasonList);
  }, [zeroAllocations, onConfirm]);

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (!isOpen || zeroAllocations.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zero-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2
                id="zero-dialog-title"
                className="text-lg font-semibold text-gray-900"
              >
                Help Us Understand Your Zero Scores
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {zeroAllocations.length} zero-point{" "}
                {zeroAllocations.length === 1 ? "allocation" : "allocations"}{" "}
                detected — your feedback improves analytics
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Cancel"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Quick Action — Apply to All */}
        {zeroAllocations.length > 1 && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Zap className="h-4 w-4" />
              <span className="font-medium">Quick fill:</span>
              {CLASSIFICATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => applyToAll(opt.value)}
                  className="px-2 py-1 bg-white border border-blue-200 rounded-md text-xs hover:bg-blue-100 transition-colors"
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable Content — List of Zero Allocations */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {zeroAllocations.map((alloc, idx) => {
            const key = getKey(alloc);
            const reason = reasons[key] || {};
            const noteExpanded = expandedNotes[key] || false;

            return (
              <div
                key={key}
                className={`border rounded-lg p-4 transition-colors ${
                  reason.classification
                    ? "border-green-200 bg-green-50/30"
                    : "border-gray-200 bg-white"
                }`}
              >
                {/* Target Info */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-400">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-gray-800">
                      {alloc.targetName || "Unknown Target"}
                    </span>
                    {alloc.criterionName && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {alloc.criterionName}
                      </span>
                    )}
                  </div>
                  {reason.classification && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </div>

                {/* Classification Radio Buttons */}
                <div className="space-y-2">
                  {CLASSIFICATION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                        reason.classification === opt.value
                          ? `bg-${opt.color}-50 border border-${opt.color}-200 ring-1 ring-${opt.color}-200`
                          : "hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`reason-${key}`}
                        value={opt.value}
                        checked={reason.classification === opt.value}
                        onChange={() => setClassification(key, opt.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-lg">{opt.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-800">
                          {opt.label}
                        </div>
                        <div className="text-xs text-gray-500">
                          {opt.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Optional Context Note */}
                <div className="mt-2">
                  <button
                    onClick={() => toggleNote(key)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Add a note (optional)
                    {noteExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  {noteExpanded && (
                    <textarea
                      value={reason.contextNote || ""}
                      onChange={(e) => setContextNote(key, e.target.value)}
                      placeholder="Any additional context..."
                      maxLength={300}
                      className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                      rows={2}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — Progress + Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {classifiedCount}/{zeroAllocations.length} classified
            {!allClassified && (
              <span className="text-amber-600 ml-2">
                (unclassified will default to "Limited points")
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Confirm & Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZeroScoreReasonDialog;
