// ============================================================
// ADMIN ROUND MANAGER — SRS §4.3 Admin Interface
// ============================================================
// Create and manage comparative evaluation rounds.
// Admins: define scarcity parameters, add projects, assign judges,
// activate rounds, view results.
// ============================================================

import React, { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  FolderKanban,
  Play,
  Square,
  Trophy,
  Loader2,
  Settings,
} from "lucide-react";
import { useAllRounds } from "../../hooks/useComparativeRounds";
import {
  createRound,
  getRound as fetchRound,
  activateRound as activateRoundApi,
  closeRound as closeRoundApi,
  addProjectsToRound,
  removeProjectFromRound,
  assignJudgesToRound,
  removeJudgeFromRound,
  getRoundResults,
} from "../../services/comparativeApi";

// Default criteria from SRS §4.3.2
const DEFAULT_CRITERIA = [
  {
    key: "quality",
    name: "Project Quality",
    weight: 30,
    description: "Technical quality, code standards, architecture",
  },
  {
    key: "effectiveness",
    name: "Team Effectiveness",
    weight: 25,
    description: "Collaboration, delivery, sprint outcomes",
  },
  {
    key: "value",
    name: "Project Value",
    weight: 25,
    description: "Impact, innovation, stakeholder value",
  },
  {
    key: "leadership",
    name: "Project Leadership",
    weight: 20,
    description: "Vision, decision-making, team growth",
  },
];

// ============================================================
// STATUS BADGE
// ============================================================
function StatusBadge({ status }) {
  const colors = {
    draft: "bg-gray-100 text-gray-700",
    active: "bg-green-100 text-green-700",
    closed: "bg-red-100 text-red-700",
    archived: "bg-gray-200 text-gray-500",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100"}`}
    >
      {status}
    </span>
  );
}

