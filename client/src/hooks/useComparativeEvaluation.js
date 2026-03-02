// ============================================================
// USE COMPARATIVE EVALUATION — SRS §4.3 State Management
// ============================================================
// Design decisions:
//   - useReducer for complex coordinated state updates
//   - useContext to avoid prop drilling through Matrix → Row → Cell
//   - Follows useScarcity.js hook pattern for API interaction
//
// State shape:
//   session, allocationMatrix, criteriaPoolInfo, poolInfo,
//   isLoading, isSaving, error, isDirty
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  getComparativeSession,
  saveAllocations as saveAllocationsApi,
  submitComparativeSession,
  saveSnapshot as saveSnapshotApi,
} from "../services/comparativeApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// ACTION TYPES
// ============================================================
const ACTIONS = {
  SET_LOADING: "SET_LOADING",
  SET_ERROR: "SET_ERROR",
  SET_SESSION: "SET_SESSION",
  UPDATE_ALLOCATION: "UPDATE_ALLOCATION",
  SET_SAVING: "SET_SAVING",
  SAVE_SUCCESS: "SAVE_SUCCESS",
  SUBMIT_SUCCESS: "SUBMIT_SUCCESS",
  RESET_DIRTY: "RESET_DIRTY",
};

// ============================================================
// REDUCER — Pure state transitions
// ============================================================
function comparativeReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload, error: null };

    case ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isSaving: false,
      };

    case ACTIONS.SET_SESSION: {
      const { session } = action.payload;
      return {
        ...state,
        session,
        allocationMatrix: session.allocationMatrix || {},
        savedMatrix: JSON.parse(JSON.stringify(session.allocationMatrix || {})),
        criteriaPoolInfo: session.criteriaPoolInfo || [],
        poolInfo: session.poolInfo || {},
        projects: session.projects || [],
        isLoading: false,
        error: null,
      };
    }

    case ACTIONS.UPDATE_ALLOCATION: {
      const { criterionKey, projectId, points } = action.payload;
      const newMatrix = { ...state.allocationMatrix };

      // Deep clone the criterion row
      newMatrix[criterionKey] = { ...(newMatrix[criterionKey] || {}) };
      newMatrix[criterionKey][projectId] = Math.max(0, points);

      // Recompute criteria pool info
      const criteria = state.session?.criteria || [];
      const newCriteriaPoolInfo = criteria.map((c) => {
        const allocsForCriterion = newMatrix[c.key] || {};
        const allocated = Object.values(allocsForCriterion).reduce(
          (sum, v) => sum + v,
          0,
        );
        return {
          ...c,
          allocated,
          remaining: c.pool - allocated,
          utilization:
            c.pool > 0 ? Math.round((allocated / c.pool) * 10000) / 100 : 0,
          isExceeded: allocated > c.pool,
        };
      });

      // Recompute overall pool info
      const totalAllocated = newCriteriaPoolInfo.reduce(
        (sum, c) => sum + c.allocated,
        0,
      );
      const totalPool = state.session?.total_pool
        ? parseFloat(state.session.total_pool)
        : 0;

      return {
        ...state,
        allocationMatrix: newMatrix,
        criteriaPoolInfo: newCriteriaPoolInfo,
        poolInfo: {
          totalPool,
          totalAllocated,
          remaining: totalPool - totalAllocated,
          utilization:
            totalPool > 0
              ? Math.round((totalAllocated / totalPool) * 10000) / 100
              : 0,
          isExceeded: totalAllocated > totalPool,
        },
      };
    }

    case ACTIONS.SET_SAVING:
      return { ...state, isSaving: action.payload };

    case ACTIONS.SAVE_SUCCESS: {
      const { session } = action.payload;
      return {
        ...state,
        session,
        allocationMatrix: session.allocationMatrix || {},
        savedMatrix: JSON.parse(JSON.stringify(session.allocationMatrix || {})),
        criteriaPoolInfo: session.criteriaPoolInfo || [],
        poolInfo: session.poolInfo || {},
        isSaving: false,
      };
    }

    case ACTIONS.SUBMIT_SUCCESS: {
      const { session } = action.payload;
      return {
        ...state,
        session,
        allocationMatrix: session.allocationMatrix || {},
        savedMatrix: JSON.parse(JSON.stringify(session.allocationMatrix || {})),
        criteriaPoolInfo: session.criteriaPoolInfo || [],
        poolInfo: session.poolInfo || {},
        isSaving: false,
      };
    }

    case ACTIONS.RESET_DIRTY:
      return {
        ...state,
        savedMatrix: JSON.parse(JSON.stringify(state.allocationMatrix)),
      };

    default:
      return state;
  }
}

