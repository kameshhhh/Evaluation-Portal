// ================================================================
// FACULTY LOGS PAGE — Admin-like logs viewer for faculty at /worklog
// 3 sub-views: Session Logs | Project Logs | Daily Logs
// + "My Students" toggle to scope to assigned students
// ================================================================
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, FolderOpen, BookOpen, Loader2, RefreshCw, Search,
  CheckCircle2, ChevronDown, ChevronUp, User, Filter, FileText,
  LinkIcon, GitCommit, MessageSquare, Check, Github, Users,
  CalendarDays, Timer,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { useDataChange } from "../../hooks/useSocketEvent";
import {
  getAllSessionLogs, getAllProjectLogs, getLogStats, reviewSessionLog,
} from "../../services/sessionWorkLogApi";
import {
  getAllDailyLogs, getDailyLogStats, reviewDailyLog,
} from "../../services/dailyWorkLogApi";
import { getMyAssignments } from "../../services/sessionPlannerApi";

const ensureUrl = (url) => (url && !/^https?:\/\//i.test(url) ? `https://${url}` : url);
const TRACK_LABELS = { core: "Core Project", it_core: "IT / IT-Core", premium: "Premium" };

const FacultyLogsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState("session");

  // Data
  const [sessLogs, setSessLogs] = useState([]);
  const [projLogs, setProjLogs] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [trackFilter, setTrackFilter] = useState("");
  const [availableTracks, setAvailableTracks] = useState([]);
  const [dailyDateFilter, setDailyDateFilter] = useState("");
  const [dailyStatusFilter, setDailyStatusFilter] = useState("");
  const [dailyYearFilter, setDailyYearFilter] = useState("");

  // My Students
  const [myStudents, setMyStudents] = useState([]);
  const [myStudentsOn, setMyStudentsOn] = useState(false);
  const [myStudentsLoading, setMyStudentsLoading] = useState(false);

  // Expand / review
  const [expandedLog, setExpandedLog] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewType, setReviewType] = useState("session"); // track which type is being reviewed

  // Load assigned students
  useEffect(() => {
    (async () => {
      setMyStudentsLoading(true);
      try {
        const res = await getMyAssignments();
        const students = (res.data || []).map((a) => a.student_id).filter(Boolean);
        setMyStudents([...new Set(students)]);
      } catch {}
      finally { setMyStudentsLoading(false); }
    })();
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (trackFilter) params.track = trackFilter;
      if (myStudentsOn && myStudents.length > 0) {
        params.studentIds = myStudents.join(",");
      }

      const dailyParams = { ...params, limit: 200 };
      if (dailyDateFilter) dailyParams.date = dailyDateFilter;
      if (dailyStatusFilter) dailyParams.status = dailyStatusFilter;
      if (dailyYearFilter) dailyParams.admissionYear = dailyYearFilter;

      const results = await Promise.all([
        getAllSessionLogs(params),
        getAllProjectLogs(params),
        getLogStats(),
        getAllDailyLogs(dailyParams),
        getDailyLogStats(),
      ]);

      setSessLogs(results[0].data || []);
      setProjLogs(results[1].data || []);
      const statsData = results[2].data || null;
      setStats(statsData);
      if (statsData?.available_tracks?.length) {
        setAvailableTracks(statsData.available_tracks);
      }
      setDailyLogs(results[3].data || []);
      setDailyStats(results[4].data || null);
    } catch (err) {
      console.error("Failed to load logs:", err);
    } finally {
      setLoading(false);
    }
  }, [trackFilter, myStudentsOn, myStudents, dailyDateFilter, dailyStatusFilter, dailyYearFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useDataChange("session_work_log", fetchAll);
  useDataChange("project_enhancement", fetchAll);
  useDataChange("daily_work_log", fetchAll);

  const handleReview = async (logId) => {
    setReviewSaving(true);
    try {
      if (reviewType === "daily") {
        await reviewDailyLog(logId, reviewComment);
      } else {
        await reviewSessionLog(logId, reviewComment);
      }
      setReviewingId(null);
      setReviewComment("");
      fetchAll();
    } catch (err) { console.error("Review failed:", err); }
    finally { setReviewSaving(false); }
  };

  // Search filters
  const filteredSess = sessLogs.filter((l) =>
    !searchTerm ||
    l.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.session_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.department_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.summary?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredProj = projLogs.filter((l) =>
    !searchTerm ||
    l.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.project_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.department_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredDaily = dailyLogs.filter((l) =>
    !searchTerm ||
    l.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.department_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.summary?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading logs...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#7C3AED]" /> Work Logs
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Review student work logs</p>
        </div>
        <button onClick={fetchAll} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats cards */}
      {(stats || dailyStats) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {[
            { label: "Session Logs", value: stats?.total_session_logs, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Reviewed", value: stats?.reviewed_session_logs, color: "text-green-700", bg: "bg-green-50" },
            { label: "Project Logs", value: stats?.total_project_logs, color: "text-purple-700", bg: "bg-purple-50" },
            { label: "Verified", value: stats?.verified_project_logs, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "Daily Logs", value: dailyStats?.total_logs, color: "text-orange-700", bg: "bg-orange-50" },
            { label: "Daily Reviewed", value: dailyStats?.reviewed_logs, color: "text-teal-700", bg: "bg-teal-50" },
            { label: "Today's Daily", value: dailyStats?.today_logs, color: "text-pink-700", bg: "bg-pink-50" },
            { label: "Active Students", value: dailyStats?.students_with_logs, color: "text-amber-700", bg: "bg-amber-50" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-2.5 ${s.bg}`}>
              <p className={`text-lg font-bold ${s.color}`}>{s.value || 0}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        {/* View toggle */}
        <div className="flex bg-white border border-gray-200 rounded-xl p-1">
          {[
            { id: "session", label: "Session", icon: BookOpen, count: filteredSess.length },
            { id: "project", label: "Project", icon: FolderOpen, count: filteredProj.length },
            { id: "daily", label: "Daily", icon: CalendarDays, count: filteredDaily.length },
          ].map((v) => (
            <button key={v.id} onClick={() => { setActiveView(v.id); setExpandedLog(null); setReviewingId(null); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeView === v.id
                  ? "bg-red-50 text-red-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}>
              <v.icon size={13} />
              {v.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeView === v.id ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"
              }`}>{v.count}</span>
            </button>
          ))}
        </div>

        {/* My Students toggle */}
        <button
          onClick={() => setMyStudentsOn(!myStudentsOn)}
          disabled={myStudentsLoading}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
            myStudentsOn
              ? "bg-[#7C3AED] text-white border-[#7C3AED]"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}>
          <Users size={13} />
          My Students
          {myStudents.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              myStudentsOn ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
            }`}>{myStudents.length}</span>
          )}
        </button>

        {/* Track filter */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-2">
          <Filter size={13} className="text-gray-400 flex-shrink-0" />
          <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}
            className="py-2 px-1.5 text-xs focus:outline-none bg-transparent text-gray-700 cursor-pointer">
            <option value="">All Tracks</option>
            {availableTracks.map((t) => (
              <option key={t} value={t}>{TRACK_LABELS[t] || t}</option>
            ))}
          </select>
        </div>

        {/* Daily-specific filters */}
        {activeView === "daily" && (
          <>
            <input type="date" value={dailyDateFilter} onChange={(e) => setDailyDateFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-gray-700" />
            <select value={dailyStatusFilter} onChange={(e) => setDailyStatusFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-gray-700 cursor-pointer">
              <option value="">All Status</option>
              <option value="submitted">Pending</option>
              <option value="reviewed">Reviewed</option>
            </select>
            <select value={dailyYearFilter} onChange={(e) => setDailyYearFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none text-gray-700 cursor-pointer">
              <option value="">All Years</option>
              {[2022, 2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}

        {/* Search */}
        <div className="flex items-center gap-1.5 flex-1 bg-white border border-gray-200 rounded-xl px-3">
          <Search size={14} className="text-gray-400" />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student, department..."
            className="w-full py-2 text-xs focus:outline-none bg-transparent" />
        </div>

        <button onClick={fetchAll} className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 bg-white">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ═══════ SESSION LOGS VIEW ═══════ */}
      {activeView === "session" && (
        <div className="space-y-2">
          {filteredSess.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No session logs found.</p>
            </div>
          ) : (
            filteredSess.map((log) => {
              const isExpanded = expandedLog === log.log_id;
              const isReviewing = reviewingId === log.log_id && reviewType === "session";
              return (
                <div key={log.log_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                  <button onClick={() => setExpandedLog(isExpanded ? null : log.log_id)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={(e) => { e.stopPropagation(); if (log.has_github) navigate(`/github/${log.student_id}`); }}>
                          <User size={11} className="text-gray-400" /> {log.student_name || "Student"}
                          {log.has_github && <Github size={10} className="text-gray-500" />}
                        </span>
                        {log.department_code && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{log.department_code}</span>
                        )}
                        {log.student_track && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">{TRACK_LABELS[log.student_track] || log.student_track}</span>
                        )}
                        <span className="text-[11px] text-gray-400">&middot;</span>
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{log.session_title}</span>
                        <span className="text-[11px] text-gray-400">Week of {new Date(log.week_start).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{log.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-blue-700">{log.hours_spent}h</span>
                      {log.status === "reviewed" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium flex items-center gap-0.5">
                          <CheckCircle2 size={9} /> Reviewed
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Pending</span>
                      )}
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-50 pt-2 space-y-2">
                      {log.tasks_completed && (Array.isArray(log.tasks_completed) ? log.tasks_completed : []).length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Tasks Completed</p>
                          <ul className="text-xs text-gray-700 space-y-0.5 pl-3">
                            {(Array.isArray(log.tasks_completed) ? log.tasks_completed : []).map((t, i) => (
                              <li key={i} className="list-disc">{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {log.challenges && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Challenges</p>
                            <p className="text-xs text-gray-600">{log.challenges}</p>
                          </div>
                        )}
                        {log.learnings && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Learnings</p>
                            <p className="text-xs text-gray-600">{log.learnings}</p>
                          </div>
                        )}
                        {log.next_week_plan && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Next Week</p>
                            <p className="text-xs text-gray-600">{log.next_week_plan}</p>
                          </div>
                        )}
                      </div>
                      {log.evidence_urls && log.evidence_urls.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {log.evidence_urls.map((url, i) => (
                            <a key={i} href={ensureUrl(url)} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                              <LinkIcon size={9} /> Evidence {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                      {log.review_comment && (
                        <div className="bg-green-50 rounded-lg p-2">
                          <p className="text-[10px] font-semibold text-green-700">Review by {log.reviewer_name || "Admin"}</p>
                          <p className="text-xs text-green-800">{log.review_comment}</p>
                        </div>
                      )}
                      {log.status !== "reviewed" && (
                        <div className="pt-1">
                          {!isReviewing ? (
                            <button onClick={() => { setReviewingId(log.log_id); setReviewType("session"); setReviewComment(""); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                              style={{ backgroundColor: "#059669" }}>
                              <Check size={12} /> Review
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Review comment (optional)..."
                                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-green-500" />
                              <button onClick={() => handleReview(log.log_id)} disabled={reviewSaving}
                                className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#059669" }}>
                                {reviewSaving ? "..." : "Confirm"}
                              </button>
                              <button onClick={() => setReviewingId(null)}
                                className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Cancel</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══════ PROJECT LOGS VIEW ═══════ */}
      {activeView === "project" && (
        <div>
          {filteredProj.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No project logs found.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <div className="col-span-2">Student</div>
                <div className="col-span-1">Track</div>
                <div className="col-span-2">Project</div>
                <div className="col-span-1">Date</div>
                <div className="col-span-1">Hours</div>
                <div className="col-span-1">Category</div>
                <div className="col-span-2">Description</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Links</div>
              </div>
              <div className="divide-y divide-gray-50">
                {filteredProj.map((log) => (
                  <div key={log.log_id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-xs items-center hover:bg-gray-50/50 transition-colors">
                    <div className="col-span-2 min-w-0">
                      <p className="font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1"
                        onClick={() => { if (log.has_github) navigate(`/github/${log.person_id}`); }}>
                        {log.student_name || "\u2014"}
                        {log.has_github && <Github size={10} className="text-gray-500" />}
                      </p>
                      <p className="text-[10px] text-gray-400">{log.department_code || ""}</p>
                    </div>
                    <div className="col-span-1">
                      {log.student_track ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">{TRACK_LABELS[log.student_track] || log.student_track}</span>
                      ) : (
                        <span className="text-[10px] text-gray-300">\u2014</span>
                      )}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-gray-700 truncate">{log.project_title || "\u2014"}</p>
                    </div>
                    <div className="col-span-1 text-gray-500">{log.log_date?.slice(0, 10) || "\u2014"}</div>
                    <div className="col-span-1 font-semibold text-blue-700">{log.hours}h</div>
                    <div className="col-span-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">{log.category}</span>
                    </div>
                    <div className="col-span-2 text-gray-600 line-clamp-1">{log.description}</div>
                    <div className="col-span-1">
                      {log.is_verified ? (
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5"><CheckCircle2 size={9} /> Verified</span>
                      ) : (
                        <span className="text-[10px] text-gray-400">Pending</span>
                      )}
                    </div>
                    <div className="col-span-1 flex gap-1">
                      {log.linked_commit_id && (
                        <span title={log.linked_commit_id} className="cursor-default"><GitCommit size={11} className="text-gray-400" /></span>
                      )}
                      {log.evidence_urls && log.evidence_urls.length > 0 && log.evidence_urls.map((url, i) => (
                        <a key={i} href={ensureUrl(url)} target="_blank" rel="noopener noreferrer" title={url}
                          className="text-blue-500 hover:text-blue-700 transition-colors">
                          <LinkIcon size={11} />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ DAILY LOGS VIEW ═══════ */}
      {activeView === "daily" && (
        <div className="space-y-2">
          {filteredDaily.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No daily logs found.</p>
            </div>
          ) : (
            filteredDaily.map((log) => {
              const isExpanded = expandedLog === log.log_id;
              const isReviewing = reviewingId === log.log_id && reviewType === "daily";
              const tasks = Array.isArray(log.tasks_completed) ? log.tasks_completed : [];
              const logDate = new Date(log.log_date);

              return (
                <div key={log.log_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                  <button onClick={() => setExpandedLog(isExpanded ? null : log.log_id)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={(e) => { e.stopPropagation(); if (log.has_github) navigate(`/github/${log.student_id}`); }}>
                          <User size={11} className="text-gray-400" /> {log.student_name || "Student"}
                          {log.has_github && <Github size={10} className="text-gray-500" />}
                        </span>
                        {log.department_code && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{log.department_code}</span>
                        )}
                        {log.student_track && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">{TRACK_LABELS[log.student_track] || log.student_track}</span>
                        )}
                        {log.admission_year && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{log.admission_year}</span>
                        )}
                        <span className="text-[11px] text-gray-400">&middot;</span>
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600">
                          {logDate.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{log.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-blue-700">{log.hours_spent}h</span>
                      {tasks.length > 0 && (
                        <span className="text-[10px] text-gray-400">{tasks.length} tasks</span>
                      )}
                      {log.status === "reviewed" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium flex items-center gap-0.5">
                          <CheckCircle2 size={9} /> Reviewed
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Pending</span>
                      )}
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-50 pt-2 space-y-2">
                      {tasks.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Tasks Completed</p>
                          <ul className="text-xs text-gray-700 space-y-0.5 pl-3">
                            {tasks.map((t, i) => (
                              <li key={i} className="list-disc">{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {log.challenges && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Challenges</p>
                            <p className="text-xs text-gray-600">{log.challenges}</p>
                          </div>
                        )}
                        {log.learnings && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Learnings</p>
                            <p className="text-xs text-gray-600">{log.learnings}</p>
                          </div>
                        )}
                      </div>
                      {log.review_comment && (
                        <div className="bg-green-50 rounded-lg p-2">
                          <p className="text-[10px] font-semibold text-green-700">Review by {log.reviewer_name || "Admin"}</p>
                          <p className="text-xs text-green-800">{log.review_comment}</p>
                        </div>
                      )}
                      {log.status !== "reviewed" && (
                        <div className="pt-1">
                          {!isReviewing ? (
                            <button onClick={() => { setReviewingId(log.log_id); setReviewType("daily"); setReviewComment(""); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                              style={{ backgroundColor: "#059669" }}>
                              <Check size={12} /> Review
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Review comment (optional)..."
                                className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-green-500" />
                              <button onClick={() => handleReview(log.log_id)} disabled={reviewSaving}
                                className="px-3 py-1.5 text-xs text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#059669" }}>
                                {reviewSaving ? "..." : "Confirm"}
                              </button>
                              <button onClick={() => setReviewingId(null)}
                                className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50 rounded-lg border border-gray-200">Cancel</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default FacultyLogsPage;
