// ============================================================
// useSessionPlanner — Hook for session planner data and actions
// ============================================================
// Shared hook for components that need session planner state:
//   - Track info, team info, planner assignments
//   - Real-time updates via Socket.IO
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useDataChange } from "./useSocketEvent";
import {
  getMyTrack,
  getMyTeam,
  getPendingInvitations,
  getMyEvaluator,
  getMyAssignments,
  getTrackConfig,
} from "../services/sessionPlannerApi";

const useSessionPlanner = (role = "student") => {
  const [trackInfo, setTrackInfo] = useState(null);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [trackConfig, setTrackConfig] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [pendingInvitations, setPendingInvitations] = useState([]);
  const [myEvaluator, setMyEvaluator] = useState(null);
  const [myAssignments, setMyAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);

      if (role === "student") {
        const [trackRes, configRes, teamRes, invRes, evalRes] =
          await Promise.all([
            getMyTrack().catch(() => null),
            getTrackConfig().catch(() => null),
            getMyTeam().catch(() => ({ data: null })),
            getPendingInvitations().catch(() => ({ data: [] })),
            getMyEvaluator().catch(() => ({ data: [] })),
          ]);

        setTrackInfo(trackRes?.data || null);
        setNeedsSelection(trackRes?.needsSelection || false);
        setTrackConfig(configRes?.data || null);
        setMyTeam(teamRes?.data || null);
        setPendingInvitations(invRes?.data || []);
        setMyEvaluator(evalRes?.data?.[0] || null);
      }

      if (role === "faculty" || role === "admin") {
        const assignRes = await getMyAssignments().catch(() => ({
          data: [],
        }));
        setMyAssignments(assignRes?.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load planner data");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Real-time updates
  useDataChange("student_track", refresh);
  useDataChange("team_formation", refresh);
  useDataChange("team_invitation", refresh);
  useDataChange("session_planner", refresh);

  return {
    trackInfo,
    trackConfig,
    myTeam,
    pendingInvitations,
    myEvaluator,
    myAssignments,
    loading,
    error,
    refresh,
    needsTrackSelection: needsSelection,
  };
};

export default useSessionPlanner;
