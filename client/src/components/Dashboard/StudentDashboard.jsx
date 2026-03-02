// ============================================================
// STUDENT DASHBOARD — Role-Specific View with Tabbed Navigation
// ============================================================
// Renders the student's personalized dashboard with tabs:
//   1. Overview — Projects, evaluations, stats, quick actions
//   2. My Evaluations — Cohort assignments, upcoming & assigned evals
//   3. Peer Suggestions — Smart peer group recommendations
//
// SRS §1.2 + §4.5 + §8.1 — Cohort orchestration + Peer optimization
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { getInitials } from "../../utils/helpers";
import TrackSelectionModal from "./student/TrackSelectionModal";
import {
  getMyTrack,
  selectTrack,
  getMyTeam,
  getPendingInvitations,
  respondToInvitation,
  getMyEvaluator,
} from "../../services/sessionPlannerApi";
import { useDataChange } from "../../hooks/useSocketEvent";

import {
  GraduationCap,
  FolderOpen,
  FileText,
  PlusCircle,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Snowflake,
  Gauge,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  TrendingUp,
  LayoutGrid,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Target,
  PlayCircle,
  Calendar,
} from "lucide-react";

import * as cohortApi from "../../services/cohortApi";

// ============================================================
// StudentDashboard Component
// ============================================================
/**
 * Renders the student dashboard from backend-provided data.
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Complete dashboard payload from backend
 * @param {Function} props.onRefresh - Callback to refresh dashboard data
 */
