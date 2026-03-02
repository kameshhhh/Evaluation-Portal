// ============================================================
// SESSION DETAIL PAGE — Full-page view for a single session
// ============================================================
// Navigated to from the session card grid. Shows everything:
//   - Session header with status, dates, pool info
//   - Scheduling toolbar (date/time/venue with week restriction)
//   - Student list grouped by team with marks submission
//   - Cross-faculty conflict indicators
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft, Users, Calendar, Clock, MapPin,
    Loader2, Star, Award, Check, CheckSquare, Square,
    AlertCircle, MessageSquare, Send, ChevronDown, ChevronUp,
    Mail, ClipboardList, RefreshCw, Plus, Minus,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { useDataChange } from "../../hooks/useSocketEvent";
import {
    getMySessions,
    submitMarks as submitMarksApi,
    setSchedule as setScheduleApi,
} from "../../services/sessionPlannerApi";
import { listRubrics } from "../../services/rubricApi";

// ── Helpers ──
const getYearLabel = (admissionYear) => {
    if (!admissionYear) return null;
    const currentYear = new Date().getFullYear();
    const diff = currentYear - admissionYear;
    if (diff >= 4) return "Final Year";
    if (diff === 3) return "3rd Year";
    if (diff === 2) return "2nd Year";
    if (diff === 1) return "1st Year";
    return `${admissionYear}`;
};

const POINTS_PER_MEMBER = 5;

const getWeekRange = (session) => {
    const title = session.title || "";
    const MONTH_MAP = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const match = title.match(/^(\w{3})\s+S(\d)/);
    if (!match) return null;
    const monthIdx = MONTH_MAP[match[1]];
    const segNum = parseInt(match[2]) || 1;
    if (monthIdx === undefined) return null;
    const year = new Date().getFullYear();
    const startDay = (segNum - 1) * 7 + 1;
    const minDate = new Date(year, monthIdx, startDay);
    const maxDate = new Date(year, monthIdx, startDay + 6);
    return {
        min: minDate.toISOString().split("T")[0],
        max: maxDate.toISOString().split("T")[0],
    };
};

const groupStudentsByTeam = (students) => {
    if (!students || students.length === 0) return [];
    const teamMap = new Map();
    const noTeam = [];
    for (const s of students) {
        if (s.team_id) {
            if (!teamMap.has(s.team_id)) {
                teamMap.set(s.team_id, {
                    team_id: s.team_id,
                    team_title: s.team_title,
                    team_leader_name: s.team_leader_name,
                    students: [],
                });
            }
            teamMap.get(s.team_id).students.push(s);
        } else {
            noTeam.push(s);
        }
    }
    const groups = [];
    for (const [, team] of teamMap) groups.push(team);
    // Each individual (no team) is their own evaluation group (pool = 1 × 5 = 5)
    for (const s of noTeam) {
        groups.push({ team_id: null, team_title: null, students: [s] });
    }
    return groups;
};

// Compute per-rubric pool limits for a team/individual evaluation group
// Matches backend logic: pool = teamSize × 5, floor + remainder (alphabetical by rubric name)
const computeRubricPools = (teamSize, rubrics) => {
    if (!rubrics || rubrics.length === 0) return {};
    const totalPool = teamSize * 5;
    const count = rubrics.length;
    const base = Math.floor(totalPool / count);
    const rem = totalPool - base * count;
    // Sort alphabetically by headName for consistent remainder distribution
    const sorted = [...rubrics].sort((a, b) => (a.headName || '').localeCompare(b.headName || ''));
    const pools = {};
    sorted.forEach((r, idx) => {
        pools[r.headId] = base + (idx < rem ? 1 : 0);
    });
    return pools;
};

