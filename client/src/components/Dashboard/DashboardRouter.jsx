// ============================================================
// DASHBOARD ROUTER — Routes to Role-Specific Dashboard
// ============================================================
// This component replaces the old generic Dashboard.
// It fetches personalized dashboard data from the backend
// and renders the appropriate dashboard based on the user's role.
//
// The backend decides the dashboard type — this component
// just reads the 'type' field and renders the matching component.
//
// FLOW:
//   1. Mount → usePersonalization hook fetches /api/personalization/dashboard
//   2. While loading → show loading skeleton
//   3. On success → check data.type → render StudentDashboard/FacultyDashboard/AdminDashboard
//   4. On error → show error message with retry button
//   5. If type is 'default' → show profile completion prompt
// ============================================================

// Import React for JSX rendering
import React from "react";
import { Navigate } from "react-router-dom";
import { ROUTES } from "../../utils/constants";

// Import lucide icons for loading and error states
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

// Import the personalization hook — fetches and manages dashboard data
import usePersonalization from "../../hooks/usePersonalization";

// Import auth hook for user role
import useAuth from "../../hooks/useAuth";

// Import role-specific dashboard components
import StudentDashboard from "./StudentDashboard";
import FacultyDashboard from "./FacultyDashboard";
import AdminDashboard from "./AdminDashboard";
import DefaultDashboard from "./DefaultDashboard";

// ============================================================
// DashboardRouter component
// ============================================================
/**
 * Routes the user to the correct dashboard based on backend data.
 *
 * The backend determines which dashboard type to show.
 * This component is a pure router — no business logic.
 */
