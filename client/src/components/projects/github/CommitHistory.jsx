// ================================================================
// COMMIT HISTORY — GitHub-Lite Commit Log
// ================================================================
// Displays a list of commits with author, message, date, and
// changed file information. Supports branch filtering.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  GitCommit,
  GitBranch,
  User,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileCode,
} from "lucide-react";
import {
  getCommits,
  getCommitDetail,
  getBranches,
} from "../../../services/gitRepoApi";

const CommitHistory = ({ projectId }) => {
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [expandedId, setExpandedId] = useState(null);
  const [commitDetail, setCommitDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCommits(projectId, { branch: activeBranch });
      setCommits(res.data || []);
    } catch (err) {
      console.error("Failed to load commits:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, activeBranch]);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await getBranches(projectId);
      setBranches(res.data || []);
    } catch (err) {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    fetchCommits();
    fetchBranches();
  }, [fetchCommits, fetchBranches]);

  const toggleExpand = async (commitId) => {
    if (expandedId === commitId) {
      setExpandedId(null);
      setCommitDetail(null);
      return;
    }
    setExpandedId(commitId);
    try {
      const res = await getCommitDetail(projectId, commitId);
      setCommitDetail(res.data);
    } catch (err) {
      console.error("Failed to load commit detail:", err);
    }
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading commits...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCommit size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Commits</h3>
          <span className="text-xs text-gray-500">({commits.length})</span>
        </div>
        <div className="flex items-center gap-1 border rounded-lg px-2 py-1">
          <GitBranch size={14} className="text-gray-500" />
          <select
            value={activeBranch}
            onChange={(e) => setActiveBranch(e.target.value)}
            className="text-sm bg-transparent border-none focus:ring-0"
          >
            {branches.length === 0 && <option value="main">main</option>}
            {branches.map((b) => (
              <option key={b.branch_name} value={b.branch_name}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Commit List */}
      {commits.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <GitCommit size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No commits yet on this branch.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {commits.map((c) => {
            const isExpanded = expandedId === c.commit_id;
            return (
              <div
                key={c.commit_id}
                className="bg-white border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(c.commit_id)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                >
                  {/* Timeline dot */}
                  <div className="mt-1 w-3 h-3 bg-blue-500 rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.commit_message}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {c.author_name || "Unknown"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {c.created_at ? timeAgo(c.created_at) : ""}
                      </span>
                      <span className="font-mono text-gray-400">
                        {c.commit_id?.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-gray-400 mt-1" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400 mt-1" />
                  )}
                </button>

                {isExpanded && commitDetail && (
                  <div className="px-4 pb-3 border-t pt-3 ml-6">
                    {commitDetail.files_changed &&
                    commitDetail.files_changed.length > 0 ? (
                      <div>
                        <h5 className="text-xs font-medium text-gray-500 mb-2">
                          Files Changed ({commitDetail.files_changed.length})
                        </h5>
                        <div className="space-y-1">
                          {commitDetail.files_changed.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-sm text-gray-700"
                            >
                              <FileCode size={12} className="text-gray-400" />
                              <span className="font-mono text-xs">
                                {f.file_path || f}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        No file details available.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommitHistory;
