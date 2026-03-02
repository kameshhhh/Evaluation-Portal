// ============================================================
// LOADING SPINNER — Visual Loading State Indicator
// ============================================================
// Displays an animated spinner with optional message text.
// Used during authentication flow, data loading, and transitions.
// Styled with Tailwind CSS for consistent design language.
// ============================================================

import React from "react";
import { Loader2 } from "lucide-react";

/**
 * LoadingSpinner component for displaying loading states.
 * Shows an animated spinner icon with optional descriptive text.
 *
 * @param {{ message?: string, size?: string, fullScreen?: boolean }} props
 */
const LoadingSpinner = ({
  message = "Loading...",
  size = "md",
  fullScreen = false,
}) => {
  // Map size prop to Tailwind size classes for the spinner icon
  const sizeClasses = {
    sm: "h-5 w-5",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  // Map size prop to text size classes for the message
  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  // Container classes — full screen or inline
  const containerClasses = fullScreen
    ? "min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100"
    : "flex items-center justify-center p-4";

  return (
    <div className={containerClasses}>
      <div className="flex flex-col items-center space-y-3">
        {/* Animated spinner icon — Lucide's Loader2 with spin animation */}
        {/* The animate-spin class applies a continuous 360° rotation */}
        <Loader2
          className={`${sizeClasses[size] || sizeClasses.md} text-blue-600 animate-spin`}
        />

        {/* Optional message text below the spinner */}
        {message && (
          <p
            className={`${textSizeClasses[size] || textSizeClasses.md} text-gray-500 font-medium`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;