// ============================================================
// CREATE ROUND FORM
// ============================================================
function CreateRoundForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalPool, setTotalPool] = useState(20);
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await createRound({
        name: name.trim(),
        description: description.trim() || null,
        totalPool,
        criteria,
      });
      if (response.success) {
        onCreated(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  }, [name, description, totalPool, criteria, onCreated]);

  const updateCriterion = (idx, field, value) => {
    setCriteria((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Create New Round
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Round Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., January 2026 Comparative Review"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Pool (points)
          </label>
          <input
            type="number"
            value={totalPool}
            onChange={(e) =>
              setTotalPool(Math.max(1, parseInt(e.target.value) || 1))
            }
            min={1}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Distributed proportionally across criteria based on weights
          </p>
        </div>

        {/* Criteria editor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Evaluation Criteria
          </label>
          <div className="space-y-2">
            {criteria.map((c, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-gray-50 rounded-lg p-2"
              >
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => updateCriterion(idx, "name", e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                  placeholder="Criterion name"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={c.weight}
                    onChange={(e) =>
                      updateCriterion(
                        idx,
                        "weight",
                        parseInt(e.target.value) || 0,
                      )
                    }
                    className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center"
                    min={0}
                    max={100}
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
                {criteria.length > 2 && (
                  <button
                    onClick={() =>
                      setCriteria((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() =>
              setCriteria((prev) => [
                ...prev,
                {
                  key: `custom_${prev.length}`,
                  name: "",
                  weight: 0,
                  description: "",
                },
              ])
            }
            className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            Add criterion
          </button>

          <p className="text-xs text-gray-400 mt-1">
            Total weight:{" "}
            {criteria.reduce((sum, c) => sum + (c.weight || 0), 0)}%
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isCreating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </span>
            ) : (
              "Create Round"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ROUND DETAIL — Manage projects, judges, status
// ============================================================
function RoundDetail({ roundId, onBack }) {
  const [round, setRound] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectIdInput, setProjectIdInput] = useState("");
  const [judgeIdInput, setJudgeIdInput] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [results, setResults] = useState(null);

  const loadRound = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetchRound(roundId);
      if (response.success) {
        setRound(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    loadRound();
  }, [loadRound]);

  const handleActivate = useCallback(async () => {
    setActionLoading("activate");
    try {
      const response = await activateRoundApi(roundId);
      if (response.success) await loadRound();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [roundId, loadRound]);

  const handleClose = useCallback(async () => {
    setActionLoading("close");
    try {
      const response = await closeRoundApi(roundId);
      if (response.success) await loadRound();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [roundId, loadRound]);

  const handleAddProject = useCallback(async () => {
    if (!projectIdInput.trim()) return;
    setActionLoading("addProject");
    try {
      await addProjectsToRound(roundId, [{ projectId: projectIdInput.trim() }]);
      setProjectIdInput("");
      await loadRound();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [roundId, projectIdInput, loadRound]);

  const handleRemoveProject = useCallback(
    async (projectId) => {
      setActionLoading(`removeProject-${projectId}`);
      try {
        await removeProjectFromRound(roundId, projectId);
        await loadRound();
      } catch (err) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [roundId, loadRound],
  );

  const handleAddJudge = useCallback(async () => {
    if (!judgeIdInput.trim()) return;
    setActionLoading("addJudge");
    try {
      await assignJudgesToRound(roundId, [{ judgeId: judgeIdInput.trim() }]);
      setJudgeIdInput("");
      await loadRound();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [roundId, judgeIdInput, loadRound]);

  const handleRemoveJudge = useCallback(
    async (judgeId) => {
      setActionLoading(`removeJudge-${judgeId}`);
      try {
        await removeJudgeFromRound(roundId, judgeId);
        await loadRound();
      } catch (err) {
        setError(err.message);
      } finally {
        setActionLoading(null);
      }
    },
    [roundId, loadRound],
  );

  const handleViewResults = useCallback(async () => {
    setActionLoading("results");
    try {
      const response = await getRoundResults(roundId);
      if (response.success) setResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [roundId]);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-400">Loading round...</div>
    );
  }

  if (!round) {
    return (
      <div className="text-center py-12 text-red-500">
        {error || "Round not found"}
      </div>
    );
  }

  const eligibleProjects = round.eligible_projects || [];
  const eligibleJudges = round.eligible_judges || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 mb-1 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to rounds
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{round.name}</h2>
            <StatusBadge status={round.status} />
          </div>
          <p className="text-sm text-gray-500">
            Pool: {round.total_pool} pts · {(round.criteria || []).length}{" "}
            criteria
          </p>
        </div>

        <div className="flex items-center gap-2">
          {round.status === "draft" && (
            <button
              onClick={handleActivate}
              disabled={actionLoading === "activate"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {actionLoading === "activate" ? "Activating..." : "Activate"}
            </button>
          )}
          {round.status === "active" && (
            <button
              onClick={handleClose}
              disabled={actionLoading === "close"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              <Square className="w-4 h-4" />
              {actionLoading === "close" ? "Closing..." : "Close Round"}
            </button>
          )}
          {["closed", "active"].includes(round.status) && (
            <button
              onClick={handleViewResults}
              disabled={actionLoading === "results"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Trophy className="w-4 h-4" />
              {actionLoading === "results" ? "Loading..." : "Results"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Projects section */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FolderKanban className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-800">
            Eligible Projects ({eligibleProjects.length})
          </h3>
        </div>

        {eligibleProjects.length > 0 && (
          <div className="space-y-1 mb-3">
            {eligibleProjects.map((p) => (
              <div
                key={p.project_id}
                className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm"
              >
                <span className="text-gray-700 font-mono text-xs truncate max-w-[300px]">
                  {p.project_id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">P{p.priority}</span>
                  {["draft", "active"].includes(round.status) && (
                    <button
                      onClick={() => handleRemoveProject(p.project_id)}
                      disabled={
                        actionLoading === `removeProject-${p.project_id}`
                      }
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {["draft", "active"].includes(round.status) && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)}
              placeholder="Project UUID..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleAddProject}
              disabled={
                !projectIdInput.trim() || actionLoading === "addProject"
              }
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Judges section */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-800">
            Assigned Judges ({eligibleJudges.length})
          </h3>
        </div>

        {eligibleJudges.length > 0 && (
          <div className="space-y-1 mb-3">
            {eligibleJudges.map((j) => (
              <div
                key={j.judge_id}
                className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm"
              >
                <span className="text-gray-700 font-mono text-xs truncate max-w-[300px]">
                  {j.judge_id}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    cred: {j.credibility_score}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      j.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : j.status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {j.status}
                  </span>
                  {["draft", "active"].includes(round.status) && (
                    <button
                      onClick={() => handleRemoveJudge(j.judge_id)}
                      disabled={actionLoading === `removeJudge-${j.judge_id}`}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {["draft", "active"].includes(round.status) && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={judgeIdInput}
              onChange={(e) => setJudgeIdInput(e.target.value)}
              placeholder="Judge person UUID..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleAddJudge}
              disabled={!judgeIdInput.trim() || actionLoading === "addJudge"}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Criteria display */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-800">Evaluation Criteria</h3>
        </div>
        <div className="space-y-2">
          {(round.criteria || []).map((c, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-gray-800">
                  {c.name}
                </span>
                {c.description && (
                  <p className="text-xs text-gray-400">{c.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">{c.weight}%</span>
                <span className="text-indigo-600 font-medium">
                  {(c.pool || 0).toFixed(1)} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-gray-800">Round Results</h3>
          </div>
          {results.projects && results.projects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-2 text-gray-600">Rank</th>
                    <th className="text-left p-2 text-gray-600">Project</th>
                    {(results.criteriaConfig || []).map((c) => (
                      <th key={c.key} className="text-center p-2 text-gray-600">
                        {c.name}
                      </th>
                    ))}
                    <th className="text-center p-2 text-gray-600 font-bold">
                      Overall
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.projects.map((project) => (
                    <tr
                      key={project.project_id}
                      className="border-b border-gray-100"
                    >
                      <td className="p-2 font-bold text-gray-700">
                        #{project.rank}
                      </td>
                      <td className="p-2 text-gray-700 font-mono text-xs truncate max-w-[200px]">
                        {project.project_id}
                      </td>
                      {(results.criteriaConfig || []).map((c) => (
                        <td key={c.key} className="text-center p-2">
                          {project.criteria[c.key]
                            ? project.criteria[c.key].avg.toFixed(2)
                            : "-"}
                        </td>
                      ))}
                      <td className="text-center p-2 font-bold text-indigo-700">
                        {project.overall.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No results yet — no sessions have been submitted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MAIN ADMIN PAGE
// ============================================================
export default function AdminRoundManager() {
  const navigate = useNavigate();
  const { rounds, isLoading, error, refresh } = useAllRounds();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState(null);

  // Show detail view
  if (selectedRoundId) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <RoundDetail
          roundId={selectedRoundId}
          onBack={() => {
            setSelectedRoundId(null);
            refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate("/comparative")}
            className="text-sm text-gray-500 hover:text-gray-700 mb-1 flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back to evaluation
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            Manage Comparative Rounds
          </h1>
          <p className="text-sm text-gray-500">
            Create and manage evaluation rounds for cross-project comparison
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          New Round
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6">
          <CreateRoundForm
            onCreated={(round) => {
              setShowCreate(false);
              refresh();
              setSelectedRoundId(round.round_id);
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Rounds list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading rounds...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <FolderKanban className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No rounds created yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-indigo-600 hover:text-indigo-800 text-sm"
          >
            Create your first round
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <div
              key={round.round_id}
              onClick={() => setSelectedRoundId(round.round_id)}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {round.name}
                    </h3>
                    <StatusBadge status={round.status} />
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span>Pool: {round.total_pool} pts</span>
                    <span>{round.eligible_project_count || 0} projects</span>
                    <span>{round.eligible_judge_count || 0} judges</span>
                    <span>
                      {round.submitted_session_count || 0}/
                      {round.session_count || 0} sessions submitted
                    </span>
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(round.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
