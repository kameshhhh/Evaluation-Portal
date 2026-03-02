// ================================================================
// ISSUE TRACKER — GitHub-Lite Issue Management
// ================================================================
// Full CRUD for project issues with status, priority, labels.
// Supports open/closed filtering and assignment.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  CircleDot,
  Plus,
  CheckCircle2,
  Tag,
  User,
  Clock,
  Loader2,
} from "lucide-react";
import {
  getIssues,
  createIssue,
  updateIssue,
  getIssueDetail,
} from "../../../services/gitRepoApi";

const PRIORITY_CONFIG = {
  low: { color: "bg-gray-100 text-gray-600", label: "Low" },
  medium: { color: "bg-yellow-100 text-yellow-700", label: "Medium" },
  high: { color: "bg-orange-100 text-orange-700", label: "High" },
  critical: { color: "bg-red-100 text-red-700", label: "Critical" },
};

const IssueTracker = ({ projectId }) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    labels: "",
  });

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getIssues(projectId, { status: statusFilter });
      setIssues(res.data || []);
    } catch (err) {
      console.error("Failed to load issues:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const labels = form.labels
        ? form.labels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
      await createIssue(projectId, { ...form, labels });
      setShowCreate(false);
      setForm({ title: "", description: "", priority: "medium", labels: "" });
      fetchIssues();
    } catch (err) {
      console.error("Create issue failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (issue) => {
    const newStatus = issue.status === "open" ? "closed" : "open";
    try {
      await updateIssue(issue.issue_id, { status: newStatus });
      fetchIssues();
    } catch (err) {
      console.error("Status toggle failed:", err);
    }
  };

  const viewIssue = async (issue) => {
    try {
      const res = await getIssueDetail(issue.issue_id);
      setSelectedIssue(res.data);
    } catch (err) {
      console.error("Failed to load issue:", err);
    }
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return "just now";
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // Detail view
  if (selectedIssue) {
    const pcfg =
      PRIORITY_CONFIG[selectedIssue.priority] || PRIORITY_CONFIG.medium;
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedIssue(null)}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to issues
        </button>
        <div className="bg-white border rounded-lg p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">
                  #{selectedIssue.issue_number}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedIssue.status === "open"
                      ? "bg-green-100 text-green-700"
                      : "bg-purple-100 text-purple-700"
                  }`}
                >
                  {selectedIssue.status}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${pcfg.color}`}>
                  {pcfg.label}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedIssue.title}
              </h3>
            </div>
            <button
              onClick={() => toggleStatus(selectedIssue)}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                selectedIssue.status === "open"
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {selectedIssue.status === "open" ? "Close Issue" : "Reopen"}
            </button>
          </div>
          {selectedIssue.description && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
              {selectedIssue.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {selectedIssue.author_name && (
              <span className="flex items-center gap-1">
                <User size={10} /> {selectedIssue.author_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={10} /> {timeAgo(selectedIssue.created_at)}
            </span>
          </div>
          {selectedIssue.labels && selectedIssue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedIssue.labels.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                >
                  <Tag size={10} />
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CircleDot size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Issues</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus size={14} />
          New Issue
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b">
        {["open", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === s
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s === "open" ? (
              <span className="flex items-center gap-1">
                <CircleDot size={14} /> Open
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 size={14} /> Closed
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Issue title"
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
            />
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
              rows={3}
              placeholder="Describe the issue..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Labels (comma-separated)
              </label>
              <input
                value={form.labels}
                onChange={(e) => setForm({ ...form, labels: e.target.value })}
                placeholder="bug, frontend, urgent"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Issue"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Issues List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading issues...
        </div>
      ) : issues.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CircleDot size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">
            No {statusFilter} issues.{" "}
            {statusFilter === "open" &&
              "Create one to start tracking bugs and tasks!"}
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {issues.map((issue) => {
            const pcfg =
              PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
            return (
              <div
                key={issue.issue_id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <button
                  onClick={() => toggleStatus(issue)}
                  className="mt-0.5 flex-shrink-0"
                  title={issue.status === "open" ? "Close" : "Reopen"}
                >
                  {issue.status === "open" ? (
                    <CircleDot size={18} className="text-green-600" />
                  ) : (
                    <CheckCircle2 size={18} className="text-purple-600" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => viewIssue(issue)}
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 text-left"
                  >
                    {issue.title}
                  </button>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">
                      #{issue.issue_number}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${pcfg.color}`}
                    >
                      {pcfg.label}
                    </span>
                    {issue.labels &&
                      issue.labels.map((l) => (
                        <span
                          key={l}
                          className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full"
                        >
                          {l}
                        </span>
                      ))}
                    <span className="text-xs text-gray-400">
                      {timeAgo(issue.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IssueTracker;
