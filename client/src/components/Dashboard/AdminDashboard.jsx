// ============================================================
// ADMIN DASHBOARD — Full Admin Control Panel with Tabbed Layout
// ============================================================
// Enhanced admin dashboard with tabbed navigation:
//   1. Overview — System health, departments, quick actions
//   2. User Management — Full CRUD for all users (search, edit, delete)
//
// This component manages tab state and delegates to sub-components.
// The Overview tab preserves the original admin dashboard content.
// User Management fetches its own data via the useAdmin hook.
//
// DESIGN: Backend provides overview data via props (dashboardData).
// User management data is fetched independently via admin API.
// This keeps the existing PersonalizationService flow intact.
//
// SECTIONS:
//   1. Welcome header with admin status + refresh
//   2. Tab navigation bar
//   3. Active tab content (Overview or User Management)
//
// SRS 4.3.1: System monitoring dashboard for administrators
// SRS 4.3.2: Admin user management capabilities
// ============================================================

// Import React for JSX rendering and state management
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// Import Lucide icons for visual elements
import {
  Shield, // Admin icon
  RefreshCw, // Refresh button
  LayoutDashboard, // Overview tab icon
  Users, // User management tab icon
  FolderOpen, // Projects tab icon
  Activity, // Activity log tab icon
  AlertTriangle, // Zero scores tab icon
  Layers, // Cohort management tab icon
  GraduationCap, // Faculty evaluation tab icon
  ClipboardList, // Team management tab icon
  BookOpen, // Rubrics tab icon
  FileText, // Session report tab icon
  Bell, // Alerts tab icon
  Settings, // Admin management tab icon
} from "lucide-react";

// Import admin sub-components
import AdminOverview from "./admin/AdminOverview";
import UserManagement from "./admin/UserManagement";
import ProjectManagement from "./admin/ProjectManagement";
import ActivityLog from "./admin/ActivityLog";
import ZeroScoreAnalyticsTab from "./admin/ZeroScoreAnalyticsTab";
import CohortManagementTab from "./admin/CohortManagementTab";
import FacultyEvalTab from "./admin/FacultyEvalTab";
import TeamManagementTab from "./admin/TeamManagementTab";
import RubricManagementTab from "./admin/RubricManagementTab";
import SessionReportTab from "./admin/SessionReportTab";
import AlertsAppealsTab from "./admin/AlertsAppealsTab";
import AdminManagementTab from "./admin/AdminManagementTab";

// ============================================================
// TAB CONFIGURATION — Defines the admin navigation tabs
// Each tab maps to a sub-component rendered in the content area
// ============================================================
const ADMIN_TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    description: "System health & statistics",
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    description: "Manage all system users",
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderOpen,
    description: "Monitor & manage projects",
  },
  {
    id: "activity",
    label: "Activity Log",
    icon: Activity,
    description: "Login & audit trail",
  },
  {
    id: "zero-scores",
    label: "Zero Scores",
    icon: AlertTriangle,
    description: "Zero-score reason analytics",
  },
  {
    id: "cohorts",
    label: "Cohorts",
    icon: Layers,
    description: "Evaluation cohort orchestration",
  },
  {
    id: "faculty-eval",
    label: "Faculty Eval",
    icon: GraduationCap,
    description: "Faculty evaluation analytics & normalization",
  },
  {
    id: "teams",
    label: "Teams",
    icon: ClipboardList,
    description: "Team formation approvals",
  },
  {
    id: "rubrics",
    label: "Rubrics",
    icon: BookOpen,
    description: "Evaluation rubric management",
  },
  {
    id: "session-report",
    label: "Session Report",
    icon: FileText,
    description: "Session evaluation insights & reporting",
  },
  {
    id: "alerts",
    label: "Alerts & Appeals",
    icon: Bell,
    description: "Anomaly alerts & student score appeals",
  },
  {
    id: "management",
    label: "Management",
    icon: Settings,
    description: "Delete sessions & reset credibility",
  },
];

