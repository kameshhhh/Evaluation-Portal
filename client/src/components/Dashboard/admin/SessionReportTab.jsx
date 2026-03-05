// ============================================================
// SESSION REPORT TAB — Admin Session Insights & Evaluation Report
// ============================================================
// Provides a comprehensive view of evaluation data per session:
//   - Filter bar: Year → Month → Session
//   - Summary cards: Total students, faculty, evaluated, etc.
//   - Students table with per-faculty rubric marks (expandable)
//   - Faculty table with assignment/evaluation counts
//   - CSV + PDF export
//
// DESIGN: Self-contained tab — fetches its own data via sessionReportApi.
// Does NOT modify any existing component or data flow.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Filter,
  Users,
  GraduationCap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  Loader2,
  BarChart3,
  UserX,
  UserCheck,
  Clock,
  FileDown,
} from "lucide-react";
import {
  fetchSessions,
  fetchSessionReport,
  downloadSessionReportCSV,
} from "../../../services/sessionReportApi";
import { getYearLabel, YEAR_CHIPS, YEAR_BADGE_COLORS } from "../../../utils/yearUtils";
import { getBatchYearLabel } from "../../../utils/batchHelper";

// ============================================================
// MONTH NAMES — For month filter dropdown
// ============================================================
const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================
const StatusBadge = ({ status }) => {
  const config = {
    evaluated: {
      bg: "bg-green-100",
      text: "text-green-700",
      icon: CheckCircle,
      label: "Evaluated",
    },
    assigned: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: Clock,
      label: "Not Evaluated",
    },
    not_assigned: {
      bg: "bg-red-100",
      text: "text-red-700",
      icon: UserX,
      label: "Not Assigned",
    },
  };

  const c = config[status] || config.not_assigned;
  const Icon = c.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
};

