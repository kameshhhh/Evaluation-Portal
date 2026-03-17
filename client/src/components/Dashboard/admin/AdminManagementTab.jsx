// ============================================================
// ADMIN MANAGEMENT TAB — Session Delete, Credibility Reset & CR Rounds
// ============================================================
// Three panels:
//   1. Session Management — View sessions, delete with confirmation
//   2. Credibility Reset  — Select faculty or reset all
//   3. CR Rounds          — View and delete comparative review rounds
// Both work in real-time: backend deletes → socket broadcast → UI updates
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Shield,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  Calendar,
  Hash,
  Zap,
  Scale,
} from "lucide-react";
import {
  listAllSessions,
  deleteSession,
  listFacultyCredibility,
  resetCredibility,
} from "../../../services/adminManagementApi";
import { listRounds, deleteRound } from "../../../services/comparativeReviewApi";

// ============================================================
// STATUS BADGE — Color-coded session status
// ============================================================
const StatusBadge = ({ status }) => {
  const styles = {
    OPEN: "bg-green-100 text-green-700 border-green-200",
    FINALIZED: "bg-blue-100 text-blue-700 border-blue-200",
    CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
    DRAFT: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles.DRAFT}`}
    >
      {status || "DRAFT"}
    </span>
  );
};

// ============================================================
// CREDIBILITY BADGE
// ============================================================
const CredBadge = ({ score, band }) => {
  if (score == null) return <span className="text-gray-400 text-xs">—</span>;
  const colors = {
    HIGH: "text-green-600 bg-green-50",
    MEDIUM: "text-yellow-600 bg-yellow-50",
    LOW: "text-red-600 bg-red-50",
    NEW: "text-gray-500 bg-gray-50",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${colors[band] || colors.NEW}`}>
      {parseFloat(score).toFixed(2)} ({band || "NEW"})
    </span>
  );
};

