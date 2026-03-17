// ================================================================
// DIFF VIEWER — GitHub-Lite File Diff Display
// ================================================================
// Shows side-by-side or unified diff for a commit's changed files.
// Computes line-level diffs using a simple LCS-based algorithm.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  FileDiff,
  FileCode,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Eye,
} from "lucide-react";
import { getCommitDiff } from "../../../services/gitRepoApi";

/**
 * Simple line diff — compares old/new line arrays and produces
 * unified-style hunks with context lines.
 */
function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");
  const result = [];

  // Simple diff: walk both arrays using LCS-like approach
  const m = oldLines.length;
  const n = newLines.length;

  // Use a basic O(mn) DP for small files, fall back to line-by-line for large
  if (m + n > 4000) {
    // For very large files, just show all old as removed, all new as added
    oldLines.forEach((l, i) => result.push({ type: "removed", oldNum: i + 1, newNum: null, text: l }));
    newLines.forEach((l, i) => result.push({ type: "added", oldNum: null, newNum: i + 1, text: l }));
    return result;
  }

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const rawDiff = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.unshift({ type: "context", oldNum: i, newNum: j, text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.unshift({ type: "added", oldNum: null, newNum: j, text: newLines[j - 1] });
      j--;
    } else {
      rawDiff.unshift({ type: "removed", oldNum: i, newNum: null, text: oldLines[i - 1] });
      i--;
    }
  }

  return rawDiff;
}

const DiffViewer = ({ projectId, commitHash, onBack, diffOverride }) => {
  const [diffData, setDiffData] = useState(diffOverride || null);
  const [loading, setLoading] = useState(!diffOverride);
  const [expandedFiles, setExpandedFiles] = useState(new Set());

  const fetchDiff = useCallback(async () => {
    if (diffOverride) return; // Skip fetch when data is provided directly
    setLoading(true);
    try {
      const res = await getCommitDiff(projectId, commitHash);
      setDiffData(res.data);
      // Auto-expand all files initially
      if (res.data?.diffs) {
        setExpandedFiles(new Set(res.data.diffs.map((_, i) => i)));
      }
    } catch (err) {
      console.error("Failed to load diff:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, commitHash, diffOverride]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  // Auto-expand overridden diffs
  useEffect(() => {
    if (diffOverride?.diffs) {
      setExpandedFiles(new Set(diffOverride.diffs.map((_, i) => i)));
    }
  }, [diffOverride]);

  const toggleFile = (idx) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading diff...
      </div>
    );
  }

  if (!diffData) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No diff data available.</p>
      </div>
    );
  }

  const { commit, diffs } = diffData;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1 hover:bg-gray-200 rounded">
            <ArrowLeft size={16} />
          </button>
        )}
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileDiff size={18} className="text-blue-600" />
            Commit Diff
          </h3>
          <p className="text-sm text-gray-600 mt-0.5 truncate max-w-xl">
            {commit?.message}
          </p>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="font-mono">{commit?.commit_hash?.slice(0, 8)}</span>
            <span>{commit?.author_name}</span>
            {commit?.committed_at && (
              <span>{new Date(commit.committed_at).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 bg-gray-50 border rounded-lg px-4 py-2 text-sm">
        <span className="text-gray-600">
          {diffs.length} file{diffs.length !== 1 ? "s" : ""} changed
        </span>
        <span className="text-green-600 flex items-center gap-1">
          <Plus size={12} />
          {diffs.reduce((s, d) => s + (d.additions || 0), 0)} additions
        </span>
        <span className="text-red-500 flex items-center gap-1">
          <Minus size={12} />
          {diffs.reduce((s, d) => s + (d.deletions || 0), 0)} deletions
        </span>
      </div>

      {/* File diffs */}
      {diffs.map((fileDiff, idx) => {
        const isExpanded = expandedFiles.has(idx);
        const lines = computeLineDiff(fileDiff.oldContent, fileDiff.newContent);
        const actionColor =
          fileDiff.action === "added"
            ? "text-green-600"
            : fileDiff.action === "deleted"
              ? "text-red-500"
              : "text-yellow-600";

        return (
          <div key={idx} className="bg-white border rounded-lg overflow-hidden">
            {/* File header */}
            <button
              onClick={() => toggleFile(idx)}
              className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50 border-b hover:bg-gray-100 text-left"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <FileCode size={14} className="text-gray-400" />
              <span className="text-sm font-mono text-gray-800 flex-1 truncate">
                {fileDiff.filePath}
              </span>
              <span className={`text-xs font-medium ${actionColor}`}>
                {fileDiff.action}
              </span>
              <span className="text-xs text-green-600">+{fileDiff.additions || 0}</span>
              <span className="text-xs text-red-500">-{fileDiff.deletions || 0}</span>
            </button>

            {/* Diff content */}
            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <tbody>
                    {lines.map((line, li) => (
                      <tr
                        key={li}
                        className={
                          line.type === "added"
                            ? "bg-green-50"
                            : line.type === "removed"
                              ? "bg-red-50"
                              : ""
                        }
                      >
                        <td className="px-2 py-0 text-right text-gray-400 select-none w-10 border-r">
                          {line.oldNum || ""}
                        </td>
                        <td className="px-2 py-0 text-right text-gray-400 select-none w-10 border-r">
                          {line.newNum || ""}
                        </td>
                        <td className="px-1 py-0 text-center select-none w-5">
                          {line.type === "added" ? (
                            <span className="text-green-600">+</span>
                          ) : line.type === "removed" ? (
                            <span className="text-red-500">-</span>
                          ) : (
                            <span className="text-gray-300">&nbsp;</span>
                          )}
                        </td>
                        <td className="px-2 py-0 whitespace-pre">{line.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lines.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400 text-center">
                    No changes to display
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {diffs.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Eye size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No file changes in this commit.</p>
        </div>
      )}
    </div>
  );
};

export default DiffViewer;
