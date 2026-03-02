// ============================================================
// LOGIN PAGE — Main Authentication View
// ============================================================
// The primary login interface with Google One-Tap integration.
// Displays the login card with state machine visualization,
// Google sign-in button, and error handling.
// Uses Tailwind CSS for modern, clean design.
// ============================================================

import React from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck, Lock, Globe, Fingerprint } from "lucide-react";
import GoogleSignIn from "./GoogleSignIn";
import LoginState from "./LoginState";
import LoginError from "./LoginError";
import useAuth from "../../hooks/useAuth";
import { LOGIN_STATES } from "../../utils/constants";
import LoadingSpinner from "../Common/LoadingSpinner";

/**
 * LoginPage component — the main authentication view.
 * Shows Google sign-in, state machine progress, and error states.
 * Redirects to dashboard if already authenticated.
 */
const LoginPage = () => {
  // Get auth state from context
  const { isAuthenticated, isLoading, loginState, error, isErrorState, reset } =
    useAuth();

  // Show loading spinner while checking initial auth status
  if (isLoading) {
    return <LoadingSpinner fullScreen message="Checking authentication..." />;
  }

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Login card container — 2026 glassmorphism design */}
      <div
        className="
          bg-white/70 backdrop-blur-xl
          rounded-3xl shadow-[0_20px_70px_rgba(0,0,0,0.08)]
          p-10 max-w-md w-full
          border border-gray-100/50
          relative overflow-hidden
        "
      >
        {/* Decorative gradient orb */}
        <div
          className="
            absolute -top-20 -right-20 w-40 h-40
            bg-gradient-to-br from-violet-200/30 to-transparent
            rounded-full blur-3xl pointer-events-none
          "
        />

        {/* Logo and title section */}
        <div className="text-center mb-10 relative">
          {/* Shield icon — with violet accent */}
          <div className="flex justify-center mb-5">
            <div
              className="
                p-4 rounded-2xl
                bg-gradient-to-br from-violet-500 to-violet-600
                shadow-[0_8px_30px_rgba(139,92,246,0.35)]
              "
            >
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
          </div>

          {/* Application title */}
          <h1 className="text-2xl font-bold text-gray-800 mb-2 tracking-tight">
            BITSathy Auth
          </h1>

          {/* Subtitle */}
          <p className="text-gray-400 text-sm">
            Zero-Trust Identity Verification
          </p>
        </div>

        {/* Login state machine indicator — shows progress through auth steps */}
        <LoginState state={loginState} error={error} />

        {/* Google Sign-In component — renders One-Tap and fallback button */}
        {!isErrorState && loginState === LOGIN_STATES.UNAUTHENTICATED && (
          <GoogleSignIn />
        )}

        {/* Error display with retry/back buttons */}
        {isErrorState && (
          <LoginError error={error} onRetry={reset} onBack={reset} />
        )}

        {/* Security features footer */}
        <div className="mt-10 pt-6 border-t border-gray-100/50 relative">
          <div className="grid grid-cols-3 gap-4 text-center">
            {/* Feature 1: End-to-end encryption */}
            <div className="flex flex-col items-center group">
              <div
                className="
                  p-2 rounded-xl mb-2
                  bg-gray-50 group-hover:bg-violet-50
                  transition-colors duration-200
                "
              >
                <Lock className="h-4 w-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-400 font-medium">
                Encrypted
              </span>
            </div>

            {/* Feature 2: Domain restricted */}
            <div className="flex flex-col items-center group">
              <div
                className="
                  p-2 rounded-xl mb-2
                  bg-gray-50 group-hover:bg-violet-50
                  transition-colors duration-200
                "
              >
                <Globe className="h-4 w-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-400 font-medium">
                Domain Verified
              </span>
            </div>

            {/* Feature 3: Zero-trust identity */}
            <div className="flex flex-col items-center group">
              <div
                className="
                  p-2 rounded-xl mb-2
                  bg-gray-50 group-hover:bg-violet-50
                  transition-colors duration-200
                "
              >
                <Fingerprint className="h-4 w-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
              </div>
              <span className="text-xs text-gray-400 font-medium">
                Zero-Trust
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cloudflare badge — bottom of page */}
      <div className="fixed bottom-4 right-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.5 8.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            <path d="M4.5 6h15a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 16.5v-9A1.5 1.5 0 014.5 6z" />
          </svg>
          Protected by Cloudflare
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
