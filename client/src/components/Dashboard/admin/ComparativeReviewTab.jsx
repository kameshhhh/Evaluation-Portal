// ============================================================
// ADMIN — Comparative Review Tab
// ============================================================
// Standalone module for head-to-head team comparison.
// Sub-views: Rounds List → Round Detail (Pairing Manager)
// Auto-naming like session planner: "Mar S1 - Batch 2027 [Core] CR"
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Scale,
  Plus,
  ChevronLeft,
  Users,
  UserCheck,
  Trophy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import {
  listRounds,
  createRound,
  getRoundDetail,
  getAvailableTeams,
  createPairing,
  assignFacultyToPairing,
  deletePairing,
  deleteRound,
  finalizeRound,
  getFacultyList,
  getGlobalRankings,
} from "../../../services/comparativeReviewApi";
import { getActiveBatches } from "../../../utils/batchHelper";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEGMENTS = ["S1", "S2", "S3", "S4"];
const TRACKS = [
  { value: "core", label: "Core" },
  { value: "it_core", label: "IT & Core" },
  { value: "premium", label: "Premium" },
];

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  marking: "bg-amber-100 text-amber-700",
  finalized: "bg-green-100 text-green-700",
};

const PAIRING_STATUS_COLORS = {
  pending: "bg-gray-100 text-gray-600",
  assigned: "bg-blue-100 text-blue-700",
  marked: "bg-amber-100 text-amber-700",
  finalized: "bg-green-100 text-green-700",
};

