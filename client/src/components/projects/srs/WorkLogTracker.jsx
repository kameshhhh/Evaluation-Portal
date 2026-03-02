// ================================================================
// WORK LOG TRACKER — SRS 4.1.1 Time & Activity Logging
// ================================================================
// Team members record work logs with description, hours, category,
// optional Git commit reference and evidence URL.
// Faculty can verify logs. Shows per-member summary.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Plus,
  Check,
  Trash2,
  GitCommit,
  LinkIcon,
  Loader2,
  Filter,
  BarChart3,
} from "lucide-react";
import {
  getWorkLogs,
  createWorkLog,
  deleteWorkLog,
  verifyWorkLog,
  getWorkLogSummary,
} from "../../../services/projectEnhancementApi";

const CATEGORIES = [
  "coding",
  "design",
  "testing",
  "documentation",
  "research",
  "meetings",
  "review",
  "deployment",
  "other",
];

const WorkLogTracker = ({ projectId, personId, isFaculty = false }) => {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");

  const [form, setForm] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    hours_spent: "",
    description: "",
    category: "coding",
    git_commit_ref: "",
    evidence_url: "",
  });

  const fetchLogs = useCallback(async () => {
    try {
      const params = { person_id: personId };
      if (filterCategory) params.category = filterCategory;
      const res = await getWorkLogs(projectId, params);
      setLogs(res.data || []);
    } catch (err) {
      console.error("Failed to load work logs:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, personId, filterCategory]);

  const fetchSummary = async () => {
    try {
      const res = await getWorkLogSummary(projectId, { person_id: personId });
      setSummary(res.data);
      setShowSummary(true);
    } catch (err) {
      console.error("Failed to load summary:", err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCreate = async () => {
    if (!form.hours_spent || !form.description.trim()) return;
    setSaving(true);
    try {
      await createWorkLog(projectId, {
        ...form,
        person_id: personId,
        hours_spent: parseFloat(form.hours_spent),
      });
      setShowForm(false);
      setForm({
        work_date: new Date().toISOString().slice(0, 10),
        hours_spent: "",
        description: "",
        category: "coding",
        git_commit_ref: "",
        evidence_url: "",
      });
      fetchLogs();
    } catch (err) {
      console.error("Failed to create log:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm("Delete this work log?")) return;
    try {
      await deleteWorkLog(projectId, logId);
      fetchLogs();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleVerify = async (logId) => {
    try {
      await verifyWorkLog(projectId, logId);
      fetchLogs();
    } catch (err) {
      console.error("Verify failed:", err);
    }
  };

  const totalHours = logs.reduce(
    (s, l) => s + parseFloat(l.hours_spent || 0),
    0,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading work logs...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Work Logs</h3>
          <span className="text-xs text-gray-500">
            ({logs.length} entries &middot; {totalHours.toFixed(1)}h)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchSummary}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            <BarChart3 size={14} />
            Summary
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Log Work
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-gray-400" />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Panel */}
      {showSummary && summary && (
        <div className="bg-gray-50 border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">
              {summary.total_hours || 0}
            </p>
            <p className="text-xs text-gray-500">Total Hours</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {summary.total_logs || 0}
            </p>
            <p className="text-xs text-gray-500">Entries</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {summary.verified_count || 0}
            </p>
            <p className="text-xs text-gray-500">Verified</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-orange-600">
              {summary.categories_used || 0}
            </p>
            <p className="text-xs text-gray-500">Categories</p>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={form.work_date}
                onChange={(e) =>
                  setForm({ ...form, work_date: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Hours
              </label>
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={form.hours_spent}
                onChange={(e) =>
                  setForm({ ...form, hours_spent: e.target.value })
                }
                placeholder="e.g. 2.5"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              placeholder="What did you work on?"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <GitCommit size={12} className="inline mr-1" />
                Git Commit Ref (optional)
              </label>
              <input
                value={form.git_commit_ref}
                onChange={(e) =>
                  setForm({ ...form, git_commit_ref: e.target.value })
                }
                placeholder="e.g. abc123f"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <LinkIcon size={12} className="inline mr-1" />
                Evidence URL (optional)
              </label>
              <input
                value={form.evidence_url}
                onChange={(e) =>
                  setForm({ ...form, evidence_url: e.target.value })
                }
                placeholder="https://..."
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !form.hours_spent || !form.description.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Log"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Logs List */}
      {logs.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          No work logs recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.log_id}
              className="bg-white border rounded-lg px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">
                    {log.work_date?.slice(0, 10)}
                  </span>
                  <span className="text-xs font-medium px-1.5 py-0.5 bg-gray-100 rounded">
                    {log.category}
                  </span>
                  <span className="text-xs text-blue-700 font-semibold">
                    {log.hours_spent}h
                  </span>
                  {log.verified_by && (
                    <span className="text-xs text-green-600 flex items-center gap-0.5">
                      <Check size={10} /> Verified
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 mt-1">{log.description}</p>
                {(log.git_commit_ref || log.evidence_url) && (
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {log.git_commit_ref && (
                      <span className="flex items-center gap-1">
                        <GitCommit size={10} /> {log.git_commit_ref}
                      </span>
                    )}
                    {log.evidence_url && (
                      <a
                        href={log.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <LinkIcon size={10} /> Evidence
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isFaculty && !log.verified_by && (
                  <button
                    onClick={() => handleVerify(log.log_id)}
                    title="Verify"
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Check size={14} />
                  </button>
                )}
                {!log.verified_by && (
                  <button
                    onClick={() => handleDelete(log.log_id)}
                    title="Delete"
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkLogTracker;
