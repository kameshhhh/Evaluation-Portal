// ============================================================
// DEFAULT DASHBOARD — Profile Completion + Quick Access
// ============================================================
// Shown when user has no PEMM person profile linked yet.
// Still provides useful navigation to projects and features.
// ============================================================

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlus,
  AlertCircle,
  FolderOpen,
  Plus,
  Code2,
  BarChart2,
  RefreshCw,
} from "lucide-react";
import useAuth from "../../hooks/useAuth";
import { getInitials } from "../../utils/helpers";

const DefaultDashboard = ({ data, onRefresh }) => {
  const { user, sections, notifications } = data;
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const profilePicture = authUser?.picture || user?.picture || null;
  const displayName =
    user?.name || authUser?.name || user?.email?.split("@")[0] || "User";
  const profileCompletion = sections?.profileCompletion;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-8 text-center mb-6">
          {/* Avatar */}
          {profilePicture ? (
            <img
              src={profilePicture}
              alt={displayName}
              className="h-20 w-20 rounded-full border-4 border-blue-100 shadow-md mx-auto mb-4"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-md border-4 border-blue-50">
              <span className="text-2xl font-bold text-blue-600">
                {getInitials(displayName)}
              </span>
            </div>
          )}

          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Welcome, {displayName}!
          </h1>
          <p className="text-gray-500 text-sm mb-4">
            {user?.email || ""}
            {user?.role ? ` • ${user.role}` : ""}
          </p>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors mb-6"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>

          {/* Profile linking message */}
          {profileCompletion?.message ? (
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-start gap-2">
                <UserPlus className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-700">
                  {profileCompletion.message}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Profile Not Linked
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Your account isn&apos;t linked to a person profile yet.
                    Contact your department admin or continue using the features
                    below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile form fields from backend */}
          {profileCompletion?.fields && (
            <div className="space-y-4 text-left mb-6">
              {profileCompletion.fields.map((field, index) => (
                <div key={field.name || index}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  {field.type === "select" ? (
                    <select
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select {field.label}
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate("/projects/new")}
              className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors text-left"
            >
              <Plus className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Create Project
                </p>
                <p className="text-xs text-blue-500">Start a new project</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/projects")}
              className="flex items-center gap-3 p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors text-left"
            >
              <FolderOpen className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  Browse Projects
                </p>
                <p className="text-xs text-green-500">View all projects</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/sessions/create")}
              className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors text-left"
            >
              <Code2 className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-900">
                  Evaluations
                </p>
                <p className="text-xs text-purple-500">Create a session</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/my-results")}
              className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors text-left"
            >
              <BarChart2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">My Results</p>
                <p className="text-xs text-amber-500">View scores</p>
              </div>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {notifications && notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((notif, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-white rounded-xl border border-gray-200/50 p-3 text-sm"
              >
                <AlertCircle
                  className={`h-4 w-4 flex-shrink-0 ${
                    notif.type === "info"
                      ? "text-blue-500"
                      : notif.type === "warning"
                        ? "text-amber-500"
                        : "text-gray-400"
                  }`}
                />
                <span className="text-gray-600">
                  {typeof notif === "string"
                    ? notif
                    : notif.message || JSON.stringify(notif)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default DefaultDashboard;
