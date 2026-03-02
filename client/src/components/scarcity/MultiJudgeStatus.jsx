// ============================================================
// MULTI-JUDGE STATUS COMPONENT
// ============================================================
// SRS §4.2: Multi-Judge Evaluation Status Indicator
//
// Displays in evaluation header:
// 1. "You are evaluator X of Y" - Shows position
// 2. Progress bar of total submissions
// 3. "X of Y evaluators have submitted" (after current user submits)
// 4. Status badge (Pending/Submitted/Late)
//
// CRITICAL: NEVER shows other evaluators' scores
// CRITICAL: NEVER shows which specific evaluators have/haven't submitted
// ONLY shows aggregated counts
// ============================================================

import React from "react";
import PropTypes from "prop-types";
import {
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import useMultiJudgeStatus from "../../hooks/useMultiJudgeStatus";

// ============================================================
// MultiJudgeStatus — Main status panel component
// ============================================================
/**
 * @param {Object} props
 * @param {string} props.sessionId - UUID of session
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.compact - Compact mode for sidebar
 * @param {Function} props.onSubmit - Optional callback after submission
 */
const MultiJudgeStatus = ({
  sessionId,
  className = "",
  compact = false,
  onSubmit,
}) => {
  const {
    status,
    isLoading,
    isSubmitting,
    error,
    submitEvaluation,
    refreshStatus,
    isSubmitted,
    allSubmitted,
    completionPercentage,
    totalEvaluators,
    submittedCount,
    pendingCount,
    getProgressColor,
    getStatusBadgeVariant,
  } = useMultiJudgeStatus(sessionId, {
    refreshInterval: 30000, // Refresh every 30 seconds
    autoFetch: true,
  });

  // Don't render if single-judge session
  if (status && totalEvaluators <= 1) {
    return null;
  }

  // ============================================================
  // HANDLE SUBMIT
  // ============================================================
  const handleSubmit = async () => {
    if (
      window.confirm(
        "Are you sure you want to submit your evaluation? You cannot change it after submission.",
      )
    ) {
      try {
        await submitEvaluation();
        if (onSubmit) onSubmit();
      } catch (err) {
        // Error is handled in hook
      }
    }
  };

  // ============================================================
  // STATUS BADGE CLASSES
  // ============================================================
  const getStatusBadgeClasses = () => {
    const variant = getStatusBadgeVariant();

    switch (variant) {
      case "success":
        return "bg-green-100 text-green-800 border-green-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "secondary":
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // ============================================================
  // STATUS TEXT
  // ============================================================
  const getStatusText = () => {
    if (!status?.my_status) return "Not Assigned";

    switch (status.my_status.submission_status) {
      case "submitted":
        return "Submitted";
      case "late":
        return "Submitted (Late)";
      case "pending":
      default:
        return "Pending";
    }
  };

  // ============================================================
  // SUBMISSION TIME TEXT
  // ============================================================
  const getSubmissionTimeText = () => {
    if (!status?.my_status?.submitted_at) return null;

    const date = new Date(status.my_status.submitted_at);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  };

  // ============================================================
  // LOADING STATE
  // ============================================================
  if (isLoading && !status) {
    return (
      <div
        className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}
      >
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-2 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================
  if (error) {
    return (
      <div
        className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}
      >
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
        <button
          onClick={() => refreshStatus()}
          className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ============================================================
  // NOT ASSIGNED STATE
  // ============================================================
  if (!status) {
    return null;
  }

  // ============================================================
  // COMPACT MODE — For sidebar/dashboard cards
  // ============================================================
  if (compact) {
    return (
      <div className={`flex items-center space-x-2 text-sm ${className}`}>
        <div className="flex items-center text-gray-600">
          <Users className="h-4 w-4 mr-1" />
          <span>
            {submittedCount}/{totalEvaluators}
          </span>
        </div>
        <span className="text-gray-300">|</span>
        <div
          className={`px-2 py-0.5 rounded-full text-xs ${getStatusBadgeClasses()}`}
        >
          {getStatusText()}
        </div>
      </div>
    );
  }

  // ============================================================
  // FULL MODE — For evaluation page header
  // ============================================================
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-sm font-medium text-gray-700">
              Multi-Judge Evaluation
            </h3>
          </div>
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadgeClasses()}`}
          >
            {getStatusText()}
          </div>
        </div>

        {/* Your Position */}
        <div className="mb-3">
          <p className="text-sm text-gray-600">
            You are evaluator{" "}
            <span className="font-bold text-gray-900">
              {submittedCount > 0 && isSubmitted ? "✓" : ""} 1
            </span>{" "}
            of{" "}
            <span className="font-bold text-gray-900">{totalEvaluators}</span>
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">Submission Progress</span>
            <span className="font-medium text-gray-700">
              {submittedCount}/{totalEvaluators} completed
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full ${getProgressColor()} transition-all duration-500`}
              style={{ width: `${completionPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Status Messages */}
        {isSubmitted && (
          <div className="mt-3 text-xs text-gray-600">
            {allSubmitted ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-4 w-4 mr-1" />
                <span>All evaluators have submitted</span>
              </div>
            ) : (
              <div className="flex items-center text-gray-600">
                <Clock className="h-4 w-4 mr-1" />
                <span>
                  Waiting for {pendingCount} other evaluator
                  {pendingCount !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {status.my_status.submitted_at && (
              <p className="mt-1 text-gray-500">
                Submitted: {getSubmissionTimeText()}
              </p>
            )}
          </div>
        )}

        {/* Submit Button */}
        {!isSubmitted && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="mt-4 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit Evaluation"}
          </button>
        )}
      </div>

      {/* Admin Link - Only visible to admins */}
      {status.session_status === "active" && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 rounded-b-lg">
          <a
            href={`/admin/sessions/${sessionId}/evaluators`}
            className="flex items-center justify-between text-xs text-gray-600 hover:text-gray-900"
          >
            <span>View all evaluators</span>
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
};

MultiJudgeStatus.propTypes = {
  sessionId: PropTypes.string.isRequired,
  className: PropTypes.string,
  compact: PropTypes.bool,
  onSubmit: PropTypes.func,
};

export default MultiJudgeStatus;
