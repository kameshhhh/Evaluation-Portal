// ============================================================
// ACTIVITY LOG — Admin Audit & Login Activity + Evaluation Tracker
// ============================================================
// Two sub-views:
//   1. Login Activity — existing login audit trail (untouched)
//   2. Evaluation Tracker — student evaluation progress, GitHub tokens, filters
//
// SRS 4.3.1: Audit trail for admin visibility
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchUsers,
  fetchUserSessions,
  fetchUserSnapshots,
} from "../../../services/adminService";

import {
  getEvalActivityOverview,
  getEvalActivityStudents,
  getEvalActivityStudentDetail,
  exportEvalActivityCSV,
} from "../../../services/evalActivityApi";

import {
  Activity,
  Monitor,
  Clock,
  User,
  Shield,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Globe,
  Eye,
  GraduationCap,
  Github,
  Search,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  BarChart3,
  Calendar,
  X,
  ChevronRight,
} from "lucide-react";

// ============================================================
// MAIN ACTIVITY LOG — Sub-tab Container
// ============================================================
const ActivityLog = () => {
  const [activeSubTab, setActiveSubTab] = useState("evaluation");

  return (
    <div className="space-y-4">
      {/* Sub-Tab Toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { key: "evaluation", label: "Evaluation Tracker", icon: GraduationCap },
          { key: "login", label: "Login Activity", icon: Activity },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "login" && <LoginActivityPanel />}
      {activeSubTab === "evaluation" && <EvaluationTrackerPanel />}
    </div>
  );
};

// ============================================================
// EVALUATION TRACKER PANEL — Student evaluation progress
// ============================================================
const EvaluationTrackerPanel = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    search: "",
    sessionId: "",
    status: "",
    hasGithubToken: "",
    track: "",
    scoreMin: "",
    scoreMax: "",
    dateFrom: "",
    dateTo: "",
    admissionYear: "",
    batchYear: "",
    page: 1,
    pageSize: 30,
  });

  // Debounced search
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load overview
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await getEvalActivityOverview();
      setOverview(res.data);
    } catch { /* ignore */ }
    finally { setOverviewLoading(false); }
  }, []);

  // Load students
  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getEvalActivityStudents(filters);
      setStudents(res.data.students || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Load student detail
  const handleExpand = async (personId) => {
    if (expandedStudent === personId) {
      setExpandedStudent(null);
      return;
    }
    setExpandedStudent(personId);
    setDetailLoading(true);
    try {
      const res = await getEvalActivityStudentDetail(personId);
      setStudentDetail(res.data);
    } catch { setStudentDetail(null); }
    finally { setDetailLoading(false); }
  };

  // CSV export
  const handleExport = async () => {
    try {
      const res = await exportEvalActivityCSV(filters);
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluation_activity_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const updateFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  const clearFilters = () => {
    setSearchInput("");
    setFilters({
      search: "", sessionId: "", status: "", hasGithubToken: "",
      track: "", scoreMin: "", scoreMax: "", dateFrom: "", dateTo: "",
      admissionYear: "", batchYear: "",
      page: 1, pageSize: 30,
    });
  };

  const hasActiveFilters = filters.sessionId || filters.status || filters.hasGithubToken ||
    filters.track || filters.scoreMin || filters.scoreMax || filters.dateFrom || filters.dateTo ||
    filters.search || filters.admissionYear || filters.batchYear;

  // Group students by their first assignment session
  const groupedBySession = {};
  students.forEach((s) => {
    const firstAssignment = s.assignments?.[0];
    const key = firstAssignment?.sessionTitle || "Unassigned";
    if (!groupedBySession[key]) groupedBySession[key] = [];
    groupedBySession[key].push(s);
  });

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={loadStudents} className="ml-auto font-medium">Retry</button>
        </div>
      )}

      {/* Stats Row */}
      {!overviewLoading && overview && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total Students", value: overview.total_students, icon: Users, color: "text-gray-600" },
            { label: "Assigned", value: overview.assigned_students, icon: User, color: "text-violet-600" },
            { label: "Evaluated", value: overview.evaluated_students, icon: CheckCircle, color: "text-emerald-600" },
            { label: "Pending", value: overview.pending_students, icon: Clock, color: "text-amber-600" },
            { label: "GitHub Linked", value: overview.github_tokens_linked, icon: Github, color: "text-gray-700" },
            { label: "Active Sessions", value: overview.active_sessions, icon: GraduationCap, color: "text-blue-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-3">
              <div className="flex items-center gap-1.5 mb-0.5">
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                <span className="text-[10px] text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{s.value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            Filters
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-0.5">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
              <Download className="h-3 w-3" /> Export CSV
            </button>
            <button onClick={() => { loadOverview(); loadStudents(); }} className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {/* Search */}
          <div className="col-span-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search student, department..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder-gray-300"
            />
          </div>

          {/* Session Filter */}
          {overview?.sessions?.length > 0 && (
            <select
              value={filters.sessionId}
              onChange={(e) => updateFilter("sessionId", e.target.value)}
              className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
            >
              <option value="">All Sessions</option>
              {overview.sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>{s.title}</option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">All Status</option>
            <option value="assigned">Assigned (Pending)</option>
            <option value="evaluated">Evaluated</option>
            <option value="not_assigned">Not Assigned</option>
          </select>

          {/* GitHub Token Filter */}
          <select
            value={filters.hasGithubToken}
            onChange={(e) => updateFilter("hasGithubToken", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">GitHub: All</option>
            <option value="true">Linked</option>
            <option value="false">Not Linked</option>
          </select>

          {/* Track Filter */}
          <select
            value={filters.track}
            onChange={(e) => updateFilter("track", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">All Tracks</option>
            <option value="core">Core</option>
            <option value="it_core">IT-Core</option>
            <option value="premium">Premium</option>
          </select>

          {/* Admission Year Filter */}
          <select
            value={filters.admissionYear}
            onChange={(e) => updateFilter("admissionYear", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">All Admission Years</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Batch / Graduation Year Filter */}
          <select
            value={filters.batchYear}
            onChange={(e) => updateFilter("batchYear", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            <option value="">All Batch Years</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 2 - i).map((y) => (
              <option key={y} value={y}>{y} Batch</option>
            ))}
          </select>

          {/* Date Range */}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
            placeholder="From"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400"
            placeholder="To"
          />

          {/* Score Range */}
          <input
            type="number"
            value={filters.scoreMin}
            onChange={(e) => updateFilter("scoreMin", e.target.value)}
            placeholder="Min marks"
            min="0"
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder-gray-300"
          />
          <input
            type="number"
            value={filters.scoreMax}
            onChange={(e) => updateFilter("scoreMax", e.target.value)}
            placeholder="Max marks"
            min="0"
            className="px-2.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 placeholder-gray-300"
          />
        </div>
      </div>

      {/* Student List */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading students...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No students found</p>
            <p className="text-xs mt-1">Adjust filters to see results</p>
          </div>
        ) : (
          <>
            {/* Results count */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Showing {students.length} of {total} students
              </span>
            </div>

            {/* Grouped by session */}
            {Object.entries(groupedBySession).map(([sessionTitle, sessionStudents]) => (
              <div key={sessionTitle}>
                {/* Session group header */}
                <div className="px-4 py-2 bg-violet-50/50 border-b border-violet-100/50">
                  <span className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5" />
                    {sessionTitle}
                    <span className="text-violet-400 font-normal">— {sessionStudents.length} students</span>
                  </span>
                </div>

                {/* Student rows */}
                {sessionStudents.map((student) => {
                  const isExpanded = expandedStudent === student.person_id;
                  return (
                    <React.Fragment key={student.person_id}>
                      <button
                        onClick={() => handleExpand(student.person_id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/50 transition-colors border-b border-gray-50"
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">
                          {(student.display_name || "?")[0]}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{student.display_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {student.department_code && (
                              <span className="text-[10px] text-gray-400 uppercase">{student.department_code}</span>
                            )}
                            {student.track && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                                background: student.track === "core" ? "rgba(124,58,237,0.1)" : student.track === "premium" ? "rgba(217,119,6,0.1)" : "rgba(5,150,105,0.1)",
                                color: student.track === "core" ? "#7C3AED" : student.track === "premium" ? "#D97706" : "#059669",
                              }}>
                                {student.track.toUpperCase().replace("_", "-")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Evals count */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            {student.evaluations_done || 0} done
                          </span>
                          {(student.evaluations_pending || 0) > 0 && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                              {student.evaluations_pending} pending
                            </span>
                          )}
                        </div>

                        {/* GitHub status */}
                        <div className="shrink-0">
                          {student.has_github_token ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/github/${student.person_id}`); }}
                              className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer"
                              title={`View GitHub profile — @${student.github_username}`}
                            >
                              <Github className="h-2.5 w-2.5" /> @{student.github_username}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-400">
                              <XCircle className="h-2.5 w-2.5" /> No token
                            </span>
                          )}
                        </div>

                        <ChevronRight className={`h-4 w-4 text-gray-300 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-100">
                          {detailLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
                              <span className="ml-2 text-sm text-gray-400">Loading details...</span>
                            </div>
                          ) : studentDetail ? (
                            <div className="space-y-4">
                              {/* Summary Row */}
                              <div className="grid grid-cols-4 gap-3">
                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                  <p className="text-[10px] text-gray-400 mb-0.5">Total Assignments</p>
                                  <p className="text-lg font-bold text-gray-900">{studentDetail.summary.totalAssignments}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                  <p className="text-[10px] text-gray-400 mb-0.5">Evaluations Done</p>
                                  <p className="text-lg font-bold text-emerald-600">{studentDetail.summary.evaluationsDone}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                  <p className="text-[10px] text-gray-400 mb-0.5">Pending</p>
                                  <p className="text-lg font-bold text-amber-600">{studentDetail.summary.evaluationsPending}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                  <p className="text-[10px] text-gray-400 mb-0.5">GitHub Token</p>
                                  <p className={`text-sm font-bold ${studentDetail.summary.hasGithubToken ? "text-emerald-600" : "text-red-500"}`}>
                                    {studentDetail.summary.hasGithubToken ? "Linked" : "Missing"}
                                  </p>
                                </div>
                              </div>

                              {/* GitHub Token Info */}
                              {studentDetail.githubToken && (
                                <div className="bg-white rounded-lg p-3 border border-gray-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[10px] text-gray-500 font-semibold uppercase flex items-center gap-1">
                                      <Github className="h-3 w-3" /> GitHub Token History
                                    </p>
                                    <button
                                      onClick={() => navigate(`/github/${expandedStudent}`)}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                                    >
                                      View Profile &rarr;
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-600">
                                    <span>@{studentDetail.githubToken.github_username}</span>
                                    <span className="text-gray-300">|</span>
                                    <span>Created: {new Date(studentDetail.githubToken.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <span className="text-gray-300">|</span>
                                    <span>Updated: {new Date(studentDetail.githubToken.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <span className="text-gray-300">|</span>
                                    <span className={studentDetail.githubToken.is_valid ? "text-emerald-600" : "text-red-500"}>
                                      {studentDetail.githubToken.is_valid ? "Valid" : "Invalid"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Assignments Table */}
                              {studentDetail.assignments?.length > 0 && (
                                <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                                  <p className="text-[10px] text-gray-500 font-semibold uppercase px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1">
                                    <BarChart3 className="h-3 w-3" /> Evaluation Assignments
                                  </p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-gray-100 text-gray-500">
                                          <th className="text-left py-2 px-3 font-medium">Session</th>
                                          <th className="text-left py-2 px-3 font-medium">Faculty</th>
                                          <th className="text-left py-2 px-3 font-medium">Status</th>
                                          <th className="text-left py-2 px-3 font-medium">Marks</th>
                                          <th className="text-left py-2 px-3 font-medium">Schedule</th>
                                          <th className="text-left py-2 px-3 font-medium">Meet Link</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {studentDetail.assignments.map((a, i) => (
                                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                                            <td className="py-2 px-3 font-medium text-gray-800">{a.session_title}</td>
                                            <td className="py-2 px-3 text-gray-600">{a.faculty_name}</td>
                                            <td className="py-2 px-3">
                                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                                a.assignment_status === "evaluation_done" || a.assignment_status === "completed"
                                                  ? "bg-emerald-50 text-emerald-700"
                                                  : a.assignment_status === "assigned"
                                                    ? "bg-amber-50 text-amber-700"
                                                    : "bg-gray-50 text-gray-600"
                                              }`}>
                                                {a.assignment_status === "evaluation_done" || a.assignment_status === "completed" ? (
                                                  <><CheckCircle className="h-2.5 w-2.5" /> Done</>
                                                ) : (
                                                  <><Clock className="h-2.5 w-2.5" /> {a.assignment_status}</>
                                                )}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 font-bold text-gray-800">{a.marks ?? "—"}</td>
                                            <td className="py-2 px-3 text-gray-500">
                                              {a.scheduled_date ? (
                                                <span className="flex items-center gap-1">
                                                  <Calendar className="h-2.5 w-2.5" />
                                                  {new Date(a.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} {a.scheduled_time?.slice(0, 5)}
                                                </span>
                                              ) : "—"}
                                            </td>
                                            <td className="py-2 px-3">
                                              {a.meet_link ? (
                                                <a href={a.meet_link} target="_blank" rel="noopener noreferrer"
                                                  className="text-blue-500 hover:text-blue-700 text-[10px] font-medium">
                                                  Open
                                                </a>
                                              ) : "—"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 text-center py-2">Failed to load details</p>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}

            {/* Pagination */}
            {total > filters.pageSize && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
                  disabled={filters.page <= 1}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 disabled:opacity-40 transition-colors"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-500">
                  Page {filters.page} of {Math.ceil(total / filters.pageSize)}
                </span>
                <button
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  disabled={filters.page >= Math.ceil(total / filters.pageSize)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================
// LOGIN ACTIVITY PANEL — Original login audit (PRESERVED)
// ============================================================
const LoginActivityPanel = () => {
  const [users, setUsers] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userSessions, setUserSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const userData = await fetchUsers(1, 100);
      const userList = userData.users || [];
      setUsers(userList);

      const usersToFetch = userList.slice(0, 20);
      const snapshotResults = await Promise.allSettled(
        usersToFetch.map(async (user) => {
          try {
            const data = await fetchUserSnapshots(user.id);
            return (data.snapshots || []).map((snap) => ({
              ...snap,
              userEmail: user.email,
              userName: user.display_name || user.email?.split("@")[0],
              userRole: user.role,
              userId: user.id,
            }));
          } catch {
            return [];
          }
        }),
      );

      const allSnapshots = snapshotResults
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 100);

      setSnapshots(allSnapshots);
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Failed to load activity",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const handleExpandUser = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    try {
      setExpandedUser(userId);
      setSessionLoading(true);
      const data = await fetchUserSessions(userId);
      setUserSessions(data.sessions || []);
    } catch {
      setUserSessions([]);
    } finally {
      setSessionLoading(false);
    }
  };

  const stats = {
    totalUsers: users.length,
    totalLogins: snapshots.length,
    activeUsers: new Set(snapshots.map((s) => s.userId)).size,
    adminLogins: snapshots.filter((s) => s.role_at_login === "admin").length,
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={loadActivity} className="ml-auto text-red-600 hover:text-red-800 font-medium">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: stats.totalUsers, icon: User, color: "text-gray-600" },
          { label: "Login Events", value: stats.totalLogins, icon: Activity, color: "text-blue-600" },
          { label: "Active Users", value: stats.activeUsers, icon: Monitor, color: "text-green-600" },
          { label: "Admin Logins", value: stats.adminLogins, icon: Shield, color: "text-red-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-xs text-gray-500 font-medium">{stat.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            Recent Login Activity
          </h3>
          <button onClick={loadActivity} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Refresh activity">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading activity log...</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No login activity found</p>
            <p className="text-xs mt-1">Login events will appear here after users sign in</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">User</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Role</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">IP Address</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Login Time</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snap, index) => {
                  const isExpanded = expandedUser === snap.userId && index === snapshots.findIndex((s) => s.userId === snap.userId);
                  return (
                    <React.Fragment key={`${snap.userId}-${snap.created_at}-${index}`}>
                      <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900 text-xs">{snap.userName || "Unknown"}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{snap.userEmail || "—"}</p>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                            snap.role_at_login === "admin" ? "bg-red-50 text-red-700" : snap.role_at_login === "faculty" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600"
                          }`}>
                            {snap.role_at_login || "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {snap.ip_address || "—"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {snap.created_at ? new Date(snap.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => handleExpandUser(snap.userId)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View active sessions">
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-gray-50/80 px-4 py-4 border-b border-gray-100">
                            {sessionLoading ? (
                              <div className="flex items-center justify-center py-3">
                                <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                <span className="ml-2 text-sm text-gray-500">Loading sessions...</span>
                              </div>
                            ) : userSessions.length > 0 ? (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Active Sessions ({userSessions.length})</h4>
                                <div className="space-y-1">
                                  {userSessions.map((session, sIdx) => (
                                    <div key={sIdx} className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                                      <Monitor className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-gray-700 truncate">{session.user_agent?.slice(0, 60) || "Unknown device"}</p>
                                        <p className="text-gray-400 mt-0.5">
                                          IP: {session.ip_address || "—"} · Created: {session.created_at ? new Date(session.created_at).toLocaleString("en-IN") : "—"}
                                        </p>
                                      </div>
                                      <span className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0" title="Active" />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic text-center py-2">No active sessions for this user</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
