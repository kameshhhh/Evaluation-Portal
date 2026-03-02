// ============================================================
// PROJECT MANAGEMENT — Admin Project Monitoring & Control
// ============================================================
// Real-time project management panel that calls backend APIs:
//   1. Fetches all projects from GET /api/projects
//   2. Shows project details with team members
//   3. Allows state transitions (active → frozen, etc.)
//   4. Shows transition history per project
//
// All data is REAL — fetched from the backend on mount and
// updated in real-time after admin actions.
//
// SRS 4.3.1: System monitoring dashboard for administrators
// ============================================================

// Import React for JSX rendering and state management
import React, { useState, useEffect, useCallback } from "react";

// Import admin service API methods for project operations
import {
  fetchProjects,
  fetchProjectWithTeam,
  transitionProject,
  fetchProjectHistory,
} from "../../../services/adminService";

// Import Lucide icons for visual elements
import {
  FolderOpen,
  Users,
  Activity,
  Snowflake,
  Play,
  Pause,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Clock,
  History,
  RefreshCw,
} from "lucide-react";

// ============================================================
// PROJECT STATUS CONFIGURATION — Colors and labels per status
// ============================================================
const STATUS_CONFIG = {
  // Active projects — green indicators
  active: {
    label: "Active",
    color: "text-green-700 bg-green-50 border-green-200",
    dot: "bg-green-500",
  },
  // Frozen projects — cyan/blue indicators
  frozen: {
    label: "Frozen",
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
    dot: "bg-cyan-500",
  },
  // Completed projects — purple indicators
  completed: {
    label: "Completed",
    color: "text-purple-700 bg-purple-50 border-purple-200",
    dot: "bg-purple-500",
  },
  // Draft/setup projects — amber/yellow indicators
  draft: {
    label: "Draft",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
};

// ============================================================
// ProjectManagement Component
// ============================================================
/**
 * Admin panel for viewing and managing all projects.
 * Fetches real data from the backend on mount.
 */
const ProjectManagement = () => {
  // ---------------------------------------------------------
  // STATE — Projects, loading, errors, expanded details
  // ---------------------------------------------------------

  // Array of project records from the backend
  const [projects, setProjects] = useState([]);

  // Loading flag — true while fetching projects
  const [isLoading, setIsLoading] = useState(true);

  // Error message — null when no error
  const [error, setError] = useState(null);

  // Success message for admin feedback after actions
  const [successMessage, setSuccessMessage] = useState(null);

  // ID of the project whose details panel is expanded
  const [expandedProject, setExpandedProject] = useState(null);

  // Expanded project's team members (fetched on demand)
  const [projectTeam, setProjectTeam] = useState([]);

  // Expanded project's transition history (fetched on demand)
  const [projectHistory, setProjectHistory] = useState([]);

  // Loading flag for detail panel data
  const [detailLoading, setDetailLoading] = useState(false);

  // Status filter — 'all' or specific status string
  const [statusFilter, setStatusFilter] = useState("all");

  // Transition confirmation modal state
  const [transitionModal, setTransitionModal] = useState(null);

  // ---------------------------------------------------------
  // FETCH PROJECTS — Load all projects from backend
  // ---------------------------------------------------------
  const loadProjects = useCallback(async () => {
    try {
      // Set loading state before fetch
      setIsLoading(true);
      // Clear any previous errors
      setError(null);

      // Call the real backend API — GET /api/projects
      const data = await fetchProjects();

      // Store the projects array in state
      setProjects(data.projects || []);
    } catch (err) {
      // Store error message for display
      setError(
        err.response?.data?.error || err.message || "Failed to load projects",
      );
    } finally {
      // Clear loading state regardless of success/failure
      setIsLoading(false);
    }
  }, []);

  // Auto-fetch projects on component mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Auto-clear success messages after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ---------------------------------------------------------
  // EXPAND PROJECT — Load team + history on demand
  // ---------------------------------------------------------
  const handleExpandProject = async (projectId) => {
    // Toggle off if already expanded
    if (expandedProject === projectId) {
      setExpandedProject(null);
      return;
    }

    try {
      // Set the expanded project ID and show loading
      setExpandedProject(projectId);
      setDetailLoading(true);

      // Fetch team members and history in parallel from backend
      const [teamData, historyData] = await Promise.all([
        fetchProjectWithTeam(projectId),
        fetchProjectHistory(projectId),
      ]);

      // Store the fetched data in state
      setProjectTeam(teamData?.members || []);
      setProjectHistory(historyData || []);
    } catch (err) {
      // Show error but keep the panel expanded
      setProjectTeam([]);
      setProjectHistory([]);
    } finally {
      // Clear detail loading state
      setDetailLoading(false);
    }
  };

  // ---------------------------------------------------------
  // TRANSITION PROJECT — Change project state via backend
  // ---------------------------------------------------------
  const handleTransition = async () => {
    // Guard — must have a valid modal state
    if (!transitionModal) return;

    try {
      // Call real backend API — POST /api/projects/:id/transition
      const result = await transitionProject(
        transitionModal.projectId,
        transitionModal.targetStatus,
        transitionModal.reason || "Admin action",
      );

      // Update the project in local state to reflect the change immediately
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === transitionModal.projectId
            ? { ...p, status: transitionModal.targetStatus }
            : p,
        ),
      );

      // Show success message with the transition details
      setSuccessMessage(
        `Project transitioned to "${transitionModal.targetStatus}" successfully`,
      );

      // Close the modal
      setTransitionModal(null);

      // Refresh the expanded project details if it was the one changed
      if (expandedProject === transitionModal.projectId) {
        handleExpandProject(transitionModal.projectId);
      }
    } catch (err) {
      // Show error from backend
      setError(err.response?.data?.error || err.message || "Transition failed");
      // Close the modal
      setTransitionModal(null);
    }
  };

  // ---------------------------------------------------------
  // FILTER PROJECTS — Apply status filter
  // ---------------------------------------------------------
  const filteredProjects = projects.filter((p) => {
    // Show all projects if filter is 'all'
    if (statusFilter === "all") return true;
    // Otherwise match the project's status
    return p.status === statusFilter;
  });

  // ---------------------------------------------------------
  // COMPUTED STATS — Count projects by status
  // ---------------------------------------------------------
  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    frozen: projects.filter((p) => p.status === "frozen").length,
    completed: projects.filter((p) => p.status === "completed").length,
    draft: projects.filter((p) => p.status === "draft").length,
  };

  return (
    <div className="space-y-6">
      {/* ====================================================== */}
      {/* SUCCESS / ERROR BANNERS */}
      {/* ====================================================== */}
      {successMessage && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          {/* Retry button to reload projects */}
          <button
            onClick={loadProjects}
            className="ml-auto text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* STATS CARDS — Project count by status */}
      {/* ====================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total projects card */}
        {[
          {
            label: "Total",
            value: stats.total,
            icon: FolderOpen,
            color: "text-gray-600",
          },
          {
            label: "Active",
            value: stats.active,
            icon: Activity,
            color: "text-green-600",
          },
          {
            label: "Frozen",
            value: stats.frozen,
            icon: Snowflake,
            color: "text-cyan-600",
          },
          {
            label: "Completed",
            value: stats.completed,
            icon: CheckCircle,
            color: "text-purple-600",
          },
          {
            label: "Draft",
            value: stats.draft,
            icon: Clock,
            color: "text-amber-600",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-3"
          >
            {/* Stat icon and label */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-xs text-gray-500 font-medium">
                {stat.label}
              </span>
            </div>
            {/* Stat value */}
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ====================================================== */}
      {/* FILTER BAR + REFRESH */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-4">
        <div className="flex items-center justify-between">
          {/* Status filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {/* 'All' filter button */}
            {["all", "active", "frozen", "completed", "draft"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  statusFilter === status
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
                }`}
              >
                {status === "all" ? "All Projects" : status}
              </button>
            ))}
          </div>
          {/* Refresh button to reload data from backend */}
          <button
            onClick={loadProjects}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Refresh projects"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* PROJECT LIST */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        {isLoading ? (
          // Loading state — show spinner while fetching from backend
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading projects...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          // Empty state — no projects match the current filter
          <div className="text-center py-16 text-gray-400">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No projects found</p>
            <p className="text-xs mt-1">
              {statusFilter !== "all"
                ? "Try a different filter"
                : "No projects in the system yet"}
            </p>
          </div>
        ) : (
          // Project table with expandable rows
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Table header */}
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Project
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Year / Sem
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Created
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              {/* Table body — one row per project */}
              <tbody>
                {filteredProjects.map((project) => {
                  // Get status display config for this project
                  const statusCfg =
                    STATUS_CONFIG[project.status] || STATUS_CONFIG.draft;
                  // Check if this project's detail panel is expanded
                  const isExpanded = expandedProject === project.projectId;

                  return (
                    <React.Fragment key={project.projectId}>
                      {/* Main project row */}
                      <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        {/* Project title and ID */}
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900">
                            {project.title || "Untitled"}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {project.projectId?.slice(0, 8)}...
                          </p>
                        </td>

                        {/* Status badge */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${statusCfg.color}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`}
                            />
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Academic year and semester */}
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {project.academicYear || "—"} / Sem{" "}
                          {project.semester || "—"}
                        </td>

                        {/* Created date */}
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {project.createdAt
                            ? new Date(project.createdAt).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : "—"}
                        </td>

                        {/* Action buttons */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {/* Expand/collapse button — toggles detail panel */}
                            <button
                              onClick={() =>
                                handleExpandProject(project.projectId)
                              }
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View details"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>

                            {/* Freeze button — only for active projects */}
                            {project.status === "active" && (
                              <button
                                onClick={() =>
                                  setTransitionModal({
                                    projectId: project.projectId,
                                    projectTitle: project.title,
                                    currentStatus: project.status,
                                    targetStatus: "frozen",
                                  })
                                }
                                className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                                title="Freeze project"
                              >
                                <Snowflake className="h-4 w-4" />
                              </button>
                            )}

                            {/* Activate button — for draft/frozen projects */}
                            {(project.status === "draft" ||
                              project.status === "frozen") && (
                              <button
                                onClick={() =>
                                  setTransitionModal({
                                    projectId: project.projectId,
                                    projectTitle: project.title,
                                    currentStatus: project.status,
                                    targetStatus: "active",
                                  })
                                }
                                className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Activate project"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail panel — shows team + history */}
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={5}
                            className="bg-gray-50/80 px-4 py-4 border-b border-gray-100"
                          >
                            {detailLoading ? (
                              // Loading spinner for detail data
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                <span className="ml-2 text-sm text-gray-500">
                                  Loading details...
                                </span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Team members section */}
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5" />
                                    Team Members ({projectTeam.length})
                                  </h4>
                                  {projectTeam.length > 0 ? (
                                    <div className="space-y-1">
                                      {/* Render each team member */}
                                      {projectTeam.map((member, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-gray-100"
                                        >
                                          {/* Member avatar circle */}
                                          <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-semibold">
                                            {(
                                              member.displayName ||
                                              member.personId ||
                                              "?"
                                            )
                                              .charAt(0)
                                              .toUpperCase()}
                                          </div>
                                          {/* Member name/ID and role */}
                                          <div>
                                            <p className="font-medium text-gray-700">
                                              {member.displayName ||
                                                member.personId?.slice(0, 12)}
                                            </p>
                                            <p className="text-gray-400">
                                              {member.role || "member"}
                                            </p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">
                                      No team members
                                    </p>
                                  )}
                                </div>

                                {/* Transition history section */}
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                    <History className="h-3.5 w-3.5" />
                                    State History
                                  </h4>
                                  {projectHistory.length > 0 ? (
                                    <div className="space-y-1">
                                      {/* Render each transition record */}
                                      {projectHistory.map((entry, idx) => (
                                        <div
                                          key={idx}
                                          className="text-xs bg-white rounded-lg px-3 py-2 border border-gray-100"
                                        >
                                          {/* Transition from → to */}
                                          <p className="font-medium text-gray-700">
                                            {entry.fromStatus || "—"} →{" "}
                                            {entry.toStatus || "—"}
                                          </p>
                                          {/* Transition timestamp */}
                                          <p className="text-gray-400 mt-0.5">
                                            {entry.changedAt
                                              ? new Date(
                                                  entry.changedAt,
                                                ).toLocaleString("en-IN")
                                              : "Unknown date"}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-400 italic">
                                      No state changes recorded
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====================================================== */}
      {/* TRANSITION CONFIRMATION MODAL */}
      {/* ====================================================== */}
      {transitionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm State Change
              </h3>
              {/* Close button */}
              <button
                onClick={() => setTransitionModal(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Project info */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-gray-900">
                {transitionModal.projectTitle || "Untitled Project"}
              </p>
              {/* Show the transition direction */}
              <p className="text-xs text-gray-500 mt-1">
                <span className="font-medium">
                  {transitionModal.currentStatus}
                </span>
                {" → "}
                <span className="font-medium text-red-600">
                  {transitionModal.targetStatus}
                </span>
              </p>
            </div>

            {/* Confirmation text */}
            <p className="text-sm text-gray-600 mb-4">
              This will change the project state. The transition is recorded in
              the audit trail.
            </p>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setTransitionModal(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleTransition}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Export the ProjectManagement component
// ============================================================
export default ProjectManagement;