// Get used marks per rubric across a team (excluding current student)
const getUsedPerRubric = (teamStudents, currentStudentId, rubricIds) => {
    const used = {};
    rubricIds.forEach(rid => { used[rid] = 0; });
    for (const s of teamStudents) {
        if (s.student_id === currentStudentId) continue;
        if (!s.marks_submitted_at || !s.rubric_marks) continue;
        const rm = typeof s.rubric_marks === 'string' ? JSON.parse(s.rubric_marks) : s.rubric_marks;
        for (const [rid, val] of Object.entries(rm)) {
            used[rid] = (used[rid] || 0) + Number(val);
        }
    }
    return used;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const SessionDetailPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    // Student expand
    const [expandedStudent, setExpandedStudent] = useState(null);

    // Per-rubric marks: { [studentId]: { [rubricId]: 0-5 } }
    const [rubricMarksInputs, setRubricMarksInputs] = useState({});
    // Zero feedback: { [studentId]: { [rubricId]: "text" } }
    const [zeroFeedbackInputs, setZeroFeedbackInputs] = useState({});
    // General feedback per student
    const [feedbackInputs, setFeedbackInputs] = useState({});
    const [confirmFlags, setConfirmFlags] = useState({});
    const [submittingMarks, setSubmittingMarks] = useState({});
    const [expandedFeedback, setExpandedFeedback] = useState({});
    const [marksError, setMarksError] = useState({});

    // Rubric metadata (loaded from rubric API)
    const [rubricData, setRubricData] = useState([]);      // [{ headId, headName, description }]

    // Scheduling
    const [schedDate, setSchedDate] = useState("");
    const [schedTime, setSchedTime] = useState("");
    const [schedVenue, setSchedVenue] = useState("");
    const [schedSelectedStudents, setSchedSelectedStudents] = useState(new Set());
    const [schedLoading, setSchedLoading] = useState(false);
    const [schedError, setSchedError] = useState("");
    const [schedSuccess, setSchedSuccess] = useState("");
    const [showSchedPanel, setShowSchedPanel] = useState(false);

    // ── Load data ──
    const loadSession = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getMySessions();
            const sessions = res.data || [];
            const found = sessions.find(s => s.session_id === sessionId);
            if (found) setSession(found);
        } catch {
            setSession(null);
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => { loadSession(); }, [loadSession]);
    useDataChange(["session_planner"], loadSession);

    // Load rubric details whenever the session gains preferred_rubric_ids
    useEffect(() => {
        if (!session?.preferred_rubric_ids?.length) {
            setRubricData([]);
            return;
        }
        (async () => {
            try {
                const res = await listRubrics();
                const all = res?.data || [];
                const ids = session.preferred_rubric_ids;
                const matched = ids
                    .map(id => all.find(r => r.head_id === id))
                    .filter(Boolean);

                const withInfo = matched.map((r) => ({
                    headId: r.head_id,
                    headName: r.head_name,
                    description: r.description,
                }));
                setRubricData(withInfo);
            } catch {
                setRubricData([]);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.session_id, JSON.stringify(session?.preferred_rubric_ids)]);

    // ── Toggle schedule student (team auto-select) ──
    const toggleSchedStudent = (student, allStudents) => {
        setSchedSelectedStudents((prev) => {
            const current = new Set(prev);
            const teamIds = [];
            if (student.team_id) {
                for (const s of allStudents) {
                    if (s.team_id === student.team_id) teamIds.push(s.student_id);
                }
            } else {
                teamIds.push(student.student_id);
            }
            const isSelected = current.has(student.student_id);
            for (const id of teamIds) {
                if (isSelected) current.delete(id);
                else current.add(id);
            }
            return current;
        });
    };

    // ── Set schedule ──
    const handleSetSchedule = async () => {
        const selected = Array.from(schedSelectedStudents);
        if (!selected.length) { setSchedError("Select at least one student"); return; }
        if (!schedDate) { setSchedError("Pick a date"); return; }
        if (!schedTime) { setSchedError("Pick a time"); return; }

        try {
            setSchedLoading(true);
            setSchedError("");
            setSchedSuccess("");
            await setScheduleApi(sessionId, selected, schedDate, schedTime, schedVenue);
            setSchedSuccess("Schedule set successfully!");
            setSchedSelectedStudents(new Set());
            setTimeout(() => setSchedSuccess(""), 3000);
            loadSession();
        } catch (err) {
            setSchedError(err.response?.data?.error || "Failed to set schedule");
        } finally {
            setSchedLoading(false);
        }
    };

    // ── Per-rubric stepper change (pool-aware) ──
    const handleRubricStep = (studentId, rubricId, delta, maxForRubric) => {
        setRubricMarksInputs(prev => {
            const studentMarks = { ...(prev[studentId] || {}) };
            const current = studentMarks[rubricId] ?? 0;
            const cap = maxForRubric !== undefined ? maxForRubric : 5;
            studentMarks[rubricId] = Math.max(0, Math.min(cap, current + delta));
            return { ...prev, [studentId]: studentMarks };
        });
        setConfirmFlags(p => ({ ...p, [studentId]: false }));
        setMarksError(p => ({ ...p, [studentId]: null }));
    };

    // ── Zero feedback change ──
    const handleZeroFeedback = (studentId, rubricId, text) => {
        setZeroFeedbackInputs(prev => {
            const studentFb = { ...(prev[studentId] || {}) };
            studentFb[rubricId] = text;
            return { ...prev, [studentId]: studentFb };
        });
    };

    // ── Submit per-rubric marks ──
    const handleSubmitMarks = async (student) => {
        const sid = student.student_id;
        if (!confirmFlags[sid]) return;

        const rubricMarks = rubricMarksInputs[sid] || {};
        const zeroFeedback = zeroFeedbackInputs[sid] || {};
        const feedback = feedbackInputs[sid] || "";

        // Validate: all rubrics have marks
        for (const r of rubricData) {
            if (rubricMarks[r.headId] === undefined || rubricMarks[r.headId] === null) {
                setMarksError(p => ({ ...p, [sid]: `Set marks for "${r.headName}"` }));
                return;
            }
            // Zero feedback check
            if (rubricMarks[r.headId] === 0 && (!zeroFeedback[r.headId] || zeroFeedback[r.headId].trim().length < 20)) {
                setMarksError(p => ({ ...p, [sid]: `Zero marks for "${r.headName}" requires 20+ character feedback` }));
                return;
            }
        }

        try {
            setSubmittingMarks(p => ({ ...p, [sid]: true }));
            setMarksError(p => ({ ...p, [sid]: null }));
            await submitMarksApi(sessionId, sid, rubricMarks, zeroFeedback, feedback);
            loadSession();
        } catch (err) {
            console.error("Submit marks failed", err);
            setMarksError(p => ({ ...p, [sid]: err.response?.data?.error || "Failed: " + (err.message || "Unknown error") }));
        } finally {
            setSubmittingMarks(p => ({ ...p, [sid]: false }));
        }
    };

    // ── Loading / Not Found ──
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-violet-50/30">
                <Loader2 size={28} className="animate-spin text-violet-500" />
            </div>
        );
    }
    if (!session) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-violet-50/30 gap-4">
                <ClipboardList size={40} className="text-gray-300" />
                <p className="text-gray-500 font-medium">Session not found</p>
                <button onClick={() => navigate("/session-planner")} className="text-sm text-violet-600 hover:underline flex items-center gap-1">
                    <ArrowLeft size={14} /> Back to sessions
                </button>
            </div>
        );
    }

    // ── Computed values ──
    const students = session.students || [];
    const rubricCount = rubricData.length || 1;
    // Per-team: pool = team_size × 5, per-rubric: floor(pool/rubricCount) + remainder
    const submittedCount = students.filter(s => s.marks_submitted_at).length;
    const groups = groupStudentsByTeam(students);
    const weekRange = getWeekRange(session);
    const scheduledCount = students.filter(s => s.scheduled_date).length;
    const allIds = students.map(s => s.student_id);
    const allSelected = allIds.length > 0 && allIds.every(id => schedSelectedStudents.has(id));

    // Rubric mode — always use per-rubric UI when rubrics are configured
    const hasRubrics = rubricData.length > 0;
    // rubricTargets removed — per-rubric inline UI used instead

    const getStatusStyle = (status) => {
        const map = {
            active: { bg: "rgba(5,150,105,0.08)", color: "#059669", label: "Active" },
            scheduled: { bg: "rgba(217,119,6,0.08)", color: "#D97706", label: "Scheduled" },
            completed: { bg: "rgba(99,102,241,0.08)", color: "#6366F1", label: "Completed" },
            closed: { bg: "rgba(107,114,128,0.08)", color: "#6B7280", label: "Closed" },
            finalized: { bg: "rgba(99,102,241,0.08)", color: "#6366F1", label: "Finalized" },
        };
        return map[status] || { bg: "rgba(107,114,128,0.08)", color: "#6B7280", label: status || "Unknown" };
    };
    const statusStyle = getStatusStyle(session.status);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-violet-50/30">
            <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">

                {/* ── Back button ── */}
                <button
                    onClick={() => navigate("/session-planner")}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-violet-600 font-medium mb-5 transition-colors"
                >
                    <ArrowLeft size={16} /> Back to Sessions
                </button>

                {/* ── Session Header ── */}
                <div
                    className="rounded-2xl p-5 sm:p-6 mb-6 relative overflow-hidden"
                    style={{
                        background: "linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(99,102,241,0.05) 100%)",
                        border: "1px solid rgba(124,58,237,0.12)",
                    }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{session.title}</h1>
                                <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                                    style={{ background: statusStyle.bg, color: statusStyle.color }}
                                >
                                    {statusStyle.label}
                                </span>
                            </div>
                            {session.description && (
                                <p className="text-sm text-gray-500 mb-3">{session.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                    <Users size={13} className="text-violet-500" /> {students.length} students
                                </span>
                                <span className="flex items-center gap-1">
                                    <Star size={13} className="text-violet-500" /> {rubricCount} rubric{rubricCount !== 1 ? 's' : ''} · 0-5 each
                                </span>
                                {session.session_date && (
                                    <span className="flex items-center gap-1">
                                        <Calendar size={13} className="text-gray-400" />
                                        {new Date(session.session_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                    </span>
                                )}
                                {session.session_time && (
                                    <span className="flex items-center gap-1">
                                        <Clock size={13} className="text-gray-400" /> {session.session_time}
                                    </span>
                                )}
                                {session.venue && (
                                    <span className="flex items-center gap-1">
                                        <MapPin size={13} className="text-gray-400" /> {session.venue}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button onClick={loadSession} className="p-2 rounded-lg hover:bg-white/80 transition-colors" title="Refresh">
                            <RefreshCw size={16} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Team Pool Summary */}
                    <div className="mt-4 bg-white/60 rounded-xl p-3 border border-violet-100/50">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">Evaluation Progress</span>
                            <span className="text-xs font-bold text-violet-800">{submittedCount} / {students.length} submitted</span>
                        </div>
                        <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{
                                    width: students.length > 0 ? `${(submittedCount / students.length) * 100}%` : "0%",
                                    background: submittedCount === students.length ? "#059669" : "#7C3AED",
                                }}
                            />
                        </div>
                        {groups.length > 0 && hasRubrics && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {groups.filter(g => g.team_title).map(g => {
                                    const teamPool = g.students.length * POINTS_PER_MEMBER;
                                    const teamUsed = g.students.reduce((sum, s) => s.marks_submitted_at ? sum + (s.marks || 0) : sum, 0);
                                    return (
                                        <span key={g.team_id} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 font-medium">
                                            {g.team_title}: {teamUsed}/{teamPool} pts
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Schedule Evaluation Panel ── */}
                <div className="mb-6">
                    <button
                        onClick={() => setShowSchedPanel(!showSchedPanel)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl text-sm font-semibold transition-all"
                        style={{
                            background: showSchedPanel
                                ? "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)"
                                : "rgba(99,102,241,0.06)",
                            color: showSchedPanel ? "#fff" : "#6366F1",
                            border: showSchedPanel ? "none" : "1px solid rgba(99,102,241,0.12)",
                        }}
                    >
                        <span className="flex items-center gap-2">
                            <Calendar size={16} />
                            Schedule Evaluation
                        </span>
                        <div className="flex items-center gap-2">
                            {weekRange && !showSchedPanel && (
                                <span className="text-[10px] opacity-70 font-normal">
                                    Week: {weekRange.min.slice(5)} → {weekRange.max.slice(5)}
                                </span>
                            )}
                            <span className="text-[10px] font-normal opacity-70">
                                {scheduledCount}/{students.length} scheduled
                            </span>
                            {showSchedPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </button>

                    {showSchedPanel && (
                        <div className="mt-2 p-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 space-y-4" style={{ animation: "fadeIn 0.15s ease" }}>
                            {/* Date / Time / Venue */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-semibold text-indigo-600 mb-1 uppercase tracking-wide">
                                        <Calendar size={10} className="inline mr-1" />Date
                                    </label>
                                    <input
                                        type="date"
                                        value={schedDate}
                                        min={weekRange?.min || ""}
                                        max={weekRange?.max || ""}
                                        onChange={(e) => setSchedDate(e.target.value)}
                                        className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                    />
                                    {weekRange && (
                                        <p className="text-[9px] text-indigo-400 mt-0.5">
                                            {weekRange.min} — {weekRange.max}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-indigo-600 mb-1 uppercase tracking-wide">
                                        <Clock size={10} className="inline mr-1" />Time
                                    </label>
                                    <input
                                        type="time"
                                        value={schedTime}
                                        onChange={(e) => setSchedTime(e.target.value)}
                                        className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-indigo-600 mb-1 uppercase tracking-wide">
                                        <MapPin size={10} className="inline mr-1" />Venue
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Block 3, Room 201"
                                        value={schedVenue}
                                        onChange={(e) => setSchedVenue(e.target.value)}
                                        className="w-full px-2.5 py-2 rounded-lg border border-indigo-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none bg-white"
                                    />
                                </div>
                            </div>

                            {/* Select All */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        if (allSelected) setSchedSelectedStudents(new Set());
                                        else setSchedSelectedStudents(new Set(allIds));
                                    }}
                                    className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
                                    style={{
                                        background: allSelected ? "rgba(99,102,241,0.1)" : "rgba(107,114,128,0.06)",
                                        color: allSelected ? "#6366F1" : "#6B7280",
                                    }}
                                >
                                    {allSelected ? <><CheckSquare size={10} className="inline mr-1" />All Selected</> : <><Square size={10} className="inline mr-1" />Select All</>}
                                </button>
                                {schedSelectedStudents.size > 0 && !allSelected && (
                                    <span className="text-[10px] text-indigo-500 font-medium">{schedSelectedStudents.size} selected</span>
                                )}
                            </div>

                            {/* Student checkboxes */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                                {students.map((s) => {
                                    const isChecked = schedSelectedStudents.has(s.student_id);
                                    const otherSchedules = (s.all_schedules || []).filter(sc => sc.facultyId !== user?.personId);
                                    return (
                                        <button
                                            key={s.student_id}
                                            type="button"
                                            onClick={() => toggleSchedStudent(s, students)}
                                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all border ${isChecked
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"
                                                }`}
                                        >
                                            {isChecked ? <CheckSquare size={13} /> : <Square size={13} className="opacity-40" />}
                                            <span className="font-medium truncate flex-1">{s.display_name}</span>
                                            {s.scheduled_date && (
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isChecked ? "bg-white/20 text-white" : "bg-green-50 text-green-700 border border-green-200"
                                                    }`}>
                                                    ✓ {new Date(s.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                </span>
                                            )}
                                            {otherSchedules.length > 0 && (
                                                <span className={`text-[8px] px-1 py-0.5 rounded ${isChecked ? "bg-yellow-300/30 text-yellow-100" : "bg-amber-50 text-amber-700 border border-amber-200"
                                                    }`} title={otherSchedules.map(x => `${x.facultyName}: ${x.date} ${x.time}`).join(", ")}>
                                                    ⚠ {otherSchedules.length} other
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Messages */}
                            {schedError && (
                                <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                    <AlertCircle size={12} /> {schedError}
                                </p>
                            )}
                            {schedSuccess && (
                                <p className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                    <Check size={12} /> {schedSuccess}
                                </p>
                            )}

                            {/* Set Schedule button */}
                            <button
                                onClick={handleSetSchedule}
                                disabled={schedLoading || !schedSelectedStudents.size}
                                className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                                style={{
                                    background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
                                    boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
                                }}
                            >
                                {schedLoading ? (
                                    <Loader2 size={14} className="animate-spin mx-auto" />
                                ) : (
                                    <>Set Schedule ({schedSelectedStudents.size} student{schedSelectedStudents.size !== 1 ? "s" : ""})</>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Student List ── */}
                <div>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Users size={14} className="text-violet-500" />
                        Students ({students.length})
                    </h2>

                    {students.length === 0 ? (
                        <div className="text-center py-12 rounded-2xl border-2 border-dashed border-gray-200 bg-white/50">
                            <Users size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-gray-500 text-sm">No students assigned yet</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groups.map((group, gIdx) => (
                                <div key={group.team_id || `no-team-${gIdx}`}>
                                    {/* Team header */}
                                    {group.team_title && (
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-px flex-1 bg-violet-100" />
                                            <span className="text-[11px] font-bold text-violet-600 flex items-center gap-1 px-3 py-1 bg-violet-50 rounded-full border border-violet-100">
                                                <Users size={11} /> {group.team_title}
                                                {group.team_leader_name && (
                                                    <span className="text-violet-400 font-normal ml-1">· Lead: {group.team_leader_name}</span>
                                                )}
                                            </span>
                                            <div className="h-px flex-1 bg-violet-100" />
                                        </div>
                                    )}
                                    {!group.team_title && groups.length > 1 && group.students.length > 0 && (
                                        <div className="flex items-center gap-2 mb-2 mt-4">
                                            <div className="h-px flex-1 bg-gray-100" />
                                            <span className="text-[11px] font-medium text-gray-400 px-2">Individual Students</span>
                                            <div className="h-px flex-1 bg-gray-100" />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {group.students.map((student) => {
                                            const isExpanded = expandedStudent === student.assignment_id;
                                            const yearLabel = getYearLabel(student.admission_year);
                                            const isSubmitted = !!student.marks_submitted_at;
                                            const isSubmitting = submittingMarks[student.student_id];
                                            const error = marksError[student.student_id];
                                            const hasSchedule = !!student.scheduled_date;
                                            const otherSchedules = (student.all_schedules || []).filter(sc => sc.facultyId !== user?.personId);

                                            return (
                                                <div
                                                    key={student.assignment_id}
                                                    className="rounded-xl border bg-white overflow-hidden transition-all"
                                                    style={{
                                                        borderColor: isExpanded ? "rgba(124,58,237,0.2)" : hasSchedule ? "rgba(5,150,105,0.15)" : "#f3f4f6",
                                                        boxShadow: isExpanded ? "0 4px 16px rgba(124,58,237,0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
                                                    }}
                                                >
                                                    {/* Student row */}
                                                    <button
                                                        onClick={() => setExpandedStudent(isExpanded ? null : student.assignment_id)}
                                                        className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-gray-50/50 transition-colors"
                                                    >
                                                        <div
                                                            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                                            style={{ background: isSubmitted ? "#059669" : "#7C3AED" }}
                                                        >
                                                            {isSubmitted ? <Check size={16} /> : (student.display_name?.[0] || "?")}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-gray-800 truncate">{student.display_name}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                {student.track && (
                                                                    <span
                                                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                                                        style={{
                                                                            background: student.track === "core" ? "rgba(124,58,237,0.1)" : student.track === "premium" ? "rgba(217,119,6,0.1)" : "rgba(5,150,105,0.1)",
                                                                            color: student.track === "core" ? "#7C3AED" : student.track === "premium" ? "#D97706" : "#059669",
                                                                        }}
                                                                    >
                                                                        {student.track.toUpperCase().replace("_", "-")}
                                                                    </span>
                                                                )}
                                                                {yearLabel && <span className="text-[10px] text-gray-500 font-medium">{yearLabel}</span>}
                                                                {student.department_code && <span className="text-[10px] text-gray-400 uppercase">{student.department_code}</span>}
                                                            </div>
                                                        </div>

                                                        {/* Schedule badges */}
                                                        {hasSchedule && (
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                                                                    <Calendar size={8} /> {new Date(student.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                                                </span>
                                                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                                                                    <Clock size={8} /> {student.scheduled_time?.slice(0, 5)}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Marks badge */}
                                                        {isSubmitted ? (
                                                            <span className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0" style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>
                                                                <Award size={12} /> {student.marks}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(124,58,237,0.08)", color: "#7C3AED" }}>
                                                                Pending
                                                            </span>
                                                        )}

                                                        {isExpanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                                                    </button>

                                                    {/* Cross-faculty conflict badges */}
                                                    {otherSchedules.length > 0 && (
                                                        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                                                            {otherSchedules.map((sc, i) => (
                                                                <span key={i} className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                                                                    ⚠ {sc.facultyName?.split(" ")[0]}: {sc.date ? new Date(sc.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"} {sc.time?.slice(0, 5)} {sc.venue ? `@ ${sc.venue}` : ""}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Expanded details */}
                                                    {isExpanded && (
                                                        <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-3">
                                                            {student.email && (
                                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                                    <Mail size={14} className="text-gray-400" />
                                                                    <span>{student.email}</span>
                                                                </div>
                                                            )}

                                                            {/* Schedule details */}
                                                            {hasSchedule && (
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                                                                        <Calendar size={9} /> {new Date(student.scheduled_date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                                                                    </span>
                                                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                                                                        <Clock size={9} /> {student.scheduled_time?.slice(0, 5)}
                                                                    </span>
                                                                    {student.scheduled_venue && (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">
                                                                            <MapPin size={9} /> {student.scheduled_venue}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Team info */}
                                                            {student.team_title && (
                                                                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                                                    <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                                                        <Users size={13} className="text-violet-500" /> Team: {student.team_title}
                                                                    </p>
                                                                    {student.team_members && student.team_members.length > 0 && (
                                                                        <div className="space-y-1">
                                                                            {student.team_members.map((m, i) => (
                                                                                <div key={m.personId || i} className="flex items-center gap-2 text-xs text-gray-600 pl-2">
                                                                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: m.role === "leader" ? "#7C3AED" : "#9CA3AF" }}>
                                                                                        {m.displayName?.[0] || "?"}
                                                                                    </span>
                                                                                    <span className="truncate">{m.displayName}</span>
                                                                                    {m.departmentCode && <span className="text-gray-400 uppercase text-[10px]">{m.departmentCode}</span>}
                                                                                    {m.role === "leader" && <span className="text-[10px] font-semibold text-violet-500">★ Lead</span>}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* ── Marks Section — Per-Rubric Stepper ── */}
                                                            {isSubmitted ? (
                                                                <div className="bg-green-50 rounded-xl p-4 border border-green-100 space-y-2">
                                                                    {(() => {
                                                                        const evalGroup = groups.find(g => g.students.some(s => s.student_id === student.student_id));
                                                                        const teamSize = evalGroup ? evalGroup.students.length : 1;
                                                                        const totalPool = teamSize * 5;
                                                                        const poolLimits = computeRubricPools(teamSize, rubricData);
                                                                        return (
                                                                    <>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                                                                            <Award size={16} className="text-green-600" /> Marks Submitted
                                                                        </span>
                                                                        <span className="text-lg font-bold text-green-700">
                                                                            {student.marks}
                                                                            <span className="text-xs font-normal text-gray-400 ml-1">/ {totalPool}</span>
                                                                        </span>
                                                                    </div>
                                                                    {/* Rubric breakdown if available */}
                                                                    {student.rubric_marks && (() => {
                                                                        const rm = typeof student.rubric_marks === 'string'
                                                                            ? JSON.parse(student.rubric_marks)
                                                                            : student.rubric_marks;
                                                                        return (
                                                                            <div className="mt-2 pt-2 border-t border-green-100 space-y-1">
                                                                                {Object.entries(rm).map(([rid, val]) => {
                                                                                    const rubric = rubricData.find(r => r.headId === rid);
                                                                                    const rubricPool = poolLimits[rid] || Math.floor(totalPool / (rubricData.length || 1));
                                                                                    return (
                                                                                        <div key={rid} className="flex justify-between text-xs">
                                                                                            <span className="text-green-700">{rubric?.headName || rid}</span>
                                                                                            <span className="font-bold text-green-800">{val}/{rubricPool}</span>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    </>
                                                                        );
                                                                    })()}
                                                                    {student.feedback && (
                                                                        <div className="mt-2 pt-2 border-t border-green-100">
                                                                            <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                                                                                <MessageSquare size={12} /> Feedback
                                                                            </p>
                                                                            <p className="text-sm text-green-800 bg-white/60 rounded-lg p-2">{student.feedback}</p>
                                                                        </div>
                                                                    )}
                                                                    <p className="text-[10px] text-green-600 mt-1">
                                                                        Submitted {new Date(student.marks_submitted_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                                    </p>
                                                                </div>
                                                            ) : hasRubrics ? (
                                                                <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100 space-y-3">
                                                                    <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                                                                        <Star size={13} className="text-violet-500" /> Per-Rubric Evaluation
                                                                    </p>

                                                                    {/* Rubric steppers */}
                                                                    {(() => {
                                                                        // Compute pool limits for this evaluation group
                                                                        const evalGroup = groups.find(g => g.students.some(s => s.student_id === student.student_id));
                                                                        const teamStudents = evalGroup ? evalGroup.students : [student];
                                                                        const teamSize = teamStudents.length;
                                                                        const poolLimits = computeRubricPools(teamSize, rubricData);
                                                                        const rubricIds = rubricData.map(r => r.headId);
                                                                        const usedMarks = getUsedPerRubric(teamStudents, student.student_id, rubricIds);

                                                                        return (
                                                                    <div className="space-y-2.5">
                                                                        {rubricData.map((rubric) => {
                                                                            const sid = student.student_id;
                                                                            const currentVal = rubricMarksInputs[sid]?.[rubric.headId] ?? 0;
                                                                            const poolForRubric = poolLimits[rubric.headId] || 5;
                                                                            const usedByOthers = usedMarks[rubric.headId] || 0;
                                                                            const remaining = poolForRubric - usedByOthers;
                                                                            const maxForThis = Math.max(0, Math.min(5, remaining));
                                                                            const isZero = currentVal === 0 && (rubricMarksInputs[sid]?.[rubric.headId] !== undefined);
                                                                            const zfText = zeroFeedbackInputs[sid]?.[rubric.headId] || "";

                                                                            return (
                                                                                <div key={rubric.headId} className="bg-white rounded-lg p-3 border border-violet-100">
                                                                                    <div className="flex items-center justify-between mb-1">
                                                                                        <div className="flex-1 min-w-0">
                                                                                            <p className="text-xs font-semibold text-gray-700 truncate">{rubric.headName}</p>
                                                                                            {rubric.description && (
                                                                                                <p className="text-[10px] text-gray-400 truncate">{rubric.description}</p>
                                                                                            )}
                                                                                        </div>
                                                                                        {/* Stepper +/- */}
                                                                                        <div className="flex items-center gap-1.5 ml-3">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleRubricStep(sid, rubric.headId, -1, maxForThis)}
                                                                                                disabled={isSubmitting || currentVal <= 0}
                                                                                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-violet-200 hover:bg-violet-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                            >
                                                                                                <Minus size={14} className="text-violet-600" />
                                                                                            </button>
                                                                                            <span className="w-8 text-center text-lg font-bold text-violet-800">{currentVal}</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleRubricStep(sid, rubric.headId, 1, maxForThis)}
                                                                                                disabled={isSubmitting || currentVal >= maxForThis}
                                                                                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-violet-200 hover:bg-violet-100 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                            >
                                                                                                <Plus size={14} className="text-violet-600" />
                                                                                            </button>
                                                                                            <span className="text-[10px] text-gray-400 ml-1">/{poolForRubric}</span>
                                                                                        </div>
                                                                                    </div>

                                                                                    {/* Zero feedback required */}
                                                                                    {isZero && (
                                                                                        <div className="mt-2">
                                                                                            <label className="text-[10px] font-semibold text-red-600 mb-1 block">
                                                                                                ⚠ Zero marks require feedback (min 20 characters)
                                                                                            </label>
                                                                                            <textarea
                                                                                                value={zfText}
                                                                                                onChange={(e) => handleZeroFeedback(sid, rubric.headId, e.target.value)}
                                                                                                placeholder="Explain why this rubric received 0 marks..."
                                                                                                rows={2}
                                                                                                className="w-full px-2.5 py-1.5 rounded-lg border border-red-200 focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none text-xs transition-all resize-none"
                                                                                                disabled={isSubmitting}
                                                                                            />
                                                                                            <p className="text-[9px] text-gray-400 mt-0.5">{zfText.length}/20 characters</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                        );
                                                                    })()}

                                                                    {/* Total display + pool info */}
                                                                    {(() => {
                                                                        const sid = student.student_id;
                                                                        const marks = rubricMarksInputs[sid] || {};
                                                                        const total = Object.values(marks).reduce((s, v) => s + v, 0);
                                                                        const avg = rubricData.length > 0 ? (total / rubricData.length) : 0;
                                                                        const evalGroup = groups.find(g => g.students.some(s => s.student_id === student.student_id));
                                                                        const teamSize = evalGroup ? evalGroup.students.length : 1;
                                                                        const totalPool = teamSize * 5;
                                                                        return (
                                                                            <>
                                                                            <div className="flex items-center justify-between px-3 py-2 bg-violet-100/50 rounded-lg">
                                                                                <span className="text-xs text-violet-600 font-medium">
                                                                                    Display Score
                                                                                </span>
                                                                                <span className="text-sm font-bold text-violet-800">
                                                                                    {avg.toFixed(1)} / 5
                                                                                </span>
                                                                            </div>
                                                                            {teamSize > 0 && (
                                                                                <div className="text-[10px] text-gray-400 text-right">
                                                                                    Pool: {totalPool} points across {rubricData.length} rubric{rubricData.length !== 1 ? 's' : ''}
                                                                                    {teamSize > 1 ? ` (team of ${teamSize})` : ' (individual)'}
                                                                                </div>
                                                                            )}
                                                                            </>
                                                                        );
                                                                    })()}

                                                                    {/* General feedback toggle */}
                                                                    <button
                                                                        onClick={() => setExpandedFeedback(p => ({ ...p, [student.student_id]: !p[student.student_id] }))}
                                                                        className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors"
                                                                    >
                                                                        <MessageSquare size={13} />
                                                                        {expandedFeedback[student.student_id] ? "Hide" : "Add"} General Feedback
                                                                    </button>
                                                                    {expandedFeedback[student.student_id] && (
                                                                        <textarea
                                                                            value={feedbackInputs[student.student_id] || ""}
                                                                            onChange={(e) => setFeedbackInputs(p => ({ ...p, [student.student_id]: e.target.value }))}
                                                                            placeholder="Optional general feedback..."
                                                                            rows={2}
                                                                            className="w-full px-3 py-2 rounded-lg border border-violet-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition-all resize-none"
                                                                            disabled={isSubmitting}
                                                                        />
                                                                    )}

                                                                    {error && (
                                                                        <p className="text-xs text-red-500 flex items-center gap-1">
                                                                            <AlertCircle size={12} /> {error}
                                                                        </p>
                                                                    )}

                                                                    {/* Confirm + Submit */}
                                                                    <div className="flex items-start gap-2 pt-1">
                                                                        <button
                                                                            onClick={() => setConfirmFlags(p => ({ ...p, [student.student_id]: !p[student.student_id] }))}
                                                                            className="mt-0.5 shrink-0 text-violet-500 hover:text-violet-700 transition-colors"
                                                                            disabled={isSubmitting}
                                                                        >
                                                                            {confirmFlags[student.student_id] ? <CheckSquare size={16} /> : <Square size={16} />}
                                                                        </button>
                                                                        <p className="text-[11px] text-gray-500 leading-tight">
                                                                            I confirm these marks are <span className="font-semibold text-red-500">final and cannot be changed</span> after submission.
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleSubmitMarks(student)}
                                                                        disabled={!confirmFlags[student.student_id] || isSubmitting}
                                                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        style={{
                                                                            background: confirmFlags[student.student_id] ? "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)" : "#D1D5DB",
                                                                            boxShadow: confirmFlags[student.student_id] ? "0 2px 8px rgba(124,58,237,0.3)" : "none",
                                                                        }}
                                                                    >
                                                                        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <><Send size={14} /> Submit Marks</>}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="bg-violet-50/50 rounded-xl p-4 border border-violet-100 space-y-3">
                                                                    <p className="text-xs text-gray-500">No rubrics configured for this session.</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Per-rubric marks are now inline in each student card ── */}
            </div>

            {/* Inline keyframe */}
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>
        </div>
    );
};

export default SessionDetailPage;
