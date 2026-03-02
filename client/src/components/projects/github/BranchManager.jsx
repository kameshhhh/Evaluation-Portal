// ================================================================
// BRANCH MANAGER — GitHub-Lite Branch Operations
// ================================================================
// List, create, and delete branches. Shows head commit for each.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Check,
  Loader2,
  GitCommit,
} from "lucide-react";
import {
  getBranches,
  createBranch,
  deleteBranch,
} from "../../../services/gitRepoApi";

const BranchManager = ({ projectId }) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [sourceBranch, setSourceBranch] = useState("main");
  const [creating, setCreating] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await getBranches(projectId);
      setBranches(res.data || []);
    } catch (err) {
      console.error("Failed to load branches:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBranch(projectId, {
        branch_name: newName.trim(),
        source_branch: sourceBranch,
      });
      setNewName("");
      setShowCreate(false);
      fetchBranches();
    } catch (err) {
      console.error("Create branch failed:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (branchName) => {
    if (branchName === "main") return;
    if (!window.confirm(`Delete branch "${branchName}"?`)) return;
    try {
      await deleteBranch(projectId, branchName);
      fetchBranches();
    } catch (err) {
      console.error("Delete branch failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading branches...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Branches</h3>
          <span className="text-xs text-gray-500">({branches.length})</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          New Branch
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Branch Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="feature/my-feature"
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Branch From
              </label>
              <select
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              >
                {branches.map((b) => (
                  <option key={b.branch_name} value={b.branch_name}>
                    {b.branch_name}
                  </option>
                ))}
                {branches.length === 0 && <option value="main">main</option>}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Branch"}
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

      {/* Branch List */}
      {branches.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <GitBranch size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">
            No branches yet. The default "main" will be created on first commit.
          </p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {branches.map((b) => (
            <div
              key={b.branch_name}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <GitBranch
                  size={16}
                  className={b.is_default ? "text-green-600" : "text-gray-400"}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {b.branch_name}
                    </span>
                    {b.is_default && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Check size={10} /> default
                      </span>
                    )}
                  </div>
                  {b.head_commit_id && (
                    <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <GitCommit size={10} />
                      {b.head_commit_id.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
              {!b.is_default && (
                <button
                  onClick={() => handleDelete(b.branch_name)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  title="Delete branch"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BranchManager;
