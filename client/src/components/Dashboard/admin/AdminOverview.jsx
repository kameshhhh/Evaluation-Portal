// ============================================================
// ADMIN OVERVIEW — System Health & Department Statistics
// ============================================================
// This component contains the original admin dashboard content:
//   1. System health statistics cards (users, projects, DB status)
//   2. Department breakdown table
//   3. Quick actions panel — NOW WIRED to real backend APIs
//
// Extracted from AdminDashboard.jsx to support tabbed layout.
// Receives the same props that the original AdminDashboard used.
// Quick actions now trigger real backend operations and report results.
//
// SRS 4.3.1: System monitoring dashboard for administrators
// ============================================================

// Import React for JSX rendering and state management
import React, { useState } from "react";

// Import useNavigate for client-side navigation
import { useNavigate } from "react-router-dom";

// Import admin service for backend API calls
import { runIntegrityCheck } from "../../../services/adminService";

// Import Lucide icons for visual elements
import {
  Shield,
  Users,
  FolderOpen,
  ShieldCheck,
  Calendar,
  FileSearch,
  BarChart2,
  Database,
  Snowflake,
  Activity,
  Loader2,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";

// ============================================================
// AdminOverview Component
// ============================================================
/**
 * Renders the system health overview section of the admin dashboard.
 * Quick actions are wired to real backend APIs and tab navigation.
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Complete dashboard payload from backend
 * @param {Function} props.onSwitchTab - Callback to switch admin tabs (e.g., to 'users', 'projects')
 */
const AdminOverview = ({ data, onSwitchTab }) => {
  // Destructure the dashboard payload from backend
  const { sections, actions } = data;

  // Destructure sections for easy access
  const { systemHealth, departments } = sections;

  // Navigation hook for weighted results page
  const navigate = useNavigate();

  // State for tracking action execution (loading, result, error)
  const [actionState, setActionState] = useState({
    activeAction: null, // ID of the action currently running
    result: null, // Result message to display
    resultType: null, // 'success' or 'error'
  });

  // ---------------------------------------------------------
  // Handle quick action button clicks — route to real operations
  // ---------------------------------------------------------
  const handleActionClick = async (action) => {
    // Route each action to its real handler
    switch (action.id) {
      case "integrity-check":
        // Run real backend integrity check
        await executeIntegrityCheck();
        break;
      case "user-management":
        // Navigate to the User Management tab
        if (onSwitchTab) onSwitchTab("users");
        break;
      case "manage-calendar":
        // Navigate to the Projects tab (calendar = project scheduling)
        if (onSwitchTab) onSwitchTab("projects");
        break;
      case "audit-trail":
        // Navigate to the Activity Log tab
        if (onSwitchTab) onSwitchTab("activity");
        break;
      case "department-report":
        // Scroll to the department table on this page
        document
          .getElementById("dept-table")
          ?.scrollIntoView({ behavior: "smooth" });
        break;
      default:
        break;
    }
  };

  // ---------------------------------------------------------
  // Execute real integrity check against the backend
  // ---------------------------------------------------------
  const executeIntegrityCheck = async () => {
    try {
      // Set loading state for this action
      setActionState({
        activeAction: "integrity-check",
        result: null,
        resultType: null,
      });

      // Call real backend API — POST /api/evaluations/integrity-check
      const result = await runIntegrityCheck();

      // Show the result to the admin
      setActionState({
        activeAction: null,
        result: `Integrity check complete — ${result?.totalChecked || 0} entities verified, ${result?.issuesFound || 0} issues found`,
        resultType: (result?.issuesFound || 0) === 0 ? "success" : "error",
      });
    } catch (err) {
      // Show error message if the check failed
      setActionState({
        activeAction: null,
        result: `Integrity check failed: ${err.response?.data?.error || err.message}`,
        resultType: "error",
      });
    }

    // Auto-clear the result message after 5 seconds
    setTimeout(
      () =>
        setActionState({ activeAction: null, result: null, resultType: null }),
      5000,
    );
  };

  return (
    <div>
      {/* ====================================================== */}
      {/* SYSTEM HEALTH — Statistics cards */}
      {/* ====================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {/* Total Auth Users */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500 font-medium">
              Auth Users
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {systemHealth?.totalUsers || 0}
          </p>
        </div>

        {/* Total PEMM Persons */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-indigo-500" />
            <span className="text-xs text-gray-500 font-medium">Persons</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {systemHealth?.totalPersons || 0}
          </p>
        </div>

        {/* Total Projects */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Projects</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {systemHealth?.totalProjects || 0}
          </p>
        </div>

        {/* Active Projects */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-gray-500 font-medium">Active</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {systemHealth?.activeProjects || 0}
          </p>
        </div>

        {/* Frozen Projects */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Snowflake className="h-4 w-4 text-cyan-500" />
            <span className="text-xs text-gray-500 font-medium">Frozen</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {systemHealth?.frozenProjects || 0}
          </p>
        </div>

        {/* Database Status */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Database</span>
          </div>
          <p className="text-sm font-bold text-green-600 capitalize mt-1">
            {systemHealth?.databaseStatus || "Unknown"}
          </p>
        </div>
      </div>

      {/* ====================================================== */}
      {/* TWO-COLUMN LAYOUT — Departments + Actions */}
      {/* ====================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ====================================================== */}
        {/* LEFT COLUMN (2/3) — Department Breakdown */}
        {/* ====================================================== */}
        <div className="lg:col-span-2">
          <div
            id="dept-table"
            className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-red-600" />
              Department Breakdown
            </h2>

            {departments && departments.length > 0 ? (
              // Department table
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {/* Table header */}
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">
                        Department
                      </th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">
                        Students
                      </th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">
                        Projects
                      </th>
                    </tr>
                  </thead>
                  {/* Table body — one row per department */}
                  <tbody>
                    {departments.map((dept, index) => (
                      <tr
                        key={dept.code || index}
                        className="border-b border-gray-50 hover:bg-gray-50/50"
                      >
                        {/* Department code */}
                        <td className="py-3 px-3 font-medium text-gray-900">
                          {dept.code || "Unknown"}
                        </td>
                        {/* Student count */}
                        <td className="py-3 px-3 text-right text-gray-600">
                          {dept.studentCount || 0}
                        </td>
                        {/* Project count */}
                        <td className="py-3 px-3 text-right text-gray-600">
                          {dept.projectCount || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Table footer — totals */}
                  <tfoot>
                    <tr className="border-t border-gray-200">
                      <td className="py-3 px-3 font-semibold text-gray-900">
                        Total
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-900">
                        {departments.reduce(
                          (sum, d) => sum + (d.studentCount || 0),
                          0,
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-900">
                        {departments.reduce(
                          (sum, d) => sum + (d.projectCount || 0),
                          0,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              // Empty state
              <div className="text-center py-8 text-gray-400">
                <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No department data available yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* ====================================================== */}
        {/* RIGHT COLUMN (1/3) — Quick Actions */}
        {/* ====================================================== */}
        <div className="space-y-6">
          {/* Quick Actions Card — buttons wired to real backend operations */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Admin Actions
            </h2>

            {/* Action result banner — shows after an action completes */}
            {actionState.result && (
              <div
                className={`flex items-center gap-2 px-3 py-2 mb-3 rounded-xl text-xs font-medium ${
                  actionState.resultType === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {/* Show check or warning icon based on result type */}
                {actionState.resultType === "success" ? (
                  <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                {actionState.result}
              </div>
            )}

            {/* Action buttons — each calls a real backend operation */}
            <div className="space-y-2">
              {actions?.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  disabled={actionState.activeAction === action.id}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm font-medium ${
                    actionState.activeAction === action.id
                      ? "bg-gray-100 text-gray-400 cursor-wait"
                      : action.available
                        ? "bg-red-50 text-red-700 hover:bg-red-100"
                        : "bg-gray-50 text-gray-400 cursor-not-allowed"
                  }`}
                  title={action.description}
                >
                  {/* Show spinner if this action is currently executing */}
                  {actionState.activeAction === action.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    getActionIcon(action.icon)
                  )}
                  {action.label}
                </button>
              ))}
              {/* Comparative Evaluation — Admin round management (SRS §4.3) */}
              <button
                onClick={() => navigate("/comparative/admin")}
                className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors text-sm font-medium"
                title="Manage comparative evaluation rounds (SRS §4.3)"
              >
                <LayoutGrid className="h-4 w-4" />
                Comparative Rounds
              </button>
              {/* Weighted Results — Navigate to credibility-weighted results */}
              <button
                onClick={() =>
                  navigate(
                    "/scarcity/weighted-results/78fa3840-247f-4dcd-9b75-bdf499c292b9",
                  )
                }
                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors text-sm font-medium"
                title="View credibility-weighted evaluation results"
              >
                <TrendingUp className="h-4 w-4" />
                Weighted Results
              </button>
              {/* Credibility Bands — Navigate to band distribution overview (SRS 7.2) */}
              <button
                onClick={() => navigate("/admin/credibility")}
                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors text-sm font-medium"
                title="Evaluator credibility band distribution"
              >
                <Shield className="h-4 w-4" />
                Credibility Bands
              </button>
            </div>
          </div>

          {/* System Info Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-gray-600" />
              System Info
            </h2>
            <div className="space-y-2 text-sm">
              {/* Last integrity check */}
              <div className="flex justify-between">
                <span className="text-gray-500">Last Integrity Check</span>
                <span className="text-gray-700 font-medium">
                  {systemHealth?.lastIntegrityCheck
                    ? new Date(
                        systemHealth.lastIntegrityCheck,
                      ).toLocaleDateString()
                    : "Never"}
                </span>
              </div>
              {/* Database status */}
              <div className="flex justify-between">
                <span className="text-gray-500">Database</span>
                <span className="text-green-600 font-medium capitalize">
                  {systemHealth?.databaseStatus || "Unknown"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Map action icon names to Lucide components.
 *
 * @param {string} iconName - Icon name from backend payload
 * @returns {JSX.Element} Lucide icon component
 */
const getActionIcon = (iconName) => {
  const iconMap = {
    "shield-check": <ShieldCheck className="h-4 w-4" />,
    calendar: <Calendar className="h-4 w-4" />,
    users: <Users className="h-4 w-4" />,
    "file-search": <FileSearch className="h-4 w-4" />,
    "bar-chart-2": <BarChart2 className="h-4 w-4" />,
  };
  return iconMap[iconName] || <Shield className="h-4 w-4" />;
};

// ============================================================
// Export the AdminOverview component
// ============================================================
export default AdminOverview;
