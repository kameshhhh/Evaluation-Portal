// ============================================================
// USE ADMIN HOOK — React Hook for Admin User Management
// ============================================================
// Custom React hook that manages admin-specific state:
//   1. Fetches paginated user list from /api/users
//   2. Provides CRUD operations (edit role, deactivate, reactivate)
//   3. Client-side search/filter functionality
//   4. Loading, error, and success states
//   5. Auto-polling every 30s for real-time user data
//
// SYNC: After mutations, both the admin user list AND the
// personalization cache are invalidated so all dashboards
// reflect changes in real-time.
// ============================================================

// Import React hooks for state management and side effects
import { useState, useEffect, useCallback, useRef } from "react";

// Import admin API service methods
import {
  fetchUsers,
  updateUserRole,
  deactivateUser,
  reactivateUser,
} from "../services/adminService";

// Import cache invalidation to sync other dashboards after admin mutations
import { invalidateDashboardCache } from "../services/personalizationService";

// Import real-time socket hook for live data updates
import { useDataChange } from "./useSocketEvent";

// ============================================================
// POLLING INTERVAL — Keep admin user list fresh (30 seconds)
// ============================================================
const ADMIN_POLL_INTERVAL_MS = 30000;

// ============================================================
// useAdmin — Custom hook for admin operations
// ============================================================
/**
 * Hook that fetches and manages the admin user list.
 *
 * Auto-fetches on mount. Provides methods for:
 *   - Changing user roles
 *   - Deactivating/reactivating users
 *   - Searching and filtering users
 *   - Paginating through the user list
 *
 * @returns {Object} Admin state and control methods
 */
const useAdmin = () => {
  // ---------------------------------------------------------
  // STATE — Users, pagination, loading, error, filters
  // ---------------------------------------------------------

  // The array of user records from the backend
  const [users, setUsers] = useState([]);

  // Pagination metadata from the backend
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

  // Loading flag — true while fetching users
  const [isLoading, setIsLoading] = useState(true);

  // Error message — null when no error
  const [error, setError] = useState(null);

  // Search query for client-side filtering
  const [searchQuery, setSearchQuery] = useState("");

  // Role filter — 'all' or specific role string
  const [roleFilter, setRoleFilter] = useState("all");

  // Success message for user feedback after actions
  const [successMessage, setSuccessMessage] = useState(null);

  // ---------------------------------------------------------
  // FETCH USERS — Load user list with pagination
  // ---------------------------------------------------------
  const loadUsers = useCallback(
    async (page = 1) => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch paginated users from the backend
        const data = await fetchUsers(page, pagination.limit);

        // Update state with the response
        setUsers(data.users);
        setPagination(data.pagination);
      } catch (err) {
        setError(err.message || "Failed to load users");
      } finally {
        setIsLoading(false);
      }
    },
    [pagination.limit],
  );

  // Track if initial load is done (skip spinner during background polls)
  const hasLoadedOnce = useRef(false);

  // Auto-fetch on mount + auto-poll every 30s for real-time data
  useEffect(() => {
    // Initial fetch
    loadUsers().then(() => {
      hasLoadedOnce.current = true;
    });

    // Background polling — keeps user list fresh across admin sessions
    const pollTimer = setInterval(() => {
      // Silent reload — don't show spinner during background polls
      fetchUsers(pagination.page || 1, pagination.limit)
        .then((data) => {
          setUsers(data.users);
          setPagination(data.pagination);
        })
        .catch(() => {}); // Silently ignore poll errors
    }, ADMIN_POLL_INTERVAL_MS);

    return () => clearInterval(pollTimer);
  }, [loadUsers, pagination.page, pagination.limit]);

  // ---------------------------------------------------------
  // Clear success message after 3 seconds
  // ---------------------------------------------------------
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Real-time: refetch when user/role data changes on server
  useDataChange(["user", "role"], () => {
    loadUsers(pagination.page);
  });

  // ---------------------------------------------------------
  // CHANGE USER ROLE — Update a user's role assignment
  // Invalidates dashboard cache so the affected user sees changes immediately
  // ---------------------------------------------------------
  const changeUserRole = useCallback(async (userId, newRole) => {
    try {
      setError(null);
      await updateUserRole(userId, newRole);

      // Optimistic update — immediately reflect in the admin UI
      setUsers((prev) =>
        prev.map((u) =>
          u.internal_user_id === userId ? { ...u, user_role: newRole } : u,
        ),
      );

      // Invalidate admin's own dashboard cache so overview stats refresh
      try {
        await invalidateDashboardCache();
      } catch (_) {}

      setSuccessMessage(`Role updated to "${newRole}" successfully`);
      return true;
    } catch (err) {
      setError(err.message || "Failed to update user role");
      return false;
    }
  }, []);

  // ---------------------------------------------------------
  // DEACTIVATE USER — Soft-delete, revoke sessions, sync caches
  // ---------------------------------------------------------
  const removeUser = useCallback(async (userId) => {
    try {
      setError(null);
      await deactivateUser(userId);

      // Optimistic update — mark as inactive in the UI
      setUsers((prev) =>
        prev.map((u) =>
          u.internal_user_id === userId ? { ...u, is_active: false } : u,
        ),
      );

      // Invalidate admin's dashboard cache for fresh overview counts
      try {
        await invalidateDashboardCache();
      } catch (_) {}

      setSuccessMessage("User deactivated successfully");
      return true;
    } catch (err) {
      setError(err.message || "Failed to deactivate user");
      return false;
    }
  }, []);

  // ---------------------------------------------------------
  // REACTIVATE USER — Restore a deactivated user, sync caches
  // ---------------------------------------------------------
  const restoreUser = useCallback(async (userId) => {
    try {
      setError(null);
      await reactivateUser(userId);

      // Optimistic update — mark as active in the UI
      setUsers((prev) =>
        prev.map((u) =>
          u.internal_user_id === userId ? { ...u, is_active: true } : u,
        ),
      );

      // Invalidate admin's dashboard cache for fresh overview counts
      try {
        await invalidateDashboardCache();
      } catch (_) {}

      setSuccessMessage("User reactivated successfully");
      return true;
    } catch (err) {
      setError(err.message || "Failed to reactivate user");
      return false;
    }
  }, []);

  // ---------------------------------------------------------
  // CLIENT-SIDE FILTERING — Search + role filter
  // ---------------------------------------------------------
  const filteredUsers = users.filter((u) => {
    // Apply search query filter (email or role)
    const matchesSearch =
      !searchQuery ||
      u.normalized_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.user_role?.toLowerCase().includes(searchQuery.toLowerCase());

    // Apply role filter
    const matchesRole = roleFilter === "all" || u.user_role === roleFilter;

    return matchesSearch && matchesRole;
  });

  // ---------------------------------------------------------
  // COMPUTED VALUES — Derived stats from user list
  // ---------------------------------------------------------
  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
    students: users.filter((u) => u.user_role === "student").length,
    faculty: users.filter((u) => u.user_role === "faculty").length,
    admins: users.filter((u) => u.user_role === "admin").length,
    pending: users.filter((u) => u.user_role === "pending").length,
  };

  // ---------------------------------------------------------
  // RETURN — Expose state and methods to the component
  // ---------------------------------------------------------
  return {
    // Data
    users: filteredUsers,
    allUsers: users,
    pagination,
    stats,

    // State
    isLoading,
    error,
    successMessage,

    // Filters
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,

    // Actions
    loadUsers,
    changeUserRole,
    removeUser,
    restoreUser,
    refresh: () => loadUsers(pagination.page),
  };
};

export default useAdmin;
