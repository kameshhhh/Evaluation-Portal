// ============================================================
// PROJECT LIST PAGE — Role-Based Project Browser
// ============================================================
// Students & Faculty: see only their team's projects via /mine
// Admins: see all projects in the system via /projects
// Clickable cards navigate to EnhancedProjectDashboard.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FolderOpen,
  Plus,
  Search,
  Filter,
  Users,
  Snowflake,
  Loader2,
  RefreshCw,
  Calendar,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { listProjects, listMyProjects } from "../../services/projectService";
import useAuth from "../../hooks/useAuth";

// Status color map
const statusColors = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  under_review: "bg-amber-100 text-amber-700",
  locked: "bg-cyan-100 text-cyan-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-purple-100 text-purple-700",
};

const formatStatus = (s) =>
  s
    ? s
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Unknown";

const ProjectListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Determine role — admins see all, others see only their own
  const isAdmin = user?.role === "admin";

  // State
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filters
  const [filters, setFilters] = useState({
    status: "",
    academicYear: "",
    semester: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch projects from backend — role-based
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activeFilters = {};
      if (filters.status) activeFilters.status = filters.status;
      if (filters.academicYear)
        activeFilters.academicYear = filters.academicYear;
      if (filters.semester) activeFilters.semester = filters.semester;

      // Admins see all projects; students & faculty see only their own
      const fetchFn = isAdmin ? listProjects : listMyProjects;
      const result = await fetchFn(activeFilters, 100, 0);
      setProjects(result.projects);
      setPagination(result.pagination);
    } catch (err) {
      const rawMsg =
        err.response?.data?.message || err.response?.data?.error || err.message || "Failed to load projects";
      setError(
        typeof rawMsg === "string"
          ? rawMsg
          : rawMsg?.message || JSON.stringify(rawMsg),
      );
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Client-side search filter
  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.title?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FolderOpen className="h-6 w-6 text-blue-600" />
                {isAdmin ? "All Projects" : "My Projects"}
              </h1>
              <p className="text-sm text-gray-500">
                {pagination.total || filteredProjects.length} project
                {(pagination.total || filteredProjects.length) !== 1
                  ? "s"
                  : ""}{" "}
                found
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchProjects}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/projects/new")}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by title or description..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-colors ${
                showFilters
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="under_review">Under Review</option>
                  <option value="locked">Locked</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Academic Year
                </label>
                <select
                  value={filters.academicYear}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      academicYear: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">All</option>
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Semester
                </label>
                <select
                  value={filters.semester}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      semester: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">All</option>
                  <option value="1">Odd (Jun–Nov)</option>
                  <option value="2">Even (Dec–May)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">
              {typeof error === "string"
                ? error
                : error?.message || JSON.stringify(error)}
            </p>
            <button
              onClick={fetchProjects}
              className="ml-auto text-sm text-red-600 hover:text-red-800 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading projects...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProjects.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {searchQuery ? "No matching projects" : "No projects yet"}
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              {searchQuery
                ? "Try adjusting your search or filters"
                : "Create your first project to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate("/projects/new")}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Create First Project
              </button>
            )}
          </div>
        )}

        {/* Project Cards */}
        {!loading && filteredProjects.length > 0 && (
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <div
                key={project.projectId}
                onClick={() => navigate(`/projects/${project.projectId}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">
                        {project.title}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                          statusColors[project.status] || statusColors.draft
                        }`}
                      >
                        {formatStatus(project.status)}
                      </span>
                      {project.frozenAt && (
                        <Snowflake className="h-3.5 w-3.5 text-cyan-500 flex-shrink-0" />
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {project.academicYear && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {project.academicYear}
                          {project.semester ? ` • Sem ${project.semester}` : ""}
                        </span>
                      )}
                      {project.teamSize !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {project.teamSize} members
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Right: arrow */}
                  <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectListPage;
