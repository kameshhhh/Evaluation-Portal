// ============================================================
// useMultiJudgeStatus Hook
// ============================================================
// SRS §4.2: Multi-Judge Evaluation Status
//
// PURPOSE: Fetch and manage multi-judge submission status
//
// Features:
// - Get current evaluator's submission status
// - Get multi-judge counts (total/submitted)
// - Submit evaluation
// - Auto-refresh status
// - No score exposure - ONLY submission status
//
// USAGE:
// const {
//   status,
//   isLoading,
//   error,
//   submitEvaluation,
//   refreshStatus
// } = useMultiJudgeStatus(sessionId);
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getEvaluatorSessionStatus,
  submitEvaluation as submitEvaluationApi,
} from "../services/evaluatorStatusApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// useMultiJudgeStatus — Main hook for multi-judge status tracking
// ============================================================
/**
 * Hook for managing multi-judge evaluation status.
 *
 * @param {string} sessionId - UUID of the session
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default: true)
 * @param {number} options.refreshInterval - Auto-refresh interval in ms (default: 30000 - 30 seconds)
 * @returns {Object} Multi-judge status and actions
 */
const useMultiJudgeStatus = (sessionId, options = {}) => {
  const {
    autoFetch = true,
    refreshInterval = 30000, // 30 seconds default for status updates
  } = options;

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  // Multi-judge status from backend
  const [status, setStatus] = useState(null);

  // Loading state for initial fetch
  const [isLoading, setIsLoading] = useState(false);

  // Submitting state for evaluation submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Error message (null = no error)
  const [error, setError] = useState(null);

  // Last fetch timestamp for caching
  const [lastFetched, setLastFetched] = useState(null);

  // Ref to track mounted state
  const mountedRef = useRef(true);

  // ----------------------------------------------------------
  // FETCH STATUS — Load multi-judge status from backend
  // ----------------------------------------------------------
  const fetchStatus = useCallback(
    async (force = false) => {
      if (!sessionId) return;

      // Cache status for 10 seconds to prevent excessive API calls
      const CACHE_DURATION = 10000; // 10 seconds
      if (
        !force &&
        status &&
        lastFetched &&
        Date.now() - lastFetched < CACHE_DURATION
      ) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await getEvaluatorSessionStatus(sessionId);

        if (!mountedRef.current) return;

        setStatus(data);
        setLastFetched(Date.now());
      } catch (err) {
        if (!mountedRef.current) return;

        console.error("Failed to fetch multi-judge status:", err);

        if (err.response?.status === 403) {
          setError("You are not assigned to evaluate this session");
        } else if (err.response?.status === 404) {
          setError("Session not found");
        } else {
          setError("Failed to load evaluation status");
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [sessionId, status, lastFetched],
  );

  // ----------------------------------------------------------
  // SUBMIT EVALUATION — Mark evaluation as complete
  // ----------------------------------------------------------
  const submitEvaluation = useCallback(async () => {
    if (!sessionId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await submitEvaluationApi(sessionId);

      if (!mountedRef.current) return;

      // Update status with response
      if (response.status) {
        setStatus(response.status);
      }

      return response;
    } catch (err) {
      if (!mountedRef.current) return;

      console.error("Failed to submit evaluation:", err);

      if (err.response?.status === 400) {
        const message =
          err.response.data?.message || "Cannot submit: Incomplete evaluation";
        setError(message);
      } else if (err.response?.status === 403) {
        setError("You are not assigned to evaluate this session");
      } else {
        setError("Failed to submit evaluation");
      }

      throw err;
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [sessionId]);

  // ----------------------------------------------------------
  // REFRESH STATUS — Force fetch (bypass cache)
  // ----------------------------------------------------------
  const refreshStatus = useCallback(() => {
    fetchStatus(true);
  }, [fetchStatus]);

  // ----------------------------------------------------------
  // EFFECT: Auto-fetch on mount and when sessionId changes
  // ----------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch && sessionId) {
      fetchStatus();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [autoFetch, sessionId, fetchStatus]);

  // ----------------------------------------------------------
  // EFFECT: Set up auto-refresh interval
  // ----------------------------------------------------------
  useEffect(() => {
    if (refreshInterval <= 0 || !sessionId) return;

    const intervalId = setInterval(() => {
      fetchStatus(true); // Force refresh on interval
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval, sessionId, fetchStatus]);

  useDataChange(
    ["session", "evaluation", "comparative_session"],
    refreshStatus,
  );

  // ----------------------------------------------------------
  // COMPUTED VALUES
  // ----------------------------------------------------------

  // Whether current evaluator has submitted
  const isSubmitted =
    status?.my_status?.submission_status === "submitted" ||
    status?.my_status?.submission_status === "late";

  // Whether evaluator is assigned to this session
  const isAssigned = !!status;

  // Whether all evaluators have submitted
  const allSubmitted = status?.multi_judge_status?.all_submitted || false;

  // Completion percentage
  const completionPercentage = status?.completion_percentage || 0;

  // Counts
  const totalEvaluators = status?.multi_judge_status?.total_evaluators || 0;
  const submittedCount = status?.multi_judge_status?.submitted_count || 0;
  const pendingCount = status?.multi_judge_status?.pending_count || 0;

  // ----------------------------------------------------------
  // HELPER FUNCTIONS
  // ----------------------------------------------------------

  /**
   * Get color for progress bar based on completion
   */
  const getProgressColor = useCallback(() => {
    if (!status?.multi_judge_status) return "bg-blue-600";

    const percentage = status.completion_percentage || 0;

    if (percentage === 100) return "bg-green-600";
    if (percentage >= 75) return "bg-blue-600";
    if (percentage >= 50) return "bg-yellow-600";
    return "bg-gray-600";
  }, [status]);

  /**
   * Get badge variant based on submission status
   */
  const getStatusBadgeVariant = useCallback(() => {
    if (!status?.my_status) return "secondary";

    switch (status.my_status.submission_status) {
      case "submitted":
        return "success";
      case "late":
        return "warning";
      case "pending":
      default:
        return "secondary";
    }
  }, [status]);

  // ----------------------------------------------------------
  // RETURN
  // ----------------------------------------------------------
  return {
    // Data
    status,
    isLoading,
    isSubmitting,
    error,

    // Actions
    fetchStatus,
    submitEvaluation,
    refreshStatus,

    // Helper getters
    getProgressColor,
    getStatusBadgeVariant,

    // Computed booleans
    isSubmitted,
    isAssigned,
    allSubmitted,
    completionPercentage,

    // Counts
    totalEvaluators,
    submittedCount,
    pendingCount,
  };
};

export default useMultiJudgeStatus;
