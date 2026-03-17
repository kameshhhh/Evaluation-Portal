// ============================================================
// USE PERSONALIZATION HOOK — React Hook for Dashboard Data
// ============================================================
// Custom React hook that manages the personalization state.
// Fetches dashboard data from the backend and exposes it to
// dashboard components along with loading/error states.
//
// FEATURES:
//   - Auto-fetch on mount when authenticated
//   - Auto-polling every 30s for real-time data freshness
//   - Manual refresh with cache invalidation
//   - Graceful error handling with unmount protection
//
// USAGE:
//   const { dashboardData, isLoading, error, refresh } = usePersonalization();
//
// This hook is the ONLY way frontend components get dashboard data.
// ============================================================

// Import React hooks for state management and side effects
import { useState, useEffect, useCallback, useRef } from "react";

// Import the personalization API service
import {
  fetchDashboard,
  invalidateDashboardCache,
} from "../services/personalizationService";

// Import the auth hook to check authentication status
import useAuth from "./useAuth";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// POLLING INTERVAL — How often to auto-refresh (milliseconds)
// 30 seconds balances freshness vs server load
// ============================================================
const POLL_INTERVAL_MS = 30000;

// ============================================================
// usePersonalization — Custom hook for dashboard data
// ============================================================
const usePersonalization = () => {
  // ---------------------------------------------------------
  // STATE — Dashboard data, loading, and error states
  // ---------------------------------------------------------

  // The complete dashboard payload from the backend
  const [dashboardData, setDashboardData] = useState(null);

  // Loading flag — true during initial load only (not polling)
  const [isLoading, setIsLoading] = useState(true);

  // Error message — null when no error, string when failed
  const [error, setError] = useState(null);

  // Fetch counter — incremented to trigger manual re-fetches
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // Track whether we've done the initial load (hide spinner during polls)
  const hasLoadedOnce = useRef(false);

  // Get authentication state from AuthContext
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // ---------------------------------------------------------
  // FETCH DASHBOARD DATA — Runs on mount, on trigger, and on poll
  // ---------------------------------------------------------
  useEffect(() => {
    // Don't fetch if auth is still loading or user isn't logged in
    if (authLoading || !isAuthenticated) {
      if (!authLoading && !isAuthenticated) {
        setIsLoading(false);
      }
      return;
    }

    // Flag to prevent state updates on unmounted components
    let isCancelled = false;

    /**
     * Fetch dashboard data from the backend.
     * Shows loading spinner only on initial load, not during background polls.
     */
    const loadDashboard = async () => {
      try {
        // Only show loading spinner on first fetch, not background polls
        if (!hasLoadedOnce.current) {
          setIsLoading(true);
        }
        setError(null);

        // Fetch the personalized dashboard from the backend
        const data = await fetchDashboard();

        if (!isCancelled) {
          setDashboardData(data);
          setIsLoading(false);
          hasLoadedOnce.current = true;
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || "Failed to load dashboard data");
          setIsLoading(false);
        }
      }
    };

    // Execute the initial fetch
    loadDashboard();

    // ---------------------------------------------------------
    // AUTO-POLLING — Refresh dashboard every POLL_INTERVAL_MS
    // Keeps data fresh across all dashboards without manual refresh
    // Background polls don't show loading spinner (hasLoadedOnce)
    // ---------------------------------------------------------
    const pollTimer = setInterval(() => {
      if (!isCancelled) {
        loadDashboard();
      }
    }, POLL_INTERVAL_MS);

    // Cleanup — cancel pending updates and stop polling on unmount
    return () => {
      isCancelled = true;
      clearInterval(pollTimer);
    };
  }, [isAuthenticated, authLoading, fetchTrigger]);

  // ---------------------------------------------------------
  // REFRESH — Invalidate cache and force immediate refetch
  // ---------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      // Invalidate the server-side cache first
      await invalidateDashboardCache();
    } catch {
      // Cache invalidation failure is non-critical
    }

    // Reset the loaded flag to show spinner on manual refresh
    hasLoadedOnce.current = false;

    // Trigger a re-fetch by incrementing the counter
    setFetchTrigger((prev) => prev + 1);
  }, []);

  // Silent refresh — refetch data in the background without showing spinner
  // Used by socket events so the dashboard doesn't unmount/remount
  const silentRefresh = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  useDataChange(
    [
      "session",
      "project",
      "evaluation",
      "allocation",
      "cohort",
      "peer_ranking",
      "faculty_evaluation",
      "session_planner",
    ],
    silentRefresh,
  );

  // ---------------------------------------------------------
  // RETURN — Expose state and methods to the component
  // ---------------------------------------------------------
  return {
    dashboardData, // The complete dashboard payload (or null while loading)
    isLoading, // True during initial fetch only
    error, // Error message string (or null)
    refresh, // Function to invalidate cache and refetch immediately
  };
};

// ============================================================
// Export the hook for use in dashboard components
// ============================================================
export default usePersonalization;