// ============================================================
// AdminDashboard Component
// ============================================================
/**
 * Renders the admin dashboard with tabbed navigation.
 * Preserves the original dashboard data flow (data + onRefresh props)
 * while adding new capabilities through tabs.
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Complete dashboard payload from backend
 * @param {Function} props.onRefresh - Callback to refresh dashboard data
 */
const AdminDashboard = ({ data, onRefresh }) => {
  // Destructure user info from the dashboard payload
  const { user } = data;

  // Active tab state — defaults to overview (original content)
  const [activeTab, setActiveTab] = useState("overview");

  // Navigation for Session Planner
  const navigate = useNavigate();

  return (
    // Main container with gradient background (matches existing pages)
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Content wrapper — wider max-width for table layouts */}
      <main className="w-full mx-auto px-4 sm:px-6 py-5">
        {/* ====================================================== */}
        {/* WELCOME HEADER — Admin greeting + refresh */}
        {/* ====================================================== */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {/* Admin name greeting */}
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-7 w-7 text-red-600" />
              Admin Console — {user?.name || "Administrator"}
            </h1>
            {/* System overview subtext */}
            <p className="text-gray-500 mt-1">
              System administration and monitoring dashboard
            </p>
          </div>
          {/* Session Planner + Refresh buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/session-planner")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg"
              style={{
                background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
              }}
              title="Open Session Planner"
            >
              <ClipboardList className="h-4 w-4" />
              Session Planner
            </button>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 
                         hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              title="Refresh dashboard data"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* ====================================================== */}
        {/* TAB NAVIGATION — Switch between admin views */}
        {/* ====================================================== */}
        <div className="flex gap-1 bg-white rounded-2xl shadow-sm border border-gray-200/50 p-1.5 mb-4 overflow-x-auto scrollbar-hide">
          {ADMIN_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0
                           transition-all duration-200 ${
                             isActive
                               ? "bg-red-50 text-red-700 shadow-sm border border-red-200/50"
                               : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                           }`}
                title={tab.description}
              >
                <TabIcon
                  className={`h-3.5 w-3.5 ${isActive ? "text-red-600" : ""}`}
                />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ====================================================== */}
        {/* TAB CONTENT — Renders the active tab's component */}
        {/* ====================================================== */}
        <div>
          {/* Overview tab — original admin dashboard content */}
          {/* Pass onSwitchTab so quick actions can navigate to other tabs */}
          {activeTab === "overview" && (
            <AdminOverview
              data={data}
              onSwitchTab={(tabId) => setActiveTab(tabId)}
            />
          )}

          {/* User Management tab — full CRUD user interface */}
          {activeTab === "users" && <UserManagement />}

          {/* Projects tab — real-time project monitoring & state transitions */}
          {activeTab === "projects" && <ProjectManagement />}

          {/* Activity Log tab — login events & session audit trail */}
          {activeTab === "activity" && <ActivityLog />}

          {/* Zero Scores tab — SRS §4.1.5 zero-score reason analytics */}
          {activeTab === "zero-scores" && <ZeroScoreAnalyticsTab />}

          {/* Cohorts tab — SRS §1.2 + §8.1 evaluation cohort orchestration */}
          {activeTab === "cohorts" && <CohortManagementTab />}

          {/* Faculty Eval tab — SRS §4.4.3 normalization config + results */}
          {activeTab === "faculty-eval" && <FacultyEvalTab />}

          {/* Teams tab — team formation approvals */}
          {activeTab === "teams" && <TeamManagementTab />}

          {/* Rubrics tab — SRS §4.1.4 rubric-based distribution */}
          {activeTab === "rubrics" && <RubricManagementTab />}

          {/* Session Report tab — evaluation insights per session */}
          {activeTab === "session-report" && <SessionReportTab />}

          {/* Alerts & Appeals tab — anomaly alerts + student appeals */}
          {activeTab === "alerts" && <AlertsAppealsTab />}

          {/* Admin Management tab — delete sessions + reset credibility */}
          {activeTab === "management" && <AdminManagementTab />}
        </div>
      </main>
    </div>
  );
};

// ============================================================
// Export the AdminDashboard component
// ============================================================
export default AdminDashboard;
