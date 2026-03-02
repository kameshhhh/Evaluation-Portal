// ============================================================
// PEER GROUP WIZARD — Student Peer Group Creation
// ============================================================
// SRS §4.5.1: "Students may define a peer group (one-time or
// periodic). Network stored privately."
//
// Three-step wizard:
//   Step 1: Name your group
//   Step 2: Select 5-15 peers (from classmates/teammates)
//   Step 3: Confirm and create
//
// PRIVACY: Group is private to the student. No admin/faculty sees it.
// ============================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Search,
  Check,
  X,
  UserPlus,
  ChevronRight,
  ChevronLeft,
  Shield,
} from "lucide-react";

const PeerGroupWizard = ({
  availablePeers,
  loadAvailablePeers,
  onCreateGroup,
  existingGroups,
  onSkip,
}) => {
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState("");
  const [selectedPeerIds, setSelectedPeerIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshPeriod, setRefreshPeriod] = useState("semester");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // Load available peers on mount
  useEffect(() => {
    loadAvailablePeers();
  }, [loadAvailablePeers]);

  // Filter peers by search
  const filteredPeers = useMemo(() => {
    if (!searchQuery.trim()) return availablePeers;
    const q = searchQuery.toLowerCase();
    return availablePeers.filter(
      (p) =>
        p.displayName?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q),
    );
  }, [availablePeers, searchQuery]);

  // Group by relationship
  const groupedPeers = useMemo(() => {
    const groups = { teammate: [], classmate: [], other: [] };
    filteredPeers.forEach((p) => {
      const key = p.relationship || "other";
      if (groups[key]) groups[key].push(p);
      else groups.other.push(p);
    });
    return groups;
  }, [filteredPeers]);

  const togglePeer = (personId) => {
    setSelectedPeerIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else if (next.size < 15) {
        next.add(personId);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      await onCreateGroup({
        groupName: groupName.trim(),
        peerIds: Array.from(selectedPeerIds),
        refreshPeriod,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-indigo-600" />
              Create Your Peer Group
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Step {step} of 3 —{" "}
              {step === 1 ? "Name" : step === 2 ? "Select Peers" : "Confirm"}
            </p>
          </div>
          {onSkip && (
            <button
              onClick={onSkip}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Skip for now
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex gap-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-indigo-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ============ STEP 1: Name ============ */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Group Name (private — only you see this)
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder='e.g., "Spring 2026 Study Group"'
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                maxLength={100}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Refresh Period
              </label>
              <select
                value={refreshPeriod}
                onChange={(e) => setRefreshPeriod(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
              >
                <option value="one-time">One-time (no refresh)</option>
                <option value="semester">Every semester</option>
                <option value="yearly">Every year</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                SRS §4.5.1: You can refresh your peer group periodically.
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg">
              <Shield className="h-4 w-4 text-indigo-600" />
              <p className="text-xs text-indigo-700">
                Your peer group is completely private. No one — not even faculty
                or admins — can see who you've selected.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!groupName.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Next: Select Peers
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 2: Select Peers ============ */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Search + counter */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search peers by name or department..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  selectedPeerIds.size >= 5 && selectedPeerIds.size <= 15
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {selectedPeerIds.size}/15 selected
              </div>
            </div>

            {selectedPeerIds.size < 5 && (
              <p className="text-xs text-amber-600">
                Select at least 5 peers (currently {selectedPeerIds.size})
              </p>
            )}

            {/* Peer list grouped by relationship */}
            <div className="max-h-80 overflow-y-auto space-y-4 border border-gray-200 rounded-xl p-3">
              {[
                { key: "teammate", label: "Project Teammates", color: "green" },
                { key: "classmate", label: "Classmates", color: "blue" },
                { key: "other", label: "Others", color: "gray" },
              ].map(({ key, label, color }) => {
                const peers = groupedPeers[key] || [];
                if (peers.length === 0) return null;
                return (
                  <div key={key}>
                    <h4
                      className={`text-xs font-semibold text-${color}-600 uppercase tracking-wider mb-2`}
                    >
                      {label} ({peers.length})
                    </h4>
                    <div className="space-y-1">
                      {peers.map((peer) => {
                        const selected = selectedPeerIds.has(peer.personId);
                        return (
                          <button
                            key={peer.personId}
                            onClick={() => togglePeer(peer.personId)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                              selected
                                ? "bg-indigo-50 border border-indigo-300"
                                : "hover:bg-gray-50 border border-transparent"
                            }`}
                            aria-pressed={selected}
                          >
                            <div
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                                selected
                                  ? "bg-indigo-600 border-indigo-600"
                                  : "border-gray-300"
                              }`}
                            >
                              {selected && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gray-900 truncate block">
                                {peer.displayName}
                              </span>
                              {peer.department && (
                                <span className="text-xs text-gray-500">
                                  {peer.department}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredPeers.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-4">
                  No peers found matching your search.
                </p>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-2.5 text-gray-600 hover:text-gray-800 text-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedPeerIds.size < 5}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Review & Create
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============ STEP 3: Confirm ============ */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  Group Name
                </span>
                <p className="text-sm font-medium text-gray-900">{groupName}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  Selected Peers ({selectedPeerIds.size})
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {availablePeers
                    .filter((p) => selectedPeerIds.has(p.personId))
                    .map((p) => (
                      <span
                        key={p.personId}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs"
                      >
                        {p.displayName}
                        <button
                          onClick={() => togglePeer(p.personId)}
                          className="text-indigo-400 hover:text-indigo-700"
                          aria-label={`Remove ${p.displayName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  Refresh Period
                </span>
                <p className="text-sm text-gray-700 capitalize">
                  {refreshPeriod}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <Shield className="h-4 w-4 text-green-600" />
              <p className="text-xs text-green-700">
                This group is stored privately and encrypted. It will be used
                only for your anonymous peer evaluations.
              </p>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-2.5 text-gray-600 hover:text-gray-800 text-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || selectedPeerIds.size < 5}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {creating ? (
                  <>
                    <Users className="h-4 w-4 animate-pulse" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4" />
                    Create Peer Group
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PeerGroupWizard;
