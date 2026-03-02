// ============================================================
// usePeerRanking — Custom Hook for Peer Ranking State
// ============================================================
// Manages all peer ranking state: groups, surveys, rankings.
// Implements click-to-assign ranking with undo, auto-save,
// and forced ranking validation.
//
// @see SRS §4.5.1 — Peer group management
// @see SRS §4.5.2 — Forced ranking constraints
// @see SRS §4.5.3 — Privacy (aggregated results only)
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as peerRankingApi from "../services/peerRankingApi";
import { useDataChange } from "./useSocketEvent";

// ============================================================
// VIEWS — UI state machine for the peer ranking flow
// ============================================================
const VIEWS = {
  LOADING: "loading",
  GROUP_SETUP: "group_setup", // No peer group yet → wizard
  SURVEY_LIST: "survey_list", // Has group → show available surveys
  RANKING: "ranking", // Inside a survey → rank peers
  RESULTS: "results", // Viewing aggregated results
  SUBMITTED: "submitted", // Just submitted successfully
};

/**
 * Custom hook for peer ranking survey system.
 *
 * @param {string} [initialSurveyId] - Optional survey ID from URL params
 * @returns {Object} State and action methods for peer ranking UI
 */
const usePeerRanking = (initialSurveyId = null) => {
  // ============================================================
  // State
  // ============================================================
  const [view, setView] = useState(VIEWS.LOADING);
  const [error, setError] = useState(null);

  // Peer groups (SRS §4.5.1)
  const [peerGroups, setPeerGroups] = useState([]);
  const [availablePeers, setAvailablePeers] = useState([]);

  // Surveys (SRS §4.5.2)
  const [surveys, setSurveys] = useState([]);
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [surveyPeers, setSurveyPeers] = useState([]);
  const [traitQuestions, setTraitQuestions] = useState([]);

  // Rankings — { questionIndex → { personId → rank } }
  const [rankings, setRankings] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Undo stack
  const [undoStack, setUndoStack] = useState([]);
  const MAX_UNDO = 20;

  // Auto-save interval
  const autoSaveRef = useRef(null);

  // Refresh trigger for real-time updates
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ============================================================
  // Initialization — Load groups, surveys, traits
  // ============================================================
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        const [groupsRes, surveysRes, traitsRes, peersRes] = await Promise.all([
          peerRankingApi.getMyPeerGroups(),
          peerRankingApi.getActiveSurveys(),
          peerRankingApi.getTraitQuestions(),
          peerRankingApi.getAvailablePeers(),
        ]);

        setPeerGroups(groupsRes.data || []);
        setSurveys(surveysRes.data || []);
        setTraitQuestions(traitsRes.data || []);
        setAvailablePeers(peersRes.data || []);

        // Decide initial view
        const groups = groupsRes.data || [];
        const surveyList = surveysRes.data || [];

        if (initialSurveyId) {
          // Direct link to a survey — load it
          const survey = surveyList.find((s) => s.surveyId === initialSurveyId);
          if (survey) {
            await loadSurvey(survey);
          } else {
            setView(VIEWS.SURVEY_LIST);
          }
        } else if (groups.length === 0 && surveyList.length === 0) {
          setView(VIEWS.GROUP_SETUP);
        } else {
          setView(VIEWS.SURVEY_LIST);
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        setView(VIEWS.SURVEY_LIST);
      } finally {
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSurveyId, refreshTrigger]);

  // ============================================================
  // Auto-save (60s interval when in ranking view)
  // ============================================================
  useEffect(() => {
    if (view === VIEWS.RANKING && activeSurvey && !submitting) {
      autoSaveRef.current = setInterval(() => {
        handleSaveDraft();
      }, 60000);
    }

    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
        autoSaveRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeSurvey, rankings, submitting]);

  // ============================================================
  // Peer Group Actions (SRS §4.5.1)
  // ============================================================

  const createGroup = useCallback(async (groupData) => {
    try {
      setError(null);
      const result = await peerRankingApi.createPeerGroup(groupData);
      // Refresh groups
      const groupsRes = await peerRankingApi.getMyPeerGroups();
      setPeerGroups(groupsRes.data || []);
      setView(VIEWS.SURVEY_LIST);
      return result;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  const removeGroup = useCallback(async (groupId) => {
    try {
      setError(null);
      await peerRankingApi.deletePeerGroup(groupId);
      setPeerGroups((prev) => prev.filter((g) => g.groupId !== groupId));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  const loadAvailablePeers = useCallback(async () => {
    try {
      const result = await peerRankingApi.getAvailablePeers();
      setAvailablePeers(result.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  // ============================================================
  // Survey Actions (SRS §4.5.2)
  // ============================================================

  const loadSurvey = useCallback(async (survey) => {
    try {
      setError(null);
      setActiveSurvey(survey);

      // Load peers for this survey
      const peersRes = await peerRankingApi.getSurveyPeers(survey.surveyId);
      setSurveyPeers(peersRes.data || []);

      // Restore draft if exists
      if (survey.hasDraft && survey.draftRankings) {
        const draftData =
          typeof survey.draftRankings === "string"
            ? JSON.parse(survey.draftRankings)
            : survey.draftRankings;
        // Convert array format to our state format { qIndex → { personId → rank } }
        const restored = {};
        if (Array.isArray(draftData)) {
          draftData.forEach((q) => {
            restored[q.questionIndex] = {};
            (q.rankings || []).forEach((r) => {
              restored[q.questionIndex][r.personId] = r.rank;
            });
          });
        }
        setRankings(restored);
      } else {
        setRankings({});
      }

      setCurrentQuestionIndex(0);
      setUndoStack([]);

      if (survey.status === "submitted") {
        setView(VIEWS.SUBMITTED);
      } else {
        setView(VIEWS.RANKING);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }, []);

  const createSurvey = useCallback(
    async (groupId, traitKeys) => {
      try {
        setError(null);
        const result = await peerRankingApi.createStudentSurvey({
          groupId,
          traitKeys,
        });

        // Refresh surveys and open the new one
        const surveysRes = await peerRankingApi.getActiveSurveys();
        setSurveys(surveysRes.data || []);

        const newSurvey = (surveysRes.data || []).find(
          (s) => s.surveyId === result.data?.survey_id,
        );
        if (newSurvey) {
          await loadSurvey(newSurvey);
        }
        return result;
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        throw err;
      }
    },
    [loadSurvey],
  );

  // ============================================================
  // Ranking Actions — Click-to-Assign (Option B)
  // ============================================================

  /**
   * Assign a rank to a peer for the current question.
   * SRS §4.5.2: Forced ranking — unique consecutive ranks.
   *
   * @param {string} personId - Peer to assign rank to
   * @param {number} rank - Rank number (1-based)
   */
  const assignRank = useCallback(
    (personId, rank) => {
      setRankings((prev) => {
        // Save undo state
        setUndoStack((stack) =>
          [JSON.parse(JSON.stringify(prev)), ...stack].slice(0, MAX_UNDO),
        );

        const qRankings = { ...(prev[currentQuestionIndex] || {}) };

        // If this rank is already assigned to another peer, remove it
        const existingHolder = Object.entries(qRankings).find(
          ([, r]) => r === rank,
        );
        if (existingHolder && existingHolder[0] !== personId) {
          delete qRankings[existingHolder[0]];
        }

        // If this peer already has a rank, remove old one
        if (qRankings[personId] !== undefined) {
          delete qRankings[personId];
        }

        // Assign new rank
        qRankings[personId] = rank;

        return { ...prev, [currentQuestionIndex]: qRankings };
      });
    },
    [currentQuestionIndex],
  );

  /**
   * Remove a peer's rank assignment.
   */
  const removeRank = useCallback(
    (personId) => {
      setRankings((prev) => {
        setUndoStack((stack) =>
          [JSON.parse(JSON.stringify(prev)), ...stack].slice(0, MAX_UNDO),
        );

        const qRankings = { ...(prev[currentQuestionIndex] || {}) };
        delete qRankings[personId];
        return { ...prev, [currentQuestionIndex]: qRankings };
      });
    },
    [currentQuestionIndex],
  );

  /**
   * Undo last ranking action.
   */
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [prevState, ...rest] = undoStack;
    setRankings(prevState);
    setUndoStack(rest);
  }, [undoStack]);

  /**
   * Clear all rankings for current question.
   */
  const clearCurrentQuestion = useCallback(() => {
    setRankings((prev) => {
      setUndoStack((stack) =>
        [JSON.parse(JSON.stringify(prev)), ...stack].slice(0, MAX_UNDO),
      );
      return { ...prev, [currentQuestionIndex]: {} };
    });
  }, [currentQuestionIndex]);

  // ============================================================
  // Save & Submit
  // ============================================================

  /**
   * Convert internal state to API format.
   * Internal: { questionIndex: { personId: rank } }
   * API: [{ questionIndex, rankings: [{ personId, rank }] }]
   */
  const toApiFormat = useCallback(() => {
    return Object.entries(rankings).map(([qIdx, peerRanks]) => ({
      questionIndex: parseInt(qIdx),
      rankings: Object.entries(peerRanks).map(([personId, rank]) => ({
        personId,
        rank,
      })),
    }));
  }, [rankings]);

  const handleSaveDraft = useCallback(async () => {
    if (!activeSurvey || submitting) return;
    try {
      setSaving(true);
      await peerRankingApi.saveDraft(activeSurvey.surveyId, toApiFormat());
      setLastSaved(new Date());
    } catch (err) {
      // Silent fail for auto-save — don't disrupt user
      console.warn("Auto-save failed:", err.message);
    } finally {
      setSaving(false);
    }
  }, [activeSurvey, submitting, toApiFormat]);

  const handleSubmit = useCallback(async () => {
    if (!activeSurvey) return;
    try {
      setSubmitting(true);
      setError(null);
      await peerRankingApi.submitRanking(activeSurvey.surveyId, toApiFormat());
      setView(VIEWS.SUBMITTED);

      // Refresh surveys
      const surveysRes = await peerRankingApi.getActiveSurveys();
      setSurveys(surveysRes.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }, [activeSurvey, toApiFormat]);

  // ============================================================
  // Computed Values
  // ============================================================

  /**
   * Current question's data (from survey config).
   */
  const currentQuestion = useMemo(() => {
    if (!activeSurvey?.questions) return null;
    const questions =
      typeof activeSurvey.questions === "string"
        ? JSON.parse(activeSurvey.questions)
        : activeSurvey.questions;
    return questions[currentQuestionIndex] || null;
  }, [activeSurvey, currentQuestionIndex]);

  /**
   * Current question's rankings.
   */
  const currentRankings = useMemo(() => {
    return rankings[currentQuestionIndex] || {};
  }, [rankings, currentQuestionIndex]);

  /**
   * Max rankings allowed for current question.
   */
  const maxRanks = useMemo(() => {
    if (!currentQuestion) return 3;
    return (
      currentQuestion.maxTopPositions || activeSurvey?.maxTopPositions || 3
    );
  }, [currentQuestion, activeSurvey]);

  /**
   * Total questions in the survey.
   */
  const totalQuestions = useMemo(() => {
    if (!activeSurvey?.questions) return 0;
    const questions =
      typeof activeSurvey.questions === "string"
        ? JSON.parse(activeSurvey.questions)
        : activeSurvey.questions;
    return questions.length;
  }, [activeSurvey]);

  /**
   * How many ranks are assigned for current question.
   */
  const ranksAssigned = useMemo(() => {
    return Object.keys(currentRankings).length;
  }, [currentRankings]);

  /**
   * Validation: can the user submit?
   * - Every question must have at least 2 ranked peers
   * - Cannot rank ALL peers in any question (scarcity)
   */
  const canSubmit = useMemo(() => {
    if (!activeSurvey?.questions || surveyPeers.length === 0) return false;
    const questions =
      typeof activeSurvey.questions === "string"
        ? JSON.parse(activeSurvey.questions)
        : activeSurvey.questions;

    for (let i = 0; i < questions.length; i++) {
      const qRanks = rankings[i] || {};
      const count = Object.keys(qRanks).length;
      if (count < 2) return false;
      if (count >= surveyPeers.length) return false; // scarcity rule
    }
    return true;
  }, [rankings, activeSurvey, surveyPeers]);

  /**
   * Per-question completion status.
   */
  const questionCompletionStatus = useMemo(() => {
    if (!activeSurvey?.questions) return [];
    const questions =
      typeof activeSurvey.questions === "string"
        ? JSON.parse(activeSurvey.questions)
        : activeSurvey.questions;

    return questions.map((_, i) => {
      const count = Object.keys(rankings[i] || {}).length;
      return { index: i, ranksAssigned: count, isComplete: count >= 2 };
    });
  }, [rankings, activeSurvey]);

  // ============================================================
  // Navigation
  // ============================================================

  const goToQuestion = useCallback((index) => {
    setCurrentQuestionIndex(index);
  }, []);

  const nextQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
  }, [totalQuestions]);

  const prevQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goBackToList = useCallback(() => {
    setActiveSurvey(null);
    setSurveyPeers([]);
    setRankings({});
    setCurrentQuestionIndex(0);
    setUndoStack([]);
    setError(null);
    setView(peerGroups.length > 0 ? VIEWS.SURVEY_LIST : VIEWS.GROUP_SETUP);
  }, [peerGroups]);

  const goToGroupSetup = useCallback(() => {
    setView(VIEWS.GROUP_SETUP);
  }, []);

  const viewResults = useCallback(() => {
    setView(VIEWS.RESULTS);
  }, []);

  // ============================================================
  // Real-time updates via Socket.IO
  // ============================================================
  useDataChange(["peer_ranking", "peer_group", "persons"], () =>
    setRefreshTrigger((t) => t + 1),
  );

  // ============================================================
  // Return
  // ============================================================
  return {
    // State
    view,
    error,
    loading,
    saving,
    submitting,
    lastSaved,

    // Peer groups
    peerGroups,
    availablePeers,
    createGroup,
    removeGroup,
    loadAvailablePeers,

    // Surveys
    surveys,
    activeSurvey,
    traitQuestions,
    surveyPeers,
    createSurvey,
    loadSurvey,

    // Rankings
    rankings,
    currentRankings,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    maxRanks,
    ranksAssigned,
    canSubmit,
    questionCompletionStatus,

    // Actions
    assignRank,
    removeRank,
    undo,
    clearCurrentQuestion,
    handleSaveDraft,
    handleSubmit,

    // Navigation
    goToQuestion,
    nextQuestion,
    prevQuestion,
    goBackToList,
    goToGroupSetup,
    viewResults,

    // Constants
    VIEWS,
  };
};

export default usePeerRanking;
