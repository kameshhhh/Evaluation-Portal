// ============================================================
// USE SCARCITY HOOK — React State Management for Evaluations
// ============================================================
// Custom hook that manages the full scarcity evaluation lifecycle:
//   1. Load session data (targets, pool, own allocations)
//   2. Track allocation edits in local state
//   3. Compute real-time pool usage as inputs change
//   4. Submit allocations with optimistic UI updates
//
// SRS §4.1.2: Also fetches previous month scores for growth-aware
//             evaluation context.
//
// FOLLOWS THE SAME PATTERN AS usePersonalization.js:
//   - Auto-fetches on mount when dependencies are ready
//   - Cancellation flag to prevent updates after unmount
//   - Error state management with user-friendly messages
//   - Refresh function for manual data reload
// ============================================================

// Import React hooks for state, effects, and memoization
import { useState, useEffect, useCallback, useMemo } from "react";

// Import API functions for scarcity endpoints
import {
  getScarcitySession,
  submitAllocations as submitAllocationsApi,
  getMyScarcitySessions,
  getSessionProjectsWithHistory,
  getSessionHistorySummary,
} from "../services/scarcityApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// useScarcity — Main scarcity evaluation hook
// ============================================================
/**
 * Hook for managing a scarcity evaluation session.
 *
 * @param {string} sessionId - UUID of the evaluation session
 * @param {string} evaluatorId - UUID of the current evaluator
 * @returns {Object} Scarcity state and actions
 *   - session: Full session data from backend
 *   - allocations: Current allocation map { targetId → points }
 *   - poolInfo: { poolSize, allocatedTotal, remainingPool, utilization }
 *   - isLoading: Whether data is being fetched
 *   - error: Error message or null
 *   - isSaving: Whether allocations are being submitted
 *   - isDirty: Whether allocations have been modified since last save
 *   - setAllocation(targetId, points): Update a single allocation
 *   - submitAllocations(): Save all allocations to backend
 *   - refresh(): Reload session data
 */
