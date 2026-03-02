// ============================================================
// useFacultyEvaluation HOOK
// ============================================================
// SRS §4.4 — Manages all state for the Faculty Evaluation page.
// Handles: session loading, tier management, pool calculation,
//          auto-save drafts (30s), undo, and final submission.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  getActiveFacultySessions,
  getSessionFaculty,
  saveFacultyDraft,
  submitFacultyEvaluation,
} from "../services/facultyEvaluationApi";
import { useDataChange } from "./useSocketEvent";

/**
 * @description Tier-to-points mapping per evaluation mode
 * Must match server/src/controllers/facultyEvaluationController.js TIER_CONFIG
 * @see SRS §4.4.2
 */
const TIER_CONFIG = {
  binary: [
    { id: "tier1", label: "Selected", points: 1, color: "gold" },
    { id: "unranked", label: "Not Selected", points: 0, color: "gray" },
  ],
  small_pool: [
    { id: "tier1", label: "Outstanding", points: 3, color: "gold" },
    { id: "tier2", label: "Good", points: 2, color: "silver" },
    { id: "tier3", label: "Satisfactory", points: 1, color: "bronze" },
    { id: "unranked", label: "Not Evaluated", points: 0, color: "gray" },
  ],
  full_pool: [
    { id: "tier1", label: "Exceptional", points: 4, color: "gold" },
    { id: "tier2", label: "Commendable", points: 2, color: "silver" },
    { id: "tier3", label: "Adequate", points: 1, color: "bronze" },
    { id: "unranked", label: "Not Evaluated", points: 0, color: "gray" },
  ],
};

/**
 * @description Calculate faculty evaluation budget
 * @see SRS §4.4.1 — "Student receives limited points"
 */
function calculateBudget(mode, facultyCount) {
  switch (mode) {
    case "binary":
      return Math.max(1, Math.floor(facultyCount * 0.3));
    case "small_pool":
      return Math.max(3, Math.floor(facultyCount * 1.5));
    case "full_pool":
      return 10;
    default:
      return 10;
  }
}

/**
 * @description Get points for a tier in a given mode
 */
function getTierPoints(mode, tierId) {
  const config = TIER_CONFIG[mode];
  if (!config) return 0;
  const tier = config.find((t) => t.id === tierId);
  return tier ? tier.points : 0;
}

/**
 * @description Main hook for the Faculty Evaluation page
 * @param {string|null} sessionId - Optional session ID from URL params
 * @returns {Object} All state and actions for the Faculty Evaluation UI
 */
