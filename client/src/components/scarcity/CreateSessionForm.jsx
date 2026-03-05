// ============================================================
// CREATE SESSION FORM — Admin/Faculty Creates Evaluation Session
// ============================================================
// Multi-step wizard for creating a scarcity evaluation session.
// Step 1: Faculty selects students (targets) from person list
// Step 2: Configure session type, intent, mode, pool, schedule
// On submit, backend creates session + assigns selected students.
//
// Route: /sessions/create
// Access: Faculty, Admin
// ============================================================

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getYearLabel } from "../../utils/yearUtils";
import { listRubrics, attachRubricsToSession } from "../../services/rubricApi";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Calendar,
  Gauge,
  Target,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
  Users,
  Search,
  Check,
  X,
  UserCheck,
  GraduationCap,
  BookOpen,
  Sparkles,
} from "lucide-react";

// ============================================================
// SESSION TYPE & INTENT OPTIONS
// ============================================================
const SESSION_TYPES = [
  {
    value: "project_review",
    label: "Project Review",
    desc: "Review project progress and deliverables",
  },
  {
    value: "faculty_assessment",
    label: "Faculty Assessment",
    desc: "Faculty evaluating student contributions",
  },
  {
    value: "peer_evaluation",
    label: "Peer Evaluation",
    desc: "Students evaluating each other's work",
  },
];

const INTENTS = [
  { value: "growth", label: "Growth", desc: "Tracking improvement over time" },
  {
    value: "excellence",
    label: "Excellence",
    desc: "Identifying top performers",
  },
  {
    value: "leadership",
    label: "Leadership",
    desc: "Assessing leadership qualities",
  },
  {
    value: "comparative",
    label: "Comparative",
    desc: "Comparing entities (scarcity model)",
  },
];

const EVALUATION_MODES = [
  {
    value: "project_member",
    label: "Project Member",
    desc: "Evaluate members within a project",
  },
  {
    value: "cross_project",
    label: "Cross Project",
    desc: "Evaluate across multiple projects",
  },
  { value: "faculty", label: "Faculty", desc: "Faculty-level evaluation" },
  { value: "peer", label: "Peer", desc: "Peer-to-peer evaluation" },
];

