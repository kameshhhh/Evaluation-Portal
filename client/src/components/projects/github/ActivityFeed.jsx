// ================================================================
// ACTIVITY FEED — GitHub-Lite Real-Time Activity Stream
// ================================================================
// Displays a chronological feed of project activities: commits,
// issues, PRs, branch operations, and more.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  GitCommit,
  GitBranch,
  GitPullRequest,
  CircleDot,
  FileCode,
  MessageSquare,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { getActivityFeed } from "../../../services/gitRepoApi";

const ACTIVITY_ICONS = {
  commit: GitCommit,
  branch_create: GitBranch,
  branch_delete: GitBranch,
  issue_create: CircleDot,
  issue_close: CircleDot,
  issue_update: CircleDot,
  issue_comment: MessageSquare,
  pr_create: GitPullRequest,
  pr_merge: GitPullRequest,
  pr_merged: GitPullRequest,
  pr_close: GitPullRequest,
  pr_closed: GitPullRequest,
  pr_comment: MessageSquare,
  pr_review: GitPullRequest,
  pr_update: GitPullRequest,
  file_create: FileCode,
  file_delete: FileCode,
};

const ACTIVITY_COLORS = {
  commit: "text-blue-600 bg-blue-50",
  branch_create: "text-green-600 bg-green-50",
  branch_delete: "text-red-500 bg-red-50",
  issue_create: "text-green-600 bg-green-50",
  issue_close: "text-purple-600 bg-purple-50",
  issue_update: "text-yellow-600 bg-yellow-50",
  issue_comment: "text-gray-600 bg-gray-50",
  pr_create: "text-green-600 bg-green-50",
  pr_merge: "text-purple-600 bg-purple-50",
  pr_merged: "text-purple-600 bg-purple-50",
  pr_close: "text-red-500 bg-red-50",
  pr_closed: "text-red-500 bg-red-50",
  pr_comment: "text-gray-600 bg-gray-50",
  pr_review: "text-blue-600 bg-blue-50",
  pr_update: "text-yellow-600 bg-yellow-50",
  file_create: "text-blue-500 bg-blue-50",
  file_delete: "text-red-500 bg-red-50",
};

const ActivityFeed = ({ projectId, refreshKey }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActivityFeed(projectId, { page, limit: 30 });
      setActivities(res.data || []);
    } catch (err) {
      console.error("Failed to load activity feed:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities, refreshKey]);

  const timeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getDescription = (a) => {
    const d = a.data || {};
    switch (a.activity_type) {
      case "commit":
        return `committed: ${d.message || ""}`;
      case "branch_create":
        return `created branch ${d.branchName || d.branch || ""}`;
      case "branch_delete":
        return `deleted branch ${d.branchName || d.branch || ""}`;
      case "issue_create":
        return `opened issue #${d.issueNumber || d.issue_number || ""}: ${d.title || ""}`;
      case "issue_close":
        return `closed issue #${d.issueNumber || d.issue_number || ""}`;
      case "issue_update":
        return `updated issue #${d.issueNumber || d.issue_number || ""}`;
      case "issue_comment":
        return `commented on issue #${d.issueNumber || d.issue_number || ""}`;
      case "pr_create":
        return `opened PR #${d.prNumber || d.pr_number || ""}: ${d.title || ""}`;
      case "pr_merged":
        return `merged PR #${d.prNumber || d.pr_number || ""}`;
      case "pr_merge":
        return `merged PR #${d.prNumber || d.pr_number || ""}`;
      case "pr_closed":
        return `closed PR #${d.prNumber || d.pr_number || ""}`;
      case "pr_close":
        return `closed PR #${d.prNumber || d.pr_number || ""}`;
      case "pr_comment":
        return `commented on PR #${d.prNumber || d.pr_number || ""}`;
      case "pr_review":
        return `reviewed PR #${d.prNumber || d.pr_number || ""} (${d.reviewStatus || "reviewed"})`;
      case "file_delete":
        return `deleted file ${d.filePath || ""}`;
      default:
        return a.activity_type?.replace(/_/g, " ") || "activity";
    }
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading activity...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Activity Feed</h3>
        </div>
        <button
          onClick={fetchActivities}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Activity Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Activity size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-1">
            {activities.map((a, idx) => {
              const Icon = ACTIVITY_ICONS[a.activity_type] || Activity;
              const colorClass =
                ACTIVITY_COLORS[a.activity_type] || "text-gray-500 bg-gray-50";

              return (
                <div
                  key={a.activity_id || idx}
                  className="relative flex items-start gap-3 pl-2"
                >
                  {/* Icon */}
                  <div
                    className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}
                  >
                    <Icon size={14} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-3">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">
                        {a.actor_name || "Someone"}
                      </span>{" "}
                      {getDescription(a)}
                    </p>
                    <span className="text-xs text-gray-400">
                      {timeAgo(a.occurred_at || a.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {activities.length >= 30 && (
        <div className="flex justify-center">
          <button
            onClick={() => setPage(page + 1)}
            className="text-sm text-blue-600 hover:underline"
          >
            Load more...
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;
