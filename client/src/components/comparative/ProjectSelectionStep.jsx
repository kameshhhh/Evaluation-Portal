// ============================================================
// PROJECT SELECTION STEP — SRS §4.3 Judge picks 3-5 projects
// ============================================================
// Phase 2 of hybrid model: Judge sees eligible projects from
// the round pool and selects 3-5 to create a comparative session.
// Shows project info, priority indicators, and selection count.
// ============================================================

import React, { useState, useCallback } from "react";
import {
  CheckCircle,
  Circle,
  Star,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { createComparativeSession } from "../../services/comparativeApi";
import { useEligibleProjects } from "../../hooks/useComparativeRounds";

const MIN_PROJECTS = 3;
const MAX_PROJECTS = 5;

// Priority label map
const PRIORITY_LABELS = {
  1: { label: "Must Evaluate", color: "text-red-600", icon: AlertTriangle },
  2: { label: "Recommended", color: "text-amber-600", icon: Star },
  3: { label: "Optional", color: "text-gray-400", icon: null },
};

export default function ProjectSelectionStep({ round, onSessionCreated }) {
  const { projects, isLoading, error } = useEligibleProjects(round.round_id);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const toggleProject = useCallback((projectId) => {
    setSelectedIds((prev) => {
      if (prev.includes(projectId)) {
        return prev.filter((id) => id !== projectId);
      }
      if (prev.length >= MAX_PROJECTS) return prev;
      return [...prev, projectId];
    });
  }, []);

  const handleCreateSession = useCallback(async () => {
    if (selectedIds.length < MIN_PROJECTS) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await createComparativeSession(
        round.round_id,
        selectedIds,
      );
      if (response.success) {
        onSessionCreated(response.data);
      } else {
        setCreateError(response.error || "Failed to create session");
      }
    } catch (err) {
      setCreateError(err.message || "Network error");
    } finally {
      setIsCreating(false);
    }
  }, [round.round_id, selectedIds, onSessionCreated]);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading eligible projects...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  const canCreate =
    selectedIds.length >= MIN_PROJECTS && selectedIds.length <= MAX_PROJECTS;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">{round.name}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select {MIN_PROJECTS}-{MAX_PROJECTS} projects to compare. Pool:{" "}
          <span className="font-medium text-indigo-600">
            {round.total_pool} points
          </span>{" "}
          across {(round.criteria || []).length} criteria.
        </p>
      </div>

      {/* Selection Counter */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Selected:</span>
          <div className="flex gap-1">
            {Array.from({ length: MAX_PROJECTS }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < selectedIds.length ? "bg-indigo-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <span
            className={`text-sm font-medium ${
              canCreate ? "text-green-600" : "text-gray-500"
            }`}
          >
            {selectedIds.length}/{MAX_PROJECTS}
          </span>
        </div>

        {selectedIds.length < MIN_PROJECTS && (
          <span className="text-xs text-amber-600">
            Select {MIN_PROJECTS - selectedIds.length} more
          </span>
        )}
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {projects.map((project) => {
          const isSelected = selectedIds.includes(project.project_id);
          const atMax = selectedIds.length >= MAX_PROJECTS && !isSelected;
          const priorityInfo =
            PRIORITY_LABELS[project.priority] || PRIORITY_LABELS[3];
          const PriorityIcon = priorityInfo.icon;

          return (
            <button
              key={project.project_id}
              onClick={() => toggleProject(project.project_id)}
              disabled={atMax}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50"
                  : atMax
                    ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                    : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Selection indicator */}
                <div className="mt-0.5">
                  {isSelected ? (
                    <CheckCircle className="w-5 h-5 text-indigo-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 truncate">
                      {project.project_name || "Untitled Project"}
                    </h4>
                    {PriorityIcon && (
                      <PriorityIcon
                        className={`w-4 h-4 flex-shrink-0 ${priorityInfo.color}`}
                      />
                    )}
                  </div>

                  {project.project_description && (
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {project.project_description}
                    </p>
                  )}

                  {project.priority <= 2 && (
                    <span
                      className={`text-xs ${priorityInfo.color} mt-1 inline-block`}
                    >
                      {priorityInfo.label}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {createError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          {createError}
        </div>
      )}

      {/* Create Button */}
      <div className="flex justify-end">
        <button
          onClick={handleCreateSession}
          disabled={!canCreate || isCreating}
          className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            canCreate && !isCreating
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isCreating ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating session...
            </span>
          ) : (
            `Start Evaluation (${selectedIds.length} projects)`
          )}
        </button>
      </div>
    </div>
  );
}