// ============================================================
// CONFIRMATION MODAL — Double-confirm destructive actions
// ============================================================
const ConfirmModal = ({ open, title, message, danger, confirmLabel, onConfirm, onCancel, loading }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-full ${danger ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertTriangle className={`h-5 w-5 ${danger ? "text-red-600" : "text-amber-600"}`} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition flex items-center gap-2 ${
              danger
                ? "bg-red-600 hover:bg-red-700 disabled:bg-red-400"
                : "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400"
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const AdminManagementTab = () => {
  // ── Session Management State ──
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // session to delete
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Credibility State ──
  const [faculty, setFaculty] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(false);
  const [facultySearch, setFacultySearch] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState(new Set());
  const [resetTarget, setResetTarget] = useState(null); // "selected" | "all" | null
  const [resetLoading, setResetLoading] = useState(false);

  // ── CR Rounds State ──
  const [crRounds, setCrRounds] = useState([]);
  const [crLoading, setCrLoading] = useState(false);
  const [crSearch, setCrSearch] = useState("");
  const [crDeleteTarget, setCrDeleteTarget] = useState(null);
  const [crDeleteLoading, setCrDeleteLoading] = useState(false);

  // ── Shared State ──
  const [successMsg, setSuccessMsg] = useState(null);
  const [error, setError] = useState(null);
  const [activePanel, setActivePanel] = useState("sessions"); // "sessions" | "credibility" | "cr"

  // ── Auto-dismiss success messages ──
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // ── Load Sessions ──
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setError(null);
    try {
      const result = await listAllSessions();
      setSessions(result.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // ── Load Faculty ──
  const loadFaculty = useCallback(async () => {
    setFacultyLoading(true);
    setError(null);
    try {
      const result = await listFacultyCredibility();
      setFaculty(result.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load faculty");
    } finally {
      setFacultyLoading(false);
    }
  }, []);

  // ── Load CR Rounds ──
  const loadCRRounds = useCallback(async () => {
    setCrLoading(true);
    setError(null);
    try {
      const result = await listRounds();
      const data = result?.data || result || [];
      setCrRounds(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load CR rounds");
    } finally {
      setCrLoading(false);
    }
  }, []);

  // ── Initial Load ──
  useEffect(() => {
    loadSessions();
    loadFaculty();
    loadCRRounds();
  }, [loadSessions, loadFaculty, loadCRRounds]);

  // ── Delete Session Handler ──
  const handleDeleteSession = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setError(null);
    try {
      const result = await deleteSession(deleteTarget.id);
      setSuccessMsg(result.message);
      setDeleteTarget(null);
      // Real-time: remove from local list immediately
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Delete failed");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Delete CR Round Handler ──
  const handleDeleteCRRound = async () => {
    if (!crDeleteTarget) return;
    setCrDeleteLoading(true);
    setError(null);
    try {
      await deleteRound(crDeleteTarget.id);
      setSuccessMsg(`CR Round "${crDeleteTarget.title}" deleted.`);
      setCrDeleteTarget(null);
      setCrRounds((prev) => prev.filter((r) => r.id !== crDeleteTarget.id));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Delete failed");
      setCrDeleteTarget(null);
    } finally {
      setCrDeleteLoading(false);
    }
  };

  // ── Reset Credibility Handler ──
  const handleResetCredibility = async () => {
    if (!resetTarget) return;
    setResetLoading(true);
    setError(null);
    try {
      const ids = resetTarget === "selected" ? [...selectedFaculty] : null;
      const result = await resetCredibility(ids);
      setSuccessMsg(result.message);
      setResetTarget(null);
      setSelectedFaculty(new Set());
      // Reload faculty to show updated credibility
      await loadFaculty();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Reset failed");
      setResetTarget(null);
    } finally {
      setResetLoading(false);
    }
  };

  // ── Filtered Lists ──
  const filteredSessions = sessions.filter((s) => {
    if (!sessionSearch) return true;
    const q = sessionSearch.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.group_title?.toLowerCase().includes(q) ||
      s.track?.toLowerCase().includes(q) ||
      s.status?.toLowerCase().includes(q)
    );
  });

  const filteredFaculty = faculty.filter((f) => {
    if (!facultySearch) return true;
    const q = facultySearch.toLowerCase();
    return (
      f.display_name?.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q) ||
      f.department_code?.toLowerCase().includes(q)
    );
  });

  const filteredCR = crRounds.filter((r) => {
    if (!crSearch) return true;
    const q = crSearch.toLowerCase();
    return (
      r.title?.toLowerCase().includes(q) ||
      r.track?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
    );
  });

  // ── Toggle faculty selection ──
  const toggleFaculty = (id) => {
    setSelectedFaculty((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFaculty = () => {
    if (selectedFaculty.size === filteredFaculty.length) {
      setSelectedFaculty(new Set());
    } else {
      setSelectedFaculty(new Set(filteredFaculty.map((f) => f.person_id)));
    }
  };

  return (
    <div className="space-y-4">
      {/* ── SUCCESS / ERROR BANNERS ── */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 animate-in fade-in duration-300">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── PANEL SWITCHER ── */}
      <div className="flex gap-2 bg-white rounded-xl shadow-sm border border-gray-200/50 p-1">
        <button
          onClick={() => setActivePanel("sessions")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activePanel === "sessions"
              ? "bg-red-50 text-red-700 shadow-sm border border-red-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          Delete Sessions ({sessions.length})
        </button>
        <button
          onClick={() => setActivePanel("credibility")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activePanel === "credibility"
              ? "bg-amber-50 text-amber-700 shadow-sm border border-amber-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <Shield className="h-4 w-4" />
          Reset Credibility ({faculty.length})
        </button>
        <button
          onClick={() => setActivePanel("cr")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activePanel === "cr"
              ? "bg-violet-50 text-violet-700 shadow-sm border border-violet-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <Scale className="h-4 w-4" />
          CR Rounds ({crRounds.length})
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* PANEL 1: SESSION MANAGEMENT                             */}
      {/* ════════════════════════════════════════════════════════ */}
      {activePanel === "sessions" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Trash2 className="h-4.5 w-4.5 text-red-500" />
                Session Management
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Click the delete button to permanently remove a session and ALL its data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-52"
                />
              </div>
              <button
                onClick={loadSessions}
                disabled={sessionsLoading}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${sessionsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Sessions Table */}
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading sessions...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {sessionSearch ? "No sessions match your search" : "No sessions found"}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Session</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Track</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Status</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Students</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Faculty</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Results</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Date</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-red-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]" title={s.title}>
                          {s.title || "Untitled"}
                        </div>
                        {s.group_title && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Group: {s.group_title}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-gray-600 capitalize">{s.track || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-semibold text-gray-700">
                          {s.student_count || 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-semibold text-gray-700">
                          {s.faculty_count || 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono font-semibold ${s.finalized_results_count > 0 ? "text-blue-600" : "text-gray-400"}`}>
                          {s.finalized_results_count || 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {s.session_date
                          ? new Date(s.session_date).toLocaleDateString()
                          : s.opens_at
                            ? new Date(s.opens_at).toLocaleDateString()
                            : new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors opacity-60 group-hover:opacity-100"
                          title={`Delete "${s.title}"`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Stats */}
          {!sessionsLoading && filteredSessions.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-500">
              Showing {filteredSessions.length} of {sessions.length} sessions
              {" · "}
              {sessions.filter((s) => s.status === "FINALIZED").length} finalized
              {" · "}
              {sessions.filter((s) => s.status === "OPEN").length} open
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* PANEL 2: CREDIBILITY RESET                              */}
      {/* ════════════════════════════════════════════════════════ */}
      {activePanel === "credibility" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Shield className="h-4.5 w-4.5 text-amber-500" />
                Credibility Reset
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Select specific faculty or reset ALL credibility scores back to 1.0 (neutral)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search faculty..."
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-48"
                />
              </div>
              <button
                onClick={loadFaculty}
                disabled={facultyLoading}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${facultyLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Action Buttons Bar */}
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/30 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span>
                <strong className="text-amber-700">{selectedFaculty.size}</strong> faculty selected
              </span>
              <button
                onClick={selectAllFaculty}
                className="text-amber-600 hover:text-amber-800 font-medium underline underline-offset-2"
              >
                {selectedFaculty.size === filteredFaculty.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* Reset Selected */}
              <button
                onClick={() => setResetTarget("selected")}
                disabled={selectedFaculty.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="h-3.5 w-3.5" />
                Reset Selected ({selectedFaculty.size})
              </button>
              {/* Reset ALL */}
              <button
                onClick={() => setResetTarget("all")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg transition"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Reset ALL Faculty
              </button>
            </div>
          </div>

          {/* Faculty Table */}
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            {facultyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading faculty...</span>
              </div>
            ) : filteredFaculty.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {facultySearch ? "No faculty match your search" : "No faculty found"}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-center px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={filteredFaculty.length > 0 && filteredFaculty.every(f => selectedFaculty.has(f.person_id))}
                        onChange={selectAllFaculty}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                    </th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Faculty</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Department</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Credibility</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Alignment</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Stability</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Discipline</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFaculty.map((f) => {
                    const isSelected = selectedFaculty.has(f.person_id);
                    return (
                      <tr
                        key={f.person_id}
                        onClick={() => toggleFaculty(f.person_id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-amber-50/60" : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="text-center px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFaculty(f.person_id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-900">{f.display_name}</div>
                          <div className="text-[10px] text-gray-400">{f.email}</div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{f.department_code || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <CredBadge score={f.credibility_score} band={f.credibility_band} />
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {f.alignment_score != null ? parseFloat(f.alignment_score).toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {f.stability_score != null ? parseFloat(f.stability_score).toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {f.discipline_score != null ? parseFloat(f.discipline_score).toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-mono font-semibold text-gray-700">
                            {f.sessions_evaluated || 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Stats */}
          {!facultyLoading && filteredFaculty.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-500">
              {filteredFaculty.length} faculty
              {" · "}
              {filteredFaculty.filter((f) => f.credibility_score != null && f.credibility_score < 0.7).length} low credibility
              {" · "}
              {filteredFaculty.filter((f) => f.credibility_score == null).length} no data
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* PANEL 3: CR ROUND MANAGEMENT                           */}
      {/* ════════════════════════════════════════════════════════ */}
      {activePanel === "cr" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Scale className="h-4.5 w-4.5 text-violet-500" />
                CR Round Management
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Delete comparative review rounds and all their pairings & marks
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search CR rounds..."
                  value={crSearch}
                  onChange={(e) => setCrSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 w-52"
                />
              </div>
              <button
                onClick={loadCRRounds}
                disabled={crLoading}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${crLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* CR Table */}
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {crLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">Loading CR rounds...</span>
              </div>
            ) : filteredCR.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {crSearch ? "No CR rounds match your search" : "No CR rounds found"}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Round</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Track</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Status</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Pairings</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Pool</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Batch</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Date</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCR.map((r) => (
                    <tr key={r.id} className="hover:bg-red-50/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 truncate max-w-[220px]" title={r.title}>
                          {r.title || "Untitled"}
                        </div>
                        {r.description && (
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[220px]">
                            {r.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-gray-600 capitalize">{r.track?.replace("_", " & ") || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          r.status === "finalized" ? "bg-green-100 text-green-700 border-green-200" :
                          r.status === "marking" ? "bg-amber-100 text-amber-700 border-amber-200" :
                          r.status === "active" ? "bg-blue-100 text-blue-700 border-blue-200" :
                          "bg-gray-100 text-gray-600 border-gray-200"
                        }`}>
                          {r.status?.toUpperCase() || "DRAFT"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-semibold text-gray-700">
                          {r.pairing_count || 0}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-mono font-semibold text-gray-700">
                          {parseFloat(r.mark_pool || 5).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {r.batch_year || "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => setCrDeleteTarget(r)}
                          disabled={r.status === "finalized"}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors opacity-60 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={r.status === "finalized" ? "Cannot delete finalized rounds" : `Delete "${r.title}"`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Stats */}
          {!crLoading && filteredCR.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 text-[11px] text-gray-500">
              Showing {filteredCR.length} of {crRounds.length} CR rounds
              {" · "}
              {crRounds.filter((r) => r.status === "finalized").length} finalized
              {" · "}
              {crRounds.filter((r) => r.status === "active" || r.status === "marking").length} active
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════ */}

      {/* Delete Session Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        danger
        title="Delete Session Permanently"
        message={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.title || "Untitled"}" and ALL associated data:\n\n• ${deleteTarget.assignment_count || 0} assignments\n• ${deleteTarget.finalized_results_count || 0} finalized results\n• Score events, alerts, appeals\n\nThis action CANNOT be undone.`
            : ""
        }
        confirmLabel="Delete Forever"
        loading={deleteLoading}
        onConfirm={handleDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Reset Credibility Modal */}
      <ConfirmModal
        open={!!resetTarget}
        danger={resetTarget === "all"}
        title={resetTarget === "all" ? "Reset ALL Faculty Credibility" : "Reset Selected Faculty Credibility"}
        message={
          resetTarget === "all"
            ? `This will reset credibility scores for ALL ${faculty.length} faculty members back to 1.0 (neutral). All alignment, stability, and discipline scores will be cleared. History will be wiped.\n\nThey will need to be re-evaluated to rebuild their credibility.`
            : `This will reset credibility for ${selectedFaculty.size} selected faculty member(s) back to 1.0 (neutral). Their alignment, stability, discipline, and history will be cleared.`
        }
        confirmLabel={resetTarget === "all" ? "Reset ALL" : `Reset ${selectedFaculty.size} Faculty`}
        loading={resetLoading}
        onConfirm={handleResetCredibility}
        onCancel={() => setResetTarget(null)}
      />

      {/* Delete CR Round Modal */}
      <ConfirmModal
        open={!!crDeleteTarget}
        danger
        title="Delete CR Round Permanently"
        message={
          crDeleteTarget
            ? `This will permanently delete "${crDeleteTarget.title || "Untitled"}" and ALL associated data:\n\n• All pairings and team assignments\n• All submitted marks and feedback\n• Rankings data for this round\n\nThis action CANNOT be undone.`
            : ""
        }
        confirmLabel="Delete Forever"
        loading={crDeleteLoading}
        onConfirm={handleDeleteCRRound}
        onCancel={() => setCrDeleteTarget(null)}
      />
    </div>
  );
};

export default AdminManagementTab;
