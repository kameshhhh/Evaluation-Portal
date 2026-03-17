// ================================================================
// DAILY LOG TAB — Student daily work log with time-windowed submission
// ================================================================
import React, { useState, useEffect, useCallback } from "react";
import {
  Clock, Plus, Trash2, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, Send, FileText,
  Timer, CalendarDays, BookOpen,
} from "lucide-react";
import { useCountdown } from "../../hooks/useCountdown";
import {
  createDailyLog, getMyDailyLogs, getTodayStatus, deleteDailyLog,
} from "../../services/dailyWorkLogApi";

const DailyLogTab = () => {
  const [loading, setLoading] = useState(true);
  const [windowInfo, setWindowInfo] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);
  const [pastLogs, setPastLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedLog, setExpandedLog] = useState(null);
  const [form, setForm] = useState({
    summary: "", hours_spent: "", tasks_completed: "",
    challenges: "", learnings: "",
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [todayRes, logsRes] = await Promise.all([
        getTodayStatus(),
        getMyDailyLogs(),
      ]);
      setWindowInfo(todayRes.data?.window || null);
      setTodayLog(todayRes.data?.todayLog || null);
      setHasSubmittedToday(!!todayRes.data?.hasSubmittedToday);
      setPastLogs(logsRes.data || []);
    } catch (err) {
      console.error("Failed to load daily logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Refresh window info every 60 seconds
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await getTodayStatus();
        setWindowInfo(res.data?.window || null);
        setTodayLog(res.data?.todayLog || null);
        setHasSubmittedToday(!!res.data?.hasSubmittedToday);
      } catch {}
    }, 60000);
    return () => clearInterval(id);
  }, []);

  // Determine countdown target
  const isWindowOpen = windowInfo?.allowed;
  const isSunday = windowInfo?.isSunday;
  const countdownTarget = isWindowOpen
    ? windowInfo?.windowClosesAt
    : !isSunday && windowInfo?.istHour < 8
      ? windowInfo?.windowOpensAt
      : null;

  const countdown = useCountdown(countdownTarget);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.summary.trim() || !form.hours_spent) return;
    setSaving(true);
    setError("");
    try {
      const tasks = form.tasks_completed
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      await createDailyLog({
        summary: form.summary.trim(),
        hours_spent: parseFloat(form.hours_spent),
        tasks_completed: tasks,
        challenges: form.challenges.trim() || null,
        learnings: form.learnings.trim() || null,
      });
      setForm({ summary: "", hours_spent: "", tasks_completed: "", challenges: "", learnings: "" });
      setShowForm(false);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to submit daily log");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm("Delete this daily log?")) return;
    try {
      await deleteDailyLog(logId);
      fetchAll();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading daily logs...
      </div>
    );
  }

  const formatCountdown = () => {
    if (!countdownTarget || countdown.isPast) return null;
    const parts = [];
    if (countdown.hours > 0) parts.push(`${countdown.hours}h`);
    parts.push(`${countdown.minutes}m`);
    parts.push(`${countdown.seconds}s`);
    return parts.join(" ");
  };

  return (
    <div className="space-y-4">
      {/* ═══════ WINDOW STATUS BANNER ═══════ */}
      <div className={`rounded-xl border p-4 ${
        hasSubmittedToday
          ? "bg-green-50 border-green-200"
          : isWindowOpen
            ? "bg-emerald-50 border-emerald-200"
            : isSunday
              ? "bg-gray-50 border-gray-200"
              : "bg-amber-50 border-amber-200"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasSubmittedToday ? (
              <>
                <CheckCircle2 size={18} className="text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Today's log submitted!</p>
                  <p className="text-[10px] text-green-600">
                    Submitted at {new Date(todayLog?.created_at).toLocaleTimeString()} &middot;
                    {todayLog?.status === "reviewed" ? " Reviewed" : " Pending review"}
                  </p>
                </div>
              </>
            ) : isWindowOpen ? (
              <>
                <Timer size={18} className="text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Submission window is OPEN</p>
                  <p className="text-[10px] text-emerald-600">Submit your daily log before 4:00 PM IST</p>
                </div>
              </>
            ) : isSunday ? (
              <>
                <AlertCircle size={18} className="text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">No submissions on Sunday</p>
                  <p className="text-[10px] text-gray-500">Next window: Monday 8:00 AM IST</p>
                </div>
              </>
            ) : windowInfo?.istHour < 8 ? (
              <>
                <Clock size={18} className="text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Window opens at 8:00 AM IST</p>
                  <p className="text-[10px] text-amber-600">Come back when the window opens</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Window closed for today</p>
                  <p className="text-[10px] text-amber-600">Next window: tomorrow 8:00 AM IST</p>
                </div>
              </>
            )}
          </div>
          {/* Countdown */}
          {!hasSubmittedToday && countdownTarget && !countdown.isPast && (
            <div className={`text-right px-3 py-1.5 rounded-lg ${
              isWindowOpen ? "bg-emerald-100" : "bg-amber-100"
            }`}>
              <p className={`text-lg font-bold font-mono ${
                isWindowOpen ? "text-emerald-700" : "text-amber-700"
              }`}>
                {formatCountdown()}
              </p>
              <p className={`text-[9px] ${
                isWindowOpen ? "text-emerald-500" : "text-amber-500"
              }`}>
                {isWindowOpen ? "closes in" : "opens in"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ CREATE FORM ═══════ */}
      {isWindowOpen && !hasSubmittedToday && (
        <div>
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#7C3AED]/30 rounded-xl text-sm font-medium text-[#7C3AED] hover:bg-[#7C3AED]/5 transition-colors">
              <Plus size={16} /> Write Today's Daily Log
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <FileText size={14} className="text-[#7C3AED]" /> Daily Work Log
                </h3>
                <span className="text-[10px] text-gray-400">
                  {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
                </span>
              </div>

              {/* Summary */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Summary <span className="text-red-400">*</span>
                </label>
                <textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="What did you work on today?"
                  rows={3} required
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              </div>

              {/* Hours */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Hours Spent <span className="text-red-400">*</span>
                </label>
                <input type="number" min="0.5" max="16" step="0.5"
                  value={form.hours_spent} onChange={(e) => setForm({ ...form, hours_spent: e.target.value })}
                  placeholder="e.g. 4.5" required
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED]" />
              </div>

              {/* Tasks */}
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Tasks Completed <span className="text-[10px] text-gray-400 font-normal">(one per line)</span>
                </label>
                <textarea value={form.tasks_completed} onChange={(e) => setForm({ ...form, tasks_completed: e.target.value })}
                  placeholder={"Completed login page UI\nFixed API validation bug\nWrote unit tests for auth"}
                  rows={3}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
              </div>

              {/* Challenges + Learnings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Challenges</label>
                  <textarea value={form.challenges} onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                    placeholder="Any blockers or difficulties?"
                    rows={2}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Learnings</label>
                  <textarea value={form.learnings} onChange={(e) => setForm({ ...form, learnings: e.target.value })}
                    placeholder="What did you learn today?"
                    rows={2}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#7C3AED] resize-none" />
                </div>
              </div>

              {error && (
                <p className="text-[10px] text-red-600 flex items-center gap-1">
                  <AlertCircle size={10} /> {error}
                </p>
              )}

              <div className="flex gap-2">
                <button type="submit" disabled={saving || !form.summary.trim() || !form.hours_spent}
                  className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "#7C3AED" }}>
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {saving ? "Submitting..." : "Submit Daily Log"}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError(""); }}
                  className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ═══════ PAST LOGS LIST ═══════ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <CalendarDays size={14} className="text-gray-400" /> Your Daily Logs
          </h3>
          <button onClick={fetchAll} className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
            <RefreshCw size={10} /> Refresh
          </button>
        </div>

        {pastLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No daily logs yet.</p>
            <p className="text-[10px] mt-1">Submit your first daily log during the submission window (8 AM - 4 PM IST, Mon-Sat).</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastLogs.map((log) => {
              const isExpanded = expandedLog === log.log_id;
              const tasks = Array.isArray(log.tasks_completed) ? log.tasks_completed : [];
              const logDate = new Date(log.log_date);
              // IST date comparison for "Today" badge
              const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000) + (new Date().getTimezoneOffset() * 60000));
              const todayIST = nowIST.toISOString().slice(0, 10);
              const isToday = log.log_date === todayIST;

              return (
                <div key={log.log_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                  <button onClick={() => setExpandedLog(isExpanded ? null : log.log_id)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">
                          {logDate.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
                        </span>
                        {isToday && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">Today</span>
                        )}
                        <span className="text-[11px] text-gray-400">&middot;</span>
                        <span className="text-[11px] font-medium text-blue-700">{log.hours_spent}h</span>
                        {tasks.length > 0 && (
                          <>
                            <span className="text-[11px] text-gray-400">&middot;</span>
                            <span className="text-[10px] text-gray-500">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{log.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                        <div className="bg-green-50 rounded-lg p-2 mt-1">
                          <p className="text-[10px] font-semibold text-green-700 mb-0.5">Review by {log.reviewer_name || "Faculty"}</p>
                          <p className="text-xs text-green-800">{log.review_comment}</p>
                        </div>
                      )}
                      {/* Delete button for unreviewed */}
                      {log.status !== "reviewed" && (
                        <div className="pt-1">
                          <button onClick={() => handleDelete(log.log_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
                            <Trash2 size={10} /> Delete
                          </button>
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
    </div>
  );
};

export default DailyLogTab;
