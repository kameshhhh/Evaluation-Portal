// ============================================================
// SESSION PLANNER LIST PAGE — Entry point for session planner
// ============================================================
// Default view: "My Assigned Sessions" (no password needed)
// Create button: password-gated → session history + planner access
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Users,
  UserCheck,
  ChevronRight,
  Lock,
  Plus,
  Loader2,
  Calendar,
  Mail,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckSquare,
  Square,
  MessageSquare,
  Star,
  Send,
  Award,
  Check,
  Search,
  Clock,
  MapPin,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { useDataChange } from "../../hooks/useSocketEvent";
import {
  getMySessions,
  getSessionHistory,
  verifyPlannerPassword,
  createSessionGroup,
  listSessionGroups,
  submitMarks as submitMarksApi,
  setSchedule as setScheduleApi,
} from "../../services/sessionPlannerApi";

// ============================================================
// HELPERS
// ============================================================
import { getActiveBatches, getBatchYearLabel, getCurrentAcademicYear } from "../../utils/batchHelper";

// SRS §4.1.3 — Scarcity pool: each student = 5 points
const POINTS_PER_MEMBER = 5;

const STATUS_STYLES = {
  active: { bg: "rgba(5,150,105,0.08)", color: "#059669", label: "Active" },
  scheduled: {
    bg: "rgba(217,119,6,0.08)",
    color: "#D97706",
    label: "Scheduled",
  },
  completed: {
    bg: "rgba(99,102,241,0.08)",
    color: "#6366F1",
    label: "Completed",
  },
  closed: { bg: "rgba(107,114,128,0.08)", color: "#6B7280", label: "Closed" },
  finalized: {
    bg: "rgba(99,102,241,0.08)",
    color: "#6366F1",
    label: "Finalized",
  },
};

const getStatusStyle = (status) =>
  STATUS_STYLES[status] || {
    bg: "rgba(107,114,128,0.08)",
    color: "#6B7280",
    label: status || "Unknown",
  };

