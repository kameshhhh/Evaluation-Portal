// ============================================================
// LOGIN ERROR — Error Display Component for Authentication
// ============================================================
// Shows authentication errors with clear messages and
// actionable retry buttons. Handles different error types:
// - Domain restriction errors
// - Google sign-in errors
// - Network errors
// - Generic server errors
// ============================================================

import React from "react";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";

/**
 * LoginError component — displays authentication errors.
 *
 * @param {{ error: string, onRetry: Function, onBack: Function }} props
 */
const LoginError = ({ error, onRetry, onBack }) => {
  // Determine the error type for appropriate messaging
  const isDomainError = error?.toLowerCase().includes("domain");
  const isNetworkError =
    error?.toLowerCase().includes("network") ||
    error?.toLowerCase().includes("timeout");

  return (
    <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
      {/* Error icon and title */}
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800 mb-1">
            {isDomainError
              ? "Domain Not Authorized"
              : isNetworkError
                ? "Connection Error"
                : "Authentication Failed"}
          </h3>
          <p className="text-sm text-red-700">{error}</p>

          {/* Helpful hint based on error type */}
          {isDomainError && (
            <p className="text-xs text-red-600 mt-2">
              Only users with authorized email domains can sign in. Contact your
              administrator if you believe this is an error.
            </p>
          )}
          {isNetworkError && (
            <p className="text-xs text-red-600 mt-2">
              Please check your internet connection and try again.
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-4">
        {/* Retry button */}
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </button>

        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-red-700 text-sm rounded-lg border border-red-200 hover:bg-red-50 transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go Back
        </button>
      </div>
    </div>
  );
};

export default LoginError;
