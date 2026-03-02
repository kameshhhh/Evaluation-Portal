// ============================================================
// USER MANAGEMENT — Full CRUD Interface for Admin Users
// ============================================================
// Complete user management panel with:
//   1. Search bar with real-time filtering
//   2. Role filter tabs (All / Students / Faculty / Admin / Pending)
//   3. User table with sortable columns
//   4. Inline actions: Edit Role, Deactivate, Reactivate
//   5. Pagination controls
//   6. Stats summary cards
//
// This component fetches its own data via the useAdmin hook,
// independent of the personalization flow.
//
// SRS 4.3.2: Admin user management capabilities
// ============================================================

// Import React for JSX rendering and state management
import React, { useState } from "react";

// Import the admin hook for user data and actions
import useAdmin from "../../../hooks/useAdmin";

// Import Lucide icons for visual elements
import {
  Search,
  Users,
  UserCheck,
  UserX,
  Shield,
  GraduationCap,
  BookOpen,
  Clock,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Power,
  PowerOff,
  X,
  Check,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";

// ============================================================
// ROLE CONFIGURATION — Display labels, colors, and icons
// ============================================================
const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    color: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-500",
    icon: Shield,
  },
  faculty: {
    label: "Faculty",
    color: "text-purple-700 bg-purple-50 border-purple-200",
    dot: "bg-purple-500",
    icon: BookOpen,
  },
  student: {
    label: "Student",
    color: "text-blue-700 bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
    icon: GraduationCap,
  },
  pending: {
    label: "Pending",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    icon: Clock,
  },
};

// Role filter tabs
const ROLE_FILTERS = [
  { id: "all", label: "All Users", icon: Users },
  { id: "student", label: "Students", icon: GraduationCap },
  { id: "faculty", label: "Faculty", icon: BookOpen },
  { id: "admin", label: "Admins", icon: Shield },
  { id: "pending", label: "Pending", icon: Clock },
];

// Available roles for the edit dropdown
const AVAILABLE_ROLES = ["student", "faculty", "admin", "pending"];

// ============================================================
// UserManagement Component
// ============================================================
/**
 * Full user management panel for administrators.
 * Fetches user data independently via useAdmin hook.
 */