const DashboardRouter = () => {
  // Fetch personalized dashboard data via the custom hook
  const { dashboardData, isLoading, error, refresh } = usePersonalization();

  // Get user role from auth context for fallback routing
  const { user } = useAuth();

  // SCOPE GOVERNANCE CHECK
  // If faculty has not configured scope, redirect to setup page immediately
  // This enforces the "First Login Setup" rule
  if (user?.role === 'faculty' && user?.scopeStatus !== 'exists') {
    return <Navigate to={ROUTES.SCOPE_SETUP} replace />;
  }

  // ---------------------------------------------------------
  // LOADING STATE — Show skeleton while fetching data
  // ---------------------------------------------------------
  if (isLoading) {
    return (
      // Full-page loading with 2026 glassmorphism design
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        {/* Loading card */}
        <div
          className="
            bg-white/70 backdrop-blur-xl rounded-2xl
            shadow-[0_8px_40px_rgba(0,0,0,0.06)]
            border border-gray-100/50
            p-10 text-center
          "
        >
          {/* Spinning loader icon with violet accent */}
          <div
            className="
              w-14 h-14 mx-auto mb-5 rounded-2xl
              bg-gradient-to-br from-violet-50 to-white
              flex items-center justify-center
              shadow-[0_4px_12px_rgba(139,92,246,0.1)]
            "
          >
            <Loader2 className="h-7 w-7 text-violet-500 animate-spin" />
          </div>
          {/* Loading text */}
          <p className="text-gray-700 font-medium tracking-tight">
            Loading your dashboard...
          </p>
          {/* Subtext */}
          <p className="text-gray-400 text-sm mt-1">
            Fetching your projects and data
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // ERROR STATE — Show error with retry button
  // ---------------------------------------------------------
  if (error) {
    return (
      // Full-page error with 2026 design
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        {/* Error card */}
        <div
          className="
            bg-white/70 backdrop-blur-xl rounded-2xl
            shadow-[0_8px_40px_rgba(0,0,0,0.06)]
            border border-gray-100/50
            p-10 text-center max-w-md
          "
        >
          {/* Warning icon */}
          <div
            className="
              w-14 h-14 mx-auto mb-5 rounded-2xl
              bg-gradient-to-br from-red-50 to-white
              flex items-center justify-center
              shadow-[0_4px_12px_rgba(239,68,68,0.1)]
            "
          >
            <AlertTriangle className="h-7 w-7 text-red-400" />
          </div>
          {/* Error title */}
          <h2 className="text-lg font-semibold text-gray-800 mb-2 tracking-tight">
            Dashboard Load Failed
          </h2>
          {/* Error message */}
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          {/* Retry button */}
          <button
            onClick={refresh}
            className="
              inline-flex items-center gap-2 px-6 py-3
              bg-gray-900 text-white rounded-xl font-medium
              shadow-[0_4px_12px_rgba(0,0,0,0.15)]
              hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)]
              hover:scale-[1.02]
              active:scale-[0.98]
              transition-all duration-200
            "
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // NO DATA STATE — Shouldn't happen, but handle defensively
  // ---------------------------------------------------------
  if (!dashboardData) {
    return (
      // Same layout as error but with different message
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
        <div
          className="
            bg-white/70 backdrop-blur-xl rounded-2xl
            shadow-[0_8px_40px_rgba(0,0,0,0.06)]
            border border-gray-100/50
            p-10 text-center
          "
        >
          <p className="text-gray-500">No dashboard data available.</p>
          {/* Retry button */}
          <button
            onClick={refresh}
            className="
              mt-6 inline-flex items-center gap-2 px-6 py-3
              bg-gray-900 text-white rounded-xl font-medium
              shadow-[0_4px_12px_rgba(0,0,0,0.15)]
              hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)]
              hover:scale-[1.02]
              active:scale-[0.98]
              transition-all duration-200
            "
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // ROUTE TO ROLE-SPECIFIC DASHBOARD
  // The backend sets data.type to 'student', 'faculty', 'admin', or 'default'
  // Each dashboard component receives the full payload as props
  // For 'default' type, fall back to role-based dashboard with empty data
  // ---------------------------------------------------------
  switch (dashboardData.type) {
    // Student dashboard — projects, work logs, evaluations
    case "student":
      return <StudentDashboard data={dashboardData} onRefresh={refresh} />;

    // Faculty dashboard — evaluations, department stats, reviews
    case "faculty":
      return <FacultyDashboard data={dashboardData} onRefresh={refresh} />;

    // Admin dashboard — system health, departments, integrity checks
    case "admin":
      return <AdminDashboard data={dashboardData} onRefresh={refresh} />;

    // Default dashboard — check user role and show appropriate dashboard
    // with safe default data so students/faculty still have full navigation
    case "default": {
      const userRole = user?.role || dashboardData.user?.role;

      if (userRole === "student") {
        // Build safe student dashboard data with empty sections
        const studentData = {
          ...dashboardData,
          type: "student",
          user: {
            ...dashboardData.user,
            name:
              user?.name ||
              dashboardData.user?.name ||
              user?.email?.split("@")[0],
            picture: user?.picture || null,
            role: "student",
          },
          sections: {
            myProjects: dashboardData.sections?.myProjects || [],
            pendingWork: dashboardData.sections?.pendingWork || [],
            stats: dashboardData.sections?.stats || {
              totalProjects: 0,
              activeProjects: 0,
              pendingItems: 0,
              completedProjects: 0,
            },
            upcomingEvaluations:
              dashboardData.sections?.upcomingEvaluations || [],
            assignedEvaluations:
              dashboardData.sections?.assignedEvaluations || [],
            scarcityEvaluations:
              dashboardData.sections?.scarcityEvaluations || [],
          },
          actions: dashboardData.actions || [
            {
              id: "create-project",
              label: "Create Project",
              icon: "plus-circle",
              available: true,
              description: "Start a new project",
            },
            {
              id: "view-project",
              label: "My Projects",
              icon: "folder-open",
              available: true,
              description: "View your projects",
            },
          ],
        };
        return <StudentDashboard data={studentData} onRefresh={refresh} />;
      }

      if (userRole === "faculty") {
        const facultyData = {
          ...dashboardData,
          type: "faculty",
          user: {
            ...dashboardData.user,
            name:
              user?.name ||
              dashboardData.user?.name ||
              user?.email?.split("@")[0],
            picture: user?.picture || null,
            role: "faculty",
          },
          sections: {
            evaluationAssignments:
              dashboardData.sections?.evaluationAssignments || [],
            departmentOverview:
              dashboardData.sections?.departmentOverview || {},
            students: dashboardData.sections?.students || [],
          },
          actions: dashboardData.actions || [],
        };
        return <FacultyDashboard data={facultyData} onRefresh={refresh} />;
      }

      // Unknown role — show default dashboard
      return <DefaultDashboard data={dashboardData} onRefresh={refresh} />;
    }

    // Unknown type — defensive fallback to default
    default:
      return <DefaultDashboard data={dashboardData} onRefresh={refresh} />;
  }
};

// ============================================================
// Export the DashboardRouter component
// This replaces <Dashboard /> in the App.jsx routing
// ============================================================
export default DashboardRouter;
