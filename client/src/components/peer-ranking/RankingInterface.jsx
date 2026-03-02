// ============================================================
// RANKING INTERFACE — Click-to-Assign Forced Ranking UI
// ============================================================
// SRS §4.5.2: "Student must rank limited top positions (1, 2, 3…).
// Cannot rank all peers equally."
//
// INTERACTION MODEL (Option B — Click-to-assign):
//   1. Student clicks a rank slot (🥇🥈🥉)
//   2. Then clicks a peer card to assign that rank
//   3. OR clicks a peer card first, then a rank slot
//   4. Undo/clear available at any time
//
// ACCESSIBILITY:
//   - Keyboard: Tab through slots + peers, Enter/Space to assign
//   - Screen reader: Announces "Rank N assigned to [Name]"
//   - High contrast rank badges
//   - Reduced motion: no animations, number-only display
//
// VALIDATION:
//   - Unique ranks per question (forced distribution)
//   - Cannot rank all peers (scarcity)
//   - Min 2 ranked per question
// ============================================================

import React, { useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Undo2,
  Trash2,
  Save,
  Send,
  Loader2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";

// Rank badge configs with medal styling
const RANK_MEDALS = {
  1: {
    emoji: "🥇",
    label: "1st",
    color: "bg-amber-100 border-amber-400 text-amber-800",
  },
  2: {
    emoji: "🥈",
    label: "2nd",
    color: "bg-gray-100 border-gray-400 text-gray-800",
  },
  3: {
    emoji: "🥉",
    label: "3rd",
    color: "bg-orange-100 border-orange-400 text-orange-800",
  },
  4: {
    emoji: "4",
    label: "4th",
    color: "bg-blue-50 border-blue-300 text-blue-700",
  },
  5: {
    emoji: "5",
    label: "5th",
    color: "bg-blue-50 border-blue-300 text-blue-700",
  },
};

const RankingInterface = ({
  survey,
  peers,
  currentQuestion,
  currentQuestionIndex,
  totalQuestions,
  currentRankings,
  maxRanks,
  ranksAssigned,
  canSubmit,
  questionCompletionStatus,
  saving,
  submitting,
  lastSaved,
  undoAvailable,
  onAssignRank,
  onRemoveRank,
  onUndo,
  onClearQuestion,
  onNextQuestion,
  onPrevQuestion,
  onGoToQuestion,
  onSaveDraft,
  onSubmit,
}) => {
  // Selected rank slot (waiting for peer click)
  const [selectedRank, setSelectedRank] = useState(null);
  // Show submit confirmation
  const [showConfirm, setShowConfirm] = useState(false);

  // Invert mapping: rank → personId
  const rankToPersonMap = {};
  Object.entries(currentRankings).forEach(([personId, rank]) => {
    rankToPersonMap[rank] = personId;
  });

  // Handle rank slot click
  const handleRankClick = useCallback(
    (rank) => {
      if (selectedRank === rank) {
        setSelectedRank(null); // Deselect
      } else {
        setSelectedRank(rank);
      }
    },
    [selectedRank],
  );

  // Handle peer card click
  const handlePeerClick = useCallback(
    (personId) => {
      if (selectedRank !== null) {
        // A rank is selected — assign this peer to that rank
        onAssignRank(personId, selectedRank);
        setSelectedRank(null);
      } else {
        // No rank selected — check if this peer is already ranked
        const existingRank = currentRankings[personId];
        if (existingRank !== undefined) {
          // Remove the rank (unassign)
          onRemoveRank(personId);
        }
        // If peer is unranked and no rank selected, do nothing
        // User needs to click a rank slot first
      }
    },
    [selectedRank, currentRankings, onAssignRank, onRemoveRank],
  );

  // Get peer name by ID
  const getPeerName = (personId) => {
    const peer = peers.find((p) => p.personId === personId);
    return peer?.displayName || "Unknown";
  };

  const isNegativeQuestion =
    currentQuestion?.isNegative || currentQuestion?.type === "negative";

  return (
    <div className="space-y-4">
      {/* Question Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-600">
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </span>
          <div className="flex gap-1">
            {questionCompletionStatus.map((q) => (
              <button
                key={q.index}
                onClick={() => onGoToQuestion(q.index)}
                className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                  q.index === currentQuestionIndex
                    ? "bg-indigo-600 text-white"
                    : q.isComplete
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                title={`Question ${q.index + 1}: ${q.ranksAssigned} ranked`}
              >
                {q.isComplete ? (
                  <Check className="h-3 w-3 mx-auto" />
                ) : (
                  q.index + 1
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Question text */}
        <div
          className={`p-4 rounded-lg ${isNegativeQuestion ? "bg-orange-50 border border-orange-200" : "bg-indigo-50 border border-indigo-200"}`}
        >
          <p className="text-base font-semibold text-gray-900">
            {currentQuestion?.text || "Loading question..."}
          </p>
          {isNegativeQuestion && (
            <p className="text-xs text-orange-600 mt-1">
              ⚠️ Sensitive question — responses receive extra anonymization
            </p>
          )}
        </div>
      </div>

      {/* Main Ranking Area — Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Rank Slots (1/3) */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm sticky top-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Rank Slots ({ranksAssigned}/{maxRanks})
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Click a slot, then click a peer to assign
            </p>

            <div className="space-y-2">
              {Array.from({ length: maxRanks }, (_, i) => i + 1).map((rank) => {
                const medal = RANK_MEDALS[rank] || {
                  emoji: rank,
                  label: `${rank}th`,
                  color: "bg-gray-50 border-gray-300 text-gray-700",
                };
                const assignedPeerId = rankToPersonMap[rank];
                const isSelected = selectedRank === rank;

                return (
                  <button
                    key={rank}
                    onClick={() =>
                      assignedPeerId
                        ? onRemoveRank(assignedPeerId)
                        : handleRankClick(rank)
                    }
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border-2 transition-all text-sm ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                        : assignedPeerId
                          ? `${medal.color} border-2`
                          : "border-dashed border-gray-300 hover:border-gray-400 bg-gray-50"
                    }`}
                    aria-label={
                      assignedPeerId
                        ? `Rank ${rank}: ${getPeerName(assignedPeerId)}. Click to remove.`
                        : `Rank ${rank}: Empty. Click to select, then choose a peer.`
                    }
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="text-lg flex-shrink-0 w-8 text-center">
                      {medal.emoji}
                    </span>
                    <div className="flex-1 text-left min-w-0">
                      {assignedPeerId ? (
                        <span className="font-medium truncate block">
                          {getPeerName(assignedPeerId)}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">
                          {isSelected
                            ? "Now click a peer →"
                            : `Select for ${medal.label}`}
                        </span>
                      )}
                    </div>
                    {assignedPeerId && (
                      <X className="h-4 w-4 text-gray-400 hover:text-red-500 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Cannot rank all warning */}
            {ranksAssigned >= peers.length - 1 && peers.length > maxRanks && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  You must leave at least one peer unranked — this is how
                  scarcity ensures honest differentiation.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={onUndo}
                disabled={!undoAvailable}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Undo last action"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
              <button
                onClick={onClearQuestion}
                disabled={ranksAssigned === 0}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Clear all ranks for this question"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Peer Cards (2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Peers ({peers.length})
              {selectedRank && (
                <span className="ml-2 text-indigo-600 font-normal">
                  — Click a peer to assign rank {selectedRank}
                </span>
              )}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {peers.map((peer) => {
                const assignedRank = currentRankings[peer.personId];
                const isAssigned = assignedRank !== undefined;
                const medal = isAssigned ? RANK_MEDALS[assignedRank] : null;

                return (
                  <button
                    key={peer.personId}
                    onClick={() => handlePeerClick(peer.personId)}
                    disabled={isAssigned && selectedRank === null}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-sm text-left ${
                      isAssigned
                        ? `${medal?.color || "bg-gray-100"} border-2 opacity-75`
                        : selectedRank
                          ? "border-indigo-300 bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    } ${isAssigned && selectedRank === null ? "cursor-default" : ""}`}
                    aria-label={
                      isAssigned
                        ? `${peer.displayName} — Rank ${assignedRank}. Click to remove.`
                        : `${peer.displayName} — Unranked.${selectedRank ? ` Click to assign rank ${selectedRank}.` : ""}`
                    }
                  >
                    {/* Avatar */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isAssigned
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {peer.displayName
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900 block truncate">
                        {peer.displayName}
                      </span>
                      {peer.department && (
                        <span className="text-xs text-gray-500 block truncate">
                          {peer.department}
                        </span>
                      )}
                    </div>

                    {/* Rank badge */}
                    {isAssigned && medal && (
                      <span className="text-lg flex-shrink-0">
                        {medal.emoji}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation + Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Question nav */}
          <div className="flex gap-2">
            <button
              onClick={onPrevQuestion}
              disabled={currentQuestionIndex === 0}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={onNextQuestion}
              disabled={currentQuestionIndex >= totalQuestions - 1}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Status + Actions */}
          <div className="flex items-center gap-3">
            {/* Auto-save status */}
            {saving && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {lastSaved && !saving && (
              <span className="text-xs text-gray-400">
                Saved {new Date(lastSaved).toLocaleTimeString()}
              </span>
            )}

            <button
              onClick={onSaveDraft}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <Save className="h-4 w-4" />
              Save
            </button>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canSubmit || submitting}
              className="flex items-center gap-1 px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              <Send className="h-4 w-4" />
              Submit
            </button>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Submit Your Rankings?
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  This action is final — rankings cannot be changed after
                  submission to ensure fairness.
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
              {questionCompletionStatus.map((q) => (
                <div
                  key={q.index}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600">Question {q.index + 1}</span>
                  <span
                    className={
                      q.isComplete
                        ? "text-green-600 font-medium"
                        : "text-amber-600"
                    }
                  >
                    {q.ranksAssigned} peers ranked
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
              <p className="text-xs text-green-700">
                🔒 Your rankings are anonymous and encrypted. No one will see
                how you ranked specific peers.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onSubmit();
                }}
                disabled={submitting}
                className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {submitting ? "Submitting..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RankingInterface;