const UserManagement = () => {
  // Initialize the admin hook — manages all user data and actions
  const {
    users,
    allUsers,
    pagination,
    stats,
    isLoading,
    error,
    successMessage,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    loadUsers,
    changeUserRole,
    removeUser,
    restoreUser,
    refresh,
  } = useAdmin();

  // Local state for the role edit modal
  const [editingUser, setEditingUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");

  // Local state for confirmation dialogs
  const [confirmAction, setConfirmAction] = useState(null);

  // ---------------------------------------------------------
  // HANDLE ROLE CHANGE — Open edit modal
  // ---------------------------------------------------------
  const handleEditRole = (user) => {
    setEditingUser(user);
    setSelectedRole(user.user_role);
  };

  // Save role change
  const handleSaveRole = async () => {
    if (!editingUser || selectedRole === editingUser.user_role) {
      setEditingUser(null);
      return;
    }
    const success = await changeUserRole(
      editingUser.internal_user_id,
      selectedRole,
    );
    if (success) {
      setEditingUser(null);
    }
  };

  // ---------------------------------------------------------
  // HANDLE DEACTIVATE/REACTIVATE — Confirm dialog
  // ---------------------------------------------------------
  const handleToggleActive = (user) => {
    setConfirmAction({
      userId: user.internal_user_id,
      email: user.normalized_email,
      action: user.is_active ? "deactivate" : "reactivate",
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.action === "deactivate") {
      await removeUser(confirmAction.userId);
    } else {
      await restoreUser(confirmAction.userId);
    }
    setConfirmAction(null);
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
          <button
            onClick={refresh}
            className="ml-auto text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* STATS CARDS — Quick summary of user distribution */}
      {/* ====================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {
            label: "Total",
            value: stats.total,
            icon: Users,
            color: "text-gray-600",
          },
          {
            label: "Active",
            value: stats.active,
            icon: UserCheck,
            color: "text-green-600",
          },
          {
            label: "Inactive",
            value: stats.inactive,
            icon: UserX,
            color: "text-red-600",
          },
          {
            label: "Students",
            value: stats.students,
            icon: GraduationCap,
            color: "text-blue-600",
          },
          {
            label: "Faculty",
            value: stats.faculty,
            icon: BookOpen,
            color: "text-purple-600",
          },
          {
            label: "Admins",
            value: stats.admins,
            icon: Shield,
            color: "text-red-600",
          },
          {
            label: "Pending",
            value: stats.pending,
            icon: Clock,
            color: "text-amber-600",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-3"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-xs text-gray-500 font-medium">
                {stat.label}
              </span>
            </div>
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ====================================================== */}
      {/* SEARCH + FILTER BAR */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
        {/* Search input */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl 
                         text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 
                         focus:border-red-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Role filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {ROLE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setRoleFilter(filter.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                          transition-colors ${
                            roleFilter === filter.id
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent"
                          }`}
            >
              <filter.icon className="h-3.5 w-3.5" />
              {filter.label}
              {filter.id !== "all" && (
                <span className="ml-0.5 text-[10px] opacity-70">
                  (
                  {stats[filter.id === "admin" ? "admins" : `${filter.id}s`] ||
                    stats[filter.id] ||
                    0}
                  )
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ====================================================== */}
      {/* USER TABLE */}
      {/* ====================================================== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
        {isLoading ? (
          // Loading skeleton
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-red-500 animate-spin" />
            <span className="ml-3 text-gray-500">Loading users...</span>
          </div>
        ) : users.length === 0 ? (
          // Empty state
          <div className="text-center py-16 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No users found</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Try a different search query"
                : "No users in the system yet"}
            </p>
          </div>
        ) : (
          // User table
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Table header */}
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Email
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Role
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    Updated
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              {/* Table body */}
              <tbody>
                {users.map((user) => {
                  // Get role display config
                  const roleConfig =
                    ROLE_CONFIG[user.user_role] || ROLE_CONFIG.pending;
                  const RoleIcon = roleConfig.icon;

                  return (
                    <tr
                      key={user.internal_user_id}
                      className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${
                        !user.is_active ? "opacity-60" : ""
                      }`}
                    >
                      {/* Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                              user.is_active
                                ? "bg-blue-100 text-blue-600"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {user.normalized_email?.charAt(0).toUpperCase() ||
                              "?"}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">
                              {user.normalized_email}
                            </p>
                            <p className="text-xs text-gray-400">
                              ID: {user.internal_user_id?.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${roleConfig.color}`}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {roleConfig.label}
                        </span>
                      </td>

                      {/* Active status */}
                      <td className="py-3 px-4 text-center">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Created date */}
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "—"}
                      </td>

                      {/* Updated date */}
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {user.updated_at
                          ? new Date(user.updated_at).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "—"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {/* Edit Role button */}
                          <button
                            onClick={() => handleEditRole(user)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 
                                       rounded-lg transition-colors"
                            title="Edit role"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>

                          {/* Deactivate / Reactivate button */}
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              user.is_active
                                ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                                : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                            }`}
                            title={
                              user.is_active
                                ? "Deactivate user"
                                : "Reactivate user"
                            }
                          >
                            {user.is_active ? (
                              <PowerOff className="h-4 w-4" />
                            ) : (
                              <Power className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ====================================================== */}
        {/* PAGINATION */}
        {/* ====================================================== */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} users
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => loadUsers(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white 
                           rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => loadUsers(pageNum)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      pagination.page === pageNum
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "text-gray-500 hover:text-gray-700 hover:bg-white"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => loadUsers(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white 
                           rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================== */}
      {/* EDIT ROLE MODAL */}
      {/* ====================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit User Role
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* User info */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-gray-900">
                {editingUser.normalized_email}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Current role: {editingUser.user_role}
              </p>
            </div>

            {/* Role selection */}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Role
            </label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {AVAILABLE_ROLES.map((role) => {
                const config = ROLE_CONFIG[role] || ROLE_CONFIG.pending;
                const Icon = config.icon;
                return (
                  <button
                    key={role}
                    onClick={() => setSelectedRole(role)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium 
                                border-2 transition-all ${
                                  selectedRole === role
                                    ? "border-red-400 bg-red-50 text-red-700 shadow-sm"
                                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                  >
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 
                           rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={selectedRole === editingUser.user_role}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl 
                           hover:bg-red-700 transition-colors text-sm font-medium
                           disabled:opacity-40 disabled:cursor-not-allowed
                           flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" />
                Save Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* CONFIRM ACTION MODAL */}
      {/* ====================================================== */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4">
            {/* Modal header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`p-2 rounded-xl ${
                  confirmAction.action === "deactivate"
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-600"
                }`}
              >
                {confirmAction.action === "deactivate" ? (
                  <PowerOff className="h-5 w-5" />
                ) : (
                  <Power className="h-5 w-5" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize">
                  {confirmAction.action} User
                </h3>
                <p className="text-xs text-gray-500">
                  This action can be reversed
                </p>
              </div>
            </div>

            {/* Confirmation message */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to <strong>{confirmAction.action}</strong>{" "}
                the user <strong>{confirmAction.email}</strong>?
              </p>
              {confirmAction.action === "deactivate" && (
                <p className="text-xs text-red-500 mt-2">
                  All active sessions will be revoked. The user will be logged
                  out immediately.
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 
                           rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium
                           text-white flex items-center justify-center gap-2 ${
                             confirmAction.action === "deactivate"
                               ? "bg-red-600 hover:bg-red-700"
                               : "bg-green-600 hover:bg-green-700"
                           }`}
              >
                {confirmAction.action === "deactivate" ? (
                  <>
                    <PowerOff className="h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4" />
                    Reactivate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Export the UserManagement component
// ============================================================
export default UserManagement;