// ============================================================
// MAIN COMPONENT
// ============================================================
const SessionPlannerListPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [mySessions, setMySessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Password gate
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Create session form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Month/Segment/Year dropdowns
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const SEGMENTS = ["S1", "S2", "S3", "S4"];
  const ACTIVE_BATCHES = getActiveBatches(); // [{batchYear, label, chipId}]
  const currentMonth = MONTHS[new Date().getMonth()];
  const [sessionMonth, setSessionMonth] = useState(currentMonth);
  const [sessionSegment, setSessionSegment] = useState("S1");
  const [selectedBatchYear, setSelectedBatchYear] = useState(ACTIVE_BATCHES[0]?.batchYear || null);
  const [sessionSemester, setSessionSemester] = useState(1);

  // Session groups state
  const [sessionGroups, setSessionGroups] = useState([]);
  
  // Filtering for Sessions List
  const [sessionSearch, setSessionSearch] = useState("");


  // ============================================================
  // LOAD DATA
  // ============================================================
  const loadMySessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getMySessions();
      setMySessions(res.data || []);
    } catch {
      setMySessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const [histRes, groupRes] = await Promise.all([
        getSessionHistory(),
        listSessionGroups(),
      ]);
      setSessionHistory(histRes.data || []);
      setSessionGroups(groupRes.data || []);
    } catch {
      setSessionHistory([]);
      setSessionGroups([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMySessions();
  }, [loadMySessions]);

  useEffect(() => {
    if (isUnlocked) loadHistory();
  }, [isUnlocked, loadHistory]);

  // Real-time updates
  useDataChange(["session_planner"], loadMySessions);

  // ============================================================
  // COMPUTE SCARCITY POOL for a session
  // ============================================================
  const computePool = useCallback((session) => {
    const students = session.students || [];
    const totalStudents = students.length;
    const totalPool = totalStudents * POINTS_PER_MEMBER;
    const usedMarks = students.reduce((sum, s) => {
      if (s.marks_submitted_at) return sum + (s.marks || 0);
      return sum;
    }, 0);
    // Also add pending (not yet submitted) marks from local inputs
    return { totalStudents, totalPool, usedMarks, remaining: totalPool - usedMarks };
  }, []);

  // ============================================================
  // SCHEDULING HELPERS
  // ============================================================


  // ============================================================
  // CREATE SESSION
  // ============================================================
  const handleCreateSession = async () => {
    try {
      setCreating(true);
      setCreateError("");
      const res = await createSessionGroup({
        month: sessionMonth,
        segment: sessionSegment,
        batchYear: selectedBatchYear,
        targetYear: getBatchYearLabel(selectedBatchYear),
        academicYear: getCurrentAcademicYear(),
        semester: sessionSemester,
      });
      setShowCreateForm(false);
      // If the group has child sessions, navigate to the first one (core)
      const sessions = res?.data?.sessions;
      if (sessions && sessions.length > 0) {
        // Navigate to core session by default
        const coreSession = sessions.find(s => s.track === 'core') || sessions[0];
        navigate(`/session-planner/${coreSession.id}`);
      } else {
        loadHistory();
      }
    } catch (err) {
      setCreateError(err.response?.data?.error || "Failed to create session group");
    } finally {
      setCreating(false);
    }
  };

  // ============================================================
  // PASSWORD VERIFICATION
  // ============================================================
  const handleVerifyPassword = async () => {
    if (!password.trim()) return;
    try {
      setVerifying(true);
      setPasswordError("");
      await verifyPlannerPassword(password);
      setIsUnlocked(true);
      setShowPasswordModal(false);
      setPassword("");
    } catch (err) {
      setPasswordError(err.response?.data?.error || "Incorrect password");
    } finally {
      setVerifying(false);
    }
  };

  // ============================================================
  // NAVIGATE TO PLANNER
  // ============================================================
  const openPlanner = (sessionId) => {
    navigate(`/session-planner/${sessionId}`);
  };

  // ============================================================
  // RENDER: Password Modal
  // ============================================================
  const PasswordModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4"
        style={{ border: "1px solid rgba(139,92,246,0.15)" }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-violet-100 rounded-xl">
            <Lock size={24} className="text-violet-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Session Planner Access
            </h3>
            <p className="text-sm text-gray-500">
              Enter password to create & manage sessions
            </p>
          </div>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
          placeholder="Enter planner password"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition-all"
          autoFocus
        />

        {passwordError && (
          <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} /> {passwordError}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              setShowPasswordModal(false);
              setPassword("");
              setPasswordError("");
            }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleVerifyPassword}
            disabled={verifying || !password.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
              boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
            }}
          >
            {verifying ? (
              <Loader2 size={16} className="animate-spin mx-auto" />
            ) : (
              "Unlock"
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: Session Card (My Sessions) — clickable, navigates to detail page
  // ============================================================
  const renderMySessionCard = (session) => {
    const statusStyle = getStatusStyle(session.status);
    const pool = computePool(session);
    const submittedCount = session.students?.filter((s) => s.marks_submitted_at).length || 0;
    const totalCount = session.studentCount || 0;
    const progress = totalCount > 0 ? (submittedCount / totalCount) * 100 : 0;
    const scheduledCount = (session.students || []).filter(s => s.scheduled_date).length;

    return (
      <div
        key={session.session_id}
        onClick={() => navigate(`/session-planner/view/${session.session_id}`)}
        className="group rounded-2xl bg-white overflow-hidden transition-all cursor-pointer relative"
        style={{
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 8px 25px rgba(124,58,237,0.12), 0 4px 10px rgba(0,0,0,0.04)";
          e.currentTarget.style.borderColor = "rgba(124,58,237,0.2)";
          e.currentTarget.style.transform = "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)";
          e.currentTarget.style.borderColor = "rgba(0,0,0,0.06)";
          e.currentTarget.style.transform = "none";
        }}
      >
        {/* Gradient accent bar */}
        <div
          className="h-1"
          style={{
            background: progress === 100
              ? "linear-gradient(90deg, #059669, #10B981)"
              : "linear-gradient(90deg, #7C3AED, #6366F1, #818CF8)",
          }}
        />

        <div className="p-4">
          {/* Title + Status */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate group-hover:text-violet-700 transition-colors">
                {session.title || "Untitled Session"}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Users size={11} /> {totalCount} student{totalCount !== 1 ? "s" : ""}
              </p>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              {statusStyle.label}
            </span>
          </div>

          {/* Info chips */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100">
              <Star size={10} /> Pool: {pool.totalPool}pts
            </span>
            {session.session_date && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded-full bg-gray-50">
                <Calendar size={10} /> {new Date(session.session_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
            {session.session_time && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded-full bg-gray-50">
                <Clock size={10} /> {session.session_time}
              </span>
            )}
            {session.venue && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 px-1.5 py-0.5 rounded-full bg-gray-50">
                <MapPin size={10} /> {session.venue}
              </span>
            )}
          </div>

          {/* Progress */}
          {totalCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-400">
                  {submittedCount}/{totalCount} marks submitted
                </span>
                {scheduledCount > 0 && (
                  <span className="text-[10px] text-indigo-500 font-medium">
                    {scheduledCount} scheduled
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    background: progress === 100
                      ? "linear-gradient(90deg, #059669, #10B981)"
                      : "linear-gradient(90deg, #7C3AED, #6366F1)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

// ============================================================
// RENDER: Session History Card (Admin view)
// ============================================================
const HistoryCard = ({ session }) => {
  const statusStyle = getStatusStyle(session.status);
  const assignmentPercent =
    session.total_students > 0
      ? Math.round((session.assigned_students / session.total_students) * 100)
      : 0;

  return (
    <button
      onClick={() => openPlanner(session.session_id)}
      className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl border border-gray-100 bg-white text-left hover:border-violet-200 hover:shadow-md transition-all group"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background:
            assignmentPercent === 100
              ? "rgba(5,150,105,0.1)"
              : assignmentPercent > 0
                ? "rgba(217,119,6,0.08)"
                : "rgba(107,114,128,0.08)",
        }}
      >
        {assignmentPercent === 100 ? (
          <UserCheck size={20} className="text-green-600" />
        ) : assignmentPercent > 0 ? (
          <Users size={20} className="text-amber-600" />
        ) : (
          <ClipboardList size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {session.title || "Untitled Session"}
          </p>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: statusStyle.bg, color: statusStyle.color }}
          >
            {statusStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-gray-500">
            {session.faculty_count} faculty · {session.assigned_students}/
            {session.total_students} students
          </span>
          {session.opens_at && (
            <span className="text-xs text-gray-400">
              {new Date(session.opens_at).toLocaleDateString()}
            </span>
          )}
        </div>
        {session.total_students > 0 && (
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${assignmentPercent}%`,
                background:
                  assignmentPercent === 100
                    ? "#059669"
                    : assignmentPercent > 50
                      ? "#D97706"
                      : "#EF4444",
              }}
            />
          </div>
        )}
      </div>
      <ChevronRight
        size={18}
        className="text-gray-300 group-hover:text-violet-500 transition-colors shrink-0"
      />
    </button>
  );
};

// ============================================================
// MAIN RENDER
// ============================================================
return (
  <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-violet-50/30">
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-violet-600" />
            Session Planner
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            View assigned sessions & manage evaluator assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMySessions}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          {!isUnlocked ? (
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
              }}
            >
              <Lock size={15} />
              <span className="hidden sm:inline">Create Session</span>
              <span className="sm:hidden">
                <Plus size={15} />
              </span>
            </button>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg"
              style={{
                background:
                  "linear-gradient(135deg, #059669 0%, #047857 100%)",
                boxShadow: "0 2px 8px rgba(5,150,105,0.25)",
              }}
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Create Session</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* MY ASSIGNED SESSIONS — always visible */}
      {/* ============================================================ */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Shield size={14} className="text-violet-500" />
          My Assigned Sessions
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-violet-500" />
          </div>
        ) : mySessions.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2 border-dashed border-gray-200 bg-white/50">
            <ClipboardList size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">
              No sessions assigned to you yet
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Sessions will appear here once an admin assigns students to you
            </p>
          </div>
        ) : (
          <div>
            {/* Session Search Filter */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Filter sessions..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-violet-300 transition-all text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mySessions
                .filter(s => !sessionSearch || s.title.toLowerCase().includes(sessionSearch.toLowerCase()))
                .map((session) => renderMySessionCard(session))}
            </div>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {
        isUnlocked && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar size={14} className="text-violet-500" />
                All Sessions History
              </h2>
              <button
                onClick={loadHistory}
                className="text-xs text-violet-500 hover:text-violet-700 font-medium flex items-center gap-1"
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            ) : sessionGroups.length === 0 && sessionHistory.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-gray-200 bg-white/50">
                <Calendar size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">
                  No sessions created yet
                </p>
                <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                  Click "Create Session" to create a grouped session with Core, IT&Core, and Premium tracks.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Grouped Sessions */}
                {sessionGroups.map((group) => (
                  <div key={group.group_id} className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                    <div className="px-5 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-gray-100">
                      <p className="text-sm font-bold text-gray-900">{group.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {group.session_date ? new Date(group.session_date).toLocaleDateString() : ""} · Year {group.academic_year} · Sem {group.semester}
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {(group.sessions || []).map((sess) => {
                        const TRACK_LABELS = { core: "Core", it_core: "IT & Core", premium: "Premium" };
                        const TRACK_COLORS = {
                          core: { bg: "rgba(5,150,105,0.08)", color: "#059669" },
                          it_core: { bg: "rgba(99,102,241,0.08)", color: "#6366F1" },
                          premium: { bg: "rgba(217,119,6,0.08)", color: "#D97706" },
                        };
                        const trackColor = TRACK_COLORS[sess.track] || TRACK_COLORS.core;
                        const statusStyle = getStatusStyle(sess.status);
                        return (
                          <button
                            key={sess.id}
                            onClick={() => openPlanner(sess.id)}
                            className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-gray-50 transition-all group"
                          >
                            <span
                              className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                              style={{ background: trackColor.bg, color: trackColor.color }}
                            >
                              {TRACK_LABELS[sess.track] || sess.track}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-800 truncate">{sess.title}</p>
                                <span
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                  style={{ background: statusStyle.bg, color: statusStyle.color }}
                                >
                                  {statusStyle.label}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {sess.facultyCount || 0} faculty · {sess.assignedStudents || 0} students · {sess.totalAssignments || 0} assignments
                              </p>
                            </div>
                            <ChevronRight
                              size={16}
                              className="text-gray-300 group-hover:text-violet-500 transition-colors shrink-0"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Ungrouped Sessions (legacy) */}
                {sessionHistory
                  .filter(s => !s.group_id)
                  .map((session) => (
                    <HistoryCard key={session.session_id} session={session} />
                  ))}
              </div>
            )}
          </section>
        )
      }
    </div >

    {/* Password Modal */}
    {showPasswordModal && <PasswordModal />}

    {/* Create Session Modal */}
    {
      showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            style={{ border: "1px solid rgba(139,92,246,0.15)" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-violet-100 rounded-xl">
                <Plus size={24} className="text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Create New Session
                </h3>
                <p className="text-sm text-gray-500">
                  Select month, segment & year group
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Month */}
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

              {/* Segment */}
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

              {/* Batch Year */}
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

              {/* Semester */}
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


              {/* Preview */}
              <div className="bg-violet-50 p-3 rounded-xl border border-violet-100">
                <p className="text-xs text-violet-600 font-medium mb-1">Session Group Preview:</p>
                <p className="text-sm font-bold text-violet-800">
                  {sessionMonth} {sessionSegment} - Batch {selectedBatchYear} ({getBatchYearLabel(selectedBatchYear) || "?"})
                </p>
                <p className="text-[10px] text-violet-500 mt-1">
                  Week {sessionSegment.replace("S", "")} of {sessionMonth} {new Date().getFullYear()} • Semester {sessionSemester}
                </p>
                <div className="flex gap-2 mt-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">Core</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">IT & Core</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Premium</span>
                </div>
                <p className="text-[10px] text-violet-400 mt-1">3 track-specific sub-sessions will be created</p>
              </div>

              {/* Scarcity Info */}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-800">
                  <strong>Mode:</strong> Scarcity Pool — Each student gets <strong>5 points</strong> to distribute.
                </p>
              </div>

              {createError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {createError}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError("");
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={creating}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                  boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
                }}
              >
                {creating ? (
                  <Loader2 size={16} className="animate-spin mx-auto" />
                ) : (
                  "Open Session"
                )}
              </button>
            </div>
          </div>
        </div>
      )
    }
  </div >
);
};

export default SessionPlannerListPage;