export default function useFacultyEvaluation(sessionId) {
  // ── State ──────────────────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [faculty, setFaculty] = useState([]);
  const [mode, setMode] = useState("small_pool");
  const [tiers, setTiers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const autoSaveRef = useRef(null);
  const tiersRef = useRef(tiers);
  tiersRef.current = tiers;

  // ── Tier Config for current mode ────────────────────────
  const tierConfig = useMemo(
    () => TIER_CONFIG[mode] || TIER_CONFIG.small_pool,
    [mode],
  );

  // ── Pool Calculation ────────────────────────────────────
  const pool = useMemo(() => {
    const budget = calculateBudget(mode, faculty.length);
    let used = 0;
    for (const [tierId, members] of Object.entries(tiers)) {
      const pts = getTierPoints(mode, tierId);
      used += (members || []).length * pts;
    }
    return {
      total: budget,
      used,
      remaining: budget - used,
      isExceeded: used > budget,
      utilization: budget > 0 ? Math.min(used / budget, 1) : 0,
    };
  }, [tiers, mode, faculty.length]);

  // ── Load Sessions (when no sessionId provided) ──────────
  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getActiveFacultySessions();
      if (result.success) {
        setSessions(result.data || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load Session Faculty ────────────────────────────────
  const loadSessionFaculty = useCallback(async (sid) => {
    try {
      setLoading(true);
      setError(null);
      const result = await getSessionFaculty(sid);
      if (result.success) {
        const {
          session: sess,
          faculty: fac,
          existingAllocations,
          hasSubmitted,
        } = result.data;
        setSession(sess);
        setFaculty(fac);
        setMode(sess.evaluation_mode);
        setSubmitted(hasSubmitted);

        // Initialize tiers from existing allocations or put all in unranked
        const config =
          TIER_CONFIG[sess.evaluation_mode] || TIER_CONFIG.small_pool;
        const initial = {};
        config.forEach((t) => (initial[t.id] = []));

        if (
          existingAllocations &&
          Object.keys(existingAllocations).length > 0
        ) {
          for (const f of fac) {
            const alloc = existingAllocations[f.person_id];
            const tier = alloc?.tier || "unranked";
            if (!initial[tier]) initial[tier] = [];
            initial[tier].push(f);
          }
        } else {
          initial.unranked = [...fac];
        }
        setTiers(initial);
        setHistory([]);
        setIsDirty(false);
      }
    } catch (err) {
      setError(err.message || "Failed to load faculty");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Initial Load ────────────────────────────────────────
  useEffect(() => {
    if (sessionId) {
      loadSessionFaculty(sessionId);
    } else {
      loadSessions();
    }
  }, [sessionId, loadSessionFaculty, loadSessions]);

  // ── Move Faculty to Tier ────────────────────────────────
  const moveFaculty = useCallback(
    (facultyId, targetTierId) => {
      if (submitted) return;

      setTiers((prev) => {
        // Save to history for undo
        setHistory((h) => [...h.slice(-19), prev]); // keep last 20

        const next = {};
        let movedFaculty = null;

        // Remove from current tier and find the faculty object
        Object.entries(prev).forEach(([tid, members]) => {
          next[tid] = (members || []).filter((f) => {
            if (f.person_id === facultyId) {
              movedFaculty = f;
              return false;
            }
            return true;
          });
        });

        // Add to target tier
        if (movedFaculty && next[targetTierId]) {
          next[targetTierId] = [...next[targetTierId], movedFaculty];
        }

        return next;
      });
      setIsDirty(true);
    },
    [submitted],
  );

  // ── Undo Last Move ──────────────────────────────────────
  const undo = useCallback(() => {
    if (history.length === 0 || submitted) return;
    const prev = history[history.length - 1];
    setTiers(prev);
    setHistory((h) => h.slice(0, -1));
    setIsDirty(true);
  }, [history, submitted]);

  // ── Reset All to Unranked ───────────────────────────────
  const resetAll = useCallback(() => {
    if (submitted) return;
    setHistory((h) => [...h.slice(-19), tiers]);
    const reset = {};
    tierConfig.forEach((t) => (reset[t.id] = []));
    reset.unranked = [...faculty];
    setTiers(reset);
    setIsDirty(true);
  }, [faculty, tierConfig, tiers, submitted]);

  // ── Build allocations array for API ─────────────────────
  const buildAllocations = useCallback(() => {
    const allocations = [];
    for (const [tierId, members] of Object.entries(tiersRef.current)) {
      for (const f of members || []) {
        allocations.push({ facultyPersonId: f.person_id, tier: tierId });
      }
    }
    return allocations;
  }, []);

  // ── Save Draft ──────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!sessionId || submitted || !isDirty) return;
    try {
      setSaving(true);
      const allocations = buildAllocations();
      const result = await saveFacultyDraft(sessionId, allocations);
      if (result.success) {
        setLastSaved(new Date(result.savedAt));
        setIsDirty(false);
      }
    } catch (err) {
      // Draft save failure is non-critical — don't overwrite main error
      console.warn("Draft save failed:", err.message);
    } finally {
      setSaving(false);
    }
  }, [sessionId, submitted, isDirty, buildAllocations]);

  // ── Auto-Save Every 30s ─────────────────────────────────
  useEffect(() => {
    if (submitted || !sessionId) return;
    autoSaveRef.current = setInterval(() => {
      if (tiersRef.current && Object.keys(tiersRef.current).length > 0) {
        saveDraft();
      }
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [sessionId, submitted, saveDraft]);

  // Real-time: refetch when faculty evaluation data changes on server
  useDataChange(
    ["faculty_evaluation_session", "faculty_allocation", "faculty_evaluation"],
    () => {
      loadSessions();
    },
  );

  // ── Submit Final Evaluation ─────────────────────────────
  const submit = useCallback(async () => {
    if (!sessionId || submitted) return;
    if (pool.isExceeded) {
      setError(`Budget exceeded: ${pool.used} > ${pool.total}`);
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const allocations = buildAllocations();
      const result = await submitFacultyEvaluation(sessionId, allocations);
      if (result.success) {
        setSubmitted(true);
        setIsDirty(false);
        clearInterval(autoSaveRef.current);
      }
    } catch (err) {
      setError(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, submitted, pool, buildAllocations]);

  // ── Return ──────────────────────────────────────────────
  return {
    // Data
    sessions,
    session,
    faculty,
    tiers,
    tierConfig,
    mode,
    pool,
    // State
    loading,
    saving,
    submitting,
    submitted,
    error,
    isDirty,
    lastSaved,
    canUndo: history.length > 0 && !submitted,
    // Actions
    moveFaculty,
    undo,
    resetAll,
    saveDraft,
    submit,
    clearError: () => setError(null),
    selectSession: (sid) => loadSessionFaculty(sid),
  };
}

export { TIER_CONFIG, calculateBudget, getTierPoints };
