// ============================================================
// WHAT-IF SCENARIO HOOK
// ============================================================
// SRS §4.4.3 — Real-time weight simulation for faculty.
// Manages scenario weights, simulation results, saved scenarios.
// ============================================================

import { useState, useCallback } from "react";
import {
  simulateWhatIf,
  saveWhatIfScenario,
  getWhatIfScenarios,
  deleteWhatIfScenario,
} from "../services/facultyEvaluationApi";
import { useDataChange } from "./useSocketEvent";

/**
 * @param {string} sessionId
 * @param {string} facultyId
 */
export default function useWhatIfScenario(sessionId, facultyId) {
  // Adjustable weights
  const [weights, setWeights] = useState({
    sessions_weight: 0.3,
    hours_weight: 0.5,
    role_weight: 0.2,
  });

  // Simulation result
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Saved scenarios
  const [scenarios, setScenarios] = useState([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);

  // Saving state
  const [saving, setSaving] = useState(false);

  // Error
  const [error, setError] = useState(null);

  // ── Run simulation ──────────────────────────────────────

  const runSimulation = useCallback(
    async (customWeights) => {
      if (!sessionId || !facultyId) return;
      const w = customWeights || weights;

      // Validate sum
      const sum = w.sessions_weight + w.hours_weight + w.role_weight;
      if (Math.abs(sum - 1.0) > 0.02) {
        setError("Weights must sum to 1.0");
        return;
      }

      setSimulating(true);
      setError(null);
      try {
        const result = await simulateWhatIf(facultyId, sessionId, w);
        if (result.success) {
          setSimulation(result.data);
        } else {
          setError(result.error || "Simulation failed");
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setSimulating(false);
      }
    },
    [sessionId, facultyId, weights],
  );

  // ── Update weights + auto-simulate ──────────────────────

  const updateWeights = useCallback((newWeights) => {
    setWeights(newWeights);
    // Debounced simulation will be handled by component
  }, []);

  // ── Save scenario ───────────────────────────────────────

  const save = useCallback(
    async (name) => {
      if (!sessionId || !facultyId || !name) return;
      setSaving(true);
      setError(null);
      try {
        const result = await saveWhatIfScenario(
          facultyId,
          sessionId,
          name,
          weights,
        );
        if (result.success) {
          setScenarios((prev) => [result.data, ...prev]);
          return true;
        }
        setError(result.error || "Save failed");
        return false;
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [sessionId, facultyId, weights],
  );

  // ── Load saved scenarios ────────────────────────────────

  const loadScenarios = useCallback(async () => {
    if (!facultyId) return;
    setScenariosLoading(true);
    try {
      const result = await getWhatIfScenarios(facultyId, sessionId);
      if (result.success) {
        setScenarios(result.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setScenariosLoading(false);
    }
  }, [facultyId, sessionId]);

  // ── Delete scenario ─────────────────────────────────────

  const removeScenario = useCallback(
    async (scenarioId) => {
      try {
        const result = await deleteWhatIfScenario(scenarioId, facultyId);
        if (result.success) {
          setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      }
    },
    [facultyId],
  );

  // ── Real-time updates via Socket.IO ─────────────────────
  useDataChange(
    ["what_if_scenario", "normalization_weights", "normalized_scores"],
    loadScenarios,
  );

  // ── Apply saved scenario weights ────────────────────────

  const applyScenario = useCallback(
    (scenario) => {
      const w = {
        sessions_weight: parseFloat(scenario.alt_sessions_weight) || 0.3,
        hours_weight: parseFloat(scenario.alt_hours_weight) || 0.5,
        role_weight: parseFloat(scenario.alt_role_weight) || 0.2,
      };
      setWeights(w);
      runSimulation(w);
    },
    [runSimulation],
  );

  return {
    weights,
    updateWeights,
    simulation,
    simulating,
    runSimulation,
    scenarios,
    scenariosLoading,
    loadScenarios,
    save,
    saving,
    removeScenario,
    applyScenario,
    error,
    clearError: () => setError(null),
  };
}