const useScarcity = (sessionId, evaluatorId) => {
  // ----------------------------------------------------------
  // STATE — Session data, allocations, loading, errors
  // ----------------------------------------------------------

  // Session data from the backend (null until loaded)
  const [session, setSession] = useState(null);

  // Local allocation state: { targetId → points }
  // This is the mutable working copy that the UI edits
  const [allocations, setAllocations] = useState({});

  // The last-saved allocations (for dirty checking)
  const [savedAllocations, setSavedAllocations] = useState({});

  // Loading state for initial data fetch
  const [isLoading, setIsLoading] = useState(false);

  // Saving state for allocation submission
  const [isSaving, setIsSaving] = useState(false);

  // Error message string (null = no error)
  const [error, setError] = useState(null);

  // Trigger counter to force re-fetches (like usePersonalization)
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // SRS §4.1.5 — Evaluator-provided zero-score reasons
  // Map: targetId → { classification, contextNote }
  const [zeroScoreReasons, setZeroScoreReasons] = useState({});

  // Whether the zero-score reason dialog should be shown before submit
  const [showZeroReasonDialog, setShowZeroReasonDialog] = useState(false);

  // SRS §4.1.2 — Historical data for previous month scores
  // Contains previous scores map and session summary
  const [historicalData, setHistoricalData] = useState({
    hasPrevious: false,
    scores: {},
    summary: null,
  });

  // ----------------------------------------------------------
  // FETCH SESSION — Load session data on mount or trigger change
  // ----------------------------------------------------------
  useEffect(() => {
    // Don't fetch without required params
    if (!sessionId || !evaluatorId) return;

    // Cancellation flag to prevent state updates after unmount
    let isCancelled = false;

    /**
     * Fetch session data from the backend.
     * Populates session, allocations, and savedAllocations state.
     * Also fetches historical data for SRS §4.1.2 growth-aware evaluation.
     */
    const fetchSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch session with evaluator-scoped data
        // Pass evaluatorId for SRS 4.2.1 isolation (backend requires it)
        const response = await getScarcitySession(sessionId, evaluatorId);

        // Don't update state if component has unmounted
        if (isCancelled) return;

        if (response.success && response.data) {
          const sessionData = response.data;

          // SRS §4.1.2: Fetch historical scores for growth-aware context
          // Define scoresMap at this scope so it's accessible for target merge
          let scoresMap = {};
          let historySummary = null;

          try {
            // Step 1: Always get history summary (for banner display)
            const historyResponse = await getSessionHistorySummary(sessionId);
            if (!isCancelled && historyResponse.success) {
              // Store the summary for banner display (even if no previous data)
              historySummary = historyResponse;

              // Step 2: Only fetch per-target scores if there IS previous data
              if (historyResponse.hasPrevious) {
                const projectsWithHistory =
                  await getSessionProjectsWithHistory(sessionId);

                if (
                  !isCancelled &&
                  projectsWithHistory.success &&
                  projectsWithHistory.projects
                ) {
                  // Build a scores map from projects' members
                  projectsWithHistory.projects.forEach((project) => {
                    if (project.members) {
                      project.members.forEach((member) => {
                        if (member.has_history) {
                          scoresMap[member.id] = {
                            previous_score: member.previous_score,
                            previous_total: member.previous_total,
                            previous_percentage: member.previous_percentage,
                            previous_evaluator_count:
                              member.previous_evaluator_count,
                            previous_session_month:
                              member.previous_session_month,
                          };
                        }
                      });
                    }
                  });
                }
              }

              // Always set historical data (summary is always shown in banner)
              setHistoricalData({
                hasPrevious: historyResponse.hasPrevious,
                previousSessionMonth:
                  historyResponse.previousPeriodMonth ||
                  historyResponse.previousSessionMonth,
                scores: scoresMap,
                summary: historySummary,
              });
            }
          } catch (histErr) {
            // Historical data fetch failure is non-fatal — log but continue
            console.warn("Failed to fetch historical data:", histErr.message);
          }

          // Merge historical data into targets for display
          // SRS §4.1.2: Targets should show previous month scores
          // NOTE: Use scoresMap directly, not historicalData state (async timing issue)
          if (sessionData.targets) {
            sessionData.targets = sessionData.targets.map((target) => {
              const history = scoresMap?.[target.target_id];
              if (history) {
                return {
                  ...target,
                  has_history: true,
                  previous_score: history.previous_score,
                  previous_total: history.previous_total,
                  previous_percentage: history.previous_percentage,
                  previous_evaluator_count: history.previous_evaluator_count,
                  previous_session_month: history.previous_session_month,
                };
              }
              return { ...target, has_history: false };
            });
          }

          setSession(sessionData);

          // Build allocation map from existing allocations
          // Each allocation: { targetId, points, headId }
          const allocationMap = {};
          if (sessionData.myAllocations) {
            sessionData.myAllocations.forEach((alloc) => {
              allocationMap[alloc.targetId] = alloc.points;
            });
          }

          // Initialize targets with zero if no allocation exists
          if (sessionData.targets) {
            sessionData.targets.forEach((target) => {
              if (allocationMap[target.target_id] === undefined) {
                allocationMap[target.target_id] = 0;
              }
            });
          }

          // Set both current and saved allocations
          setAllocations(allocationMap);
          setSavedAllocations({ ...allocationMap });
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || "Failed to load evaluation session");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSession();

    // Cleanup: set cancellation flag on unmount
    return () => {
      isCancelled = true;
    };
  }, [sessionId, evaluatorId, fetchTrigger]);

  // ----------------------------------------------------------
  // COMPUTED — Pool info derived from current allocations
  // ----------------------------------------------------------
  const poolInfo = useMemo(() => {
    // Can't compute without session data
    if (!session) {
      return {
        poolSize: 0,
        allocatedTotal: 0,
        remainingPool: 0,
        utilization: 0,
      };
    }

    // Sum all current allocation points
    const allocatedTotal = Object.values(allocations).reduce(
      (sum, points) => sum + (Number(points) || 0),
      0,
    );

    const poolSize = session.poolSize || 0;
    const remainingPool = poolSize - allocatedTotal;
    const utilization = poolSize > 0 ? (allocatedTotal / poolSize) * 100 : 0;

    return {
      poolSize,
      allocatedTotal,
      remainingPool,
      utilization: Math.round(utilization * 10) / 10, // 1 decimal place
      isExceeded: allocatedTotal > poolSize,
    };
  }, [session, allocations]);

  // ----------------------------------------------------------
  // COMPUTED — Dirty check (has the user made changes?)
  // ----------------------------------------------------------
  const isDirty = useMemo(() => {
    // Compare current allocations with last-saved state
    const currentKeys = Object.keys(allocations);
    const savedKeys = Object.keys(savedAllocations);

    if (currentKeys.length !== savedKeys.length) return true;

    return currentKeys.some(
      (key) => allocations[key] !== savedAllocations[key],
    );
  }, [allocations, savedAllocations]);

  // ----------------------------------------------------------
  // COMPUTED — Zero allocations needing reasons (SRS §4.1.5)
  // ----------------------------------------------------------
  const pendingZeroAllocations = useMemo(() => {
    if (!session || !session.targets) return [];

    return Object.entries(allocations)
      .filter(([, points]) => Number(points) === 0)
      .map(([targetId]) => {
        const target = session.targets.find((t) => t.target_id === targetId);
        return {
          targetId,
          targetName: target ? target.display_name : "Unknown",
        };
      });
  }, [allocations, session]);

  // ----------------------------------------------------------
  // setZeroScoreReason — Update reason for a specific target
  // ----------------------------------------------------------
  const setZeroScoreReason = useCallback((targetId, reason) => {
    setZeroScoreReasons((prev) => ({
      ...prev,
      [targetId]: reason,
    }));
  }, []);

  // ----------------------------------------------------------
  // setAllocation — Update a single target's points
  // ----------------------------------------------------------
  /**
   * Set the point allocation for a specific target.
   * This updates the local state — call submitAllocations() to save.
   *
   * @param {string} targetId - UUID of the target person
   * @param {number} points - Points to allocate (0 or positive)
   */
  const setAllocation = useCallback((targetId, points) => {
    // Clamp to non-negative — no negative points allowed
    const clampedPoints = Math.max(0, Number(points) || 0);

    setAllocations((prev) => ({
      ...prev,
      [targetId]: clampedPoints,
    }));
  }, []);

  // ----------------------------------------------------------
  // submitAllocations — Save all allocations to the backend
  // ----------------------------------------------------------
  /**
   * Submit all current allocations to the backend.
   * Replaces all previous allocations for this evaluator atomically.
   * If there are zero allocations and no reasons provided, triggers the dialog.
   *
   * @param {Array<Object>} [providedReasons] - Optional pre-collected reasons from dialog
   * @returns {Promise<Object>} Submission result from backend
   */
  const submitAllocations = useCallback(
    async (providedReasons = null) => {
      // Check if we need to show the zero-score dialog first
      const zeroEntries = Object.entries(allocations).filter(
        ([, points]) => Number(points) === 0,
      );

      if (zeroEntries.length > 0 && providedReasons === null) {
        // Show the dialog — submission will be retried via onConfirm
        setShowZeroReasonDialog(true);
        return { deferred: true };
      }

      // Build the allocations array from the map
      const allocationArray = Object.entries(allocations).map(
        ([targetId, points]) => ({
          targetId,
          points: Number(points) || 0,
        }),
      );

      // Build zero-score reasons array for the API
      const reasonsForApi = providedReasons || [];

      setIsSaving(true);
      setError(null);
      setShowZeroReasonDialog(false);

      try {
        // Submit to backend — API validates scarcity constraint
        const response = await submitAllocationsApi(
          sessionId,
          evaluatorId,
          allocationArray,
          reasonsForApi,
        );

        if (response.success) {
          // Update saved state to match current (no longer dirty)
          setSavedAllocations({ ...allocations });

          // Update session.myAllocations so the saved-success banner
          // renders immediately (it checks session.myAllocations?.length > 0)
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  myAllocations: allocationArray.map((a) => ({
                    targetId: a.targetId,
                    points: a.points,
                    headId: null,
                  })),
                }
              : prev,
          );

          return response;
        } else {
          // Backend validation failed (e.g., POOL_EXCEEDED)
          setError(response.message || "Allocation submission failed");
          return response;
        }
      } catch (err) {
        setError(err.message || "Failed to submit allocations");
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId, evaluatorId, allocations],
  );

  // ----------------------------------------------------------
  // refresh — Force a data reload
  // ----------------------------------------------------------
  /**
   * Trigger a fresh data fetch from the backend.
   * Increments the fetch trigger counter to re-run the effect.
   */
  const refresh = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useDataChange(
    ["scarcity_session", "scarcity_allocation", "session"],
    refresh,
  );

  // ----------------------------------------------------------
  // RETURN — Expose state and actions to consuming components
  // ----------------------------------------------------------
  return {
    // Data
    session,
    allocations,
    poolInfo,

    // SRS §4.1.2 — Historical data for growth-aware evaluation
    historicalData, // { hasPrevious, scores, summary }
    historySummary: historicalData.summary, // Convenience shortcut

    // Status flags
    isLoading,
    isSaving,
    isDirty,
    error,

    // Zero-score reason capture (SRS §4.1.5)
    showZeroReasonDialog,
    setShowZeroReasonDialog,
    pendingZeroAllocations,
    zeroScoreReasons,
    setZeroScoreReason,

    // Actions
    setAllocation,
    submitAllocations,
    refresh,
  };
};

// ============================================================
// useMyScarcitySessions — List evaluator's sessions
// ============================================================
/**
 * Hook for fetching the list of scarcity sessions assigned to the
 * current evaluator. Used on the dashboard to show pending evaluations.
 *
 * @param {string} evaluatorId - UUID of the evaluator (person_id)
 * @returns {Object} { sessions, isLoading, error, refresh }
 */
export const useMyScarcitySessions = (evaluatorId) => {
  // Session list state
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Fetch sessions on mount or trigger change
  useEffect(() => {
    // Don't fetch without evaluatorId — backend requires it
    if (!evaluatorId) return;

    let isCancelled = false;

    const fetchSessions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Pass evaluatorId to API — backend requires it as query param
        const response = await getMyScarcitySessions(evaluatorId);
        if (!isCancelled && response.success) {
          setSessions(response.data || []);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || "Failed to load sessions");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSessions();
    return () => {
      isCancelled = true;
    };
  }, [evaluatorId, fetchTrigger]);

  // Refresh function
  const refresh = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useDataChange(["scarcity_session", "session"], refresh);

  return { sessions, isLoading, error, refresh };
};

// ============================================================
// Export the main hook as default
// ============================================================
export default useScarcity;