// ============================================================
// INITIAL STATE
// ============================================================
const initialState = {
  session: null,
  allocationMatrix: {},
  savedMatrix: {},
  criteriaPoolInfo: [],
  poolInfo: {},
  projects: [],
  isLoading: true,
  isSaving: false,
  error: null,
};

// ============================================================
// CONTEXT
// ============================================================
const ComparativeContext = createContext(null);

/**
 * Provider component wrapping the allocation matrix.
 * Place at the page level so all children can access without prop drilling.
 */
export function ComparativeProvider({ sessionId, children }) {
  const [state, dispatch] = useReducer(comparativeReducer, initialState);
  const fetchRef = useRef(0);

  // SRS §4.1.5 — Zero-score reason dialog state
  const [showZeroReasonDialog, setShowZeroReasonDialog] = useState(false);

  // --------------------------------------------------------
  // FETCH SESSION DATA
  // --------------------------------------------------------
  const fetchSession = useCallback(async () => {
    if (!sessionId) return;

    const fetchId = ++fetchRef.current;
    dispatch({ type: ACTIONS.SET_LOADING, payload: true });

    try {
      const response = await getComparativeSession(sessionId);
      if (fetchRef.current !== fetchId) return; // stale request

      if (response.success) {
        dispatch({
          type: ACTIONS.SET_SESSION,
          payload: { session: response.data },
        });
      } else {
        dispatch({
          type: ACTIONS.SET_ERROR,
          payload: response.error || "Failed to load session",
        });
      }
    } catch (err) {
      if (fetchRef.current !== fetchId) return;
      dispatch({
        type: ACTIONS.SET_ERROR,
        payload: err.message || "Network error",
      });
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Real-time: refetch when comparative data changes on server
  useDataChange(
    ["comparative_session", "comparative_allocation", "comparative_round"],
    () => {
      fetchSession();
    },
  );

  // --------------------------------------------------------
  // UPDATE A SINGLE CELL — (criterionKey, projectId, points)
  // --------------------------------------------------------
  const setAllocation = useCallback((criterionKey, projectId, points) => {
    dispatch({
      type: ACTIONS.UPDATE_ALLOCATION,
      payload: { criterionKey, projectId, points },
    });
  }, []);

  // --------------------------------------------------------
  // SAVE ALL ALLOCATIONS TO SERVER
  // --------------------------------------------------------
  const saveAll = useCallback(async () => {
    dispatch({ type: ACTIONS.SET_SAVING, payload: true });

    try {
      const response = await saveAllocationsApi(
        sessionId,
        state.allocationMatrix,
      );

      if (response.success) {
        dispatch({
          type: ACTIONS.SAVE_SUCCESS,
          payload: { session: response.data },
        });
        return { success: true };
      } else {
        dispatch({ type: ACTIONS.SET_ERROR, payload: response.error });
        return { success: false, error: response.error };
      }
    } catch (err) {
      dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
      return { success: false, error: err.message };
    }
  }, [sessionId, state.allocationMatrix]);

  // --------------------------------------------------------
  // SUBMIT SESSION (finalize)
  // --------------------------------------------------------
  const submit = useCallback(
    async (providedReasons = null) => {
      // Check for zero allocations and show dialog if needed
      const zeros = [];
      const criteria = state.session?.criteria || [];
      for (const c of criteria) {
        const row = state.allocationMatrix[c.key] || {};
        for (const [projectId, points] of Object.entries(row)) {
          if (Number(points) === 0) {
            const project = state.projects.find(
              (p) => p.project_id === projectId,
            );
            zeros.push({
              targetId: projectId,
              targetName: project?.project_name || "Unknown Project",
              criterionKey: c.key,
              criterionName: c.name,
            });
          }
        }
      }

      if (zeros.length > 0 && providedReasons === null) {
        setShowZeroReasonDialog(true);
        return { deferred: true };
      }

      // Save first, then submit
      dispatch({ type: ACTIONS.SET_SAVING, payload: true });
      setShowZeroReasonDialog(false);

      try {
        // Save current state
        await saveAllocationsApi(sessionId, state.allocationMatrix);

        // Then submit with zero-score reasons
        const response = await submitComparativeSession(
          sessionId,
          providedReasons || [],
        );

        if (response.success) {
          dispatch({
            type: ACTIONS.SUBMIT_SUCCESS,
            payload: { session: response.data },
          });
          return { success: true };
        } else {
          dispatch({ type: ACTIONS.SET_ERROR, payload: response.error });
          return { success: false, error: response.error };
        }
      } catch (err) {
        dispatch({ type: ACTIONS.SET_ERROR, payload: err.message });
        return { success: false, error: err.message };
      }
    },
    [
      sessionId,
      state.allocationMatrix,
      state.projects,
      state.session?.criteria,
    ],
  );

  // --------------------------------------------------------
  // SNAPSHOT
  // --------------------------------------------------------
  const snapshot = useCallback(async () => {
    try {
      await saveSnapshotApi(sessionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [sessionId]);

  // --------------------------------------------------------
  // COMPUTED: isDirty
  // --------------------------------------------------------
  const isDirty = useMemo(() => {
    return (
      JSON.stringify(state.allocationMatrix) !==
      JSON.stringify(state.savedMatrix)
    );
  }, [state.allocationMatrix, state.savedMatrix]);

  // --------------------------------------------------------
  // COMPUTED: canSubmit
  // --------------------------------------------------------
  const canSubmit = useMemo(() => {
    if (!state.session) return false;
    if (!["draft", "in_progress"].includes(state.session.status)) return false;
    if (state.isSaving) return false;
    // Check no criteria exceeded
    return !state.criteriaPoolInfo.some((c) => c.isExceeded);
  }, [state.session, state.isSaving, state.criteriaPoolInfo]);

  // --------------------------------------------------------
  // COMPUTED: canSave
  // --------------------------------------------------------
  const canSave = useMemo(() => {
    if (!state.session) return false;
    if (!["draft", "in_progress"].includes(state.session.status)) return false;
    if (state.isSaving) return false;
    if (!isDirty) return false;
    return !state.criteriaPoolInfo.some((c) => c.isExceeded);
  }, [state.session, state.isSaving, isDirty, state.criteriaPoolInfo]);

  // --------------------------------------------------------
  // COMPUTED: pendingZeroAllocations (SRS §4.1.5)
  // --------------------------------------------------------
  const pendingZeroAllocations = useMemo(() => {
    const zeros = [];
    const criteria = state.session?.criteria || [];
    for (const c of criteria) {
      const row = state.allocationMatrix[c.key] || {};
      for (const [projectId, points] of Object.entries(row)) {
        if (Number(points) === 0) {
          const project = state.projects.find(
            (p) => p.project_id === projectId,
          );
          zeros.push({
            targetId: projectId,
            targetName: project?.project_name || "Unknown Project",
            criterionKey: c.key,
            criterionName: c.name,
          });
        }
      }
    }
    return zeros;
  }, [state.allocationMatrix, state.session, state.projects]);

  // --------------------------------------------------------
  // CONTEXT VALUE
  // --------------------------------------------------------
  const contextValue = useMemo(
    () => ({
      // State
      session: state.session,
      allocationMatrix: state.allocationMatrix,
      criteriaPoolInfo: state.criteriaPoolInfo,
      poolInfo: state.poolInfo,
      projects: state.projects,
      isLoading: state.isLoading,
      isSaving: state.isSaving,
      error: state.error,

      // Computed
      isDirty,
      canSubmit,
      canSave,
      pendingZeroAllocations,

      // Zero-score dialog (SRS §4.1.5)
      showZeroReasonDialog,
      setShowZeroReasonDialog,

      // Actions
      setAllocation,
      saveAll,
      submit,
      snapshot,
      refresh: fetchSession,
    }),
    [
      state,
      isDirty,
      canSubmit,
      canSave,
      pendingZeroAllocations,
      showZeroReasonDialog,
      setAllocation,
      saveAll,
      submit,
      snapshot,
      fetchSession,
    ],
  );

  return (
    <ComparativeContext.Provider value={contextValue}>
      {children}
    </ComparativeContext.Provider>
  );
}

// ============================================================
// HOOK — useComparativeEvaluation
// ============================================================
export function useComparativeEvaluation() {
  const context = useContext(ComparativeContext);
  if (!context) {
    throw new Error(
      "useComparativeEvaluation must be used within a ComparativeProvider",
    );
  }
  return context;
}

// ============================================================
// SECONDARY HOOKS — List-level data (no context needed)
// ============================================================
export { default as useComparativeRounds } from "./useComparativeRounds";