// ============================================================
// CreateSessionForm Component — Multi-Step Wizard
// ============================================================
const CreateSessionForm = () => {
  const navigate = useNavigate();

  // ---------------------------------------------------------
  // WIZARD STEP STATE — 1: Select Students, 2: Configure Session, 3: Select Rubrics
  // ---------------------------------------------------------
  const [step, setStep] = useState(1);

  // ---------------------------------------------------------
  // RUBRIC STATE (Step 3) — SRS §4.1.4
  // Admin selects exactly 3 rubrics for the session.
  // ---------------------------------------------------------
  const [availableRubrics, setAvailableRubrics] = useState([]);
  const [rubricsLoading, setRubricsLoading] = useState(false);
  const [selectedRubrics, setSelectedRubrics] = useState(new Set());

  // ---------------------------------------------------------
  // STUDENT FETCH STATE
  // ---------------------------------------------------------
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");

  // ---------------------------------------------------------
  // SELECTED STUDENTS STATE
  // ---------------------------------------------------------
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ---------------------------------------------------------
  // FORM STATE (Step 2)
  // ---------------------------------------------------------
  const [form, setForm] = useState({
    sessionType: "project_review",
    intent: "comparative",
    evaluationMode: "project_member",
    // Pool size is auto-calculated from selected student count
    // SRS 4.1.3: 5 points per team member (2→10, 3→15, 4→20, etc.)
    poolSize: 0,
    windowStart: "",
    windowEnd: "",
  });

  // -------------------------------------------------------
  // POINTS_PER_MEMBER constant for SRS 4.1.3 formula
  // "3 members → 15 points, 4 members → 20 points" = 5 pts each
  // -------------------------------------------------------
  const POINTS_PER_MEMBER = 5;

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // ---------------------------------------------------------
  // FETCH RUBRICS (for step 3)
  // ---------------------------------------------------------
  useEffect(() => {
    const fetchRubrics = async () => {
      setRubricsLoading(true);
      try {
        const data = await listRubrics();
        setAvailableRubrics(Array.isArray(data) ? data : (data?.data || []));
      } catch (err) {
        console.warn("[CreateSessionForm] Failed to load rubrics:", err);
      } finally {
        setRubricsLoading(false);
      }
    };
    fetchRubrics();
  }, []);

  // ---------------------------------------------------------
  // FETCH STUDENTS ON MOUNT
  // ---------------------------------------------------------
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setStudentsLoading(true);
        setStudentsError(null);
        const response = await api.get("/persons", {
          params: { personType: "student", status: "active", limit: 200 },
        });
        if (response.data?.success) {
          setStudents(response.data.data || []);
        } else {
          setStudents(response.data?.data || []);
        }
      } catch (err) {
        setStudentsError(
          err.response?.data?.message ||
            err.message ||
            "Failed to load students.",
        );
      } finally {
        setStudentsLoading(false);
      }
    };
    fetchStudents();
  }, []);

  // ---------------------------------------------------------
  // AUTO-CALCULATE POOL SIZE when selected students change
  // SRS 4.1.3: Pool = selectedStudents × 5 points per member
  // Re-triggers whenever the student selection changes
  // ---------------------------------------------------------
  useEffect(() => {
    const autoPool = selectedIds.size * POINTS_PER_MEMBER;
    setForm((prev) => ({ ...prev, poolSize: autoPool }));
  }, [selectedIds.size]);

  // ---------------------------------------------------------
  // FILTERED + SEARCHED STUDENTS
  // ---------------------------------------------------------
  const filteredStudents = useMemo(() => {
    let list = students;
    if (departmentFilter) {
      list = list.filter((s) => s.departmentCode === departmentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.displayName || "").toLowerCase().includes(q) ||
          (s.departmentCode || "").toLowerCase().includes(q) ||
          (s.personId || s.person_id || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [students, searchQuery, departmentFilter]);

  // Unique departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set(
      students.map((s) => s.departmentCode).filter(Boolean),
    );
    return [...depts].sort();
  }, [students]);

  // ---------------------------------------------------------
  // SELECTION HANDLERS
  // ---------------------------------------------------------
  const toggleStudent = (personId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = filteredStudents.map((s) => s.personId || s.person_id);
    setSelectedIds(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // ---------------------------------------------------------
  // FORM HANDLERS (Step 2)
  // ---------------------------------------------------------
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation
    if (selectedIds.size === 0) {
      setError("Please select at least one student.");
      setStep(1);
      return;
    }
    if (!form.windowStart || !form.windowEnd) {
      setError(
        "Please set both start and end dates for the evaluation window.",
      );
      return;
    }
    if (new Date(form.windowStart) >= new Date(form.windowEnd)) {
      setError("End date must be after start date.");
      return;
    }
    // Pool size is auto-calculated — validate it's a positive number
    if (!form.poolSize || form.poolSize < 1) {
      setError("Pool size must be at least 1. Select more students.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await api.post("/scarcity/sessions/create", {
        sessionType: form.sessionType,
        intent: form.intent,
        evaluationMode: form.evaluationMode,
        poolSize: Number(form.poolSize),
        evaluationWindowStart: new Date(form.windowStart).toISOString(),
        evaluationWindowEnd: new Date(form.windowEnd).toISOString(),
        selectedStudentIds: [...selectedIds],
      });

      if (response.data?.success) {
        const newSessionId = response.data.data?.sessionId;

        // Attach rubrics if admin selected exactly 3 (SRS §4.1.4)
        if (newSessionId && selectedRubrics.size === 3) {
          try {
            await attachRubricsToSession(
              newSessionId,
              [...selectedRubrics],
              Number(form.poolSize),
            );
          } catch (rubricErr) {
            console.warn("[CreateSessionForm] Rubric attach failed (non-fatal):", rubricErr);
          }
        }

        setSuccess(
          `Session created with ${response.data.data?.selectedStudents || selectedIds.size} students!`,
        );
        // Navigate to the evaluation page for the new session
        // so faculty can immediately start allocating points
        setTimeout(
          () =>
            navigate(
              newSessionId
                ? `/scarcity/evaluate/${newSessionId}`
                : "/sessions/status",
            ),
          1500,
        );
      } else {
        setError(response.data?.error || "Failed to create session.");
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Failed to create session. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* PAGE HEADER */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => (step === 3 ? setStep(2) : step === 2 ? setStep(1) : navigate(-1))}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 2 ? "Back to Student Selection" : "Back"}
          </button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardCheck className="h-7 w-7 text-indigo-600" />
            Create Evaluation Session
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {step === 1
              ? "Step 1 of 3 — Select the students to evaluate"
              : step === 2
              ? "Step 2 of 3 — Configure session details and schedule"
              : "Step 3 of 3 — Select evaluation rubrics (choose exactly 3)"}
          </p>
        </div>

        {/* STEP INDICATOR */}
        <div className="flex items-center gap-2 mb-8">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              step === 1
                ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                : "bg-green-100 text-green-700 border border-green-200"
            }`}
          >
            {step > 1 ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Users className="h-3.5 w-3.5" />
            )}
            Select Students
            {selectedIds.size > 0 && (
              <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {selectedIds.size}
              </span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-gray-300" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              step === 2
                ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                : step > 2
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-gray-100 text-gray-400 border border-gray-200"
            }`}
          >
            {step > 2 ? <Check className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
            Assign Schedule
          </div>
          <ArrowRight className="h-4 w-4 text-gray-300" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              step === 3
                ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                : "bg-gray-100 text-gray-400 border border-gray-200"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Rubrics
            {selectedRubrics.size > 0 && (
              <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {selectedRubrics.size}/3
              </span>
            )}
          </div>
        </div>

        {/* ALERTS */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {success}
            </span>
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800">{error}</span>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 1 — SELECT STUDENTS */}
        {/* ====================================================== */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Search + Filter bar */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search input */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                {/* Department filter */}
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select/Deselect all */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  {filteredStudents.length} students found • {selectedIds.size}{" "}
                  selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </div>

            {/* Student list */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
              {studentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                  <span className="ml-3 text-sm text-gray-500">
                    Loading students...
                  </span>
                </div>
              ) : studentsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-600">{studentsError}</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-8 text-center">
                  <GraduationCap className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No students found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try adjusting your search or department filter
                  </p>
                </div>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto divide-y divide-gray-50">
                  {filteredStudents.map((student) => {
                    const id = student.personId || student.person_id;
                    const isSelected = selectedIds.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleStudent(id)}
                        className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors ${
                          isSelected
                            ? "bg-indigo-50/70 hover:bg-indigo-50"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        {/* Checkbox indicator */}
                        <div
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-indigo-600 border-indigo-600"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </div>

                        {/* Avatar circle */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {(student.displayName || student.display_name || "?")
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        {/* Student info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {student.displayName ||
                              student.display_name ||
                              "Unknown Student"}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {student.departmentCode ||
                              student.department_code ||
                              "—"}
                            {student.admissionYear || student.admission_year
                              ? ` • ${getYearLabel(student.admissionYear || student.admission_year) || `Batch ${student.admissionYear || student.admission_year}`}`
                              : ""}
                          </p>
                        </div>

                        {/* Status badge */}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">
                          {student.status || "active"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Next button */}
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size === 0) {
                  setError("Please select at least one student to continue.");
                  return;
                }
                setError(null);
                setStep(2);
              }}
              disabled={selectedIds.size === 0}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
            >
              <UserCheck className="h-4 w-4" />
              Continue with {selectedIds.size} Student
              {selectedIds.size !== 1 ? "s" : ""}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 2 — CONFIGURE SESSION + SCHEDULE */}
        {/* ====================================================== */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Selected students summary */}
            <div className="bg-indigo-50 rounded-2xl border border-indigo-200/50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCheck className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-indigo-900">
                    {selectedIds.size} Student
                    {selectedIds.size !== 1 ? "s" : ""} Selected
                  </p>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    These students will be the evaluation targets
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Change
              </button>
            </div>

            {/* SESSION TYPE */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-indigo-500" />
                Session Type
              </label>
              <div className="grid grid-cols-1 gap-2">
                {SESSION_TYPES.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      form.sessionType === opt.value
                        ? "border-indigo-300 bg-indigo-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="sessionType"
                      value={opt.value}
                      checked={form.sessionType === opt.value}
                      onChange={() => handleChange("sessionType", opt.value)}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* INTENT */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Evaluation Intent
              </label>
              <div className="grid grid-cols-2 gap-2">
                {INTENTS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                      form.intent === opt.value
                        ? "border-indigo-300 bg-indigo-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="intent"
                      value={opt.value}
                      checked={form.intent === opt.value}
                      onChange={() => handleChange("intent", opt.value)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </span>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* EVALUATION MODE */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Evaluation Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EVALUATION_MODES.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
                      form.evaluationMode === opt.value
                        ? "border-indigo-300 bg-indigo-50/50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="evaluationMode"
                      value={opt.value}
                      checked={form.evaluationMode === opt.value}
                      onChange={() => handleChange("evaluationMode", opt.value)}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </span>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* POOL SIZE + TIME WINDOW */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <div className="space-y-5">
                {/* Pool Size — Auto-calculated, read-only */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-purple-500" />
                    Scarcity Pool Size
                    <span className="text-xs font-normal text-gray-400">
                      (auto-calculated)
                    </span>
                  </label>
                  {/* Read-only display showing the calculated pool */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-purple-50 rounded-xl p-4 border border-purple-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-3xl font-bold text-purple-700">
                            {form.poolSize}
                            <span className="text-sm font-medium text-purple-400 ml-1">
                              points
                            </span>
                          </p>
                          <p className="text-xs text-purple-500 mt-1">
                            {selectedIds.size} student
                            {selectedIds.size !== 1 ? "s" : ""} ×{" "}
                            {POINTS_PER_MEMBER} points each
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">
                            SRS 4.1.3 Formula
                          </p>
                          <p className="text-xs text-purple-500 font-mono">
                            {selectedIds.size} × {POINTS_PER_MEMBER} ={" "}
                            {form.poolSize}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Each evaluator distributes {form.poolSize} total points
                    across {selectedIds.size} student
                    {selectedIds.size !== 1 ? "s" : ""}. Scarcity forces
                    deliberate trade-offs in scoring.
                  </p>
                </div>

                {/* Evaluation Window / Schedule */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Evaluation Schedule
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Start Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={form.windowStart}
                        onChange={(e) =>
                          handleChange("windowStart", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        End Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={form.windowEnd}
                        onChange={(e) =>
                          handleChange("windowEnd", e.target.value)
                        }
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* NEXT: Step 3 — Rubric Selection */}
            <button
              type="button"
              onClick={() => {
                if (!form.windowStart || !form.windowEnd) {
                  setError("Please set both start and end dates.");
                  return;
                }
                if (new Date(form.windowStart) >= new Date(form.windowEnd)) {
                  setError("End date must be after start date.");
                  return;
                }
                setError(null);
                setStep(3);
              }}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm shadow-lg shadow-indigo-200"
            >
              <BookOpen className="h-4 w-4" />
              Next: Select Rubrics
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* ====================================================== */}
        {/* STEP 3 — SELECT EVALUATION RUBRICS                     */}
        {/* SRS §4.1.4: Admin selects exactly 3 rubrics per session */}
        {/* ====================================================== */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Info notice */}
            <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4 flex gap-3">
              <Sparkles className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-sm text-indigo-700">
                <p className="font-medium mb-1">Rubric-Based Distribution (SRS §4.1.4)</p>
                <p className="text-xs text-indigo-600">
                  Select exactly <strong>3 rubrics</strong>. Pool ({form.poolSize} pts) is split equally
                  across all 3 — judges score each rubric separately. Skipping rubrics creates a
                  standard single-pool session.
                </p>
              </div>
            </div>

            {/* Per-rubric pool preview */}
            {selectedRubrics.size > 0 && (
              <div className="bg-purple-50 rounded-xl border border-purple-100 px-4 py-3 flex items-center justify-between">
                <p className="text-xs text-purple-700">
                  Per-rubric pool: <strong>{Math.floor(form.poolSize / 3)}</strong> pts each
                  {form.poolSize % 3 > 0 && `, first rubric gets +${form.poolSize % 3}`}
                </p>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    selectedRubrics.size === 3
                      ? "bg-green-100 text-green-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {selectedRubrics.size}/3 selected
                </span>
              </div>
            )}

            {/* Rubric cards */}
            {rubricsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin" />
                <span className="ml-3 text-sm text-gray-500">Loading rubrics...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {availableRubrics.map((rubric) => {
                  const rid = rubric.head_id;
                  const isSelected = selectedRubrics.has(rid);
                  const isDisabled = !isSelected && selectedRubrics.size >= 3;
                  return (
                    <button
                      key={rid}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        setSelectedRubrics((prev) => {
                          const next = new Set(prev);
                          if (next.has(rid)) next.delete(rid);
                          else if (next.size < 3) next.add(rid);
                          return next;
                        });
                      }}
                      className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? "border-indigo-300 bg-indigo-50/70 shadow-sm"
                          : isDisabled
                          ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                          : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className={`p-2 rounded-xl ${isSelected ? "bg-indigo-100" : "bg-gray-100"}`}>
                        <BookOpen className={`h-4 w-4 ${isSelected ? "text-indigo-600" : "text-gray-500"}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{rubric.head_name}</p>
                        {rubric.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{rubric.description}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {/* Skip rubrics — create standard session */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async (e) => {
                  setSelectedRubrics(new Set());
                  // Trigger form submit directly
                  await handleSubmit(e);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Skip Rubrics
              </button>

              {/* Create session with rubrics */}
              <button
                type="button"
                disabled={isSubmitting || selectedRubrics.size !== 3}
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Create with {selectedRubrics.size === 3 ? "3" : "?"} Rubrics
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CreateSessionForm;
