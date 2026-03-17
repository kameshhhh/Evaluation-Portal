// ================================================================
// WORK LOG PAGE — Student Profile + Two Tabs (Projects | Sessions)
// ================================================================
import React, { useState, useEffect, useCallback } from "react";
import {
  Clock, Plus, Check, Trash2, GitCommit, LinkIcon, Loader2, FolderOpen,
  RefreshCw, User, GraduationCap, Building2, CalendarDays, Layers,
  BookOpen, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Lock,
  FileText, Send, Github, Shield, Eye, EyeOff, Pencil, X,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import usePersonalization from "../../hooks/usePersonalization";
import { useDataChange } from "../../hooks/useSocketEvent";
import { listProjects } from "../../services/projectService";
import {
  getWorkLogs, createWorkLog, deleteWorkLog, verifyWorkLog, getWorkLogSummary,
} from "../../services/projectEnhancementApi";
import { getMyTrack } from "../../services/sessionPlannerApi";
import {
  createSessionLog, getMySessionLogs, getMySessions, deleteSessionLog,
} from "../../services/sessionWorkLogApi";
import {
  saveGitHubToken, getGitHubTokenStatus, updateGitHubToken, deleteGitHubToken,
} from "../../services/githubApi";
import FacultyLogsPage from "./FacultyLogsPage";
import DailyLogTab from "./DailyLogTab";

const CATEGORIES = [
  "coding", "design", "testing", "documentation",
  "research", "meeting", "other",
];
const ensureUrl = (url) => (url && !/^https?:\/\//i.test(url) ? `https://${url}` : url);
const TRACK_LABELS = { core: "Core Project", it_core: "IT / IT-Core", premium: "Premium" };

const WorkLogPage = () => {
  const { user } = useAuth();
  const isFaculty = user?.role === "faculty" || user?.role === "admin";
  const personId = user?.personId || user?.userId;

  const { dashboardData, refresh: refreshDashboard } = usePersonalization();
  const profileUser = dashboardData?.user || {};

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState("projects");

  // ── Track ──
  const [trackData, setTrackData] = useState(null);
  const loadTrack = useCallback(async () => {
    if (isFaculty) return;
    try { const res = await getMyTrack(); setTrackData(res.data || null); } catch {}
  }, [isFaculty]);
  useEffect(() => { loadTrack(); }, [loadTrack]);

  // ── GitHub PAT ──
  const [ghStatus, setGhStatus] = useState(null); // null = loading, object = data, false = no token
  const [ghLoading, setGhLoading] = useState(true);
  const [ghShowForm, setGhShowForm] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [ghShowToken, setGhShowToken] = useState(false);
  const [ghSaving, setGhSaving] = useState(false);
  const [ghError, setGhError] = useState("");
  const [ghEditing, setGhEditing] = useState(false);

  const loadGhStatus = useCallback(async () => {
    if (isFaculty) { setGhLoading(false); return; }
    try {
      const res = await getGitHubTokenStatus();
      setGhStatus(res.data || false);
    } catch { setGhStatus(false); }
    finally { setGhLoading(false); }
  }, [isFaculty]);
  useEffect(() => { loadGhStatus(); }, [loadGhStatus]);

  const handleGhSave = async () => {
    if (!ghToken.trim()) return;
    setGhSaving(true);
    setGhError("");
    try {
      const fn = ghEditing ? updateGitHubToken : saveGitHubToken;
      await fn(ghToken.trim());
      setGhShowForm(false);
      setGhEditing(false);
      setGhToken("");
      loadGhStatus();
    } catch (err) {
      setGhError(err.response?.data?.error || "Failed to save token");
    } finally { setGhSaving(false); }
  };

  const handleGhDelete = async () => {
    if (!window.confirm("Remove your GitHub token? You won't be able to submit logs until you re-link.")) return;
    try {
      await deleteGitHubToken();
      setGhStatus(false);
      setGhShowForm(false);
      setGhEditing(false);
    } catch {}
  };

  const hasGitHub = ghStatus && ghStatus.is_valid;

  // ══════════════════════════════════════════════════════
  // PROJECTS TAB STATE
  // ══════════════════════════════════════════════════════
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projLogs, setProjLogs] = useState([]);
  const [projLoading, setProjLoading] = useState(true);
  const [projLoadingInit, setProjLoadingInit] = useState(true);
  const [showProjForm, setShowProjForm] = useState(false);
  const [projSaving, setProjSaving] = useState(false);
  const [projFilter, setProjFilter] = useState("");
  const [projForm, setProjForm] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    hours_spent: "", description: "", category: "coding",
    git_commit_ref: "", evidence_url: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const { projects: p } = await listProjects({}, 100, 0);
        setProjects(p);
        if (p.length > 0) setSelectedProject(p[0].projectId);
      } catch {}
      finally { setProjLoadingInit(false); }
    })();
  }, []);

  const fetchProjLogs = useCallback(async () => {
    if (!selectedProject) { setProjLogs([]); setProjLoading(false); return; }
    setProjLoading(true);
    try {
      const params = {};
      if (!isFaculty) params.personId = personId;
      if (projFilter) params.category = projFilter;
      const res = await getWorkLogs(selectedProject, params);
      setProjLogs(res.data || []);
    } catch { setProjLogs([]); }
    finally { setProjLoading(false); }
  }, [selectedProject, personId, projFilter, isFaculty]);

  useEffect(() => { fetchProjLogs(); }, [fetchProjLogs]);

  const handleProjCreate = async () => {
    if (!hasGitHub && !isFaculty) return;
    if (!projForm.hours_spent || !projForm.description.trim() || !selectedProject) return;
    setProjSaving(true);
    try {
      await createWorkLog(selectedProject, {
        logDate: projForm.work_date,
        hours: parseFloat(projForm.hours_spent),
        description: projForm.description,
        category: projForm.category,
        evidenceUrls: projForm.evidence_url ? [projForm.evidence_url] : [],
      });
      setShowProjForm(false);
      setProjForm({ work_date: new Date().toISOString().slice(0, 10), hours_spent: "", description: "", category: "coding", git_commit_ref: "", evidence_url: "" });
      fetchProjLogs();
    } catch (err) { console.error("Create project log failed:", err); }
    finally { setProjSaving(false); }
  };

  const handleProjDelete = async (logId) => {
    if (!window.confirm("Delete this work log?")) return;
    try { await deleteWorkLog(selectedProject, logId); fetchProjLogs(); } catch {}
  };
  const handleProjVerify = async (logId) => {
    try { await verifyWorkLog(selectedProject, logId); fetchProjLogs(); } catch {}
  };

  // ══════════════════════════════════════════════════════
  // SESSIONS TAB STATE
  // ══════════════════════════════════════════════════════
  const [sessions, setSessions] = useState([]);
  const [sessLogs, setSessLogs] = useState([]);
  const [sessLoading, setSessLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState("");
  const [showSessForm, setShowSessForm] = useState(false);
  const [sessSaving, setSessSaving] = useState(false);
  const [sessError, setSessError] = useState("");
  const [sessForm, setSessForm] = useState({
    summary: "", hours_spent: "", tasks_completed: "",
    challenges: "", learnings: "", next_week_plan: "", evidence_urls: "",
  });
  const [expandedLog, setExpandedLog] = useState(null);

  const fetchSessions = useCallback(async () => {
    if (isFaculty) return;
    try {
      const res = await getMySessions();
      setSessions(res.data || []);
    } catch {}
  }, [isFaculty]);

  const fetchSessLogs = useCallback(async () => {
    setSessLoading(true);
    try {
      const res = await getMySessionLogs(selectedSession || undefined);
      setSessLogs(res.data || []);
    } catch { setSessLogs([]); }
    finally { setSessLoading(false); }
  }, [selectedSession]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { if (activeTab === "sessions") fetchSessLogs(); }, [fetchSessLogs, activeTab]);

  const canLogSession = (sess) => {
    if (!sess) return false;
    if (sess.status !== "active") return false;
    if (sess.has_this_week_log) return false;
    const now = new Date();
    if (sess.opens_at && now < new Date(sess.opens_at)) return false;
    if (sess.closes_at && now > new Date(sess.closes_at)) return false;
    return true;
  };

  const selectedSessObj = sessions.find((s) => s.session_id === selectedSession);

  const handleSessCreate = async () => {
    if (!hasGitHub && !isFaculty) return;
    if (!sessForm.summary.trim() || !sessForm.hours_spent || !selectedSession) return;
    setSessSaving(true);
    setSessError("");
    try {
      await createSessionLog({
        session_id: selectedSession,
        summary: sessForm.summary,
        hours_spent: parseFloat(sessForm.hours_spent),
        tasks_completed: sessForm.tasks_completed ? sessForm.tasks_completed.split("\n").filter(Boolean) : [],
        challenges: sessForm.challenges,
        learnings: sessForm.learnings,
        next_week_plan: sessForm.next_week_plan,
        evidence_urls: sessForm.evidence_urls ? sessForm.evidence_urls.split("\n").filter(Boolean) : [],
      });
      setShowSessForm(false);
      setSessForm({ summary: "", hours_spent: "", tasks_completed: "", challenges: "", learnings: "", next_week_plan: "", evidence_urls: "" });
      fetchSessLogs();
      fetchSessions();
    } catch (err) {
      setSessError(err.response?.data?.error || "Failed to submit log");
    }
    finally { setSessSaving(false); }
  };

  const handleSessDelete = async (logId) => {
    if (!window.confirm("Delete this session log?")) return;
    try { await deleteSessionLog(logId); fetchSessLogs(); fetchSessions(); } catch {}
  };

  // ── Real-time ──
  useDataChange("project_enhancement", fetchProjLogs);
  useDataChange("session_work_log", () => { fetchSessLogs(); fetchSessions(); });

  const refreshAll = () => { refreshDashboard(); loadTrack(); loadGhStatus(); fetchProjLogs(); fetchSessions(); fetchSessLogs(); };

  // ── Helpers ──
  const getYearLabel = (admYear) => {
    if (!admYear) return null;
    const diff = new Date().getFullYear() - admYear;
    if (diff <= 0) return "1st Year";
    if (diff === 1) return "2nd Year";
    if (diff === 2) return "3rd Year";
    if (diff === 3) return "4th Year";
    return "Alumni";
  };

  const totalProjHours = projLogs.reduce((s, l) => s + parseFloat(l.hours || l.hours_spent || 0), 0);

  // ── Faculty/Admin role gate — show admin-like logs view ──
  if (isFaculty) return <FacultyLogsPage />;

  if (projLoadingInit && !dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#7C3AED]" /> WorkLog
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Your profile &amp; work logs</p>
        </div>
        <button onClick={refreshAll} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ═══════ PROFILE CARD ═══════ */}
      <div className="mb-4 bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-[#F5F3FF] flex items-center justify-center">
            <User size={20} className="text-[#7C3AED]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{profileUser.name || user?.name || user?.email || "Student"}</h2>
            <p className="text-[11px] text-gray-400">{profileUser.email || user?.email}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-gray-400" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Department</p>
              <p className="text-xs font-medium text-gray-800">{profileUser.departmentName || profileUser.department || profileUser.departmentCode || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GraduationCap size={14} className="text-gray-400" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Year</p>
              <p className="text-xs font-medium text-gray-800">{getYearLabel(profileUser.admissionYear) || (profileUser.academicYear ? `Year ${profileUser.academicYear}` : "—")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-gray-400" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Semester</p>
              <p className="text-xs font-medium text-gray-800">{profileUser.semester || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-gray-400" />
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Track</p>
              <p className="text-xs font-medium text-[#7C3AED]">{trackData ? (TRACK_LABELS[trackData.track] || trackData.track) : "Not selected"}</p>
            </div>
          </div>
        </div>
        {profileUser.admissionYear && (
          <p className="text-[10px] text-gray-400 mt-3 border-t border-gray-50 pt-2">
            Batch {profileUser.admissionYear}{profileUser.graduationYear ? ` – ${profileUser.graduationYear}` : ""} &middot; {profileUser.status || "active"}
          </p>
        )}
      </div>

      {/* ═══════ GITHUB LINK SECTION ═══════ */}
      {!isFaculty && (
        <div className="mb-4 bg-white border border-gray-100 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Github size={16} className="text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-800">GitHub Account</h3>
              {hasGitHub && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium flex items-center gap-0.5">
                  <CheckCircle2 size={9} /> Linked
                </span>
              )}
              {!ghLoading && !hasGitHub && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 font-medium flex items-center gap-0.5">
                  <AlertCircle size={9} /> Required
                </span>
              )}
            </div>
            {hasGitHub && !ghShowForm && (
              <div className="flex gap-1.5">
                <button onClick={() => { setGhEditing(true); setGhShowForm(true); setGhToken(""); setGhError(""); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Pencil size={10} /> Edit
                </button>
                <button onClick={handleGhDelete}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
                  <Trash2 size={10} /> Remove
                </button>
              </div>
            )}
          </div>

          {hasGitHub && !ghShowForm && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              {ghStatus.github_avatar_url && (
                <img src={ghStatus.github_avatar_url} alt="" className="w-8 h-8 rounded-full" />
              )}
              <div>
                <p className="text-xs font-medium text-gray-800">@{ghStatus.github_username}</p>
                <p className="text-[10px] text-gray-400">
                  Linked {new Date(ghStatus.created_at).toLocaleDateString()} · Scopes: {ghStatus.token_scopes?.join(", ") || "—"}
                </p>
              </div>
            </div>
          )}

          {!hasGitHub && !ghShowForm && !ghLoading && (
            <div className="text-center py-4">
              <Github size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-500 mb-1">Link your GitHub to submit work logs</p>
              <p className="text-[10px] text-gray-400 mb-3 max-w-sm mx-auto">
                Create a <strong>Personal Access Token (classic)</strong> with scopes: 
                <code className="bg-gray-100 px-1 rounded text-[10px]">public_repo</code>, 
                <code className="bg-gray-100 px-1 rounded text-[10px]">read:user</code>, 
                <code className="bg-gray-100 px-1 rounded text-[10px]">user:email</code>
              </p>
              <button onClick={() => { setGhShowForm(true); setGhEditing(false); setGhToken(""); setGhError(""); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white rounded-lg"
                style={{ backgroundColor: "#7C3AED" }}>
                <Shield size={13} /> Link GitHub Account
              </button>
            </div>
          )}

          {ghShowForm && (
            <div className="mt-2 space-y-2">
              <div className="bg-blue-50 rounded-lg p-2.5">
                <p className="text-[10px] text-blue-700 font-medium mb-1">How to create your token:</p>
                <ol className="text-[10px] text-blue-600 space-y-0.5 list-decimal pl-3">
                  <li>Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
                  <li>Click "Generate new token (classic)"</li>
                  <li>Enable scopes: <strong>public_repo</strong>, <strong>read:user</strong>, <strong>user:email</strong></li>
                  <li>Generate and paste the token below</li>
                </ol>
              </div>
              <div className="relative">
                <input
                  type={ghShowToken ? "text" : "password"}
                  value={ghToken}
                  onChange={(e) => setGhToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] pr-10"
                />
                <button onClick={() => setGhShowToken(!ghShowToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {ghShowToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {ghError && (
                <p className="text-[10px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={10} /> {ghError}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={handleGhSave} disabled={ghSaving || !ghToken.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
                  style={{ backgroundColor: "#7C3AED" }}>
                  {ghSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {ghSaving ? "Validating…" : ghEditing ? "Update Token" : "Save & Validate"}
                </button>
                <button onClick={() => { setGhShowForm(false); setGhEditing(false); setGhError(""); }}
                  className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ PAT REQUIRED BANNER ═══════ */}
      {!isFaculty && !hasGitHub && !ghLoading && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            <strong>GitHub account required.</strong> Link your GitHub Personal Access Token above before submitting work logs.
          </p>
        </div>
      )}

      {/* ═══════ TAB SWITCHER ═══════ */}
      <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-4">
        {[
          { id: "projects", label: "Projects", icon: FolderOpen, count: projects.length },
          { id: "sessions", label: "Sessions", icon: BookOpen, count: sessions.length },
          { id: "daily", label: "Daily Log", icon: CalendarDays },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-[#7C3AED] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}>
            <tab.icon size={14} />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PROJECTS TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === "projects" && (
        <div>
          {/* Project selector + category filter + log button */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-1">
              <FolderOpen size={13} className="text-gray-400 flex-shrink-0" />
              <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent bg-white">
                {projects.length === 0 && <option value="">No projects</option>}
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>{p.title || p.projectId}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select value={projFilter} onChange={(e) => setProjFilter(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED] bg-white">
                <option value="">All</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              {!isFaculty && selectedProject && (
                <button onClick={() => setShowProjForm(!showProjForm)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white rounded-lg" style={{ backgroundColor: "#7C3AED" }}>
                  <Plus size={12} /> Log
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-500">
            <span><b className="text-gray-700">{totalProjHours.toFixed(1)}h</b> logged</span>
            <span><b className="text-gray-700">{projLogs.filter((l) => l.verified_by).length}</b> verified</span>
            <span><b className="text-gray-700">{new Set(projLogs.map((l) => l.category)).size}</b> categories</span>
          </div>

          {/* Create form — date locked to today */}
          {showProjForm && (
            <div className="border rounded-xl p-4 mb-3 space-y-3" style={{ backgroundColor: "#FAF5FF", borderColor: "#E9D5FF" }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="date" value={new Date().toISOString().slice(0, 10)} disabled
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-gray-50 text-gray-500 cursor-not-allowed" />
                <input type="number" min="0.25" max="24" step="0.25" value={projForm.hours_spent}
                  onChange={(e) => setProjForm({ ...projForm, hours_spent: e.target.value })} placeholder="Hours (e.g. 2.5)"
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
                <select value={projForm.category} onChange={(e) => setProjForm({ ...projForm, category: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED]">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <textarea value={projForm.description} onChange={(e) => setProjForm({ ...projForm, description: e.target.value })}
                rows={2} placeholder="What did you work on today?"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <input value={projForm.git_commit_ref} onChange={(e) => setProjForm({ ...projForm, git_commit_ref: e.target.value })}
                  placeholder="Git ref (optional)" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
                <input value={projForm.evidence_url} onChange={(e) => setProjForm({ ...projForm, evidence_url: e.target.value })}
                  placeholder="Evidence URL (optional)" className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleProjCreate} disabled={projSaving || !projForm.hours_spent || !projForm.description.trim()}
                  className="px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50" style={{ backgroundColor: "#7C3AED" }}>
                  {projSaving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setShowProjForm(false)} className="px-3 py-1.5 bg-white text-gray-600 text-xs rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Log entries */}
          {projLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={16} className="animate-spin mr-1.5" /> Loading…</div>
          ) : projLogs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No project logs yet. Click "+ Log" to submit today's work.</p>
          ) : (
            <div className="space-y-1.5">
              {projLogs.map((log) => (
                <div key={log.log_id} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-start justify-between gap-2 hover:shadow-sm transition-shadow">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-gray-400">{log.work_date?.slice(0, 10) || log.log_date?.slice(0, 10)}</span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#F5F3FF", color: "#7C3AED" }}>{log.category}</span>
                      <span className="text-[11px] font-semibold text-blue-700">{log.hours_spent || log.hours}h</span>
                      {(log.verified_by || log.is_verified) && <span className="text-[10px] text-green-600 flex items-center gap-0.5"><Check size={9} /> Verified</span>}
                    </div>
                    <p className="text-xs text-gray-700 mt-0.5 line-clamp-1">{log.description}</p>
                    {(log.linked_commit_id || (log.evidence_urls && log.evidence_urls.length > 0)) && (
                      <div className="flex gap-2 mt-0.5 text-[10px] text-gray-400">
                        {log.linked_commit_id && <span className="flex items-center gap-0.5"><GitCommit size={9} /> {log.linked_commit_id.slice(0, 8)}</span>}
                        {log.evidence_urls && log.evidence_urls.length > 0 && (
                          <a href={ensureUrl(log.evidence_urls[0])} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[#7C3AED] hover:underline">
                            <LinkIcon size={9} /> Evidence
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {isFaculty && !log.verified_by && !log.is_verified && (
                      <button onClick={() => handleProjVerify(log.log_id)} title="Verify" className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={13} /></button>
                    )}
                    {!log.verified_by && !log.is_verified && !isFaculty && (
                      <button onClick={() => handleProjDelete(log.log_id)} title="Delete" className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SESSIONS TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === "sessions" && (
        <div>
          {/* Session selector */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-1">
              <BookOpen size={13} className="text-gray-400 flex-shrink-0" />
              <select value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[#7C3AED] focus:border-transparent bg-white">
                <option value="">All Sessions</option>
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.title} {s.status !== "active" ? `(${s.status})` : ""} — {s.total_logs} log{s.total_logs !== 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
            {!isFaculty && selectedSession && canLogSession(selectedSessObj) && (
              <button onClick={() => { setShowSessForm(!showSessForm); setSessError(""); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white rounded-lg" style={{ backgroundColor: "#7C3AED" }}>
                <Plus size={12} /> Weekly Log
              </button>
            )}
          </div>

          {/* Session cards overview */}
          {!selectedSession && sessions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              {sessions.map((s) => {
                const isActive = s.status === "active";
                const isEvaluated = s.assignment_status === "evaluation_done" || s.assignment_status === "completed" || s.marks_submitted_at;
                return (
                  <button key={s.session_id} onClick={() => setSelectedSession(s.session_id)}
                    className="bg-white border border-gray-100 rounded-xl p-3 text-left hover:shadow-md hover:border-[#7C3AED]/30 transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-[#7C3AED]">{s.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            isActive ? "bg-green-50 text-green-600" :
                            s.status === "closed" ? "bg-gray-100 text-gray-500" :
                            s.status === "archived" ? "bg-gray-100 text-gray-400" :
                            "bg-blue-50 text-blue-600"
                          }`}>{s.status}</span>
                          {isEvaluated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium flex items-center gap-0.5">
                              <CheckCircle2 size={9} /> Evaluated
                            </span>
                          )}
                          {s.marks != null && (
                            <span className="text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                              {Number(s.marks).toFixed(1)} marks
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-[#7C3AED]">{s.total_logs}</p>
                        <p className="text-[10px] text-gray-400">logs</p>
                      </div>
                    </div>
                    {s.has_this_week_log && isActive && (
                      <p className="text-[10px] text-green-600 mt-2 flex items-center gap-1">
                        <CheckCircle2 size={10} /> This week's log submitted
                      </p>
                    )}
                    {!s.has_this_week_log && isActive && (
                      <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                        <AlertCircle size={10} /> Weekly log pending
                      </p>
                    )}
                    {!isActive && (
                      <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                        <Lock size={10} /> Read only
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {sessions.length === 0 && (
            <div className="text-center py-10">
              <BookOpen size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No evaluation sessions assigned yet.</p>
            </div>
          )}

          {/* Session log form */}
          {showSessForm && selectedSession && (
            <div className="border rounded-xl p-4 mb-4 space-y-3" style={{ backgroundColor: "#FAF5FF", borderColor: "#E9D5FF" }}>
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-[#7C3AED]" />
                <h3 className="text-xs font-semibold text-gray-800">Weekly Session Log</h3>
                <span className="text-[10px] text-gray-400">Week of {new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86400000).toLocaleDateString()}</span>
              </div>
              {sessError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={13} /> {sessError}
                </div>
              )}
              <textarea value={sessForm.summary} onChange={(e) => setSessForm({ ...sessForm, summary: e.target.value })}
                rows={3} placeholder="Summary of this week's work…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="number" min="0.5" max="100" step="0.5" value={sessForm.hours_spent}
                  onChange={(e) => setSessForm({ ...sessForm, hours_spent: e.target.value })} placeholder="Total hours this week"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
                <input value={sessForm.evidence_urls} onChange={(e) => setSessForm({ ...sessForm, evidence_urls: e.target.value })}
                  placeholder="Evidence URLs (one per line)" className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
              </div>
              <textarea value={sessForm.tasks_completed} onChange={(e) => setSessForm({ ...sessForm, tasks_completed: e.target.value })}
                rows={2} placeholder="Tasks completed (one per line)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <textarea value={sessForm.challenges} onChange={(e) => setSessForm({ ...sessForm, challenges: e.target.value })}
                  rows={2} placeholder="Challenges faced…"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
                <textarea value={sessForm.learnings} onChange={(e) => setSessForm({ ...sessForm, learnings: e.target.value })}
                  rows={2} placeholder="Key learnings…"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
                <textarea value={sessForm.next_week_plan} onChange={(e) => setSessForm({ ...sessForm, next_week_plan: e.target.value })}
                  rows={2} placeholder="Next week plan…"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSessCreate} disabled={sessSaving || !sessForm.summary.trim() || !sessForm.hours_spent}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50" style={{ backgroundColor: "#7C3AED" }}>
                  {sessSaving ? <><Loader2 size={12} className="animate-spin" /> Submitting…</> : <><Send size={12} /> Submit</>}
                </button>
                <button onClick={() => { setShowSessForm(false); setSessError(""); }}
                  className="px-3 py-1.5 bg-white text-gray-600 text-xs rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          {/* Session log entries */}
          {sessLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={16} className="animate-spin mr-1.5" /> Loading…</div>
          ) : sessLogs.length === 0 && selectedSession ? (
            <p className="text-xs text-gray-400 text-center py-6">No logs for this session yet.</p>
          ) : sessLogs.length > 0 && (
            <div className="space-y-2">
              {sessLogs.map((log) => {
                const isExpanded = expandedLog === log.log_id;
                const isReadOnly = log.session_status !== "active" || log.status === "reviewed";
                return (
                  <div key={log.log_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                    <button onClick={() => setExpandedLog(isExpanded ? null : log.log_id)}
                      className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-gray-400">Week of {new Date(log.week_start).toLocaleDateString()}</span>
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{log.session_title}</span>
                          <span className="text-[11px] font-semibold text-blue-700">{log.hours_spent}h</span>
                          {log.status === "reviewed" && (
                            <span className="text-[10px] text-green-600 flex items-center gap-0.5"><CheckCircle2 size={9} /> Reviewed</span>
                          )}
                          {isReadOnly && log.status !== "reviewed" && (
                            <Lock size={10} className="text-gray-300" />
                          )}
                        </div>
                        <p className="text-xs text-gray-700 mt-0.5 line-clamp-1">{log.summary}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isReadOnly && !isFaculty && (
                          <button onClick={(e) => { e.stopPropagation(); handleSessDelete(log.log_id); }}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                        )}
                        {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-2">
                        {log.tasks_completed && log.tasks_completed.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Tasks Completed</p>
                            <ul className="text-xs text-gray-700 space-y-0.5 pl-3">
                              {(Array.isArray(log.tasks_completed) ? log.tasks_completed : []).map((t, i) => (
                                <li key={i} className="list-disc">{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}
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
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Next Week Plan</p>
                            <p className="text-xs text-gray-600">{log.next_week_plan}</p>
                          </div>
                        )}
                        {log.evidence_urls && log.evidence_urls.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Evidence</p>
                            <div className="flex flex-wrap gap-1.5">
                              {log.evidence_urls.map((url, i) => (
                                <a key={i} href={ensureUrl(url)} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-[#7C3AED] hover:underline flex items-center gap-0.5">
                                  <LinkIcon size={9} /> Link {i + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {log.review_comment && (
                          <div className="bg-green-50 rounded-lg p-2 mt-1">
                            <p className="text-[10px] font-semibold text-green-700 mb-0.5">Review by {log.reviewer_name || "Faculty"}</p>
                            <p className="text-xs text-green-800">{log.review_comment}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DAILY LOG TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {activeTab === "daily" && <DailyLogTab />}
    </div>
  );
};

export default WorkLogPage;
