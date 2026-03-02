// ============================================================
// FACULTY ANALYTICS HOOK
// ============================================================
// SRS §4.4.3 — Exposure normalization analytics and faculty trends.
// Provides normalized results, department rankings, response rates,
// and faculty performance trend data for dashboards.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  getFacultyTrend,
  getNormalizedResults,
  getDepartmentRankings,
  getResponseRate,
  getSessionOverview,
  getNormalizationExplanation,
} from "../services/facultyEvaluationApi";
import { useDataChange } from "./useSocketEvent";

/**
 * @description Hook for faculty evaluation analytics
 * @param {string} sessionId - Current session being viewed
 * @param {Object} options - { autoLoad: boolean, facultyId: string }
 * @returns {Object} Analytics data, loading states, fetchers
 */
export default function useFacultyAnalytics(sessionId, options = {}) {
  const { autoLoad = false, facultyId = null } = options;

  // Trend data (faculty's performance over sessions)
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Normalized results for a session
  const [normalizedResults, setNormalizedResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Department rankings
  const [rankings, setRankings] = useState([]);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Response rate
  const [responseRate, setResponseRate] = useState(null);
  const [responseRateLoading, setResponseRateLoading] = useState(false);

  // Session overview stats
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Normalization explanation for a specific faculty
  const [explanation, setExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // ── Data Fetchers ──────────────────────────────────────────

  const fetchTrend = useCallback(
    async (fId, limit = 10) => {
      setTrendLoading(true);
      setError(null);
      try {
        const result = await getFacultyTrend(fId || facultyId, limit);
        if (result.success) {
          setTrend(result.data);
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setTrendLoading(false);
      }
    },
    [facultyId],
  );

  const fetchNormalizedResults = useCallback(async (sId) => {
    const targetSession = sId;
    if (!targetSession) return;
    setResultsLoading(true);
    setError(null);
    try {
      const result = await getNormalizedResults(targetSession);
      if (result.success) {
        setNormalizedResults(result.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setResultsLoading(false);
    }
  }, []);

  const fetchRankings = useCallback(async (sId, department) => {
    const targetSession = sId;
    if (!targetSession) return;
    setRankingsLoading(true);
    setError(null);
    try {
      const result = await getDepartmentRankings(targetSession, department);
      if (result.success) {
        setRankings(result.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRankingsLoading(false);
    }
  }, []);

  const fetchResponseRate = useCallback(async (sId) => {
    const targetSession = sId;
    if (!targetSession) return;
    setResponseRateLoading(true);
    setError(null);
    try {
      const result = await getResponseRate(targetSession);
      if (result.success) {
        setResponseRate(result.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setResponseRateLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async (sId) => {
    const targetSession = sId;
    if (!targetSession) return;
    setOverviewLoading(true);
    setError(null);
    try {
      const result = await getSessionOverview(targetSession);
      if (result.success) {
        setOverview(result.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchExplanation = useCallback(async (sId, fId) => {
    if (!sId || !fId) return;
    setExplanationLoading(true);
    setError(null);
    try {
      const result = await getNormalizationExplanation(sId, fId);
      if (result.success) {
        setExplanation(result.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setExplanationLoading(false);
    }
  }, []);

  // ── Auto-load on session change ────────────────────────────

  useEffect(() => {
    if (!autoLoad || !sessionId) return;
    let cancelled = false;

    const loadAll = async () => {
      if (!cancelled) fetchOverview(sessionId);
      if (!cancelled) fetchNormalizedResults(sessionId);
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [sessionId, autoLoad, fetchOverview, fetchNormalizedResults]);

  // ── Refresh helper ─────────────────────────────────────────

  const refreshAll = useCallback(
    (sId) => {
      const target = sId || sessionId;
      if (!target) return;
      fetchOverview(target);
      fetchNormalizedResults(target);
      fetchResponseRate(target);
      fetchRankings(target);
    },
    [
      sessionId,
      fetchOverview,
      fetchNormalizedResults,
      fetchResponseRate,
      fetchRankings,
    ],
  );

  // Real-time: refetch when faculty analytics data changes on server
  useDataChange(
    [
      "faculty_evaluation",
      "normalized_scores",
      "normalization_weights",
      "faculty_assignment",
    ],
    () => {
      refreshAll(sessionId);
    },
  );

  return {
    // Trend
    trend,
    trendLoading,
    fetchTrend,

    // Normalized results
    normalizedResults,
    resultsLoading,
    fetchNormalizedResults,

    // Rankings
    rankings,
    rankingsLoading,
    fetchRankings,

    // Response rate
    responseRate,
    responseRateLoading,
    fetchResponseRate,

    // Overview
    overview,
    overviewLoading,
    fetchOverview,

    // Explanation
    explanation,
    explanationLoading,
    fetchExplanation,

    // Shared
    error,
    refreshAll,
  };
}
