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
  Eye,
  Plus,
  Minus,
} from "lucide-react";
import {
  getCommits,
  getCommitDetail,
  getBranches,
  diffBetweenCommits,
} from "../../../services/gitRepoApi";
import DiffViewer from "./DiffViewer";

const PAGE_SIZE = 20;

const CommitHistory = ({ projectId, refreshKey }) => {
  const [commits, setCommits] = useState([]);
  const [branches, setBranches] = useState([]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [expandedId, setExpandedId] = useState(null);
  const [commitDetail, setCommitDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCommits, setTotalCommits] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [viewingDiff, setViewingDiff] = useState(null); // commit_hash for diff view
  const [viewingRangeDiff, setViewingRangeDiff] = useState(null); // { from, to }
  const [rangeDiffData, setRangeDiffData] = useState(null);

  const fetchCommits = useCallback(async (append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const offset = append ? commits.length : 0;
      const res = await getCommits(projectId, {
        branch: activeBranch,
        limit: PAGE_SIZE,
        offset,
      });
      const newCommits = res.data || [];
      if (append) {
        setCommits((prev) => [...prev, ...newCommits]);
      } else {
        setCommits(newCommits);
      }
      setTotalCommits(res.total || newCommits.length);
      setHasMore(res.hasMore || false);
    } catch (err) {
      console.error("Failed to load commits:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [projectId, activeBranch, commits.length]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch, refreshKey, projectId]);

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

  // If viewing a range diff, show the diff viewer with range data
  if (viewingRangeDiff && rangeDiffData) {
    return (
      <DiffViewer
        projectId={projectId}
        commitHash={viewingRangeDiff.to}
        diffOverride={rangeDiffData}
        onBack={() => { setViewingRangeDiff(null); setRangeDiffData(null); }}
      />
    );
  }

  // If viewing a diff, show full-screen diff viewer
  if (viewingDiff) {
    return (
      <DiffViewer
        projectId={projectId}
        commitHash={viewingDiff}
        onBack={() => setViewingDiff(null)}
      />
    );
  }

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
          <span className="text-xs text-gray-500">
            ({commits.length}{totalCommits > commits.length ? ` of ${totalCommits}` : ""})
          </span>
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
        <div className="relative">
          {/* Timeline vertical line */}
          <div className="absolute left-[21px] top-3 bottom-3 w-0.5 bg-gray-200" />

          <div className="space-y-1">
            {commits.map((c, idx) => {
            const isExpanded = expandedId === (c.commit_hash || c.commit_id);
            const commitDate = new Date(c.committed_at || c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            const prevDate = idx > 0 ? new Date(commits[idx-1].committed_at || commits[idx-1].created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
            const showDateHeader = idx === 0 || commitDate !== prevDate;
            return (
              <React.Fragment key={c.commit_id}>
                {showDateHeader && (
                  <div className="flex items-center gap-2 py-2 pl-10">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {commitDate}
                    </span>
                  </div>
                )}
              <div
                className="bg-white border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(c.commit_hash || c.commit_id)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                >
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1 w-3 h-3 bg-blue-500 rounded-full flex-shrink-0 ring-2 ring-white" />
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
                        {(c.commit_hash || c.commit_id)?.slice(0, 8)}
                      </span>
                      {c.parent_hash && (
                        <span className="font-mono text-gray-300" title={`Parent: ${c.parent_hash.slice(0, 8)}`}>
                          ← {c.parent_hash.slice(0, 8)}
                        </span>
                      )}
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
                    {commitDetail.file_changes &&
                    commitDetail.file_changes.length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-medium text-gray-500">
                            Files Changed ({commitDetail.file_changes.length})
                          </h5>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingDiff(c.commit_hash); }}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded"
                          >
                            <Eye size={12} /> View Diff
                          </button>
                        </div>
                        <div className="space-y-1">
                          {commitDetail.file_changes.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-sm text-gray-700"
                            >
                              <FileCode size={12} className="text-gray-400" />
                              <span className="font-mono text-xs flex-1">
                                {f.path || f.file_path || f}
                              </span>
                              {f.additions > 0 && (
                                <span className="text-xs text-green-600 flex items-center gap-0.5">
                                  <Plus size={10} />{f.additions}
                                </span>
                              )}
                              {f.deletions > 0 && (
                                <span className="text-xs text-red-500 flex items-center gap-0.5">
                                  <Minus size={10} />{f.deletions}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">
                        No file details available.
                      </p>
                    )}
                    {/* Commit stats */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      {(commitDetail.additions > 0 || c.additions > 0) && (
                        <span className="text-green-600">+{commitDetail.additions || c.additions || 0}</span>
                      )}
                      {(commitDetail.deletions > 0 || c.deletions > 0) && (
                        <span className="text-red-500">-{commitDetail.deletions || c.deletions || 0}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          })}
          </div>
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => fetchCommits(true)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            {loadingMore ? (
              <><Loader2 size={14} className="animate-spin" /> Loading...</>
            ) : (
              <>Load More ({totalCommits - commits.length} remaining)</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CommitHistory;