const StudentDashboard = ({ data, onRefresh }) => {
  const { user, sections, actions } = data;
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const profilePicture = authUser?.picture || user?.picture || null;
  const displayName =
    user?.name || authUser?.name || user?.email?.split("@")[0] || "Student";

  const {
    myProjects,
    pendingWork,
    stats,
    upcomingEvaluations,
    assignedEvaluations,
  } = sections;

  // Tab navigation state
  const [activeTab, setActiveTab] = useState("overview");

  const handleQuickAction = (actionId) => {
    switch (actionId) {
      case "create-project":
        navigate("/projects/new");
        break;
      case "submit-work-log":
        if (myProjects && myProjects.length > 0) {
          navigate(`/projects/${myProjects[0].projectId}`);
        } else {
          alert("Create a project first to submit work logs.");
        }
        break;
      case "view-project":
        setActiveTab("overview");
        setTimeout(() => {
          document
            .getElementById("student-my-projects")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
        break;
      case "view-results":
        navigate("/my-results");
        break;
      default:
        break;
    }
  };

  // ── Track, Team, and Assignment state ──
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const [myTrack, setMyTrack] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [myInvitations, setMyInvitations] = useState([]);
  const [myEvaluators, setMyEvaluators] = useState([]);
  const [expandedSessions, setExpandedSessions] = useState({});

  const loadTrackData = useCallback(async () => {
    try {
      const trackRes = await getMyTrack();
      if (trackRes.needsSelection) {
        setShowTrackModal(true);
        setMyTrack(null);
      } else {
        setMyTrack(trackRes.data?.track || null);
        setShowTrackModal(false);
        // Load team + invitations + evaluator in parallel
        const [teamRes, invRes, evalRes] = await Promise.all([
          getMyTeam().catch(() => ({ data: null })),
          getPendingInvitations().catch(() => ({ data: [] })),
          getMyEvaluator().catch(() => ({ data: [] })),
        ]);
        setMyTeam(teamRes.data || null);
        setMyInvitations(invRes.data || []);
        setMyEvaluators(evalRes.data || []);
      }
    } catch {
      // If API fails (e.g. 404), don't show modal — feature might not be set up yet
    }
  }, []);

  useEffect(() => {
    loadTrackData();
  }, [loadTrackData]);
  useDataChange("student_track", loadTrackData);
  useDataChange("team_formation", loadTrackData);
  useDataChange("team_invitation", loadTrackData);
  useDataChange("session_planner", loadTrackData);

  const handleTrackSelect = async (track) => {
    try {
      setTrackLoading(true);
      await selectTrack(track);
      setShowTrackModal(false);
      await loadTrackData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to select track");
    } finally {
      setTrackLoading(false);
    }
  };

  const handleInviteRespond = async (invitationId, response) => {
    try {
      await respondToInvitation(invitationId, response);
      await loadTrackData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to respond");
    }
  };

  const TRACK_LABELS = {
    core: "Core Project",
    it_core: "IT / IT-Core",
    premium: "Premium",
  };

  // Tab definitions
  const STUDENT_TABS = [
    { id: "overview", label: "Overview", icon: GraduationCap },
    { id: "evaluations", label: "My Evaluations", icon: Layers },
    { id: "peer-suggestions", label: "Peer Suggestions", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Track Selection Modal */}
      {showTrackModal && (
        <TrackSelectionModal
          onSelect={handleTrackSelect}
          isLoading={trackLoading}
        />
      )}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* WELCOME HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {profilePicture ? (
              <img
                src={profilePicture}
                alt={displayName}
                className="h-14 w-14 rounded-full border-2 border-blue-200 shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg font-bold shadow-sm">
                {getInitials(displayName)}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <GraduationCap className="h-7 w-7 text-blue-600" />
                Welcome, {displayName.split(" ")[0]}
              </h1>
              <p className="text-gray-500 mt-1">
                {user?.departmentName || user?.department || "Department"} •
                Batch of {user?.admissionYear || "N/A"}
                {user?.graduationYear ? ` – ${user.graduationYear}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
            title="Refresh dashboard data"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* STATISTICS CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-gray-500 font-medium">
                Total Projects
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.totalProjects || 0}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500 font-medium">Active</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.activeProjects || 0}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-500 font-medium">Pending</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.pendingItems || 0}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-gray-500 font-medium">
                Completed
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {stats?.completedProjects || 0}
            </p>
          </div>
        </div>

        {/* ====================================================== */}
        {/* TRACK + TEAM + EVALUATOR INFO CARDS                    */}
        {/* ====================================================== */}
        {myTrack && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Track Badge */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-violet-500" />
                <span className="text-xs text-gray-500 font-medium">
                  Your Track
                </span>
              </div>
              <p className="text-lg font-bold text-violet-700">
                {TRACK_LABELS[myTrack] || myTrack}
              </p>
            </div>

            {/* Team Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-gray-500 font-medium">
                  Your Team
                </span>
              </div>
              {myTeam ? (
                <div>
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {myTeam.project_title || myTeam.project_name || "Team"}
                  </p>
                  <p className="text-xs text-gray-400 capitalize mb-2">
                    {myTeam.status?.replace(/_/g, " ") || "—"}
                  </p>
                  {/* Team Members */}
                  {myTeam.members && myTeam.members.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      {myTeam.members.map((m) => {
                        const isLeader = m.role === "Team Leader" || m.invitation_status === "leader";
                        return (
                          <div
                            key={m.person_id || m.invitee_id}
                            className="flex items-center gap-2"
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
                              style={{ background: isLeader ? "#7C3AED" : "#9CA3AF" }}
                            >
                              {m.email_hash ? (
                                <img
                                  src={`https://www.gravatar.com/avatar/${m.email_hash}?d=identicon`}
                                  alt={m.display_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                m.display_name?.[0] || "?"
                              )}
                            </div>
                            <span className="text-xs text-gray-700 truncate flex-1">
                              {m.display_name}
                            </span>
                            {isLeader && (
                              <span className="text-[10px] text-amber-500">👑</span>
                            )}
                            {m.invitation_status === "accepted" ? (
                              <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                            ) : m.invitation_status === "rejected" ? (
                              <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                            ) : m.invitation_status === "pending" ? (
                              <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => navigate("/team-formation")}
                  className="text-sm text-violet-600 font-medium hover:underline"
                >
                  Form your team →
                </button>
              )}
            </div>

            {/* Assigned Faculty */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="h-4 w-4 text-green-500" />
                <span className="text-xs text-gray-500 font-medium">
                  Assigned Evaluator
                </span>
              </div>
              {myEvaluators.length > 0 ? (
                <div>
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {myEvaluators[0].faculty_name ||
                      myEvaluators[0].display_name ||
                      "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {myEvaluators.length} session{myEvaluators.length > 1 ? "s" : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Not yet assigned</p>
              )}
            </div>
          </div>
        )}

        {/* Session Details Cards — shows all assigned sessions with venue, date, time, and marks */}
        {/* Session Details Cards — grouped by session */}
        {myEvaluators.length > 0 && (
          <div className="mb-6 space-y-3">
            {Object.values(
              myEvaluators.reduce((acc, ev) => {
                if (!acc[ev.session_id]) {
                  acc[ev.session_id] = {
                    ...ev,
                    evaluators: [],
                    hasFinalScore:
                      ev.normalized_score !== null &&
                      ev.normalized_score !== undefined,
                  };
                }
                acc[ev.session_id].evaluators.push(ev);
                return acc;
              }, {})
            ).map((sess, idx) => {
              const { evaluators, hasFinalScore, normalized_score } = sess;
              const allEvaluated = evaluators.every(
                (e) => e.status === "evaluation_done" || e.status === "completed"
              );
              const anyMarks = evaluators.some((e) => e.marks_submitted_at);

              // Determine overall card status
              let statusLabel = "Assigned";
              let statusClass = "bg-violet-100 text-violet-700";

              if (hasFinalScore) {
                statusLabel = "Graded";
                statusClass = "bg-green-100 text-green-700";
              } else if (allEvaluated) {
                statusLabel = "Processing";
                statusClass = "bg-blue-100 text-blue-700";
              } else if (anyMarks) {
                statusLabel = "In Progress";
                statusClass = "bg-yellow-100 text-yellow-700";
              }

              return (
                <div
                  key={sess.id || idx}
                  className={`rounded-2xl border p-4 ${hasFinalScore
                    ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200/50"
                    : "bg-gradient-to-r from-violet-50 to-indigo-50 border-violet-200/50"
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-violet-800">
                      {sess.session_title || "Untitled Session"}
                    </h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {/* Evaluators List */}
                  <div className="space-y-2 mb-3">
                    <p className="text-xs text-gray-500 font-medium">
                      Evaluators:
                    </p>
                    {evaluators.map((ev, i) => {
                      const isDone = ev.marks_submitted_at;
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs bg-white/60 rounded-lg p-2 border border-violet-100"
                        >
                          <span className="font-semibold text-gray-700">
                            {ev.faculty_name || ev.display_name || "—"}
                          </span>
                          <span
                            className={
                              isDone ? "text-green-600" : "text-gray-400"
                            }
                          >
                            {isDone ? "Submitted" : "Pending"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Final Score (Credibility Engine Result) — always /5 ── */}
                  {hasFinalScore ? (
                    <div className="bg-white/80 rounded-xl p-3 border border-green-200/60 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                          🏆 Credibility-Weighted Score
                        </span>
                        <span className="text-xl font-bold text-green-700">
                          {Number(sess.display_score ?? normalized_score).toFixed(1)}
                          <span className="text-xs font-normal text-gray-400 ml-1">/ 5</span>
                        </span>
                      </div>

                      {/* Per-rubric breakdown: show each judge's raw marks */}
                      {(() => {
                        // Use rubric_name_map (UUID→name) from backend for reliable mapping
                        const nameMap = sess.rubric_name_map || {};
                        // Collect all rubric UUIDs from evaluator marks
                        const allUUIDs = new Set();
                        evaluators.forEach(ev => {
                          const rm = ev.rubric_marks
                            ? (typeof ev.rubric_marks === 'string' ? JSON.parse(ev.rubric_marks) : ev.rubric_marks)
                            : null;
                          if (rm) Object.keys(rm).forEach(uid => allUUIDs.add(uid));
                        });
                        if (allUUIDs.size === 0) return null;
                        // Sort by rubric name alphabetically
                        const sortedUUIDs = Array.from(allUUIDs).sort((a, b) =>
                          (nameMap[a] || a).localeCompare(nameMap[b] || b)
                        );
                        return (
                          <div className="space-y-2 mt-2 pt-2 border-t border-green-100">
                            <p className="text-[10px] text-gray-500 font-medium">Per-Rubric Breakdown</p>
                            {sortedUUIDs.map((rubricUUID) => {
                              const rubricName = nameMap[rubricUUID] || `Rubric ${rubricUUID.substring(0, 8)}`;
                              return (
                                <div key={rubricUUID} className="bg-gray-50 rounded-lg p-2">
                                  <p className="text-[11px] font-semibold text-gray-700 mb-1">{rubricName}</p>
                                  <div className="space-y-0.5">
                                    {evaluators.map((ev, i) => {
                                      const rm = ev.rubric_marks
                                        ? (typeof ev.rubric_marks === 'string' ? JSON.parse(ev.rubric_marks) : ev.rubric_marks)
                                        : null;
                                      if (!rm) return null;
                                      const mark = rm[rubricUUID] !== undefined ? Number(rm[rubricUUID]) : '—';
                                      return (
                                        <div key={`judge-${i}`} className="flex justify-between text-[10px] text-gray-600">
                                          <span>{ev.faculty_name || 'Judge'}</span>
                                          <span className="font-bold">{mark}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Expandable Feedback Section */}
                      {(() => {
                        const hasFeedback = evaluators.some(ev => ev.feedback || ev.zero_feedback);
                        if (!hasFeedback) return null;
                        const fbKey = `feedback-${sess.session_id}`;
                        return (
                          <div className="mt-2 pt-2 border-t border-green-100">
                            <button
                              onClick={() => setExpandedSessions(prev => ({ ...prev, [fbKey]: !prev[fbKey] }))}
                              className="text-[10px] font-medium text-violet-600 hover:text-violet-800 flex items-center gap-1 transition-colors"
                            >
                              {expandedSessions[fbKey] ? '▾' : '▸'} Faculty Feedback
                            </button>
                            {expandedSessions[fbKey] && (
                              <div className="mt-1.5 space-y-2">
                                {evaluators.map((ev, i) => {
                                  const zf = ev.zero_feedback
                                    ? (typeof ev.zero_feedback === 'string' ? JSON.parse(ev.zero_feedback) : ev.zero_feedback)
                                    : null;
                                  const hasContent = ev.feedback || zf;
                                  if (!hasContent) return null;
                                  return (
                                    <div key={`fb-${i}`} className="bg-gray-50 rounded-lg p-2">
                                      <p className="text-[10px] font-semibold text-gray-600 mb-1">{ev.faculty_name || 'Judge'}</p>
                                      {ev.feedback && (
                                        <p className="text-[10px] text-gray-700 mb-1">
                                          <span className="font-medium text-gray-500">Comment:</span> {ev.feedback}
                                        </p>
                                      )}
                                      {zf && Object.entries(zf).map(([rid, text]) => {
                                        const nameMap = sess.rubric_name_map || {};
                                        const rubricName = nameMap[rid] || rid.substring(0, 8);
                                        return (
                                          <p key={rid} className="text-[10px] text-red-600">
                                            <span className="font-medium">⚠ Zero on {rubricName}:</span> {text}
                                          </p>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="bg-white/40 rounded-xl p-3 border border-dashed border-gray-300 mb-3 text-center">
                      <p className="text-xs text-gray-400">
                        Score pending finalization
                      </p>
                    </div>
                  )}

                  {/* ── Scheduled Details (Consolidated or List) ── */}
                  {evaluators.map((ev, i) => {
                    if (
                      !ev.scheduled_date &&
                      !ev.scheduled_time &&
                      !ev.scheduled_venue
                    )
                      return null;
                    return (
                      <div
                        key={`sched-${i}`}
                        className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-2 border border-indigo-200/60 mb-2"
                      >
                        <p className="text-[10px] uppercase tracking-wide font-bold text-indigo-600 mb-1">
                          Meeting with {ev.faculty_name?.split(" ")[0]}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {ev.scheduled_date && (
                            <span>
                              📅{" "}
                              {new Date(ev.scheduled_date).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short" }
                              )}
                            </span>
                          )}
                          {ev.scheduled_time && (
                            <span>🕐 {ev.scheduled_time.slice(0, 5)}</span>
                          )}
                          {ev.scheduled_venue && (
                            <span>📍 {ev.scheduled_venue}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Pending Invitations Banner */}
        {myInvitations.length > 0 && (
          <div className="mb-6 space-y-2">
            {myInvitations.map((inv) => (
              <div
                key={inv.invitation_id}
                className="bg-white rounded-2xl shadow-sm border border-violet-200 p-4 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm shrink-0">
                  {inv.leader_name?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {inv.project_title || inv.project_name || "Team Invitation"}
                  </p>
                  <p className="text-xs text-gray-500">
                    From {inv.leader_name} •{" "}
                    {TRACK_LABELS[inv.track] || inv.track}
                  </p>
                </div>
                <button
                  onClick={() =>
                    handleInviteRespond(inv.invitation_id, "accept")
                  }
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                  style={{ background: "#059669" }}
                >
                  Accept
                </button>
                <button
                  onClick={() =>
                    handleInviteRespond(inv.invitation_id, "reject")
                  }
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-medium bg-red-500"
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ====================================================== */}
        {/* TAB NAVIGATION — Overview / My Evaluations / Peer Suggestions */}
        {/* ====================================================== */}
        <div className="flex gap-1 bg-white rounded-2xl shadow-sm border border-gray-200/50 p-1.5 mb-6">
          {STUDENT_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                           transition-all duration-200 ${isActive
                    ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200/50"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
              >
                <TabIcon
                  className={`h-4 w-4 ${isActive ? "text-blue-600" : ""}`}
                />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ====================================================== */}
        {/* TAB CONTENT */}
        {/* ====================================================== */}

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* My Projects Card */}
              <div
                id="student-my-projects"
                className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6"
              >
                {/* Card header */}
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-blue-600" />
                  My Projects
                </h2>

                {/* View All Projects link */}
                {myProjects && myProjects.length > 0 && (
                  <button
                    onClick={() => navigate("/projects")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium mb-3 inline-block"
                  >
                    View All Projects →
                  </button>
                )}

                {/* Project list or empty state */}
                {myProjects && myProjects.length > 0 ? (
                  // List of project cards
                  <div className="space-y-3">
                    {myProjects.map((project, index) => (
                      // Individual project card — clickable to navigate to project dashboard
                      <div
                        key={project.projectId || index}
                        onClick={() =>
                          project.projectId &&
                          navigate(`/projects/${project.projectId}`)
                        }
                        className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer"
                      >
                        {/* Project title and status badge */}
                        <div className="flex items-start justify-between mb-2">
                          {/* Title */}
                          <h3 className="font-medium text-gray-900 text-sm">
                            {project.title}
                          </h3>
                          {/* Status badge */}
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(project.status)}`}
                          >
                            {formatStatus(project.status)}
                          </span>
                        </div>

                        {/* Project description */}
                        {project.description && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                            {project.description}
                          </p>
                        )}

                        {/* Project metadata row */}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          {/* My role */}
                          <span className="capitalize">
                            {project.myRole || "member"}
                          </span>
                          {/* Team size */}
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {project.teamSize} member
                            {project.teamSize !== 1 ? "s" : ""}
                          </span>
                          {/* Semester info */}
                          {project.semester && (
                            <span>Sem {project.semester}</span>
                          )}
                          {/* Frozen indicator */}
                          {project.isFrozen && (
                            <span className="flex items-center gap-1 text-cyan-600">
                              <Snowflake className="h-3 w-3" />
                              Frozen
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Empty state — no projects yet
                  <div className="text-center py-8 text-gray-400">
                    <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm mb-3">
                      No projects yet. Create your first project!
                    </p>
                    <button
                      onClick={() => navigate("/projects/new")}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Create Project
                    </button>
                  </div>
                )}
              </div>

              {/* ====================================================== */}
              {/* UPCOMING EVALUATIONS — Timeline of evaluation sessions */}
              {/* ====================================================== */}
              {upcomingEvaluations && upcomingEvaluations.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    Upcoming Evaluations
                  </h2>
                  <div className="space-y-2">
                    {upcomingEvaluations.map((evalSession, index) => (
                      <div
                        key={evalSession.session_id || index}
                        onClick={() =>
                          evalSession.session_id &&
                          navigate(
                            `/scarcity/evaluate/${evalSession.session_id}`,
                          )
                        }
                        className="flex items-center justify-between border border-gray-100 rounded-lg p-3 hover:border-amber-200 hover:bg-amber-50/30 transition-colors cursor-pointer"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {evalSession.session_type?.replace("_", " ") ||
                              "Evaluation"}
                          </p>
                          <p className="text-xs text-gray-400 capitalize">
                            Intent: {evalSession.intent || "N/A"}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(evalSession.status)}`}
                        >
                          {formatStatus(evalSession.status)}
                        </span>
                        {/* Weighted Results link */}
                        {evalSession.session_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/scarcity/weighted-results/${evalSession.session_id}`,
                              );
                            }}
                            className="ml-2 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline"
                          >
                            <TrendingUp className="h-3 w-3" />
                            Weighted
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EVALUATION SUMMARY — Compact card linking to Evaluations tab */}
              {((assignedEvaluations && assignedEvaluations.length > 0) ||
                (sections.scarcityEvaluations &&
                  sections.scarcityEvaluations.length > 0)) && (
                  <div
                    onClick={() => setActiveTab("evaluations")}
                    className="bg-white rounded-2xl shadow-lg border border-indigo-200/50 p-5 hover:border-indigo-300 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 rounded-xl">
                          <Layers className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">
                            My Evaluations
                          </h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(assignedEvaluations?.length || 0) +
                              (sections.scarcityEvaluations?.length || 0)}{" "}
                            evaluation sessions
                          </p>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-gray-400 rotate-[-90deg]" />
                    </div>
                  </div>
                )}
            </div>

            {/* ====================================================== */}
            {/* RIGHT COLUMN (1/3) — Pending Work + Quick Actions */}
            {/* ====================================================== */}
            <div className="space-y-6">
              {/* Pending Work Card */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Pending Work
                </h2>
                {pendingWork && pendingWork.length > 0 ? (
                  <div className="space-y-2">
                    {pendingWork.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 p-2 rounded-lg bg-amber-50/50"
                      >
                        {/* Priority indicator */}
                        <div
                          className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${item.priority === "high"
                            ? "bg-red-500"
                            : "bg-amber-400"
                            }`}
                        />
                        <div>
                          <p className="text-xs font-medium text-gray-700">
                            {item.label}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.dueDescription}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No pending items
                  </p>
                )}
              </div>

              {/* Quick Actions Card */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Quick Actions
                </h2>
                <div className="space-y-2">
                  {actions
                    ?.filter((a) => a.available)
                    .map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium"
                        title={action.description || action.label}
                      >
                        {/* Render appropriate icon based on action.icon */}
                        {getActionIcon(action.icon)}
                        {action.label}
                      </button>
                    ))}
                  {/* View My Results — Always available for students */}
                  <button
                    onClick={() => handleQuickAction("view-results")}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors text-sm font-medium"
                    title="View your evaluation scores and rankings"
                  >
                    <BarChart3 className="h-4 w-4" />
                    View My Results
                  </button>
                  {/* Weighted Results — Navigate to credibility-weighted results */}
                  <button
                    onClick={() => navigate("/faculty-evaluation/dashboard")}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors text-sm font-medium"
                    title="Evaluate faculty who have assessed your work (SRS §4.4)"
                  >
                    <BookOpen className="h-4 w-4" />
                    Evaluate Faculty
                  </button>
                  {/* Peer Ranking — Navigate to peer ranking survey (SRS §4.5) */}
                  <button
                    onClick={() => navigate("/peer-ranking")}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium"
                    title="Rank your peers on key competencies (SRS §4.5)"
                  >
                    <Users className="h-4 w-4" />
                    Peer Ranking
                  </button>
                  {/* Comparative Evaluation — Cross-project comparison (SRS §4.3) */}
                  <button
                    onClick={() => navigate("/comparative")}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors text-sm font-medium"
                    title="Cross-project comparative evaluation (SRS §4.3)"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Comparative Evaluation
                  </button>
                  {/* Weighted Results — Navigate to credibility-weighted results */}
                  <button
                    onClick={() => {
                      // Navigate to the first available session's weighted results
                      const sessionId =
                        upcomingEvaluations?.[0]?.session_id ||
                        assignedEvaluations?.[0]?.session_id ||
                        sections.scarcityEvaluations?.[0]?.sessionId;
                      if (sessionId) {
                        navigate(`/scarcity/weighted-results/${sessionId}`);
                      } else {
                        alert("No evaluation sessions available yet.");
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors text-sm font-medium"
                    title="View credibility-weighted evaluation results"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Weighted Results
                  </button>
                </div>
              </div>

              {/* ====================================================== */}
              {/* PEER SUGGESTIONS — Compact overview card */}
              {/* ====================================================== */}
              <StudentPeerSuggestionsCompact
                onViewAll={() => setActiveTab("peer-suggestions")}
              />
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* MY EVALUATIONS TAB */}
        {/* ====================================================== */}
        {activeTab === "evaluations" && (
          <StudentEvaluationsTab sections={sections} navigate={navigate} />
        )}

        {/* ====================================================== */}
        {/* PEER SUGGESTIONS TAB */}
        {/* ====================================================== */}
        {activeTab === "peer-suggestions" && <StudentPeerSuggestionsTab />}
      </main>
    </div>
  );
};

// ============================================================
// COMPACT PEER SUGGESTIONS — Sidebar card in Overview tab
// ============================================================
const StudentPeerSuggestionsCompact = ({ onViewAll }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await cohortApi.getPeerSuggestions({ limit: 3 });
        setSuggestions(result.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-500" />
        Suggested Peers
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Recommended peers for your evaluation groups
      </p>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-4">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">No suggestions yet</p>
          <p className="text-xs text-gray-300 mt-1">
            Check back when cohorts are active
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div
                key={s.suggested_peer_id || i}
                className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-purple-200 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {s.peer_name || "Peer"}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.department || ""}
                      {s.reasons?.[0] && ` — ${s.reasons[0]}`}
                    </p>
                  </div>
                </div>
                <div
                  className={`px-2 py-0.5 text-xs font-bold rounded-lg ${(s.composite_score || 0) >= 70
                    ? "text-green-700 bg-green-50"
                    : (s.composite_score || 0) >= 40
                      ? "text-amber-700 bg-amber-50"
                      : "text-gray-600 bg-gray-50"
                    }`}
                >
                  {s.composite_score || 0}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onViewAll}
            className="mt-3 text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
          >
            View all suggestions →
          </button>
        </>
      )}
    </div>
  );
};

// ============================================================
// STUDENT EVALUATIONS TAB — Full cohort assignments + eval list
// ============================================================
const StudentEvaluationsTab = ({ sections, navigate }) => {
  const [assignments, setAssignments] = useState(sections.assignedEvaluations || []);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState(null);

  // Use props directly - data is already fetched by usePersonalization
  useEffect(() => {
    if (sections.assignedEvaluations) {
      setAssignments(sections.assignedEvaluations);
    }
  }, [sections.assignedEvaluations]);

  const handleStartEvaluation = async (assignmentId, e) => {
    e.stopPropagation();
    setStartingId(assignmentId);
    setError(null);
    try {
      const result = await cohortApi.startEvaluation(assignmentId);
      const sessionId = result.data?.sessionId;
      if (sessionId) {
        navigate(`/scarcity/evaluate/${sessionId}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setStartingId(null);
    }
  };

  const statusColors = {
    pending: "bg-gray-100 text-gray-600",
    session_created: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      {/* Scheduled Evaluations (Faculty -> Student) */}
      {sections.facultySchedules && sections.facultySchedules.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-violet-200/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-violet-600" />
              Scheduled Evaluations
            </h2>
            <span className="bg-violet-100 text-violet-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {sections.facultySchedules.length} upcoming
            </span>
          </div>
          <div className="space-y-3">
            {sections.facultySchedules.map((schedule, index) => (
              <div
                key={schedule.id || index}
                className="border border-violet-100 rounded-xl p-4 transition-colors hover:border-violet-300 hover:bg-violet-50/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm">
                      {schedule.session_title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <Users className="h-3 w-3" />
                      <span>Evaluator: {schedule.faculty_name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 text-sm font-medium text-violet-700">
                      <Clock className="h-4 w-4" />
                      {schedule.scheduled_time}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(schedule.scheduled_date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
                {schedule.venue && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-md w-fit">
                    <Target className="h-3 w-3" />
                    <span>Venue: {schedule.venue}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cohort Assignments Section */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            Cohort Assignments
          </h2>
          {assignments.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {assignments.length} assigned
            </span>
          )}
        </div>
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-xs">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-10">
            <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              No cohort assignments yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              When your faculty assigns you to evaluation cohorts, they'll
              appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => (
              <div
                key={a.assignment_id}
                onClick={() => {
                  if (a.session_id)
                    navigate(`/scarcity/evaluate/${a.session_id}`);
                }}
                className={`border border-gray-100 rounded-xl p-4 transition-colors ${a.session_id
                  ? "hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer"
                  : ""
                  }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm">
                      {a.cohort_name || "Assigned Evaluation"}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Type: {a.target_type?.replace("_", " ") || "N/A"}
                      {a.deadline && (
                        <span>
                          {" "}
                          — Due {new Date(a.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Credibility Engine: Final Result Display */}
                  {a.session_status === 'FINALIZED' && (a.display_score != null || a.normalized_score != null) ? (
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-900 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                          Final: {Number(a.display_score ?? a.normalized_score).toFixed(2)} / 5
                        </span>
                      </div>
                      {a.confidence_score != null && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${Number(a.confidence_score) > 0.7
                            ? "bg-green-50 text-green-700 border-green-100"
                            : Number(a.confidence_score) > 0.4
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : "bg-red-50 text-red-700 border-red-100"
                            }`}
                        >
                          {Number(a.confidence_score) > 0.7 ? "High Conf." : Number(a.confidence_score) > 0.4 ? "Med Conf." : "Low Conf."}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${statusColors[a.assignment_status] ||
                        "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {a.session_status === 'FINALIZED' ? 'Completed' : (a.assignment_status?.replace("_", " ") || "Pending")}
                    </span>
                  )}
                </div>

                {/* Action: Start Evaluation when no session yet */}
                {!a.session_id && a.assignment_status !== "completed" && (
                  <button
                    onClick={(e) => handleStartEvaluation(a.assignment_id, e)}
                    disabled={startingId === a.assignment_id}
                    className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium
                               text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {startingId === a.assignment_id ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Start Evaluation
                      </>
                    )}
                  </button>
                )}
                {a.session_id && a.assignment_status !== "completed" && (
                  <div className="flex items-center gap-1 text-xs text-blue-500 mt-2">
                    <PlayCircle className="h-3 w-3" />
                    <span>Click to continue evaluation</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Evaluations from sessions (non-cohort) */}
      {sections.assignedEvaluations &&
        sections.assignedEvaluations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-indigo-200/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                Faculty-Assigned Evaluations
              </h2>
              <span className="bg-indigo-100 text-indigo-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {sections.assignedEvaluations.length} sessions
              </span>
            </div>
            <div className="space-y-3">
              {sections.assignedEvaluations.map((evalSession, index) => (
                <div
                  key={evalSession.session_id || index}
                  onClick={() => navigate("/my-results")}
                  className="border border-indigo-100 rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900 text-sm capitalize">
                        {evalSession.session_type?.replace("_", " ") ||
                          "Evaluation"}
                      </h3>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">
                        Intent: {evalSession.intent || "N/A"}
                        {evalSession.evaluation_mode && (
                          <span>
                            {" "}
                            • Mode:{" "}
                            {evalSession.evaluation_mode.replace("_", " ")}
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(evalSession.status)}`}
                    >
                      {formatStatus(evalSession.status)}
                    </span>
                  </div>
                  {evalSession.created_by_name && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                      <BookOpen className="h-3 w-3" />
                      <span>Assigned by: {evalSession.created_by_name}</span>
                    </div>
                  )}
                  {evalSession.session_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(
                          `/scarcity/weighted-results/${evalSession.session_id}`,
                        );
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline"
                    >
                      <TrendingUp className="h-3 w-3" />
                      View Weighted Results
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Scarcity Evaluations (where student is evaluator) */}
      {sections.scarcityEvaluations &&
        sections.scarcityEvaluations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-purple-500" />
              Scarcity Evaluations
            </h2>
            <div className="space-y-3">
              {sections.scarcityEvaluations.map((s, index) => (
                <div
                  key={s.sessionId || index}
                  onClick={() =>
                    s.sessionId && navigate(`/scarcity/evaluate/${s.sessionId}`)
                  }
                  className="border border-gray-100 rounded-xl p-4 hover:border-purple-200 hover:bg-purple-50/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900 text-sm capitalize">
                        {s.evaluationMode?.replace("_", " ") || "Evaluation"}
                      </h3>
                      <p className="text-xs text-gray-400 capitalize mt-0.5">
                        Intent: {s.intent || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(s.status)}`}
                    >
                      {formatStatus(s.status)}
                    </span>
                  </div>
                  {s.poolSize && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                      <Gauge className="h-3 w-3" />
                      <span>
                        Pool: {s.poolSize} points
                        {s.allocatedTotal !== undefined &&
                          ` • Used: ${s.allocatedTotal}`}
                      </span>
                    </div>
                  )}
                  {s.sessionId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/scarcity/weighted-results/${s.sessionId}`);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium hover:underline"
                    >
                      <TrendingUp className="h-3 w-3" />
                      View Weighted Results
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};

// ============================================================
// PEER SUGGESTIONS TAB — Full-featured peer recommendation view
// ============================================================
const StudentPeerSuggestionsTab = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const result = await cohortApi.getPeerSuggestions({ limit: 20 });
        setSuggestions(result.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Peer Suggestions
          </h2>
          {suggestions.length > 0 && (
            <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {suggestions.length} recommended
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          AI-recommended peers based on skill compatibility, project history,
          and collaborative potential.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-3 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="h-16 w-16 mx-auto mb-4 text-gray-200" />
            <p className="text-lg font-medium text-gray-500">
              No peer suggestions yet
            </p>
            <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
              Peer suggestions are generated when evaluation cohorts are active.
              Check back once your faculty sets up cohort assignments.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((s, i) => {
              const id = s.suggested_peer_id || i;
              const isExp = expanded[id];
              return (
                <div
                  key={id}
                  className="border border-gray-100 rounded-xl p-4 hover:border-purple-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-600 shrink-0">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {s.peer_name || "Peer"}
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.department || "Unknown Department"}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`px-3 py-1 text-sm font-bold rounded-xl ${(s.composite_score || 0) >= 70
                        ? "text-green-700 bg-green-50 border border-green-200"
                        : (s.composite_score || 0) >= 40
                          ? "text-amber-700 bg-amber-50 border border-amber-200"
                          : "text-gray-600 bg-gray-50 border border-gray-200"
                        }`}
                    >
                      {s.composite_score || 0}
                    </div>
                  </div>

                  {/* Reasons */}
                  {s.reasons && s.reasons.length > 0 && (
                    <div className="mb-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(isExp ? s.reasons : s.reasons.slice(0, 2)).map(
                          (r, ri) => (
                            <span
                              key={ri}
                              className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full"
                            >
                              {r}
                            </span>
                          ),
                        )}
                        {!isExp && s.reasons.length > 2 && (
                          <button
                            onClick={() => toggleExpand(id)}
                            className="text-xs text-purple-500 hover:text-purple-700"
                          >
                            +{s.reasons.length - 2} more
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Factor breakdown */}
                  {isExp && s.factors && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Compatibility Factors
                      </p>
                      {Object.entries(s.factors).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24 truncate capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-purple-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(val, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-8 text-right">
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expand / collapse toggle */}
                  <button
                    onClick={() => toggleExpand(id)}
                    className="mt-2 text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1"
                  >
                    {isExp ? (
                      <>
                        <ChevronUp className="h-3 w-3" /> Less details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" /> More details
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// HELPER FUNCTIONS — Status colors, formatting, icon mapping
// ============================================================

/**
 * Get Tailwind color classes for a status badge.
 * Maps project/session statuses to distinct colors.
 *
 * @param {string} status - Status string from backend
 * @returns {string} Tailwind CSS classes for the badge
 */
const getStatusColor = (status) => {
  // Map each status to a color scheme
  const colorMap = {
    draft: "bg-gray-100 text-gray-600", // Not yet started
    active: "bg-green-100 text-green-700", // Currently active
    under_review: "bg-amber-100 text-amber-700", // Awaiting review
    completed: "bg-blue-100 text-blue-700", // Successfully done
    archived: "bg-purple-100 text-purple-700", // Historical record
    open: "bg-green-100 text-green-700", // Evaluation open
    in_progress: "bg-blue-100 text-blue-700", // Evaluation in progress
    closed: "bg-gray-100 text-gray-600", // Evaluation closed
  };

  // Return matching color or default gray
  return colorMap[status] || "bg-gray-100 text-gray-600";
};

/**
 * Format a snake_case status string for display.
 * Converts 'under_review' to 'Under Review'.
 *
 * @param {string} status - Status string from backend
 * @returns {string} Human-readable status text
 */
const formatStatus = (status) => {
  if (!status) return "Unknown";
  // Split on underscores, capitalize each word, join with space
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/**
 * Map action icon names to Lucide React components.
 *
 * @param {string} iconName - Icon name from backend payload
 * @returns {JSX.Element} Lucide icon component
 */
const getActionIcon = (iconName) => {
  // Map icon names to Lucide components
  const iconMap = {
    "plus-circle": <PlusCircle className="h-4 w-4" />,
    "file-text": <FileText className="h-4 w-4" />,
    "folder-open": <FolderOpen className="h-4 w-4" />,
  };

  // Return matching icon or default
  return iconMap[iconName] || <FolderOpen className="h-4 w-4" />;
};

// ============================================================
// Export the StudentDashboard component
// ============================================================
export default StudentDashboard;
