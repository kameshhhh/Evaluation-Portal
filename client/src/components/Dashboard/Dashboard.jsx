// ============================================================
// DASHBOARD — Main Protected View After Authentication
// ============================================================
// The primary view shown to authenticated users.
// Displays user profile, session info, and quick actions.
// This page is ONLY accessible after successful authentication.
// ============================================================

import React from "react";
import { ShieldCheck, LogOut, Users, Activity } from "lucide-react";
import UserProfile from "./UserProfile";
import useAuth from "../../hooks/useAuth";

/**
 * Dashboard component — the main authenticated user interface.
 * Shows user profile and session information.
 */
const Dashboard = () => {
  // Get auth state and actions from context
  const { user, handleLogout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Main content area */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-gray-500 mt-1">
            Your identity has been verified through zero-trust authentication.
          </p>
        </div>

        {/* Dashboard grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column — User Profile */}
          <div className="md:col-span-1">
            <UserProfile />
          </div>

          {/* Right column — Quick Actions & Session Info */}
          <div className="space-y-6">
            {/* Session Status Card */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Session Status
              </h3>
              <div className="space-y-3">
                {/* Active session indicator */}
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-gray-700">Session Active</span>
                </div>
                {/* Security level */}
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-700">
                    Zero-Trust Verified
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Quick Actions
              </h3>
              <div className="space-y-3">
                {/* Admin panel link — only for admin role */}
                {user?.role === "admin" && (
                  <button className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors text-sm font-medium">
                    <Users className="h-4 w-4" />
                    User Management
                  </button>
                )}

                {/* Logout button */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors text-sm font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
