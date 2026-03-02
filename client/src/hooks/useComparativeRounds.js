// ============================================================
// USE COMPARATIVE ROUNDS — List-level hooks for rounds & sessions
// ============================================================
// Follows useMyScarcitySessions pattern from useScarcity.js
// No context needed — simple useState + useEffect hooks.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  getMyActiveRounds,
  getMySessions,
  listRounds,
  getEligibleProjects,
} from "../services/comparativeApi";
import { useDataChange } from "./useSocketEvent";

/**
 * Hook for judges: get active rounds they're assigned to.
 */
export function useMyActiveRounds() {
  const [rounds, setRounds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getMyActiveRounds();
      if (response.success) {
        setRounds(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useDataChange(["comparative_round"], fetch);

  return { rounds, isLoading, error, refresh: fetch };
}

/**
 * Hook for judges: get their comparative sessions.
 */
export function useMyComparativeSessions() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getMySessions();
      if (response.success) {
        setSessions(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useDataChange(["comparative_session", "comparative_allocation"], fetch);

  return { sessions, isLoading, error, refresh: fetch };
}

/**
 * Hook for admins: list all rounds with optional status filter.
 */
export function useAllRounds(statusFilter = null) {
  const [rounds, setRounds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listRounds(statusFilter);
      if (response.success) {
        setRounds(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useDataChange(["comparative_round"], fetch);

  return { rounds, isLoading, error, refresh: fetch };
}

/**
 * Hook for judges: get eligible projects for a specific round.
 */
export function useEligibleProjects(roundId) {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!roundId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getEligibleProjects(roundId);
      if (response.success) {
        setProjects(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useDataChange(["project", "comparative_round"], fetch);

  return { projects, isLoading, error, refresh: fetch };
}

// Default export for import from useComparativeEvaluation.js
export default {
  useMyActiveRounds,
  useMyComparativeSessions,
  useAllRounds,
  useEligibleProjects,
};
