// ============================================================
// ACTIVITY LOG — Admin Audit & Login Activity Monitor
// ============================================================
// Displays recent login activity across all users in the system.
// Uses two backend APIs per user:
//   1. GET /api/users/:userId/sessions  → active sessions
//   2. GET /api/users/:userId/snapshots → login history
//
// Fetches the full user list first, then loads activity data
// for the most recently active users. All data is REAL — pulled
// directly from the backend database.
//
// SRS 4.3.1: Audit trail for admin visibility
// ============================================================

// Import React for JSX rendering and state management
import React, { useState, useEffect, useCallback } from "react";

// Import admin service API methods
import {
  fetchUsers,
  fetchUserSessions,
  fetchUserSnapshots,
} from "../../../services/adminService";

// Import Lucide icons for visual elements
import {
  Activity,
  Monitor,
  Clock,
  User,
  Shield,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Globe,
  Eye,
} from "lucide-react";

// ============================================================
// ActivityLog Component
// ============================================================
/**
 * Admin panel showing recent login activity across all users.
 * Fetches real data from the backend on mount.
 */
const ActivityLog = () => {
  // ---------------------------------------------------------
  // STATE — Users, snapshots, loading, errors
  // ---------------------------------------------------------

  // Array of user records from the backend
  const [users, setUsers] = useState([]);

  // Array of login snapshots fetched from backend
  const [snapshots, setSnapshots] = useState([]);

  // Loading flag — true while fetching data
  const [isLoading, setIsLoading] = useState(true);

  // Error message — null when no error
  const [error, setError] = useState(null);

  // ID of the user whose sessions are expanded
  const [expandedUser, setExpandedUser] = useState(null);

  // Sessions for the currently expanded user
  const [userSessions, setUserSessions] = useState([]);

  // Loading flag for user session detail fetch
  const [sessionLoading, setSessionLoading] = useState(false);

  // ---------------------------------------------------------
  // LOAD ACTIVITY — Fetch users + login snapshots
  // ---------------------------------------------------------
  const loadActivity = useCallback(async () => {
    try {
      // Set loading state before fetch
      setIsLoading(true);
      // Clear previous errors
      setError(null);

      // Step 1: Fetch all users from backend
      const userData = await fetchUsers(1, 100);
      // Store user records in state
      const userList = userData.users || [];
      setUsers(userList);

      // Step 2: Fetch login snapshots for up to 20 users
      // Limit to 20 to avoid overloading the backend
      const usersToFetch = userList.slice(0, 20);
      // Fetch all user snapshots in parallel using Promise.allSettled
      const snapshotResults = await Promise.allSettled(
        usersToFetch.map(async (user) => {
          try {
            // Fetch login history for this user
            const data = await fetchUserSnapshots(user.id);
            // Return snapshots with user info attached
            return (data.snapshots || []).map((snap) => ({
              ...snap,
              // Attach user email and name for display
              userEmail: user.email,
              userName: user.display_name || user.email?.split("@")[0],
              userRole: user.role,
              userId: user.id,
            }));
          } catch {
            // Return empty array if fetch fails for this user
            return [];
          }
        }),
      );

      // Flatten results from all users into one sorted array
      const allSnapshots = snapshotResults
        // Only keep fulfilled promises
        .filter((r) => r.status === "fulfilled")
        // Extract the snapshot arrays
        .flatMap((r) => r.value)
        // Sort by most recent first
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        // Limit to most recent 100 entries
        .slice(0, 100);

      // Store the merged snapshots in state
      setSnapshots(allSnapshots);
    } catch (err) {
      // Store error message for display
      setError(
        err.response?.data?.error || err.message || "Failed to load activity",
      );
    } finally {
      // Clear loading state
      setIsLoading(false);
    }
  }, []);

  // Auto-fetch activity data on component mount
  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // ---------------------------------------------------------
  // EXPAND USER SESSIONS — Load active sessions on demand
  // ---------------------------------------------------------
  const handleExpandUser = async (userId) => {
    // Toggle off if already expanded
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }

    try {
      // Set expand state and show loading
      setExpandedUser(userId);
      setSessionLoading(true);

      // Fetch active sessions from backend
      const data = await fetchUserSessions(userId);
      // Store sessions in state
      setUserSessions(data.sessions || []);
    } catch {
      // Clear sessions on error
      setUserSessions([]);
    } finally {
      // Clear loading state
      setSessionLoading(false);
    }
  };

  // ---------------------------------------------------------
  // COMPUTED STATS — Activity summary
  // ---------------------------------------------------------
  const stats = {
    // Total users in the system
    totalUsers: users.length,
    // Total login events recorded (from snapshots)
    totalLogins: snapshots.length,
    // Unique users who logged in (from loaded snapshots)
    activeUsers: new Set(snapshots.map((s) => s.userId)).size,
    // Admin logins — snapshots where the role was 'admin'
    adminLogins: snapshots.filter((s) => s.role_at_login === "admin").length,
  };

  return (
    <div className="space-y-6">
      {/* ====================================================== */}
      {/* ERROR BANNER */}
      {/* ====================================================== */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          {/* Retry button to reload data from backend */}
          <button
            onClick={loadActivity}
            className="ml-auto text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* STATS CARDS — Activity summary */}
      {/* ====================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Total Users",
            value: stats.totalUsers,
            icon: User,
            color: "text-gray-600",
          },
          {
            label: "Login Events",
            value: stats.totalLogins,
            icon: Activity,
            color: "text-blue-600",
          },
          {
            label: "Active Users",
            value: stats.activeUsers,
            icon: Monitor,
            color: "text-green-600",
          },
          {
            label: "Admin Logins",
            value: stats.adminLogins,
            icon: Shield,
            color: "text-red-600",
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
      {/* REFRESH BAR */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            Recent Login Activity
          </h3>
          {/* Refresh button to reload data from backend */}
          <button
            onClick={loadActivity}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Refresh activity"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ====================================================== */}
      {/* ACTIVITY TABLE */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        {isLoading ? (
          // Loading state — show spinner while fetching data
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading activity log...</span>
          </div>
        ) : snapshots.length === 0 ? (
          // Empty state — no login events found
          <div className="text-center py-16 text-gray-400">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No login activity found</p>
            <p className="text-xs mt-1">
              Login events will appear here after users sign in
            </p>
          </div>
        ) : (
          // Activity table with expandable rows
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Table header */}
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    User
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Role
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    IP Address
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Login Time
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    Sessions
                  </th>
                </tr>
              </thead>
              {/* Table body — one row per login event */}
              <tbody>
                {snapshots.map((snap, index) => {
                  // Check if this user's sessions panel is expanded
                  const isExpanded =
                    expandedUser === snap.userId &&
                    index ===
                      snapshots.findIndex((s) => s.userId === snap.userId);

                  return (
                    <React.Fragment
                      key={`${snap.userId}-${snap.created_at}-${index}`}
                    >
                      {/* Main activity row */}
                      <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        {/* User email and name */}
                        <td className="py-3 px-4">
                          <p className="font-medium text-gray-900 text-xs">
                            {snap.userName || "Unknown"}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {snap.userEmail || "—"}
                          </p>
                        </td>

                        {/* Role at login time */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                              snap.role_at_login === "admin"
                                ? "bg-red-50 text-red-700"
                                : snap.role_at_login === "faculty"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-gray-50 text-gray-600"
                            }`}
                          >
                            {snap.role_at_login || "—"}
                          </span>
                        </td>

                        {/* IP address from snapshot */}
                        <td className="py-3 px-4">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {snap.ip_address || "—"}
                          </span>
                        </td>

                        {/* Login timestamp */}
                        <td className="py-3 px-4 text-xs text-gray-500">
                          {snap.created_at
                            ? new Date(snap.created_at).toLocaleString(
                                "en-IN",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </td>

                        {/* Expand/collapse sessions button */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleExpandUser(snap.userId)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View active sessions"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded sessions panel */}
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={5}
                            className="bg-gray-50/80 px-4 py-4 border-b border-gray-100"
                          >
                            {sessionLoading ? (
                              // Loading spinner for session data
                              <div className="flex items-center justify-center py-3">
                                <Loader2 className="h-5 w-5 text-red-500 animate-spin" />
                                <span className="ml-2 text-sm text-gray-500">
                                  Loading sessions...
                                </span>
                              </div>
                            ) : userSessions.length > 0 ? (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                  Active Sessions ({userSessions.length})
                                </h4>
                                <div className="space-y-1">
                                  {/* Render each active session */}
                                  {userSessions.map((session, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="flex items-center gap-3 text-xs bg-white rounded-lg px-3 py-2 border border-gray-100"
                                    >
                                      {/* Session device icon */}
                                      <Monitor className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      {/* Session details */}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-gray-700 truncate">
                                          {session.user_agent?.slice(0, 60) ||
                                            "Unknown device"}
                                        </p>
                                        <p className="text-gray-400 mt-0.5">
                                          IP: {session.ip_address || "—"} ·
                                          Created:{" "}
                                          {session.created_at
                                            ? new Date(
                                                session.created_at,
                                              ).toLocaleString("en-IN")
                                            : "—"}
                                        </p>
                                      </div>
                                      {/* Session active indicator */}
                                      <span
                                        className="h-2 w-2 rounded-full bg-green-400 flex-shrink-0"
                                        title="Active"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic text-center py-2">
                                No active sessions for this user
                              </p>
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
    </div>
  );
};

// ============================================================
// Export the ActivityLog component
// ============================================================
export default ActivityLog;
