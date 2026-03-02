// ============================================================
// ERROR BOUNDARY — React Error Catching Component
// ============================================================
// Catches JavaScript errors anywhere in the child component tree.
// Displays a fallback UI instead of crashing the entire application.
// This is the last line of defense against unexpected runtime errors.
// ============================================================

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * ErrorBoundary class component.
 * Must be a class component because React's error boundary API
 * uses componentDidCatch and getDerivedStateFromError lifecycle methods.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // Track whether an error has occurred
    this.state = { hasError: false, error: null };
  }

  /**
   * Static lifecycle method called when an error is thrown by a child.
   * Updates state to trigger the fallback UI on the next render.
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method for error logging.
   * Called after an error has been thrown by a descendant component.
   * Use this for error reporting to monitoring services.
   */
  componentDidCatch(error, errorInfo) {
    // Log the error for debugging — in production, send to error tracking
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  /**
   * Reset the error state and retry rendering children.
   * Called when the user clicks the "Try Again" button.
   */
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    // If an error occurred, render the fallback UI
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-200 text-center">
            {/* Error icon — AlertTriangle from Lucide */}
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>

            {/* Error title */}
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Something went wrong
            </h2>

            {/* Error description */}
            <p className="text-gray-500 mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>

            {/* Error details — only in development */}
            {this.state.error && (
              <div className="bg-red-50 rounded-lg p-3 mb-6 text-left">
                <p className="text-sm text-red-700 font-mono break-all">
                  {typeof this.state.error?.message === "string"
                    ? this.state.error.message
                    : JSON.stringify(
                        this.state.error?.message || this.state.error,
                      )}
                </p>
              </div>
            )}

            {/* Retry button */}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // No error — render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;
