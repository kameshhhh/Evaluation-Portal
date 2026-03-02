// ============================================================
// USER PROFILE — Authenticated User Display Component
// ============================================================
// Displays the authenticated user's profile information.
// Shows avatar (from Google), name, email, role badge, and
// last login timestamp. All data comes from the auth context.
// ============================================================

import React from "react";
import { Shield, Mail, Clock, BadgeCheck } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import {
  getRoleBadgeClasses,
  formatDate,
  getInitials,
} from "../../utils/helpers";

/**
 * UserProfile component — shows the current user's identity info.
 */
const UserProfile = () => {
  // Get user data from the auth context
  const { user } = useAuth();

  // Guard — don't render if no user data
  if (!user) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
      {/* Profile header with gradient background */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8">
        <div className="flex items-center gap-4">
          {/* User avatar — Google profile picture or initials fallback */}
          {user.picture ? (
            <img
              src={user.picture}
              alt={user.name || "User avatar"}
              className="h-16 w-16 rounded-full border-2 border-white/30 shadow-md"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold border-2 border-white/30">
              {getInitials(user.name || user.email)}
            </div>
          )}

          {/* User name and email */}
          <div>
            <h2 className="text-xl font-bold text-white">
              {user.name || "Unknown User"}
            </h2>
            <p className="text-blue-100 text-sm flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </p>
          </div>
        </div>
      </div>

      {/* Profile details section */}
      <div className="p-6 space-y-4">
        {/* Role badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Role
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeClasses(
              user.role,
            )}`}
          >
            {user.role?.toUpperCase() || "PENDING"}
          </span>
        </div>

        {/* Google ID (sub) — unique identity */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 flex items-center gap-1.5">
            <BadgeCheck className="h-4 w-4" />
            Identity ID
          </span>
          <span className="text-sm text-gray-700 font-mono">
            {user.userId?.slice(0, 8) || "—"}...
          </span>
        </div>

        {/* Last login timestamp */}
        {user.lastLoginAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Last Login
            </span>
            <span className="text-sm text-gray-700">
              {formatDate(user.lastLoginAt)}
            </span>
          </div>
        )}

        {/* Domain verification indicator */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <BadgeCheck className="h-4 w-4" />
            <span>Domain verified — Identity confirmed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
