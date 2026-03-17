// ================================================================
// ENHANCED PROJECT DASHBOARD — Integrated 8-Tab Dashboard
// ================================================================
// Combines SRS 4.1.1 & 4.1.2 components with GitHub-Lite features
// in a unified tabbed interface accessed via /projects/:projectId.
//
// Tabs: Overview | Code | Issues | Pull Requests | Work Logs |
//       History | Activity | Insights
//
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Code2,
  CircleDot,
  GitPullRequest,
  Clock,
  History,
  Activity,
  TrendingUp,
  Users,
  Loader2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

// SRS 4.1.1 Components
import MemberPhotoUpload from "./srs/MemberPhotoUpload";
import MemberScopeEditor from "./srs/MemberScopeEditor";
import SharePercentageDistributor from "./srs/SharePercentageDistributor";
import MonthlyPlanCreator from "./srs/MonthlyPlanCreator";
import WorkLogTracker from "./srs/WorkLogTracker";

// SRS 4.1.2 Components
import ReviewHistoryViewer from "./srs/ReviewHistoryViewer";
import ScoreComparisonTool from "./srs/ScoreComparisonTool";
import ImprovementIndicator from "./srs/ImprovementIndicator";

// GitHub-Lite Components
import RepositoryBrowser from "./github/RepositoryBrowser";
import CommitHistory from "./github/CommitHistory";
import BranchManager from "./github/BranchManager";
import IssueTracker from "./github/IssueTracker";
import PullRequestPanel from "./github/PullRequestPanel";
import ActivityFeed from "./github/ActivityFeed";
import ContributionGraph from "./github/ContributionGraph";

import { getEnhancedMembers } from "../../services/projectEnhancementApi";
import { getProject } from "../../services/projectService";
import { useSocket, EVENTS } from "../../contexts/SocketContext";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "code", label: "Code", icon: Code2 },
  { key: "issues", label: "Issues", icon: CircleDot },
  { key: "prs", label: "Pull Requests", icon: GitPullRequest },
  { key: "worklogs", label: "Work Logs", icon: Clock },
  { key: "history", label: "History", icon: History },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "insights", label: "Insights", icon: TrendingUp },
];