export default function ComparativeReviewTab() {
  // View state
  const [view, setView] = useState("rounds"); // "rounds" | "detail" | "rankings"
  const [selectedRoundId, setSelectedRoundId] = useState(null);

  // Data
  const [rounds, setRounds] = useState([]);
  const [roundDetail, setRoundDetail] = useState(null);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [rankingsTrack, setRankingsTrack] = useState("");

  // Create round modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionMonth, setSessionMonth] = useState(MONTHS[new Date().getMonth()]);
  const [sessionSegment, setSessionSegment] = useState("S1");
  const [selectedTrack, setSelectedTrack] = useState("core");
  const [selectedBatchYear, setSelectedBatchYear] = useState(getActiveBatches()[0]?.batchYear || null);
  const [sessionSemester, setSessionSemester] = useState(1);
  const [markPool, setMarkPool] = useState(5);

  // Pairing creation
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);

  // Faculty assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignPairingId, setAssignPairingId] = useState(null);
  const [assignFacultyId, setAssignFacultyId] = useState("");

  // Loading & error
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const ACTIVE_BATCHES = getActiveBatches();

  // ============================================================
  // Data fetching
  // ============================================================
  const fetchRounds = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await listRounds();
      const data = res?.data || res || [];
      setRounds(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load rounds.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoundDetail = useCallback(async (roundId) => {
    try {
      setLoading(true);
      setError("");
      const res = await getRoundDetail(roundId);
      const detail = res?.data || res;
      setRoundDetail(detail);

      const teamsRes = await getAvailableTeams(roundId);
      const teams = teamsRes?.data || teamsRes || [];
      setAvailableTeams(Array.isArray(teams) ? teams : []);
    } catch (err) {
      setError("Failed to load round detail.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFacultyList = useCallback(async () => {
    try {
      const res = await getFacultyList();
      const data = res?.data || res || [];
      setFacultyList(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, []);

  const fetchRankings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getGlobalRankings(rankingsTrack ? { track: rankingsTrack } : {});
      const data = res?.data || res || [];
      setRankings(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load rankings.");
    } finally {
      setLoading(false);
    }
  }, [rankingsTrack]);

  useEffect(() => {
    if (view === "rounds") fetchRounds();
    if (view === "rankings") fetchRankings();
  }, [view, fetchRounds, fetchRankings]);

  useEffect(() => {
    if (selectedRoundId && view === "detail") {
      fetchRoundDetail(selectedRoundId);
      fetchFacultyList();
    }
  }, [selectedRoundId, view, fetchRoundDetail, fetchFacultyList]);

  // ============================================================
  // Actions
  // ============================================================
  const handleCreateRound = async () => {
    try {
      setActionLoading(true);
      setError("");
      const res = await createRound({
        month: sessionMonth,
        segment: sessionSegment,
        track: selectedTrack,
        batchYear: selectedBatchYear,
        semester: sessionSemester,
        markPool,
      });
      const data = res?.data || res;
      if (res?.duplicate) {
        setSuccessMsg(`Round "${data.title}" already exists. Opening it.`);
      } else {
        setSuccessMsg(`Round "${data.title}" created!`);
      }
      setShowCreateModal(false);
      setSelectedRoundId(data.id);
      setView("detail");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to create round.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePairing = async () => {
    if (selectedTeamIds.length < 2) {
      setError("Select at least 2 teams/students to create a pairing.");
      return;
    }
    try {
      setActionLoading(true);
      setError("");
      // Split selections into formal teams vs solo students
      const teamIds = [];
      const soloPersonIds = [];
      for (const id of selectedTeamIds) {
        const entry = availableTeams.find(t => (t.team_id || t.person_id) === id);
        if (entry?.team_type === 'solo') {
          soloPersonIds.push(entry.person_id);
        } else {
          teamIds.push(id);
        }
      }
      await createPairing(selectedRoundId, teamIds, soloPersonIds);
      setSelectedTeamIds([]);
      setSuccessMsg("Pairing created!");
      fetchRoundDetail(selectedRoundId);
    } catch (err) {
      setError("Failed to create pairing.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignFaculty = async () => {
    if (!assignFacultyId) return;
    try {
      setActionLoading(true);
      setError("");
      await assignFacultyToPairing(assignPairingId, assignFacultyId);
      setShowAssignModal(false);
      setAssignPairingId(null);
      setAssignFacultyId("");
      setSuccessMsg("Faculty assigned!");
      fetchRoundDetail(selectedRoundId);
    } catch (err) {
      setError("Failed to assign faculty.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePairing = async (pairingId) => {
    if (!window.confirm("Delete this pairing?")) return;
    try {
      setActionLoading(true);
      await deletePairing(pairingId);
      setSuccessMsg("Pairing deleted.");
      fetchRoundDetail(selectedRoundId);
    } catch {
      setError("Failed to delete pairing.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalizeRound = async () => {
    if (!window.confirm("Finalize this round? All marks will be locked and rankings will be visible.")) return;
    try {
      setActionLoading(true);
      setError("");
      const res = await finalizeRound(selectedRoundId);
      const data = res?.data || res;
      if (res?.error || data?.error) {
        setError(res?.error || data?.error);
        return;
      }
      setSuccessMsg("Round finalized! Rankings are now visible.");
      fetchRoundDetail(selectedRoundId);
    } catch (err) {
      setError("Failed to finalize round.");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleTeamSelection = (entry) => {
    const id = entry.team_id || entry.person_id;
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleDeleteRound = async (roundId) => {
    if (!window.confirm("Delete this entire round and all its pairings?")) return;
    try {
      setActionLoading(true);
      await deleteRound(roundId);
      setSuccessMsg("Round deleted.");
      setView("rounds");
      setSelectedRoundId(null);
      setRoundDetail(null);
      fetchRounds();
    } catch {
      setError("Failed to delete round. Only non-finalized rounds can be deleted.");
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-clear messages
  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(""), 4000); return () => clearTimeout(t); }
  }, [successMsg]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(""), 6000); return () => clearTimeout(t); }
  }, [error]);

  const previewTitle = `${sessionMonth} ${sessionSegment} - Batch ${selectedBatchYear} [${TRACKS.find(t => t.value === selectedTrack)?.label}] CR`;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-4">
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

      {/* ====== VIEW: ROUNDS LIST ====== */}
      {view === "rounds" && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Scale className="h-5 w-5 text-indigo-600" />
              Comparative Review Rounds
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setView("rankings")}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors"
              >
                <Trophy className="h-4 w-4" /> Rankings
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" /> Create Round
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : rounds.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Scale className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No comparative review rounds yet.</p>
              <p className="text-xs text-gray-400 mt-1">Create a round to start pairing teams for head-to-head comparison.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {rounds.map((round) => (
                <button
                  key={round.id}
                  onClick={() => { setSelectedRoundId(round.id); setView("detail"); }}
                  className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{round.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{round.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[round.status]}`}>
                        {round.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {round.pairing_count || 0} pairings
                        {round.marked_count > 0 && ` • ${round.marked_count} marked`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>Pool: {parseFloat(round.mark_pool).toFixed(1)}</span>
                    <span>Sem {round.semester}</span>
                    {round.batch_year && <span>Batch {round.batch_year}</span>}
                    <span>By: {round.created_by_name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== VIEW: ROUND DETAIL ====== */}
      {view === "detail" && roundDetail && (
        <>
          {/* Header */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setView("rounds"); setSelectedRoundId(null); setRoundDetail(null); }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">{roundDetail.title}</h2>
              <p className="text-xs text-gray-500">{roundDetail.description}</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[roundDetail.status]}`}>
              {roundDetail.status}
            </span>
            <button onClick={() => fetchRoundDetail(selectedRoundId)} className="p-2 rounded-lg hover:bg-gray-100">
              <RefreshCw className="h-4 w-4 text-gray-400" />
            </button>
            {roundDetail.status !== "finalized" && (
              <button onClick={() => handleDeleteRound(selectedRoundId)}
                className="p-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete Round">
                <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
              </button>
            )}
          </div>

          {/* Round info bar */}
          <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2">
            <span>Mark Pool: <b className="text-gray-700">{parseFloat(roundDetail.mark_pool).toFixed(1)}</b></span>
            <span>Track: <b className="text-gray-700">{TRACKS.find(t => t.value === roundDetail.track)?.label}</b></span>
            <span>Semester: <b className="text-gray-700">{roundDetail.semester}</b></span>
            {roundDetail.batch_year && <span>Batch: <b className="text-gray-700">{roundDetail.batch_year}</b></span>}
          </div>

          {/* Available Teams + Pairing Creation */}
          {roundDetail.status !== "finalized" && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                Available Teams ({availableTeams.length})
                <span className="text-xs font-normal text-gray-400 ml-1">— Select 2+ teams then click "Create Pairing"</span>
              </h3>
              {availableTeams.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No unpaired teams available in this track.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                  {availableTeams.map((team) => {
                    const entryId = team.team_id || team.person_id;
                    const isSelected = selectedTeamIds.includes(entryId);
                    const isSolo = team.team_type === 'solo';
                    return (
                      <button
                        key={entryId}
                        onClick={() => toggleTeamSelection(team)}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm text-gray-900 truncate">{team.project_title || team.leader_name || "Unnamed"}</p>
                          {isSolo && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-semibold whitespace-nowrap">Solo</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{isSolo ? "Student" : "Leader"}: {team.leader_name}</p>
                        <p className="text-xs text-gray-400">{team.member_count || 1} member{(team.member_count || 1) > 1 ? "s" : ""}</p>
                        {team.member_names && !isSolo && (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{team.member_names}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedTeamIds.length >= 2 && (
                <button
                  onClick={handleCreatePairing}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Pairing ({selectedTeamIds.length} teams)
                </button>
              )}
            </div>
          )}

          {/* Pairings List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Scale className="h-4 w-4 text-amber-500" />
              Pairings ({roundDetail.pairings?.length || 0})
            </h3>
            {(!roundDetail.pairings || roundDetail.pairings.length === 0) ? (
              <p className="text-xs text-gray-400 text-center py-6">No pairings yet. Select teams above to create one.</p>
            ) : (
              roundDetail.pairings.map((pairing) => (
                <div key={pairing.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">{pairing.pairing_label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PAIRING_STATUS_COLORS[pairing.status]}`}>
                        {pairing.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {pairing.faculty_name ? (
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <UserCheck className="h-3 w-3" /> {pairing.faculty_name}
                        </span>
                      ) : (
                        <button
                          onClick={() => { setAssignPairingId(pairing.id); setShowAssignModal(true); }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          + Assign Faculty
                        </button>
                      )}
                      {pairing.status !== "finalized" && pairing.status !== "marked" && (
                        <button onClick={() => handleDeletePairing(pairing.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Teams in this pairing */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {pairing.teams?.map((team) => {
                      const teamMark = pairing.marks?.find((m) => m.team_id === team.team_id);
                      return (
                        <div key={team.team_id || team.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <p className="font-medium text-sm text-gray-900">{team.project_title || "Unnamed"}</p>
                          <p className="text-xs text-gray-500 mt-0.5">Leader: {team.leader_name}</p>
                          <p className="text-xs text-gray-400">{team.member_count || 1} members</p>
                          {teamMark && (
                            <div className="mt-2 bg-amber-50 rounded px-2 py-1 border border-amber-100">
                              <span className="text-sm font-bold text-amber-700">{parseFloat(teamMark.marks).toFixed(2)}</span>
                              <span className="text-xs text-amber-500 ml-1">/ {parseFloat(roundDetail.mark_pool).toFixed(1)}</span>
                              {teamMark.feedback && (
                                <p className="text-[10px] text-amber-600 mt-0.5 truncate">{teamMark.feedback}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Finalize Button */}
          {roundDetail.status === "marking" && (
            <button
              onClick={handleFinalizeRound}
              disabled={actionLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Finalize Round — Lock All Marks & Publish Rankings
            </button>
          )}
        </>
      )}

      {/* ====== VIEW: RANKINGS ====== */}
      {view === "rankings" && (
        <>
          <div className="flex items-center gap-3">
            <button onClick={() => setView("rounds")}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="h-5 w-5 text-gray-500" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Global Team Rankings
            </h2>
          </div>

          {/* Track filter */}
          <div className="flex items-center gap-2">
            <button onClick={() => setRankingsTrack("")}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${!rankingsTrack ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              All Tracks
            </button>
            {TRACKS.map((t) => (
              <button key={t.value} onClick={() => setRankingsTrack(t.value)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${rankingsTrack === t.value ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : rankings.length === 0 ? (
            <p className="text-center py-12 text-sm text-gray-400">No rankings yet. Finalize a round to see rankings.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">#</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Team / Project</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Track</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Rounds</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600">Leader</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, idx) => (
                    <tr key={r.team_id} className={`border-b border-gray-100 ${idx < 3 ? "bg-amber-50/50" : ""}`}>
                      <td className="px-4 py-2.5">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-orange-400" : "text-gray-500"}`}>
                          {r.global_rank}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{r.project_title || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                          {TRACKS.find(t => t.value === r.track)?.label || r.track}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{r.rounds_participated > 1 ? `${r.rounds_participated} rounds avg` : "1 round"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{r.leader_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-bold text-indigo-700">{parseFloat(r.marks).toFixed(2)}</span>
                        <span className="text-xs text-gray-400">/{parseFloat(r.mark_pool).toFixed(1)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ====== MODAL: Create Round (Session Planner Style) ====== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            style={{ border: "1px solid rgba(139,92,246,0.15)" }}
          >
            {/* Header with icon — matches session planner */}
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-violet-100 rounded-xl">
                <Plus size={24} className="text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Create Comparative Review
                </h3>
                <p className="text-sm text-gray-500">
                  Select month, segment, track & batch
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Month — dropdown like session planner */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Month
                </label>
                <select
                  value={sessionMonth}
                  onChange={(e) => setSessionMonth(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition-all"
                >
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Segment — tall buttons with "Week X" sublabel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Segment (Week)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {SEGMENTS.map(seg => (
                    <button
                      key={seg}
                      type="button"
                      onClick={() => setSessionSegment(seg)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${sessionSegment === seg
                        ? "bg-violet-600 text-white border-violet-600 shadow-md"
                        : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                      }`}
                    >
                      {seg}
                      <span className="block text-[10px] font-normal mt-0.5 opacity-70">
                        Week {seg.replace("S", "")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Track — styled like batch year */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Track
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TRACKS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSelectedTrack(t.value)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${selectedTrack === t.value
                        ? "bg-violet-600 text-white border-violet-600 shadow-md"
                        : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Batch — tall buttons with year label below */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Batch
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {ACTIVE_BATCHES.map(b => (
                    <button
                      key={b.batchYear}
                      type="button"
                      onClick={() => setSelectedBatchYear(b.batchYear)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${selectedBatchYear === b.batchYear
                        ? "bg-violet-600 text-white border-violet-600 shadow-md"
                        : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                      }`}
                    >
                      <span className="block text-xs font-bold">{b.batchYear}</span>
                      <span className="block text-[10px] font-normal mt-0.5 opacity-70">
                        {b.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Semester — 8 options in 4-col grid like session planner */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Semester
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSessionSemester(s)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${sessionSemester === s
                        ? "bg-violet-600 text-white border-violet-600 shadow-md"
                        : "bg-white text-gray-600 border-gray-200 hover:border-violet-300"
                      }`}
                    >
                      Sem {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mark Pool */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mark Pool (total marks to distribute)
                </label>
                <input
                  type="number"
                  value={markPool}
                  onChange={(e) => setMarkPool(parseFloat(e.target.value) || 5)}
                  min="1"
                  step="0.5"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition-all"
                />
              </div>

              {/* Preview — violet style like session planner */}
              <div className="bg-violet-50 p-3 rounded-xl border border-violet-100">
                <p className="text-xs text-violet-600 font-medium mb-1">Round Name Preview:</p>
                <p className="text-sm font-bold text-violet-800">
                  {previewTitle}
                </p>
                <p className="text-[10px] text-violet-500 mt-1">
                  Week {sessionSegment.replace("S", "")} of {sessionMonth} {new Date().getFullYear()} • Semester {sessionSemester}
                </p>
                <div className="flex gap-2 mt-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    selectedTrack === "core" ? "bg-green-100 text-green-700" :
                    selectedTrack === "it_core" ? "bg-indigo-100 text-indigo-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {TRACKS.find(t => t.value === selectedTrack)?.label}
                  </span>
                </div>
              </div>

              {/* Mode Info */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-800">
                  <strong>Mode:</strong> Comparative Pool — Faculty distributes <strong>{markPool} marks</strong> across paired teams.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
            </div>

            {/* Actions — matches session planner */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreateModal(false); setError(""); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRound}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                  boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
                }}
              >
                {actionLoading ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Create Round"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== MODAL: Assign Faculty ====== */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Assign Faculty</h3>
              <button onClick={() => { setShowAssignModal(false); setAssignPairingId(null); }}
                className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <select
              value={assignFacultyId}
              onChange={(e) => setAssignFacultyId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none mb-4"
            >
              <option value="">Select Faculty...</option>
              {facultyList.map((f) => (
                <option key={f.person_id} value={f.person_id}>
                  {f.display_name} {f.department_code ? `(${f.department_code})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleAssignFaculty}
              disabled={!assignFacultyId || actionLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Assign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