// ============================================================
// CREDIBILITY BAND BADGE
// ============================================================
const BandBadge = ({ band, score }) => {
  const colors = {
    EXEMPLARY: "bg-emerald-100 text-emerald-700",
    TRUSTED: "bg-blue-100 text-blue-700",
    DEVELOPING: "bg-yellow-100 text-yellow-700",
    PROBATION: "bg-orange-100 text-orange-700",
    NEW: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[band] || colors.NEW}`}
    >
      {band} {score != null ? `(${(score * 100).toFixed(0)}%)` : ""}
    </span>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const SessionReportTab = () => {
  // Filter state
  const [availableYears, setAvailableYears] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");

  // Report data
  const [report, setReport] = useState(null);
  const [rubricMap, setRubricMap] = useState({});

  // UI state
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const [studentSearch, setStudentSearch] = useState("");
  const [facultySearch, setFacultySearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilters, setStatusFilters] = useState(new Set(["all"]));
  const [rubricViewMode, setRubricViewMode] = useState("raw"); // "raw" | "weighted"

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState(null); // { page, pageSize, totalPages, totalItems }

  // Track filter state
  const [trackFilter, setTrackFilter] = useState("");
  const TRACK_OPTIONS = [
    { value: "", label: "All Tracks" },
    { value: "core", label: "Core" },
    { value: "it_core", label: "IT & Core" },
    { value: "premium", label: "Premium" },
  ];

  // Reference for PDF export
  const reportRef = useRef(null);

  // ----------------------------------------------------------
  // Load initial years on mount
  // ----------------------------------------------------------
  useEffect(() => {
    const loadYears = async () => {
      try {
        const result = await fetchSessions();
        setAvailableYears(result.data?.availableYears || []);
      } catch (err) {
        console.error("Failed to load years:", err);
      }
    };
    loadYears();
  }, []);

  // ----------------------------------------------------------
  // Load sessions when year or month changes
  // ----------------------------------------------------------
  useEffect(() => {
    if (!selectedYear) {
      setSessions([]);
      setSelectedSessionId("");
      setReport(null);
      setError(null);
      return;
    }

    const loadSessions = async () => {
      setSessionsLoading(true);
      setError(null);
      try {
        const filters = { year: selectedYear };
        if (selectedMonth) filters.month = selectedMonth;
        const result = await fetchSessions(filters);
        setSessions(result.data?.sessions || []);
        setSelectedSessionId("");
        setReport(null);
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setSessionsLoading(false);
      }
    };
    loadSessions();
  }, [selectedYear, selectedMonth]);

  // ----------------------------------------------------------
  // Load report when session is selected
  // ----------------------------------------------------------
  const loadReport = useCallback(async (sessionId, page = 1, track = "") => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    setExpandedStudents(new Set());
    try {
      const result = await fetchSessionReport(sessionId, {
        page,
        pageSize: 50,
        track: track || undefined,
      });
      setReport(result.data);
      setRubricMap(result.data?.rubricMap || {});
      setPagination(result.data?.pagination || null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setReport(null);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      setCurrentPage(1);
      loadReport(selectedSessionId, 1, trackFilter);
    }
  }, [selectedSessionId, loadReport, trackFilter]);

  // Re-fetch when page changes (but not on initial load / session change)
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    if (selectedSessionId) {
      loadReport(selectedSessionId, newPage, trackFilter);
    }
  }, [selectedSessionId, trackFilter, loadReport]);

  // ----------------------------------------------------------
  // Toggle student row expansion
  // ----------------------------------------------------------
  const toggleStudent = (studentId) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  // ----------------------------------------------------------
  // Status filter toggle helper
  // ----------------------------------------------------------
  const toggleStatusFilter = (value) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (value === "all") return new Set(["all"]);
      next.delete("all");
      if (next.has(value)) next.delete(value);
      else next.add(value);
      if (next.size === 0) return new Set(["all"]);
      return next;
    });
  };

  // ----------------------------------------------------------
  // Detect "zero marks" — every rubric score = 0 from at least one faculty
  // ----------------------------------------------------------
  const hasZeroMarks = (student) => {
    if (!student.assignments || student.assignments.length === 0) return false;
    return student.assignments.some((a) => {
      if (!a.rubricMarks || Object.keys(a.rubricMarks).length === 0) return false;
      return Object.values(a.rubricMarks).every((v) => Number(v) === 0);
    });
  };

  // ----------------------------------------------------------
  // Filtered students
  // ----------------------------------------------------------
  const filteredStudents = (report?.students || []).filter((s) => {
    if (
      studentSearch &&
      !s.studentName?.toLowerCase().includes(studentSearch.toLowerCase())
    )
      return false;
    if (deptFilter && s.department !== deptFilter) return false;

    // Year filter (prefer batchYear when available)
    if (yearFilter !== "all") {
      const label = s.batchYear ? getBatchYearLabel(s.batchYear) : getYearLabel(s.admissionYear);
      if (label !== yearFilter) return false;
    }

    // Status filter (multi-select)
    if (!statusFilters.has("all")) {
      const matchesAny = [...statusFilters].some((f) => {
        if (f === "evaluated") return s.status === "evaluated";
        if (f === "not_evaluated") return s.status === "assigned";
        if (f === "not_assigned") return s.status === "not_assigned";
        if (f === "zero_marks") return hasZeroMarks(s);
        return false;
      });
      if (!matchesAny) return false;
    }

    return true;
  });

  // ----------------------------------------------------------
  // Filtered faculty
  // ----------------------------------------------------------
  const filteredFaculty = (report?.faculty || []).filter((f) => {
    if (
      facultySearch &&
      !f.facultyName?.toLowerCase().includes(facultySearch.toLowerCase())
    )
      return false;
    return true;
  });

  // ----------------------------------------------------------
  // Get unique departments from students
  // ----------------------------------------------------------
  const departments = [
    ...new Set(
      (report?.students || [])
        .map((s) => s.department)
        .filter(Boolean)
    ),
  ].sort();

  // ----------------------------------------------------------
  // Get rubric IDs from session preferred_rubric_ids
  // Fallback: extract from first student's raw breakdown if NULL
  // ----------------------------------------------------------
  const sessionRubricIds = report?.session?.preferred_rubric_ids
    || (() => {
      const s = report?.students?.find(s => s.rubricBreakdownRaw);
      return s ? Object.keys(s.rubricBreakdownRaw) : [];
    })();

  // ----------------------------------------------------------
  // CSV Export — mode: "raw" or "weighted"
  // ----------------------------------------------------------
  const exportCSV = (mode = "raw") => {
    if (!report) return;
    const isWeighted = mode === "weighted";
    const label = isWeighted ? "Weighted" : "Raw";

    const rows = [];
    // Header
    const rubricHeaders = sessionRubricIds.map(
      (id) => rubricMap[id] || id.slice(0, 8)
    );
    rows.push([
      "Student Name",
      "Department",
      "Batch Year",
      "Status",
      "Assigned Faculty",
      ...rubricHeaders.map((r) => `${r} (${label})`),
      "Display Score",
      "Judge Count",
      "Confidence",
    ]);

    // Data rows
    filteredStudents.forEach((s) => {
      const bd = isWeighted ? s.rubricBreakdownFinal : s.rubricBreakdownRaw;
      const rubricAvgs = sessionRubricIds.map((rid) => {
        if (!bd) return "";
        const rb = bd[rid];
        return rb?.avg != null ? rb.avg.toFixed(2) : "";
      });

      rows.push([
        s.studentName,
        s.department || "",
        (s.batchYear ? getBatchYearLabel(s.batchYear) : getYearLabel(s.admissionYear)) || s.admissionYear || "",
        s.status === "evaluated"
          ? "Evaluated"
          : s.status === "assigned"
            ? "Not Evaluated"
            : "Not Assigned",
        s.assignments?.map((a) => a.facultyName).join("; ") || "-",
        ...rubricAvgs,
        (() => {
          if (isWeighted) return s.displayScore != null ? s.displayScore.toFixed(2) : "";
          if (!s.rubricBreakdownRaw) return "";
          const vals = sessionRubricIds.map(rid => s.rubricBreakdownRaw[rid]?.avg).filter(v => v != null);
          return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "";
        })(),
        s.judgeCount || 0,
        s.confidenceScore != null
          ? (s.confidenceScore * 100).toFixed(0) + "%"
          : "",
      ]);
    });

    const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `session-report-${label.toLowerCase()}-${report.session?.title?.replace(/\s+/g, "_") || "export"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ----------------------------------------------------------
  // PDF Export (print-based) — mode: "raw" or "weighted"
  // ----------------------------------------------------------
  const exportPDF = (mode = "raw") => {
    if (!reportRef.current) return;
    const isWeighted = mode === "weighted";
    const label = isWeighted ? "Weighted (Credibility-Adjusted)" : "Raw Average";
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Popup blocked — please allow popups for PDF export.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Session Report — ${report?.session?.title || ""} (${label})</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            h2 { font-size: 14px; margin-top: 16px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #f5f5f5; font-weight: 600; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; }
            .evaluated { background: #dcfce7; color: #166534; }
            .assigned { background: #fef9c3; color: #854d0e; }
            .not_assigned { background: #fee2e2; color: #991b1b; }
            .summary { display: flex; gap: 16px; margin: 12px 0; }
            .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
            .card-value { font-size: 22px; font-weight: 700; }
            .card-label { font-size: 11px; color: #6b7280; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>Session Report: ${report?.session?.title || ""}</h1>
          <p>Academic Year: ${report?.session?.academic_year || ""} | Status: ${report?.session?.status || ""} | Rubric Mode: ${label} | Generated: ${new Date().toLocaleDateString()}</p>
          
          <div class="summary">
            <div class="card"><div class="card-value">${report?.summary?.totalStudents || 0}</div><div class="card-label">Total Students</div></div>
            <div class="card"><div class="card-value">${report?.summary?.totalFaculty || 0}</div><div class="card-label">Total Faculty</div></div>
            <div class="card"><div class="card-value">${report?.summary?.evaluatedCount || 0}</div><div class="card-label">Evaluated</div></div>
            <div class="card"><div class="card-value">${report?.summary?.notEvaluatedCount || 0}</div><div class="card-label">Not Evaluated</div></div>
            <div class="card"><div class="card-value">${report?.summary?.notAssignedCount || 0}</div><div class="card-label">Not Assigned</div></div>
          </div>

          <h2>Students</h2>
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Dept</th><th>Year</th><th>Status</th><th>Faculty</th>
                ${sessionRubricIds.map((id) => `<th>${rubricMap[id] || id.slice(0, 8)}</th>`).join("")}
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStudents
                .map(
                  (s) => {
                    return `
                <tr>
                  <td>${s.studentName}</td>
                  <td>${s.department || "-"}</td>
                  <td>${s.batchYear ? (getBatchYearLabel(s.batchYear) || '-') : (getYearLabel(s.admissionYear) || '-')}</td>
                  <td><span class="badge ${s.status}">${s.status === "evaluated" ? "Evaluated" : s.status === "assigned" ? "Not Evaluated" : "Not Assigned"}</span></td>
                  <td>${s.assignments?.map((a) => a.facultyName).join(", ") || "-"}</td>
                  ${sessionRubricIds
                    .map((rid) => {
                      const bd = isWeighted ? s.rubricBreakdownFinal : s.rubricBreakdownRaw;
                      const rb = bd?.[rid];
                      return `<td>${rb?.avg != null ? rb.avg.toFixed(2) : "-"}</td>`;
                    })
                    .join("")}
                  <td>${(() => {
                    if (isWeighted) return s.displayScore != null ? s.displayScore.toFixed(2) : "-";
                    if (!s.rubricBreakdownRaw) return "-";
                    const vals = sessionRubricIds.map(rid => s.rubricBreakdownRaw[rid]?.avg).filter(v => v != null);
                    return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "-";
                  })()}</td>
                </tr>
              `;
                  }
                )
                .join("")}
            </tbody>
          </table>

          <h2>Faculty</h2>
          <table>
            <thead><tr><th>Name</th><th>Dept</th><th>Assigned</th><th>Evaluated</th><th>Pending</th><th>Credibility</th></tr></thead>
            <tbody>
              ${filteredFaculty
                .map(
                  (f) => `
                <tr>
                  <td>${f.facultyName}</td>
                  <td>${f.department || "-"}</td>
                  <td>${f.assignedCount}</td>
                  <td>${f.evaluatedCount}</td>
                  <td>${f.pendingCount}</td>
                  <td>${f.credibility?.band || "NEW"} (${((f.credibility?.compositeScore || 0) * 100).toFixed(0)}%)</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6" ref={reportRef}>
      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Session Report
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Comprehensive evaluation insights per session
          </p>
        </div>
        {report && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Raw downloads (current page only) */}
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1 py-0.5">
              <span className="text-[10px] text-gray-400 font-medium px-1">Raw</span>
              <button
                onClick={() => exportCSV("raw")}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition"
                title="Download raw average marks as CSV (current page only — use the green CSV button in the student table for full export)"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                onClick={() => exportPDF("raw")}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition"
                title="Download raw average marks as PDF"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>
            {/* Weighted downloads */}
            <div className="flex items-center gap-1 border border-indigo-200 rounded-lg px-1 py-0.5 bg-indigo-50/50">
              <span className="text-[10px] text-indigo-500 font-medium px-1">Weighted</span>
              <button
                onClick={() => exportCSV("weighted")}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 rounded transition"
                title="Download credibility-weighted marks as CSV"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                onClick={() => exportPDF("weighted")}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100 rounded transition"
                title="Download credibility-weighted marks as PDF"
              >
                <FileDown className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================== */}
      {/* FILTER BAR */}
      {/* ====================================================== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Academic Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setSelectedMonth("");
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">-- Select Year --</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={!selectedYear}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">-- All Months --</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Session */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Session
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              disabled={!selectedYear || sessionsLoading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">
                {sessionsLoading
                  ? "Loading sessions..."
                  : sessions.length === 0
                    ? "No sessions found"
                    : "-- Select Session --"}
              </option>
              {sessions.map((s) => {
                const trackLabel = s.track ? ` [${s.track === 'it_core' ? 'IT & Core' : s.track.charAt(0).toUpperCase() + s.track.slice(1)}]` : '';
                const groupLabel = s.group_title ? `${s.group_title} / ` : '';
                return (
                  <option key={s.session_id} value={s.session_id}>
                    {groupLabel}{s.title}{trackLabel} ({s.status}) — {s.student_count} students, {s.faculty_count} faculty
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* ====================================================== */}
      {/* LOADING STATE */}
      {/* ====================================================== */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          <span className="ml-3 text-gray-500">Loading report...</span>
        </div>
      )}

      {/* ====================================================== */}
      {/* ERROR STATE */}
      {/* ====================================================== */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* ====================================================== */}
      {/* EMPTY STATE — No session selected */}
      {/* ====================================================== */}
      {!loading && !report && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Select a year and session above to view the evaluation report
          </p>
        </div>
      )}

      {/* ====================================================== */}
      {/* REPORT CONTENT */}
      {/* ====================================================== */}
      {!loading && report && (
        <>
          {/* ====================================================== */}
          {/* SESSION INFO */}
          {/* ====================================================== */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {report.session?.title}
            </h3>
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>
                Status:{" "}
                <span className="font-medium text-gray-700">
                  {report.session?.status}
                </span>
              </span>
              <span>
                Mode:{" "}
                <span className="font-medium text-gray-700">
                  {report.session?.evaluation_mode}
                </span>
              </span>
              {report.session?.session_date && (
                <span>
                  Date:{" "}
                  <span className="font-medium text-gray-700">
                    {new Date(report.session.session_date).toLocaleDateString()}
                  </span>
                </span>
              )}
              {report.session?.min_judges && (
                <span>
                  Min Judges:{" "}
                  <span className="font-medium text-gray-700">
                    {report.session.min_judges}
                  </span>
                </span>
              )}
              <span>
                Rubrics:{" "}
                <span className="font-medium text-gray-700">
                  {sessionRubricIds
                    .map((id) => rubricMap[id] || id.slice(0, 8))
                    .join(", ") || "None set"}
                </span>
              </span>
            </div>
          </div>

          {/* ====================================================== */}
          {/* SUMMARY CARDS */}
          {/* ====================================================== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: "Total Students",
                value: report.summary?.totalStudents,
                icon: Users,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "Total Faculty",
                value: report.summary?.totalFaculty,
                icon: GraduationCap,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "Assigned",
                value: report.summary?.assignedCount,
                icon: UserCheck,
                color: "text-indigo-600",
                bg: "bg-indigo-50",
              },
              {
                label: "Evaluated",
                value: report.summary?.evaluatedCount,
                icon: CheckCircle,
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                label: "Not Evaluated",
                value: report.summary?.notEvaluatedCount,
                icon: Clock,
                color: "text-yellow-600",
                bg: "bg-yellow-50",
              },
              {
                label: "Not Assigned",
                value: report.summary?.notAssignedCount,
                icon: XCircle,
                color: "text-red-600",
                bg: "bg-red-50",
              },
            ].map((card) => {
              const CardIcon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded-lg ${card.bg}`}>
                      <CardIcon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <span className="text-xs text-gray-500">{card.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {card.value ?? 0}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ====================================================== */}
          {/* STUDENTS TABLE */}
          {/* ====================================================== */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 space-y-3">
              {/* Top row: Title + Search/Dept */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Students ({filteredStudents.length})
                </h3>
                <div className="flex items-center gap-2">
                  {/* Track filter (server-side) */}
                  <select
                    value={trackFilter}
                    onChange={(e) => setTrackFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {TRACK_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {/* Department filter */}
                  {departments.length > 1 && (
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">All Depts</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search student..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                    />
                  </div>
                  {/* CSV Download */}
                  <button
                    onClick={async () => {
                      try {
                        await downloadSessionReportCSV(selectedSessionId, trackFilter || undefined);
                      } catch (err) {
                        setError(err.response?.data?.error || err.message || "CSV download failed");
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    title="Download CSV"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                </div>
              </div>

              {/* Year filter chips */}
              <div className="flex flex-wrap gap-1.5">
                {YEAR_CHIPS.map((y) => (
                  <button
                    key={y.id}
                    onClick={() => setYearFilter(y.id === "all" ? "all" : yearFilter === y.label ? "all" : y.label)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                    style={{
                      background:
                        (y.id === "all" && yearFilter === "all") || yearFilter === y.label
                          ? y.color
                          : y.bg,
                      color:
                        (y.id === "all" && yearFilter === "all") || yearFilter === y.label
                          ? "white"
                          : y.color,
                      border: `1.5px solid ${
                        (y.id === "all" && yearFilter === "all") || yearFilter === y.label
                          ? y.color
                          : "transparent"
                      }`,
                    }}
                  >
                    {y.label}
                  </button>
                ))}
              </div>

              {/* Status filter checkboxes */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status:</span>
                {[
                  { value: "all",           label: "All" },
                  { value: "evaluated",     label: "Evaluated" },
                  { value: "not_evaluated", label: "Not Evaluated" },
                  { value: "not_assigned",  label: "Not Assigned" },
                  { value: "zero_marks",    label: "Zero Marks" },
                ].map((opt) => (
                  <label key={opt.value} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={statusFilters.has(opt.value)}
                      onChange={() => toggleStatusFilter(opt.value)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>

              {/* Rubric view mode toggle */}
              {sessionRubricIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Rubric Marks:</span>
                  <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                    <button
                      onClick={() => setRubricViewMode("raw")}
                      className={`px-3 py-1 text-xs font-medium transition ${
                        rubricViewMode === "raw"
                          ? "bg-gray-800 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Raw
                    </button>
                    <button
                      onClick={() => setRubricViewMode("weighted")}
                      className={`px-3 py-1 text-xs font-medium transition ${
                        rubricViewMode === "weighted"
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Weighted
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {rubricViewMode === "raw"
                      ? "(Average of faculty marks)"
                      : "(Credibility-adjusted scores)"}
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600 w-8"></th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Student Name
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Dept
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Year
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Faculty
                    </th>
                    {sessionRubricIds.map((rid) => (
                      <th
                        key={rid}
                        className="px-4 py-3 font-medium text-gray-600 text-center"
                      >
                        {rubricMap[rid] || rid.slice(0, 8)}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Score
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Judges
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8 + sessionRubricIds.length}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No students match the current filters
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => (
                      <React.Fragment key={student.studentId}>
                        {/* Main row */}
                        <tr
                          className={`hover:bg-gray-50 cursor-pointer transition ${
                            expandedStudents.has(student.studentId)
                              ? "bg-indigo-50/50"
                              : ""
                          }`}
                          onClick={() => toggleStudent(student.studentId)}
                        >
                          <td className="px-4 py-3">
                            {student.assignments?.length > 0 ? (
                              expandedStudents.has(student.studentId) ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {student.studentName}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {student.department || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const label = student.batchYear ? getBatchYearLabel(student.batchYear) : getYearLabel(student.admissionYear);
                              if (!label) return "-";
                              const style = YEAR_BADGE_COLORS[label] || {};
                              return (
                                <span
                                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: style.bg || "rgba(107,114,128,0.08)", color: style.color || "#6B7280" }}
                                >
                                  {label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={student.status} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {student.assignments?.length > 0
                              ? student.assignments
                                  .map((a) => a.facultyName)
                                  .join(", ")
                              : "-"}
                          </td>
                          {sessionRubricIds.map((rid) => {
                            const bd = rubricViewMode === "weighted"
                              ? student.rubricBreakdownFinal
                              : student.rubricBreakdownRaw;
                            const rb = bd?.[rid];
                            return (
                              <td
                                key={rid}
                                className="px-4 py-3 text-center"
                              >
                                {rb?.avg != null ? (
                                  <span
                                    className={`font-medium ${
                                      rb.avg >= 4
                                        ? "text-green-600"
                                        : rb.avg >= 2.5
                                          ? "text-yellow-600"
                                          : "text-red-600"
                                    }`}
                                  >
                                    {rb.avg.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center">
                            {(() => {
                              if (rubricViewMode === "weighted") {
                                return student.displayScore != null ? (
                                  <span className="font-bold text-indigo-600">
                                    {student.displayScore.toFixed(2)}
                                  </span>
                                ) : <span className="text-gray-300">-</span>;
                              }
                              const src = student.rubricBreakdownRaw;
                              if (!src) return <span className="text-gray-300">-</span>;
                              const vals = sessionRubricIds.map(rid => src[rid]?.avg).filter(v => v != null);
                              if (vals.length === 0) return <span className="text-gray-300">-</span>;
                              const rawAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
                              return <span className="font-bold text-emerald-600">{rawAvg.toFixed(2)}</span>;
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {student.judgeCount || 0}
                          </td>
                        </tr>

                        {/* Expanded row — per-faculty marks */}
                        {expandedStudents.has(student.studentId) &&
                          student.assignments?.length > 0 && (
                            <tr>
                              <td
                                colSpan={8 + sessionRubricIds.length}
                                className="px-4 py-0"
                              >
                                <div className="ml-8 my-3 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-100 text-left">
                                        <th className="px-3 py-2 font-medium text-gray-600">
                                          Faculty
                                        </th>
                                        <th className="px-3 py-2 font-medium text-gray-600">
                                          Status
                                        </th>
                                        {sessionRubricIds.map((rid) => (
                                          <th
                                            key={rid}
                                            className="px-3 py-2 font-medium text-gray-600 text-center"
                                          >
                                            {rubricMap[rid] ||
                                              rid.slice(0, 8)}
                                          </th>
                                        ))}
                                        <th className="px-3 py-2 font-medium text-gray-600">
                                          Feedback
                                        </th>
                                        <th className="px-3 py-2 font-medium text-gray-600">
                                          Evaluated At
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {student.assignments.map((a) => (
                                        <tr
                                          key={a.assignmentId}
                                          className="hover:bg-white"
                                        >
                                          <td className="px-3 py-2 font-medium text-gray-800">
                                            {a.facultyName}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span
                                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                                a.rubricMarks
                                                  ? "bg-green-100 text-green-700"
                                                  : "bg-yellow-100 text-yellow-700"
                                              }`}
                                            >
                                              {a.rubricMarks
                                                ? "Submitted"
                                                : "Pending"}
                                            </span>
                                          </td>
                                          {sessionRubricIds.map((rid) => {
                                            const mark =
                                              a.rubricMarks?.[rid];
                                            return (
                                              <td
                                                key={rid}
                                                className="px-3 py-2 text-center"
                                              >
                                                {mark != null ? (
                                                  <span
                                                    className={`font-semibold ${
                                                      mark >= 4
                                                        ? "text-green-600"
                                                        : mark >= 2
                                                          ? "text-yellow-600"
                                                          : mark === 0
                                                            ? "text-red-500"
                                                            : "text-orange-500"
                                                    }`}
                                                  >
                                                    {mark}
                                                  </span>
                                                ) : (
                                                  <span className="text-gray-300">
                                                    -
                                                  </span>
                                                )}
                                              </td>
                                            );
                                          })}
                                          <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">
                                            {a.feedback ||
                                              (a.zeroFeedback
                                                ? Object.values(
                                                    a.zeroFeedback
                                                  ).join("; ")
                                                : "-")}
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">
                                            {a.evaluatedAt
                                              ? new Date(
                                                  a.evaluatedAt
                                                ).toLocaleDateString()
                                              : "-"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} students)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  {(() => {
                    const pages = [];
                    const tp = pagination.totalPages;
                    const cp = currentPage;
                    let start = Math.max(1, cp - 2);
                    let end = Math.min(tp, cp + 2);
                    if (end - start < 4) {
                      start = Math.max(1, end - 4);
                      end = Math.min(tp, start + 4);
                    }
                    if (start > 1) {
                      pages.push(
                        <button key={1} onClick={() => handlePageChange(1)} className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50">1</button>
                      );
                      if (start > 2) pages.push(<span key="ds" className="text-xs text-gray-400">…</span>);
                    }
                    for (let i = start; i <= end; i++) {
                      pages.push(
                        <button
                          key={i}
                          onClick={() => handlePageChange(i)}
                          className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                            i === cp
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "border-gray-300 bg-white hover:bg-gray-50"
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }
                    if (end < tp) {
                      if (end < tp - 1) pages.push(<span key="de" className="text-xs text-gray-400">…</span>);
                      pages.push(
                        <button key={tp} onClick={() => handlePageChange(tp)} className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50">{tp}</button>
                      );
                    }
                    return pages;
                  })()}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= pagination.totalPages}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* FACULTY TABLE */}
          {/* ====================================================== */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-purple-600" />
                Faculty ({filteredFaculty.length})
              </h3>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search faculty..."
                  value={facultySearch}
                  onChange={(e) => setFacultySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Faculty Name
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Dept
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Assigned
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Evaluated
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Pending
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Completion
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Credibility
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFaculty.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No faculty match the current search
                      </td>
                    </tr>
                  ) : (
                    filteredFaculty.map((f) => {
                      const completionPct =
                        f.assignedCount > 0
                          ? Math.round(
                              (f.evaluatedCount / f.assignedCount) * 100
                            )
                          : 0;
                      return (
                        <tr
                          key={f.facultyId}
                          className="hover:bg-gray-50 transition"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {f.facultyName}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {f.department || "-"}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {f.assignedCount}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-green-600 font-medium">
                              {f.evaluatedCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {f.pendingCount > 0 ? (
                              <span className="text-yellow-600 font-medium">
                                {f.pendingCount}
                              </span>
                            ) : (
                              <span className="text-gray-300">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    completionPct === 100
                                      ? "bg-green-500"
                                      : completionPct > 50
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                  }`}
                                  style={{ width: `${completionPct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-10 text-right">
                                {completionPct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <BandBadge
                              band={f.credibility?.band}
                              score={f.credibility?.compositeScore}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SessionReportTab;