const EnhancedProjectDashboard = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [members, setMembers] = useState([]);
  const [project, setProject] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingProject, setLoadingProject] = useState(true);
  const [error, setError] = useState(null);
  const [repoRefreshKey, setRepoRefreshKey] = useState(0);
  const { socket } = useSocket();

  // Get current user from localStorage
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const currentPersonId = user.personId || user.userId;
  const isFaculty = user.role === "faculty";

  // Fetch project details from backend
  const fetchProject = useCallback(async () => {
    try {
      const res = await getProject(projectId);
      setProject(res.project || res);
      setError(null);
    } catch (err) {
      console.error("Failed to load project:", err);
      setError(err.message || "Failed to load project");
    } finally {
      setLoadingProject(false);
    }
  }, [projectId]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await getEnhancedMembers(projectId);
      setMembers(res.data || []);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchMembers();
  }, [fetchProject, fetchMembers]);

  // Join project socket room for real-time updates
  useEffect(() => {
    if (!socket || !projectId) return;
    socket.emit("join:project", projectId);

    const repoEvents = [
      EVENTS.REPO_FILE_COMMITTED,
      EVENTS.REPO_FILE_DELETED,
      EVENTS.REPO_BRANCH_CREATED,
      EVENTS.REPO_BRANCH_DELETED,
      EVENTS.REPO_ISSUE_CREATED,
      EVENTS.REPO_ISSUE_UPDATED,
      EVENTS.REPO_PR_CREATED,
      EVENTS.REPO_PR_UPDATED,
      EVENTS.REPO_PR_COMMENTED,
    ];

    const handleRepoEvent = () => setRepoRefreshKey((k) => k + 1);
    repoEvents.forEach((evt) => socket.on(evt, handleRepoEvent));

    return () => {
      socket.emit("leave:project", projectId);
      repoEvents.forEach((evt) => socket.off(evt, handleRepoEvent));
    };
  }, [socket, projectId]);

  const renderTab = () => {
    switch (activeTab) {
      // ─────── OVERVIEW ───────
      case "overview":
        return (
          <div className="space-y-6">
            {/* Team Members with Photos + Scope */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Team Members
                </h3>
              </div>

              {loadingMembers ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Loading team...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {members.map((m) => (
                    <div key={m.person_id} className="space-y-3">
                      <MemberPhotoUpload
                        projectId={projectId}
                        personId={m.person_id}
                        currentPhotoUrl={m.photo_url}
                        onUpload={() => fetchMembers()}
                        editable={m.person_id === currentPersonId || isFaculty}
                      />
                      <MemberScopeEditor
                        projectId={projectId}
                        personId={m.person_id}
                        member={m}
                        onUpdate={() => fetchMembers()}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Share % Distribution */}
            <section>
              <SharePercentageDistributor
                projectId={projectId}
                members={members}
                onUpdate={() => fetchMembers()}
              />
            </section>

            {/* Monthly Plans (current user) */}
            {currentPersonId && (
              <section>
                <MonthlyPlanCreator
                  projectId={projectId}
                  personId={currentPersonId}
                  isFaculty={isFaculty}
                />
              </section>
            )}

            {/* Contribution Graph */}
            <section>
              <ContributionGraph projectId={projectId} refreshKey={repoRefreshKey} />
            </section>
          </div>
        );

      // ─────── CODE ───────
      case "code":
        return (
          <div className="space-y-6">
            <RepositoryBrowser projectId={projectId} refreshKey={repoRefreshKey} />
            <CommitHistory projectId={projectId} refreshKey={repoRefreshKey} />
            <BranchManager projectId={projectId} refreshKey={repoRefreshKey} />
          </div>
        );

      // ─────── ISSUES ───────
      case "issues":
        return <IssueTracker projectId={projectId} refreshKey={repoRefreshKey} />;

      // ─────── PULL REQUESTS ───────
      case "prs":
        return <PullRequestPanel projectId={projectId} refreshKey={repoRefreshKey} />;

      // ─────── WORK LOGS ───────
      case "worklogs":
        return (
          <div className="space-y-6">
            {/* Current user's work logs */}
            {currentPersonId && (
              <WorkLogTracker
                projectId={projectId}
                personId={currentPersonId}
                isFaculty={isFaculty}
              />
            )}

            {/* Faculty can see all members' logs */}
            {isFaculty && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  All Members
                </h3>
                {members
                  .filter((m) => m.person_id !== currentPersonId)
                  .map((m) => (
                    <div key={m.person_id}>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        {m.display_name || m.person_id}
                      </h4>
                      <WorkLogTracker
                        projectId={projectId}
                        personId={m.person_id}
                        isFaculty={isFaculty}
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        );

      // ─────── HISTORY (SRS 4.1.2) ───────
      case "history":
        return (
          <div className="space-y-6">
            <ReviewHistoryViewer projectId={projectId} />
            <ScoreComparisonTool projectId={projectId} />
          </div>
        );

      // ─────── ACTIVITY ───────
      case "activity":
        return <ActivityFeed projectId={projectId} refreshKey={repoRefreshKey} />;

      // ─────── INSIGHTS (SRS 4.1.2 Improvement) ───────
      case "insights":
        return <ImprovementIndicator projectId={projectId} />;

      default:
        return null;
    }
  };

  // Status badge colors
  const statusColors = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    under_review: "bg-amber-100 text-amber-700",
    locked: "bg-cyan-100 text-cyan-700",
    archived: "bg-purple-100 text-purple-700",
  };

  if (loadingProject && loadingMembers) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Project Not Found
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {typeof error === "string"
              ? error
              : error?.message || "Something went wrong"}
          </p>
          <button
            onClick={() => navigate("/projects")}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Project Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/projects")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 truncate">
                  {project?.title || "Project"}
                </h1>
                {project?.status && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[project.status] || statusColors.draft}`}
                  >
                    {project.status
                      ?.split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")}
                  </span>
                )}
              </div>
              {project?.description && (
                <p className="text-sm text-gray-500 truncate mt-0.5">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {project?.academicYear && <span>AY {project.academicYear}</span>}
              {project?.semester && <span>• Sem {project.semester}</span>}
              {members.length > 0 && (
                <span className="flex items-center gap-1 ml-2">
                  <Users className="h-3 w-3" />
                  {members.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top navigation tabs */}
      <div className="bg-white border-b sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">{renderTab()}</div>
    </div>
  );
};

export default EnhancedProjectDashboard;
