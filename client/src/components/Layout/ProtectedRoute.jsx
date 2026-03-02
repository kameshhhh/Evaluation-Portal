// ============================================================
// PROTECTED ROUTE — Authentication Route Guard
// ============================================================
// Wraps routes that require authentication.
// If the user is not authenticated, redirects to the login page.
// If the user is authenticated, renders the child components.
// This is the client-side enforcement of the zero-trust model.
// ============================================================

import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import LoadingSpinner from "../Common/LoadingSpinner";

/**
 * ProtectedRoute component — guards routes requiring authentication.
 * Redirects to login if user is not authenticated.
 * Passes the current location to login so it can redirect back after auth.
 *
 * @param {{ children: React.ReactNode, requiredRole?: string }} props
 */
const ProtectedRoute = ({ children, requiredRole }) => {
  // Get auth state from context
  const { isAuthenticated, isLoading, user } = useAuth();

  // Get current location for redirect-back after login
  const location = useLocation();

  // Show loading spinner while checking auth status
  if (isLoading) {
    return <LoadingSpinner fullScreen message="Verifying identity..." />;
  }

  // If not authenticated, redirect to login
  // Pass the current location in state so login can redirect back
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If a specific role is required, check the user's role
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-500 mb-4">
            You do not have the required permissions to access this page.
            Required role: <strong>{requiredRole}</strong>
          </p>
          <Navigate to="/dashboard" replace />
        </div>
      </div>
    );
  }

  // Authenticated (and authorized if role required) — render children
  return children;
};

export default ProtectedRoute;
