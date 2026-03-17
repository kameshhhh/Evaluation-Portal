// ============================================================
// FACULTY — Comparative Review Tab
// ============================================================
// Shows pairings assigned to the faculty for head-to-head comparison.
// Faculty marks teams relatively — distributing a fixed mark pool.
// Completely standalone module.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Scale,
  CheckCircle,
  AlertCircle,
  Loader2,
  Users,
  Github,
  Send,
  ChevronDown,
  ChevronUp,
  Trophy,
} from "lucide-react";
import {
  getMyPairings,
  submitCompReviewMarks,
  getGlobalRankings,
} from "../../../services/comparativeReviewApi";

const TRACK_LABELS = { core: "Core", it_core: "IT & Core", premium: "Premium" };
const STATUS_COLORS = {
  assigned: "bg-blue-100 text-blue-700",
  marked: "bg-green-100 text-green-700",
  finalized: "bg-green-100 text-green-700",
};

export default function FacultyComparativeReviewTab() {
  const [pairings, setPairings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Expanded pairing for marking
  const [expandedPairingId, setExpandedPairingId] = useState(null);

  // Mark inputs: { [teamId]: { marks: "", feedback: "" } }
  const [markInputs, setMarkInputs] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Rankings
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // ============================================================
  // Fetch pairings
  // ============================================================
  const fetchPairings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getMyPairings();
      const data = res?.data || res || [];
      setPairings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load pairings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRankings = useCallback(async () => {
    try {
      setRankingsLoading(true);
      const res = await getGlobalRankings();
      const data = res?.data || res || [];
      setRankings(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setRankingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  useEffect(() => {
    if (showRankings) fetchRankings();
  }, [showRankings, fetchRankings]);

  // ============================================================
  // Expand pairing for marking
  // ============================================================
  const handleExpand = (pairing) => {
    if (expandedPairingId === pairing.id) {
      setExpandedPairingId(null);
      return;
    }
    setExpandedPairingId(pairing.id);

    // Init mark inputs from existing marks or empty
    const inputs = {};
    for (const team of pairing.teams || []) {
      const existingMark = pairing.marks?.find((m) => m.team_id === team.team_id);
      inputs[team.team_id] = {
        marks: existingMark ? parseFloat(existingMark.marks).toString() : "",
        feedback: existingMark?.feedback || "",
      };
    }
    setMarkInputs(inputs);
  };

  // ============================================================
  // Submit marks
  // ============================================================
  const handleSubmitMarks = async (pairing) => {
    const marksArray = Object.entries(markInputs).map(([teamId, val]) => ({
      teamId,
      marks: parseFloat(val.marks) || 0,
      feedback: val.feedback,
    }));

    // Validate sum
    const total = marksArray.reduce((s, m) => s + m.marks, 0);
    const pool = parseFloat(pairing.mark_pool);
    if (Math.abs(total - pool) > 0.01) {
      setError(`Total marks must equal ${pool.toFixed(1)}. Currently: ${total.toFixed(2)}`);
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const res = await submitCompReviewMarks(pairing.id, marksArray);
      const data = res?.data || res;
      if (res?.error || data?.error) {
        setError(res?.error || data?.error);
        return;
      }
      setSuccessMsg("Marks submitted successfully!");
      setExpandedPairingId(null);
      fetchPairings();
    } catch (err) {
      setError("Failed to submit marks.");
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-clear messages
  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(""), 4000); return () => clearTimeout(t); }
  }, [successMsg]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(""), 6000); return () => clearTimeout(t); }
  }, [error]);

  // Helper: compute remaining marks
  const getRemaining = (markPool) => {
    const total = Object.values(markInputs).reduce((s, v) => s + (parseFloat(v.marks) || 0), 0);
    return parseFloat(markPool) - total;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Scale className="h-5 w-5 text-violet-600" />
          Comparative Review
        </h2>
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors"
        >
          <Trophy className="h-3.5 w-3.5" /> {showRankings ? "Hide Rankings" : "View Rankings"}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
          <CheckCircle className="h-4 w-4 flex-shrink-0" /> {successMsg}
        </div>
      )}

      {/* Rankings panel */}
      {showRankings && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Global Team Rankings
          </h3>
          {rankingsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            </div>
          ) : rankings.length === 0 ? (
            <p className="text-xs text-amber-600 text-center py-2">No rankings yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {rankings.map((r) => (
                <div key={r.team_id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold w-6 ${r.global_rank <= 3 ? "text-amber-500" : "text-gray-400"}`}>
                      #{r.global_rank}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.project_title}</p>
                      <p className="text-[10px] text-gray-400">{r.leader_name} • {TRACK_LABELS[r.track] || r.track}</p>
                    </div>
                  </div>
                  <span className="font-bold text-indigo-700 text-sm">
                    {parseFloat(r.marks).toFixed(2)}<span className="text-xs text-gray-400">/{parseFloat(r.mark_pool).toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pairings List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
        </div>
      ) : pairings.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Scale className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No comparative review pairings assigned to you yet.</p>
          <p className="text-xs text-gray-400 mt-1">Admin will assign team pairings for you to evaluate.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => {
            const isExpanded = expandedPairingId === pairing.id;
            const isMarked = pairing.status === "marked" || pairing.status === "finalized";

            return (
              <div key={pairing.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Pairing Header */}
                <button
                  onClick={() => handleExpand(pairing)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-800">{pairing.pairing_label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[pairing.status] || "bg-gray-100 text-gray-600"}`}>
                          {isMarked ? "Marked" : "Pending"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                          {TRACK_LABELS[pairing.track] || pairing.track}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{pairing.round_title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Pool: {parseFloat(pairing.mark_pool).toFixed(1)}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Quick team preview when collapsed */}
                  {!isExpanded && pairing.teams && (
                    <div className="flex items-center gap-2 mt-2">
                      {pairing.teams.map((team) => {
                        const mark = pairing.marks?.find((m) => m.team_id === team.team_id);
                        return (
                          <span key={team.team_id} className="text-xs bg-gray-100 px-2 py-0.5 rounded-lg text-gray-600">
                            {team.project_title || "Team"}
                            {mark && <b className="ml-1 text-indigo-600">{parseFloat(mark.marks).toFixed(1)}</b>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>

                {/* Expanded: Marking View */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {pairing.teams?.map((team) => (
                        <div key={team.team_id} className="bg-white rounded-xl border border-gray-200 p-4">
                          <h4 className="font-semibold text-sm text-gray-900">{team.project_title || "Unnamed Project"}</h4>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Users className="h-3 w-3" /> Leader: {team.leader_name}
                          </p>
                          {team.member_names && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Members: {team.member_names}</p>
                          )}

                          {team.members_detail?.length > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] font-medium text-gray-500">Team Members:</p>
                              {team.members_detail.map((m) => (
                                <div key={m.person_id} className="flex items-center gap-2 text-xs text-gray-700">
                                  <Users className="h-3 w-3 text-gray-400" />
                                  <span>{m.name}</span>
                                  {m.has_github ? (
                                    <a href={`/github/${m.person_id}`} target="_blank" rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[9px] text-gray-600 hover:text-gray-900 transition-colors"
                                      title={`View GitHub — @${m.github_username || 'Profile'}`}>
                                      <Github className="h-3 w-3" />
                                      <span className="text-[9px] text-green-600">@{m.github_username}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
                                      <Github className="h-3 w-3" /> not linked
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Mark Input */}
                          <div className="mt-3 space-y-2">
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
                                Marks (out of {parseFloat(pairing.mark_pool).toFixed(1)} pool)
                              </label>
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                max={pairing.mark_pool}
                                value={markInputs[team.team_id]?.marks || ""}
                                onChange={(e) =>
                                  setMarkInputs((prev) => ({
                                    ...prev,
                                    [team.team_id]: { ...prev[team.team_id], marks: e.target.value },
                                  }))
                                }
                                disabled={isMarked}
                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Feedback</label>
                              <textarea
                                value={markInputs[team.team_id]?.feedback || ""}
                                onChange={(e) =>
                                  setMarkInputs((prev) => ({
                                    ...prev,
                                    [team.team_id]: { ...prev[team.team_id], feedback: e.target.value },
                                  }))
                                }
                                disabled={isMarked}
                                rows={2}
                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-violet-400 focus:outline-none resize-none disabled:bg-gray-100 disabled:text-gray-500"
                                placeholder="Feedback for this team..."
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pool validation bar */}
                    {!isMarked && (
                      <>
                        <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-gray-200 mb-3">
                          <span className="text-xs text-gray-600">
                            Total: <b className={`${Math.abs(getRemaining(pairing.mark_pool)) < 0.01 ? "text-green-600" : "text-red-600"}`}>
                              {(parseFloat(pairing.mark_pool) - getRemaining(pairing.mark_pool)).toFixed(2)}
                            </b> / {parseFloat(pairing.mark_pool).toFixed(1)}
                          </span>
                          <span className={`text-xs font-medium ${Math.abs(getRemaining(pairing.mark_pool)) < 0.01 ? "text-green-600" : "text-amber-600"}`}>
                            {Math.abs(getRemaining(pairing.mark_pool)) < 0.01
                              ? "Pool balanced!"
                              : `Remaining: ${getRemaining(pairing.mark_pool).toFixed(2)}`}
                          </span>
                        </div>
                        <button
                          onClick={() => handleSubmitMarks(pairing)}
                          disabled={submitting || Math.abs(getRemaining(pairing.mark_pool)) > 0.01}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Submit Comparative Marks
                        </button>
                      </>
                    )}

                    {isMarked && (
                      <div className="flex items-center gap-2 bg-green-50 rounded-lg px-4 py-2 border border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-xs text-green-700 font-medium">Marks submitted and locked.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
