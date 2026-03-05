// ============================================================
// SESSION PLANNER PAGE — Password-gated faculty↔student assignment
// ============================================================
// Access: Admin + Faculty
// Password: bit!123 (verified server-side)
// Features:
//   - Faculty list (left)
//   - Students/Teams list (right)
//   - Click-to-assign flow
//   - Real-time status via Socket.IO
//   - Bidirectional eval status tracking
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Lock,
  Unlock,
  ArrowLeft,
  Users,
  UserCheck,
  UserX,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  GraduationCap,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Star,
  Trash2,
  Sparkles,
  Shield,
  Award,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { getYearLabel, getYearOfStudy, YEAR_CHIPS, YEAR_BADGE_COLORS } from "../../utils/yearUtils";
import { getBatchYearLabel } from "../../utils/batchHelper";
import { useSocket } from "../../contexts/SocketContext";
import {
  useDataChange
} from "../../hooks/useSocketEvent";
import AutoAssignModal from "./AutoAssignModal";
import {
  verifyPlannerPassword,
  getPlannerOverview,
  assignFaculty,
  checkExistingAssignments,
  unassignStudent,
  getAllStudentsWithInfo,
  suggestEvaluators,
  testAutoAssign,
  resetTestAssignments,
  finalizeSession,
  getSessionGroupDetail,
} from "../../services/sessionPlannerApi";

const ASSIGNMENT_STATUS = {
  assigned: {
    color: "#6B7280",
    bg: "rgba(107,114,128,0.08)",
    label: "Assigned",
    icon: Clock,
  },
  evaluation_done: {
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    label: "Faculty Evaluated",
    icon: CheckCircle2,
  },
  feedback_given: {
    color: "#D97706",
    bg: "rgba(217,119,6,0.08)",
    label: "Student Feedback",
    icon: Star,
  },
  completed: {
    color: "#059669",
    bg: "rgba(5,150,105,0.08)",
    label: "Completed",
    icon: CheckCircle2,
  },
  removed: {
    color: "#DC2626",
    bg: "rgba(220,38,38,0.08)",
    label: "Removed",
    icon: UserX,
  },
};

// getYearLabel, getYearOfStudy, YEAR_CHIPS, YEAR_BADGE_COLORS imported from yearUtils



// Helper: Format faculty scope for display (e.g., "CORE • ECE, MECH")
const formatScope = (scopes) => {
  if (!scopes || scopes.length === 0) return null;
  const tracks = {};
  scopes.forEach((s) => {
    if (!tracks[s.track_id]) tracks[s.track_id] = [];
    if (s.department_code) tracks[s.track_id].push(s.department_code);
  });
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(tracks).map(([trackId, depts]) => (
        <span
          key={trackId}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
        >
          {trackId}
          {depts.length > 0 && ` • ${depts.join(", ")}`}
        </span>
      ))}
    </div>
  );
};

const SessionPlannerPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams();

  // Auth gate
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Planner data
  const [overview, setOverview] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Assignment mode
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(null);

  // Filters
  const [studentSearch, setStudentSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [expandedFaculty, setExpandedFaculty] = useState(null);
  const [collapsedTeams, setCollapsedTeams] = useState(new Set()); // formation_ids that are collapsed

  // Mixed-year warning popup
  const [mixedYearWarn, setMixedYearWarn] = useState(false);
  // Conflict warning popup
  const [conflictWarn, setConflictWarn] = useState(false);
  const [conflictList, setConflictList] = useState([]);
  const [scopeWarn, setScopeWarn] = useState(false);
  const [incompatibleStudents, setIncompatibleStudents] = useState([]);

  // Auto-Assignment Suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestingFor, setSuggestingFor] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState(null);

  // Sibling sessions (within same group)
  const [siblingsessions, setSiblingCoreSessions] = useState([]);

  // Test Auto-Assignment State
  const [testAssigning, setTestAssigning] = useState(false);
  const [testResetting, setTestResetting] = useState(false);
  const [showAutoAssignModal, setShowAutoAssignModal] = useState(false);

  // Finalization State
  const [finalizing, setFinalizing] = useState(false);

  // Result notification modal
  const [resultModal, setResultModal] = useState(null); // { title, message, warnings, type }

  const { socket } = useSocket();

  // Load all initial data
  useDataChange("session_planner", () => authenticated && loadInitialData());

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      setAuthLoading(true);
      setAuthError("");
      await verifyPlannerPassword(password);
      setAuthenticated(true);
    } catch (err) {
      setAuthError(err.response?.data?.error || err.message || "Invalid password");
    } finally {
      setAuthLoading(false);
    }
  };

  const loadInitialData = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);
      const [overviewRes, studentsRes] = await Promise.all([
        getPlannerOverview(sessionId),
        getAllStudentsWithInfo(),
      ]);
      setOverview(overviewRes.data || null);
      setAllStudents(studentsRes.data || []);

      // Load sibling sessions if this session belongs to a group
      const sess = overviewRes.data?.session;
      if (sess?.group_id) {
        try {
          const groupRes = await getSessionGroupDetail(sess.group_id);
          const siblings = (groupRes.data?.sessions || []).filter(s => s.id !== sessionId);
          setSiblingCoreSessions(siblings);
        } catch { setSiblingCoreSessions([]); }
      } else {
        setSiblingCoreSessions([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load planner data");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (authenticated) loadInitialData();
  }, [authenticated, sessionId, loadInitialData]);

  // Socket listener for real-time scope updates
  useEffect(() => {
    if (!socket) return;

    const handleDataChange = (payload) => {
      // If any faculty scope is updated, we need to refresh our overview
      // to get the latest scope metadata for filtering
      if (payload.entityType === 'faculty_scope' && payload.action === 'updated') {
        console.log("[Socket] Faculty scope updated, refreshing planner...");
        loadInitialData();
      }
    };

    socket.on('data:changed', handleDataChange);
    return () => {
      socket.off('data:changed', handleDataChange);
    };
  }, [socket, loadInitialData]);

  // Auto-set year filter from session title (e.g. "Feb S1 - Batch 2027" or legacy "Feb S1 - Final Year")
  useEffect(() => {
    if (!overview?.session?.title) return;
    const title = overview.session.title;

    // New format: "... - Batch 2027 ..."
    const batchMatch = title.match(/Batch\s+(\d{4})/);
    if (batchMatch) {
      const batchYr = Number(batchMatch[1]);
      const label = getBatchYearLabel(batchYr);
      const LABEL_TO_CHIP = { "Final Year": "final", "3rd Year": "3rd", "2nd Year": "2nd", "1st Year": "1st" };
      if (label && LABEL_TO_CHIP[label]) {
        setYearFilter(LABEL_TO_CHIP[label]);
        return;
      }
    }

    // Legacy format: "... - Final Year ..."
    const YEAR_MAP = {
      "Final Year": "final",
      "3rd Year": "3rd",
      "2nd Year": "2nd",
      "1st Year": "1st",
    };
    for (const [label, filterId] of Object.entries(YEAR_MAP)) {
      if (title.includes(label)) {
        setYearFilter(filterId);
        return;
      }
    }
  }, [overview]);

  const handleSuggest = async (studentId) => {
    try {
      setSuggestingFor(studentId);
      setIsSuggesting(true); // Re-used as loading state for fetch
      setSuggestionError(null);
      setSuggestions([]);
      const res = await suggestEvaluators(sessionId, studentId);
      setSuggestions(res.data || []);
    } catch (err) {
      setSuggestionError(err.response?.data?.error || err.message || "Failed to fetch suggestions");
    } finally {
      setIsSuggesting(false);
      // Note: We keep suggestingFor set to show the modal with results
    }
  };

  const handleTestAutoAssign = () => {
    // Open the rubric + judge-count modal instead of window.confirm
    setShowAutoAssignModal(true);
  };

  const handleAutoAssignConfirm = async (rubricIds, minJudges) => {
    setShowAutoAssignModal(false);
    try {
      setTestAssigning(true);
      setError(null);
      const res = await testAutoAssign(sessionId, rubricIds, minJudges);
      await loadInitialData();
      // Build warnings list
      const warnings = (res.warnings || []).map(w => {
        if (typeof w === 'string') return { text: w, students: [] };
        if (w.type === 'unteamed_core') return {
          text: `${w.count} Core students have no team and were skipped`,
          students: (w.students || []).map(s => s.displayName || s.display_name || 'Unknown')
        };
        return { text: w.message || JSON.stringify(w), students: [] };
      });
      setResultModal({
        title: 'Auto-Assignment Complete',
        message: `Created ${res.count || 0} assignments${res.track ? ` for track: ${res.track}` : ''}.`,
        warnings,
        type: 'success'
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Test auto-assign failed");
    } finally {
      setTestAssigning(false);
    }
  };

  const handleResetTestAssignments = async () => {
    try {
      if (!window.confirm("Remove all test assignments for this session?")) return;
      setTestResetting(true);
      setError(null);
      const res = await resetTestAssignments(sessionId);
      await loadInitialData();
      setResultModal({
        title: 'Assignments Reset',
        message: res.message || 'Test assignments removed.',
        warnings: [],
        type: 'info'
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Reset failed");
    } finally {
      setTestResetting(false);
    }
  };

  const handleFinalizeSession = async () => {
    try {
      if (!window.confirm(
        "This will finalize the session:\n\n" +
        "• Freeze all judge credibility scores (snapshot)\n" +
        "• Calculate credibility-weighted final scores\n" +
        "• Update judge credibility for future sessions\n" +
        "• Lock the session — no further changes allowed\n\n" +
        "This action cannot be undone. Continue?"
      )) return;
      setFinalizing(true);
      setError(null);
      const res = await finalizeSession(sessionId);
      await loadInitialData();
      const warnings = [];
      if (res.firstSessionProtection) {
        warnings.push("First-session two-pass protection was applied — faculty credibility was computed within this session for fairer scoring.");
      }
      setResultModal({
        title: 'Session Finalized',
        message: res.message || 'Session finalized successfully!',
        warnings,
        type: 'success'
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Finalization failed");
    } finally {
      setFinalizing(false);
    }
  };

  const performAssignment = async (override = false) => {
    try {
      setAssigning(true);
      setError(null);
      await assignFaculty(
        sessionId,
        selectedStudents,
        selectedFaculty
      );
      setSelectedStudents([]);
      setMixedYearWarn(false);
      setConflictWarn(false);
      setScopeWarn(false); // Clear scope warning
      setConflictList([]);
      await loadInitialData();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedFaculty || selectedStudents.length === 0 || !sessionId) return;

    // Check mixed batch years
    const years = new Set(
      selectedStudents
        .map((id) => {
          const s = allStudents.find((st) => st.person_id === id);
          return s?.batch_year || (s?.admission_year ? s.admission_year + 4 : null);
        })
        .filter(Boolean)
    );
    if (years.size > 1 && !mixedYearWarn) {
      setMixedYearWarn(true);
      return;
    }

    // Check for existing assignments (Conflict Detection)
    if (!conflictWarn) {
      const conflicts = [];
      const blocked = [];

      for (const sId of selectedStudents) {
        try {
          const sInfo = allStudents.find(s => s.person_id === sId);
          const sName = sInfo?.display_name || "Unknown";

          const check = await checkExistingAssignments(sessionId, sId);
          const existing = check.data || [];

          // 1. Check BLOCKED: Already assigned to THIS faculty (and not completed)
          const sameJudge = existing.find(a => a.faculty_id === selectedFaculty);
          if (sameJudge && sameJudge.status !== 'completed') {
            blocked.push(sName);
            continue; // Don't add to conflicts if blocked
          }

          // 2. Check WARNING: Assigned to OTHER faculty (Multi-Judge)
          const otherFaculty = existing.filter(a => a.faculty_id !== selectedFaculty);
          if (otherFaculty.length > 0) {
            conflicts.push({
              studentId: sId,
              studentName: sName,
              existing: otherFaculty // Contains faculty_name, credibility_score, status
            });
          }
        } catch (e) {
          console.error("Conflict check failed", e);
        }
      }

      // If any blocked, stop immediately
      if (blocked.length > 0) {
        setError(`Cannot re-assign: ${blocked.join(", ")} already assigned to this faculty.`);
        return;
      }

      // If any conflicts, show popup
      if (conflicts.length > 0) {
        setConflictList(conflicts);
        setConflictWarn(true);
        return;
      }
    }

    // 3. Check for Scope Mismatch
    if (!scopeWarn) {
      const fInfo = overview?.faculty?.find(f => f.person_id === selectedFaculty);
      const incompatible = [];

      for (const sId of selectedStudents) {
        const s = allStudents.find(st => st.person_id === sId);
        const isAllowed = fInfo?.scopes?.some(scope => {
          const trackMatch = scope.track_name.toLowerCase() === s.track?.toLowerCase();
          const deptMatch = !scope.department_code || scope.department_code === s.department_code;
          return trackMatch && deptMatch;
        });

        if (!isAllowed) incompatible.push(s.display_name);
      }

      if (incompatible.length > 0) {
        setIncompatibleStudents(incompatible);
        setScopeWarn(true);
        return;
      }
    }

    await performAssignment();
  };

  const handleUnassign = async (assignmentId, studentId, facultyId) => {
    try {
      setRemoving(assignmentId);
      await unassignStudent(sessionId, studentId, facultyId);
      await loadInitialData();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to unassign");
    } finally {
      setRemoving(null);
    }
  };

  const toggleStudent = (studentId) => {
    // Find the student's info
    const student = allStudents.find(s => s.person_id === studentId);

    // If student has a team (formation_id), we toggle the WHOLE team
    if (student?.formation_id) {
      const teamMembers = allStudents
        .filter(s => s.formation_id === student.formation_id)
        .map(s => s.person_id);

      setSelectedStudents((prev) => {
        // Check if the clicked student is already selected
        const isSelected = prev.includes(studentId);

        if (isSelected) {
          // Deselect all team members
          return prev.filter(id => !teamMembers.includes(id));
        } else {
          // Select all team members (adding only those not already selected)
          const newSelection = [...prev];
          teamMembers.forEach(id => {
            if (!newSelection.includes(id)) newSelection.push(id);
          });
          return newSelection;
        }
      });
    } else {
      // No team - standard toggle
      setSelectedStudents((prev) =>
        prev.includes(studentId)
          ? prev.filter((id) => id !== studentId)
          : [...prev, studentId]
      );
    }
  };

  // Get assigned student IDs for filtering (used in showUnassignedOnly)
  const assignedStudentIds = new Set(
    (overview?.assignments || []).map((a) => a.student_id)
  );

  // Get assigned student IDs for CURRENT faculty only (for disabling)
  const assignedToCurrentFaculty = new Set(
    (overview?.assignments || [])
      .filter((a) => a.faculty_id === selectedFaculty)
      .map((a) => a.student_id)
  );

  // Filter students
  const filteredStudents = allStudents.filter((s) => {
    if (studentSearch && !s.display_name?.toLowerCase().includes(studentSearch.toLowerCase())) return false;
    if (trackFilter !== "all" && s.track !== trackFilter) return false;
    if (yearFilter !== "all") {
      const chip = YEAR_CHIPS.find((c) => c.id === yearFilter);
      if (chip) {
        const batchYr = s.batch_year || (s.admission_year ? s.admission_year + 4 : null);
        if (chip.matchBatch && batchYr) {
          if (!chip.matchBatch(batchYr)) return false;
        } else if (chip.matchYear) {
          const yr = getYearOfStudy(s.admission_year) || 0;
          if (!chip.matchYear(yr)) return false;
        }
      }
    }
    if (deptFilter !== "all" && (s.department_code || "").toLowerCase() !== deptFilter) return false;
    if (showUnassignedOnly && assignedStudentIds.has(s.person_id)) return false;

    // Faculty Scope Filter (Exclusive as requested: "show only their students")
    if (selectedFaculty) {
      const fInfo = overview?.faculty?.find(f => f.person_id === selectedFaculty);
      const isAllowed = fInfo?.scopes?.some(scope => {
        const trackMatch = scope.track_name.toLowerCase() === s.track?.toLowerCase();
        const deptMatch = !scope.department_code || scope.department_code === s.department_code;
        return trackMatch && deptMatch;
      });
      if (!isAllowed) return false;
    }

    return true;
  }).map(s => {
    // Merge scores from overview.students (which JOINs final_student_results)
    const overviewStudent = (overview?.students || []).find(os => os.person_id === s.person_id);
    if (overviewStudent) {
      return {
        ...s,
        normalized_score: overviewStudent.normalized_score ?? s.normalized_score,
        confidence_score: overviewStudent.confidence_score ?? s.confidence_score,
        aggregated_score: overviewStudent.aggregated_score ?? s.aggregated_score,
      };
    }
    return s;
  });

  // Unique departments for filter chips
  const uniqueDepts = [...new Set(allStudents.map((s) => s.department_code).filter(Boolean))].sort();

  // Group filtered students by team for collapsed team display (Option C)
  const teamGroupsForDisplay = (() => {
    const teamMap = new Map();
    const solo = [];
    for (const s of filteredStudents) {
      if (s.formation_id) {
        if (!teamMap.has(s.formation_id)) {
          teamMap.set(s.formation_id, { formation_id: s.formation_id, title: s.team_title || `Team ${s.formation_id.slice(0, 6)}`, students: [] });
        }
        teamMap.get(s.formation_id).students.push(s);
      } else {
        solo.push(s);
      }
    }
    return { teams: Array.from(teamMap.values()), solo };
  })();

  // Render a single student row (used by both team groups and solo)
  const renderStudentRow = (s) => {
    const isAssignedToCurrent = assignedToCurrentFaculty.has(s.person_id);
    const isChosen = selectedStudents.includes(s.person_id);
    const myAssignments = (overview?.assignments || []).filter(a => a.student_id === s.person_id);

    return (
      <button
        key={s.person_id}
        onClick={() => selectedFaculty && !isAssignedToCurrent && toggleStudent(s.person_id)}
        disabled={!selectedFaculty || isAssignedToCurrent}
        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${isChosen
          ? "bg-violet-50 border border-violet-200"
          : isAssignedToCurrent
            ? "opacity-40 border border-transparent"
            : selectedFaculty
              ? "hover:bg-gray-50 border border-transparent cursor-pointer"
              : "opacity-60 border border-transparent cursor-default"
          }`}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: isChosen ? "#7C3AED" : isAssignedToCurrent ? "#059669" : "#9CA3AF" }}
        >
          {isAssignedToCurrent ? <UserCheck size={14} /> : (s.display_name?.[0] || "?")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 truncate">{s.display_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: s.track === 'core' ? 'rgba(124,58,237,0.1)' : s.track === 'premium' ? 'rgba(217,119,6,0.1)' : s.track === 'it_core' ? 'rgba(5,150,105,0.1)' : 'rgba(107,114,128,0.1)',
                color: s.track === 'core' ? '#7C3AED' : s.track === 'premium' ? '#D97706' : s.track === 'it_core' ? '#059669' : '#6B7280',
              }}>
              {s.track === 'core' ? 'CORE' : s.track === 'it_core' ? 'IT-CORE' : s.track === 'premium' ? 'PREMIUM' : 'NO TRACK'}
            </span>
            {(() => { const yLabel = s.batch_year ? getBatchYearLabel(s.batch_year) : getYearLabel(s.admission_year); return yLabel; })() && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: YEAR_BADGE_COLORS[s.batch_year ? getBatchYearLabel(s.batch_year) : getYearLabel(s.admission_year)]?.bg || "rgba(107,114,128,0.08)",
                  color: YEAR_BADGE_COLORS[s.batch_year ? getBatchYearLabel(s.batch_year) : getYearLabel(s.admission_year)]?.color || "#6B7280",
                }}>
                {s.batch_year ? getBatchYearLabel(s.batch_year) : getYearLabel(s.admission_year)}
              </span>
            )}
            {s.department_code && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase"
                style={{ background: "rgba(107,114,128,0.08)", color: "#6B7280" }}>
                {s.department_code}
              </span>
            )}
          </div>
          {/* Display score (always /5) */}
          {overview?.session?.status === 'FINALIZED' && (s.display_score != null || s.normalized_score != null) && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Final: {Number(s.display_score ?? s.normalized_score).toFixed(2)} / 5
              </span>
              {s.confidence_score != null && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${Number(s.confidence_score) > 0.7
                  ? "bg-green-50 text-green-700 border-green-200"
                  : Number(s.confidence_score) > 0.4
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-red-50 text-red-700 border-red-200"}`}>
                  {Number(s.confidence_score) > 0.7 ? "High Conf." : Number(s.confidence_score) > 0.4 ? "Moderate" : "Needs Review"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isAssignedToCurrent && (
            <button onClick={(e) => { e.stopPropagation(); handleSuggest(s.person_id); }}
              className="p-1.5 rounded-full hover:bg-violet-100 text-violet-600 transition-colors" title="Suggest Evaluators">
              <Sparkles size={14} />
            </button>
          )}
          <div className="flex flex-col items-end">
            {isAssignedToCurrent && (
              <span className="text-[10px] text-green-600 font-medium flex items-center gap-1 mb-1">
                <UserCheck size={12} /> Assigned
              </span>
            )}
            {!isAssignedToCurrent && isChosen && (
              <CheckCircle2 size={18} className="text-violet-500 shrink-0 mb-1" />
            )}
            <div className="flex flex-col items-end gap-1 mt-1">
              {myAssignments.map(a => {
                const facCred = parseFloat(a.faculty_display_score ?? 1.0);
                const credColor = facCred >= 0.70 ? 'text-green-600' : facCred >= 0.40 ? 'text-amber-600' : 'text-red-500';
                return (
                  <div key={a.id} className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                      {a.faculty_id === selectedFaculty ? "You" : a.faculty_name}
                      <span className={`${credColor} font-medium`}>★{facCred.toFixed(2)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </button>
    );
  };

  // Group assignments by faculty
  const facultyAssignments = {};
  (overview?.assignments || []).forEach((a) => {
    if (!facultyAssignments[a.faculty_id]) {
      facultyAssignments[a.faculty_id] = {
        faculty_name: a.faculty_name,
        faculty_id: a.faculty_id,
        students: [],
      };
    }
    facultyAssignments[a.faculty_id].students.push(a);
  });

  // Helper: Window Status
  const getWindowStatus = () => {
    if (!overview?.session?.session_week_start || !overview?.session?.session_week_end) return null;
    const now = new Date();
    const start = new Date(overview.session.session_week_start);
    const end = new Date(overview.session.session_week_end);
    end.setHours(23, 59, 59, 999);

    if (now < start) return { type: 'upcoming', message: `Planning opens on ${start.toLocaleDateString()}` };
    if (now > end) return { type: 'closed', message: `Planning closed on ${end.toLocaleDateString()}` };

    const diff = end - now;
    if (diff > 0 && diff < 86400000) return { type: 'closing_soon', message: `⚠️ Planning closes today at midnight!` };

    return { type: 'active' };
  };

  // ── PASSWORD GATE ──
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div
          className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8"
          style={{ border: "1px solid rgba(124,58,237,0.15)" }}
        >
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: "rgba(124,58,237,0.08)" }}
            >
              <Lock size={28} className="text-violet-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Session Planner</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter the planner password to continue
            </p>
          </div>

          <form onSubmit={handleAuth}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password..."
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 mb-3"
            />
            {authError && (
              <p className="text-red-500 text-xs mb-3">{authError}</p>
            )}
            <button
              type="submit"
              disabled={!password || authLoading}
              className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: "#7C3AED" }}
            >
              {authLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Unlock size={18} />
              )}
              {authLoading ? "Verifying..." : "Enter Planner"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── NO SESSION ID ──
  if (!sessionId) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          No Session Selected
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          Navigate to a session first, then open the planner.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  // ── MAIN PLANNER UI ──
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div
        className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30"
        style={{ borderColor: "rgba(124,58,237,0.1)" }}
      >
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 truncate flex items-center gap-2">
            Session Planner
            {overview?.session?.track && (() => {
              const TRACK_BADGE = {
                core: { bg: "bg-green-100", text: "text-green-700", label: "Core" },
                it_core: { bg: "bg-indigo-100", text: "text-indigo-700", label: "IT & Core" },
                premium: { bg: "bg-amber-100", text: "text-amber-700", label: "Premium" },
              };
              const t = TRACK_BADGE[overview.session.track] || TRACK_BADGE.core;
              return (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.bg} ${t.text}`}>
                  {t.label}
                </span>
              );
            })()}
          </h1>
          <p className="text-xs text-gray-400">
            Session: {sessionId?.slice(0, 8)}…
            {overview?.session?.title ? ` • ${overview.session.title}` : ""}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {overview?.session?.status && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${overview.session.status === 'FINALIZED'
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
                  }`}
              >
                {overview.session.status === 'FINALIZED' ? <Lock size={10} /> : <Unlock size={10} />}
                {overview.session.status}
              </span>
            )}
            {/* Sibling session tabs */}
            {siblingsessions.length > 0 && siblingsessions.map((sib) => {
              const STRACK = {
                core: { bg: "rgba(5,150,105,0.08)", color: "#059669", label: "Core" },
                it_core: { bg: "rgba(99,102,241,0.08)", color: "#6366F1", label: "IT & Core" },
                premium: { bg: "rgba(217,119,6,0.08)", color: "#D97706", label: "Premium" },
              };
              const st = STRACK[sib.track] || STRACK.core;
              return (
                <button
                  key={sib.id}
                  onClick={() => navigate(`/session-planner/${sib.id}`)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors hover:opacity-80"
                  style={{ background: st.bg, color: st.color, borderColor: st.color }}
                  title={`Switch to ${st.label} session`}
                >
                  → {st.label}
                </button>
              );
            })}
          </div>
        </div>
        {user?.role === "admin" && (
          <div className="flex items-center gap-2 mr-2">
            {overview?.session?.status !== 'FINALIZED' && (
              <>
                <button
                  onClick={handleTestAutoAssign}
                  disabled={testAssigning || testResetting || loading || finalizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Sparkles size={14} className={testAssigning ? "animate-pulse" : ""} />
                  {testAssigning ? "Assigning..." : "Test Auto-Assign"}
                </button>
                <button
                  onClick={handleResetTestAssignments}
                  disabled={testAssigning || testResetting || loading || finalizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} className={testResetting ? "animate-pulse" : ""} />
                  {testResetting ? "Resetting..." : "Reset Test"}
                </button>
              </>
            )}
            {overview?.session?.status !== 'FINALIZED' && (
              <button
                onClick={handleFinalizeSession}
                disabled={testAssigning || testResetting || loading || finalizing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Shield size={14} className={finalizing ? "animate-pulse" : ""} />
                {finalizing ? "Finalizing..." : "Finalize Session"}
              </button>
            )}
          </div>
        )}

        <button
          onClick={loadInitialData}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── WEEKLY WINDOW STATUS BANNER ── */}
      {(() => {
        const status = getWindowStatus();
        if (status && status.type !== 'active') {
          const colors = {
            upcoming: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", icon: Clock },
            closed: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200", icon: Lock },
            closing_soon: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100", icon: AlertCircle }
          };
          const style = colors[status.type];
          const Icon = style.icon;
          return (
            <div className={`px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 border-b ${style.bg} ${style.text} ${style.border}`}>
              <Icon size={14} />
              {status.message}
            </div>
          );
        }
        return null; // Don't render if active or no date
      })()}

      {/* ── FINALIZED SESSION BANNER ── */}
      {overview?.session?.status === 'FINALIZED' && (
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                <Shield size={14} className="text-emerald-700" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800">Session Finalized — Results Frozen</p>
                <p className="text-[10px] text-emerald-600">
                  Credibility-weighted scores are locked. Judge credibility updated for future sessions.
                  {overview.session.finalized_at && (
                    <> • Sealed {new Date(overview.session.finalized_at).toLocaleString()}</>
                  )}
                </p>
              </div>
            </div>
            {(() => {
              const scored = (overview?.students || []).filter(s => s.normalized_score != null);
              const highConf = scored.filter(s => Number(s.confidence_score) > 0.7).length;
              const medConf = scored.filter(s => Number(s.confidence_score) > 0.4 && Number(s.confidence_score) <= 0.7).length;
              const lowConf = scored.filter(s => Number(s.confidence_score) <= 0.4).length;
              return scored.length > 0 ? (
                <div className="flex items-center gap-3 text-[10px] font-semibold">
                  <span className="text-emerald-700"><Award size={12} className="inline mr-0.5" />{scored.length} scored</span>
                  {highConf > 0 && <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">{highConf} High</span>}
                  {medConf > 0 && <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">{medConf} Mod</span>}
                  {lowConf > 0 && <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full">{lowConf} Low</span>}
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {error && (
        <div
          className="mx-4 mt-4 p-3 rounded-lg flex items-start gap-2 text-sm"
          style={{
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.15)",
            color: "#991B1B",
          }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex items-center justify-center mt-20">
          <Loader2 className="animate-spin text-violet-500" size={32} />
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── LEFT: Faculty & Their Assignments ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <GraduationCap size={16} className="text-violet-500" />
              Faculty ({overview?.faculty?.length || 0})
            </h3>
            <div className="space-y-2">
              {(overview?.faculty || []).map((f) => {
                const isSelected = selectedFaculty === f.person_id;
                const fAssignments =
                  facultyAssignments[f.person_id]?.students || [];
                const isExpanded = expandedFaculty === f.person_id;
                return (
                  <div
                    key={f.person_id}
                    className="rounded-xl bg-white overflow-hidden transition-all"
                    style={{
                      border: `2px solid ${isSelected ? "#7C3AED" : "#E5E7EB"}`,
                      boxShadow: isSelected
                        ? "0 0 0 3px rgba(124,58,237,0.1)"
                        : "none",
                    }}
                  >
                    <button
                      onClick={() => {
                        setSelectedFaculty(
                          isSelected ? null : f.person_id
                        );
                        setSelectedStudents([]);
                        setExpandedFaculty(
                          isExpanded ? null : f.person_id
                        );
                      }}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{
                          background: isSelected ? "#7C3AED" : "#6B7280",
                        }}
                      >
                        {f.display_name?.[0] || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {f.display_name}
                          </p>
                          {f.credibility_score !== undefined && f.credibility_score !== null ? (
                            (() => {
                              const ds = parseFloat(f.display_score ?? f.credibility_score);
                              return (
                                <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                                  ds >= 0.70
                                    ? 'bg-green-50 border border-green-100 text-green-600'
                                    : ds >= 0.40
                                      ? 'bg-amber-50 border border-amber-100 text-amber-600'
                                      : 'bg-red-50 border border-red-100 text-red-600'
                                }`}>
                                  <Star size={10} className="fill-current" />
                                  {ds.toFixed(2)}
                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-[10px] font-medium text-gray-400 shrink-0">
                              <Star size={10} className="fill-current" />
                              New
                            </div>
                          )}
                        </div>

                        {formatScope(f.scopes)}
                        <p className="text-xs text-gray-400">
                          {fAssignments.length} student
                          {fAssignments.length !== 1 ? "s" : ""} assigned
                        </p>
                      </div>
                      {
                        fAssignments.length > 0 && (
                          isExpanded ? (
                            <ChevronUp size={16} className="text-gray-400" />
                          ) : (
                            <ChevronDown size={16} className="text-gray-400" />
                          )
                        )
                      }
                    </button>

                    {/* Expanded assignments */}
                    {isExpanded && fAssignments.length > 0 && (
                      <div className="px-3 pb-3 space-y-1">
                        {fAssignments.map((a) => {
                          const st = ASSIGNMENT_STATUS[a.status] || ASSIGNMENT_STATUS.assigned;
                          const StIcon = st.icon;
                          return (
                            <div
                              key={a.id}
                              className="flex flex-col p-2 rounded-lg bg-gray-50 text-sm"
                            >
                              <div className="flex items-center gap-2 w-full">
                                <StIcon
                                  size={14}
                                  style={{ color: st.color }}
                                />
                                <span className="flex-1 truncate text-gray-700">
                                  {a.student_name || a.student_id?.slice(0, 8)}
                                </span>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{
                                    background: st.bg,
                                    color: st.color,
                                  }}
                                >
                                  {st.label}
                                </span>
                                {(a.status === "assigned" &&
                                  (user.role === "admin" ||
                                    user.personId === f.person_id ||
                                    user.personId === a.assigned_by)) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnassign(a.id, a.student_id, a.faculty_id);
                                      }}
                                      disabled={removing === a.id}
                                      className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                                    >
                                      {removing === a.id ? (
                                        <Loader2
                                          size={14}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <Trash2 size={14} />
                                      )}
                                    </button>
                                  )}
                              </div>

                              {/* Assigned by info */}
                              {a.assigned_by_name && (
                                <div className="flex items-center gap-1 mt-1 ml-6 text-[10px] text-gray-400">
                                  <span>Assigned by {a.assigned_by_name}</span>
                                </div>
                              )}
                              {/* Other evaluators for same student */}
                              {(() => {
                                const otherEvals = (overview?.assignments || []).filter(
                                  oa => oa.student_id === a.student_id && oa.faculty_id !== f.person_id
                                );
                                if (otherEvals.length === 0) return null;
                                return (
                                  <div className="flex items-center gap-1 mt-1 ml-6 text-[10px] text-gray-400">
                                    <span>Also: {otherEvals.map(oa => oa.faculty_name || oa.faculty_id?.slice(0,8)).join(', ')}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Students/Teams List ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Users size={16} className="text-violet-500" />
              Students ({filteredStudents.length})
            </h3>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="relative flex-1 min-w-[160px]">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-violet-300"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnassignedOnly}
                  onChange={(e) => setShowUnassignedOnly(e.target.checked)}
                  className="accent-violet-600"
                />
                Unassigned only
              </label>
            </div>

            {/* Color-coded track filter chips */}
            <div className="flex gap-2 mb-3">
              {[
                { id: "all", label: "All", color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
                { id: "core", label: "Core", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
                { id: "it_core", label: "IT / IT-Core", color: "#059669", bg: "rgba(5,150,105,0.08)" },
                { id: "premium", label: "Premium", color: "#D97706", bg: "rgba(217,119,6,0.08)" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrackFilter(t.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: trackFilter === t.id ? t.color : t.bg,
                    color: trackFilter === t.id ? "white" : t.color,
                    border: `1.5px solid ${trackFilter === t.id ? t.color : "transparent"}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Year filter chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {YEAR_CHIPS.map((y) => (
                <button
                  key={y.id}
                  onClick={() => setYearFilter(y.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: yearFilter === y.id ? y.color : y.bg,
                    color: yearFilter === y.id ? "white" : y.color,
                    border: `1.5px solid ${yearFilter === y.id ? y.color : "transparent"}`,
                  }}
                >
                  {y.label}
                </button>
              ))}
            </div>

            {/* Department filter chips */}
            {uniqueDepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setDeptFilter("all")}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={{
                    background: deptFilter === "all" ? "#6B7280" : "rgba(107,114,128,0.08)",
                    color: deptFilter === "all" ? "white" : "#6B7280",
                    border: `1.5px solid ${deptFilter === "all" ? "#6B7280" : "transparent"}`,
                  }}
                >
                  All Depts
                </button>
                {uniqueDepts.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDeptFilter(d.toLowerCase())}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all uppercase"
                    style={{
                      background: deptFilter === d.toLowerCase() ? "#374151" : "rgba(55,65,81,0.06)",
                      color: deptFilter === d.toLowerCase() ? "white" : "#374151",
                      border: `1.5px solid ${deptFilter === d.toLowerCase() ? "#374151" : "transparent"}`,
                    }}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Student list — grouped by team */}
            <div className="space-y-1 max-h-[60vh] overflow-y-auto rounded-xl border border-gray-100 p-2 bg-white">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No students match your filters
                </p>
              ) : (
                <>
                  {/* Team groups */}
                  {teamGroupsForDisplay.teams.map((team) => {
                    const isCollapsed = collapsedTeams.has(team.formation_id);
                    const toggleCollapse = () => {
                      setCollapsedTeams(prev => {
                        const next = new Set(prev);
                        if (next.has(team.formation_id)) next.delete(team.formation_id);
                        else next.add(team.formation_id);
                        return next;
                      });
                    };
                    return (
                      <div key={team.formation_id} className="mb-2">
                        {/* Team header — clickable to collapse */}
                        <button
                          onClick={toggleCollapse}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors bg-violet-50 hover:bg-violet-100 border border-violet-100"
                        >
                          <Users size={13} className="text-violet-500 shrink-0" />
                          <span className="text-xs font-bold text-violet-700 flex-1 truncate">{team.title}</span>
                          <span className="text-[10px] text-violet-400 font-medium">{team.students.length} members</span>
                          {isCollapsed ? <ChevronDown size={14} className="text-violet-400" /> : <ChevronUp size={14} className="text-violet-400" />}
                        </button>
                        {/* Team members (collapsed = hidden) */}
                        {!isCollapsed && (
                          <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-violet-100 pl-2">
                            {team.students.map((s) => renderStudentRow(s))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Solo students */}
                  {teamGroupsForDisplay.solo.length > 0 && teamGroupsForDisplay.teams.length > 0 && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="h-px flex-1 bg-gray-100" />
                      <span className="text-[10px] text-gray-400 font-medium">Individual Students</span>
                      <div className="h-px flex-1 bg-gray-100" />
                    </div>
                  )}
                  {teamGroupsForDisplay.solo.map((s) => renderStudentRow(s))}
                </>
              )}
            </div>

            {/* Assign action bar */}
            {
              selectedFaculty && selectedStudents.length > 0 && (
                <div
                  className="mt-3 p-3 rounded-xl flex items-center gap-3"
                  style={{
                    background: "rgba(124,58,237,0.06)",
                    border: "1px solid rgba(124,58,237,0.15)",
                  }}
                >
                  <div className="flex-1 text-sm text-violet-700">
                    Assign{" "}
                    <strong>{selectedStudents.length}</strong> student
                    {selectedStudents.length > 1 ? "s" : ""} to{" "}
                    <strong>
                      {overview?.faculty?.find(
                        (f) => f.person_id === selectedFaculty
                      )?.display_name || "faculty"}
                    </strong>
                  </div>
                  <button
                    onClick={() => setSelectedStudents([])}
                    className="p-2 rounded-lg hover:bg-violet-100 text-violet-500"
                  >
                    <X size={16} />
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={assigning}
                    className="px-4 py-2 rounded-lg font-semibold text-white text-sm flex items-center gap-2 disabled:opacity-50"
                    style={{ background: "#7C3AED" }}
                  >
                    {assigning ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <UserCheck size={16} />
                    )}
                    Assign
                  </button>

                    {/* ── MIXED-YEAR WARNING POPUP (outside button to prevent event bubbling) ── */}
                    {mixedYearWarn && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                        <div
                          className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
                          style={{ border: "1px solid rgba(217,119,6,0.2)" }}
                        >
                          <div className="text-center mb-4">
                            <div
                              className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                              style={{ background: "rgba(217,119,6,0.1)" }}
                            >
                              <AlertCircle size={28} className="text-amber-600" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">
                              Mixed Year Students
                            </h3>
                            <p className="text-sm text-gray-500 mt-2">
                              You are selecting students from <strong>different years</strong> for this assignment.
                              Are you sure you want to proceed?
                            </p>
                            {/* Show which years are selected */}
                            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                              {[...new Set(
                                selectedStudents
                                  .map((id) => {
                                    const s = allStudents.find((st) => st.person_id === id);
                                    return s?.batch_year || (s?.admission_year ? s.admission_year + 4 : null);
                                  })
                                  .filter(Boolean)
                              )].map((by) => {
                                const label = getBatchYearLabel(by);
                                const style = YEAR_BADGE_COLORS[label] || {};
                                return (
                                  <span
                                    key={by}
                                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: style.bg || "rgba(107,114,128,0.08)", color: style.color || "#6B7280" }}
                                  >
                                    {label ? `${label} (Batch ${by})` : `Batch ${by}`}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setMixedYearWarn(false)}
                              className="flex-1 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                // Allow override — proceed with assignment
                                handleAssign();
                              }}
                              className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-colors text-sm"
                              style={{ background: "#D97706" }}
                            >
                              Assign Anyway
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              )
            }

            {/* ── CONFLICT WARNING POPUP ── */}
            {
              conflictWarn && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" style={{ border: "1px solid rgba(124,58,237,0.2)" }}>
                    <div className="text-center mb-4">
                      <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-violet-600" style={{ background: "rgba(124,58,237,0.1)" }}>
                        <Users size={28} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">Multi-Judge Assignment</h3>
                      <p className="text-sm text-gray-500 mt-2">
                        The following students already have assigned auditors. Assigning again will add a <strong>secondary evaluator</strong>.
                      </p>
                      <div className="mt-3 max-h-40 overflow-y-auto text-left space-y-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        {conflictList.map((c) => (
                          <div key={c.studentId} className="text-xs">
                            <span className="font-semibold text-gray-800">{c.studentName}</span>
                            <span className="text-gray-400"> is with </span>
                            <div className="pl-2 border-l-2 border-violet-200 mt-1 space-y-2">
                              {c.existing.map(e => (
                                <div key={e.id} className="bg-white p-2 rounded border border-gray-100 shadow-sm">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-violet-700">{e.faculty_name}</span>
                                    <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                                      (() => { const ds = parseFloat(e.display_score ?? e.credibility_score ?? 1.0); return ds >= 0.70
                                        ? 'bg-green-50 text-green-700 border-green-100'
                                        : ds >= 0.40
                                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                                          : 'bg-red-50 text-red-700 border-red-100'; })()
                                    }`}>
                                      <Star size={8} className="fill-current" />
                                      {parseFloat(e.display_score ?? e.credibility_score ?? 1.0).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-500">
                                    <span>📅 {overview?.session?.session_date ? new Date(overview.session.session_date).toLocaleDateString() : "Date TBD"}</span>
                                    <span>⏰ {overview?.session?.session_time || "Time TBD"}</span>
                                    <span className="col-span-2">📍 {overview?.session?.venue || "Venue TBD"}</span>
                                  </div>
                                  <div className="mt-1 text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                                    Status: {e.status.replace('_', ' ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setConflictWarn(false)} className="flex-1 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors text-sm">
                        Cancel
                      </button>
                      <button onClick={performAssignment} className="flex-1 py-2.5 rounded-xl font-semibold text-white transition-colors text-sm" style={{ background: "#7C3AED" }}>
                        Confirm Addition
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            {/* ── SCOPE MISMATCH WARNING POPUP ── */}
            {scopeWarn && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6"
                  style={{ border: "1px solid rgba(220,38,38,0.2)" }}
                >
                  <div className="text-center mb-4">
                    <div
                      className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center text-red-600"
                      style={{ background: "rgba(220,38,38,0.1)" }}
                    >
                      <AlertCircle size={28} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Scope Mismatch
                    </h3>
                    <div className="text-sm text-gray-500 mt-2">
                      The following students are <strong>outside</strong> this faculty&apos;s evaluation setup:
                    </div>
                    <div className="mt-2 text-[11px] text-red-600 font-medium bg-red-50 p-2 rounded border border-red-100 max-h-32 overflow-y-auto">
                      {incompatibleStudents.join(", ")}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3 italic">
                      Faculty must update their track/department scope to evaluate these students.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <button
                      onClick={() => navigate('/scope/setup')}
                      className="w-full py-2.5 rounded-xl font-semibold text-white transition-colors text-sm flex items-center justify-center gap-2"
                      style={{ background: "#7C3AED" }}
                    >
                      <UserCheck size={16} />
                      Go to Scope Setup
                    </button>
                    <button
                      onClick={() => setScopeWarn(false)}
                      className="w-full py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── MIXED-YEAR WARNING POPUP (Inside Button Handling) ── */}
            {/* Note: This is now duplicative if we moved handleAssign logic inside performAssignment, but we kept handleAssign wrapper. */}

            {/* Hint */}
            {
              !selectedFaculty && (
                <p className="text-xs text-gray-400 text-center mt-4 uppercase tracking-widest font-bold">
                  Select a faculty member to filter students
                </p>
              )
            }
          </div>
        </div >
      )
      }

      {/* ── SUGGESTIONS MODAL ── */}
      {suggestingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="text-violet-500" size={18} />
                Suggested Evaluators
              </h3>
              <button
                onClick={() => setSuggestingFor(null)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-0 overflow-y-auto">
              {isSuggesting ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="animate-spin text-violet-500 mb-2" size={32} />
                  <p className="text-sm text-gray-500">Processing signals...</p>
                </div>
              ) : suggestionError ? (
                <div className="p-6 text-center text-red-500 text-sm">
                  {suggestionError}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No suitable suggestions found.
                </div>
              ) : (
                <div className="divide-y">
                  {suggestions.map((sug, idx) => (
                    <div key={sug.facultyId} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{idx + 1}. {sug.displayName}</span>
                          <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">
                            {(sug.scores.total * 100).toFixed(0)}% Match
                          </span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-gray-500">
                          <span title="Current Workload">Load: {sug.metrics?.workload || 0}</span>
                          <span>•</span>
                          <span title={`Credibility: ${Number(sug.metrics?.credibility || 1).toFixed(2)}`}>Cred: {Number(sug.metrics?.credibility || 1).toFixed(2)}</span>
                          <span>•</span>
                          <span title="Projected Team Balance" className={sug.scores.balance > 0.5 ? "text-green-600" : "text-amber-600"}>
                            {sug.metrics?.projectedStdev < 0.15 ? "Balanced" : "Skewed"} ({Number(sug.metrics?.projectedStdev || 0).toFixed(2)})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedFaculty(sug.facultyId);
                          setSelectedStudents([suggestingFor]);
                          setSuggestingFor(null);
                        }}
                        className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-semibold rounded-lg hover:bg-violet-100 border border-violet-200"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* AUTO-ASSIGN MODAL — Rubric + Judge Selection           */}
      {/* SRS §4.1.4 + §4.2                                      */}
      {/* ====================================================== */}
      <AutoAssignModal
        isOpen={showAutoAssignModal}
        poolSize={overview?.session?.pool_size || 0}
        onConfirm={handleAutoAssignConfirm}
        onClose={() => setShowAutoAssignModal(false)}
      />

      {/* ====================================================== */}
      {/* RESULT NOTIFICATION MODAL                               */}
      {/* ====================================================== */}
      {resultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in">
            {/* Header bar */}
            <div className={`px-6 py-4 flex items-center gap-3 ${
              resultModal.type === 'success' ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-blue-50 border-b border-blue-100'
            }`}>
              <div className={`p-2 rounded-full ${
                resultModal.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {resultModal.type === 'success' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{resultModal.title}</h3>
              <button onClick={() => setResultModal(null)} className="ml-auto p-1 rounded-lg hover:bg-black/5 transition">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-gray-700 text-[15px] leading-relaxed">{resultModal.message}</p>

              {resultModal.warnings?.length > 0 && (
                <div className="space-y-3">
                  {resultModal.warnings.map((w, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle size={15} className="text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-amber-800">{w.text}</span>
                      </div>
                      {w.students?.length > 0 && (
                        <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                          {w.students.map((name, j) => (
                            <span key={j} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                              <GraduationCap size={11} className="mr-1" />
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setResultModal(null)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition shadow-sm ${
                  resultModal.type === 'success'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default SessionPlannerPage;
