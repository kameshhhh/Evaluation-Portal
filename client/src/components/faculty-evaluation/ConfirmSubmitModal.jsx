// ============================================================
// CONFIRM SUBMIT MODAL — Final evaluation confirmation
// ============================================================
// SRS §4.4.1 — Shows summary before irreversible submission.
// Displays tier breakdown, total points, budget status.
// ============================================================

import React from "react";
import { AlertTriangle, CheckCircle, X } from "lucide-react";

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility
 * @param {Function} props.onClose - Close handler
 * @param {Function} props.onConfirm - Submit handler
 * @param {Object} props.tiers - Current tier assignments
 * @param {Array} props.tierConfig - Tier definitions
 * @param {Object} props.pool - Budget status
 * @param {boolean} props.submitting - Is submission in progress
 */
const ConfirmSubmitModal = ({
  isOpen,
  onClose,
  onConfirm,
  tiers,
  tierConfig,
  pool,
  submitting,
}) => {
  if (!isOpen) return null;

  const tierColorClasses = {
    gold: "text-amber-600 bg-amber-50 border-amber-200",
    silver: "text-gray-600 bg-gray-50 border-gray-200",
    bronze: "text-orange-600 bg-orange-50 border-orange-200",
    gray: "text-gray-500 bg-gray-50 border-gray-200",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm faculty evaluation submission"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">Confirm Submission</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              This action is <strong>irreversible</strong>. Once submitted, you
              cannot modify your evaluation for this session.
            </p>
          </div>

          {/* Tier summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Your Allocation Summary
            </h3>
            {tierConfig.map((tier) => {
              const members = tiers[tier.id] || [];
              if (members.length === 0 && tier.id === "unranked") return null;
              return (
                <div
                  key={tier.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    tierColorClasses[tier.color] || tierColorClasses.gray
                  }`}
                >
                  <div>
                    <span className="font-medium text-sm">{tier.label}</span>
                    <span className="text-xs ml-2 opacity-70">
                      ({tier.points} pts each)
                    </span>
                  </div>
                  <span className="font-bold text-sm">
                    {members.length} faculty
                  </span>
                </div>
              );
            })}
          </div>

          {/* Budget summary */}
          <div
            className={`flex items-center justify-between p-3 rounded-lg border ${
              pool.isExceeded
                ? "bg-red-50 border-red-200"
                : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <span className="text-sm font-medium text-gray-700">
              Total Points
            </span>
            <span
              className={`font-bold ${pool.isExceeded ? "text-red-600" : "text-emerald-600"}`}
            >
              {pool.used} / {pool.total}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || pool.isExceeded}
            className={`px-6 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
              pool.isExceeded
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg hover:shadow-xl"
            }`}
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Submit Evaluation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmSubmitModal;
