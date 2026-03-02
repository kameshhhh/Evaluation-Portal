// ============================================================
// PEER RANKING CONTROLLER — Student-Facing Peer Survey API
// ============================================================
// Implements SRS §4.5: Peer Ranking Surveys
//
// ARCHITECTURE: Uses PeerRankingSchemaAdapter as bridge between
// the student-facing API and PeerRankingSafeguardService.js.
// Never calls the safeguard service directly for student ops —
// always routes through the adapter for schema translation.
//
// PRIVACY (SRS §4.5.3):
//   - No endpoint exposes individual peerId → rank mappings
//   - Aggregated results only via getResults
//   - Peer groups visible only to owning student
//
// ERROR HANDLING: Empathetic messages for peer ranking context.
// Peer ranking is sensitive — errors should be supportive.
//
// @see SRS §4.5.1 — Peer group creation
// @see SRS §4.5.2 — Forced ranking with limited top positions
// @see SRS §4.5.3 — Ethical safeguards
// ============================================================

"use strict";

const PeerRankingSchemaAdapter = require("../services/analytics/PeerRankingSchemaAdapter");
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// Empathetic error messages (SRS: peer ranking is sensitive)
// ============================================================
const EMPATHETIC_ERRORS = {
  SELF_RANKING:
    "You've been automatically excluded from your own ranking — this ensures fairness for everyone.",
  DUPLICATE_SUBMISSION:
    "It looks like you've already shared your perspective on this survey. Each voice counts once to keep things fair.",
  GROUP_TOO_SMALL:
    "Your peer group needs at least 5 members to ensure meaningful and anonymous rankings.",
  GROUP_TOO_LARGE:
    "For the best experience, peer groups are limited to 15 members.",
  INVALID_RANKS:
    "Please make sure each peer has a unique rank (1, 2, 3...) — tied rankings aren't allowed to ensure honest comparisons.",
  SURVEY_CLOSED:
    "This survey has closed. Your insights are valued, but we need to respect the timeline for fairness.",
  NOT_FOUND:
    "We couldn't find what you're looking for. It may have been completed or is no longer available.",
  ALREADY_SUBMITTED:
    "You've already submitted your ranking for this survey. Thank you for participating!",
  DRAFT_AFTER_SUBMIT:
    "Your final ranking has already been submitted — it can't be changed to ensure fairness for all participants.",
};

/**
 * Map technical errors to empathetic messages.
 * @param {Error} err - Original error
 * @returns {string} User-friendly message
 */
const toEmpathetic = (err) => {
  const msg = err.message || "";
  if (msg.includes("Self-ranking")) return EMPATHETIC_ERRORS.SELF_RANKING;
  if (msg.includes("Duplicate")) return EMPATHETIC_ERRORS.DUPLICATE_SUBMISSION;
  if (msg.includes("between 5 and 15"))
    return EMPATHETIC_ERRORS.GROUP_TOO_SMALL;
  if (msg.includes("already submitted"))
    return EMPATHETIC_ERRORS.ALREADY_SUBMITTED;
  if (msg.includes("closed")) return EMPATHETIC_ERRORS.SURVEY_CLOSED;
  if (msg.includes("cannot save draft"))
    return EMPATHETIC_ERRORS.DRAFT_AFTER_SUBMIT;
  if (msg.includes("consecutive")) return EMPATHETIC_ERRORS.INVALID_RANKS;
  return msg;
};

// ============================================================
// PEER GROUP ENDPOINTS — SRS §4.5.1
// ============================================================

/**
 * POST /api/peer-ranking/groups
 * Create a private peer group (student-only).
 *
 * @description SRS §4.5.1: "Students may define a peer group.
 * Network stored privately."
 * @security Only the authenticated student can create their own group.
 * @constraint 5-15 peers, no self-inclusion, no duplicates.
 *
 * Body: { groupName, peerIds: string[], refreshPeriod? }
 */
const createPeerGroup = async (req, res) => {
  try {
    const { groupName, peerIds, refreshPeriod } = req.body;

    if (!groupName || !peerIds || !Array.isArray(peerIds)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a group name and select your peers.",
      });
    }

    const group = await PeerRankingSchemaAdapter.createPeerGroup(
      req.user.personId,
      { groupName, peerIds, refreshPeriod },
    );

    broadcastChange("peer_ranking", "created", {
      id: group.id || group.group_id,
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    logger.error("createPeerGroup failed", {
      error: err.message,
      userId: req.user?.userId,
    });
    const status = err.message.includes("between 5 and 15") ? 422 : 500;
    res.status(status).json({ success: false, error: toEmpathetic(err) });
  }
};

/**
 * GET /api/peer-ranking/groups
 * Get the student's active peer groups.
 *
 * @security Privacy-safe: only returns groups owned by the requesting student.
 * @see SRS §4.5.1
 */
const getMyPeerGroups = async (req, res) => {
  try {
    const groups = await PeerRankingSchemaAdapter.getStudentPeerGroups(
      req.user.personId,
    );
    res.json({ success: true, data: groups });
  } catch (err) {
    logger.error("getMyPeerGroups failed", { error: err.message });
    res
      .status(500)
      .json({ success: false, error: EMPATHETIC_ERRORS.NOT_FOUND });
  }
};

/**
 * DELETE /api/peer-ranking/groups/:groupId
 * Deactivate a peer group (soft delete).
 *
 * @security Only the owning student can deactivate.
 */
const deletePeerGroup = async (req, res) => {
  try {
    const result = await PeerRankingSchemaAdapter.deactivatePeerGroup(
      req.user.personId,
      req.params.groupId,
    );
    broadcastChange("peer_ranking", "deleted", { id: req.params.groupId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("deletePeerGroup failed", { error: err.message });
    res.status(404).json({ success: false, error: toEmpathetic(err) });
  }
};

/**
 * GET /api/peer-ranking/available-peers
 * Get peers available for group creation (from department/projects).
 *
 * @security Returns display info only (name, department).
 * @see SRS §4.5.1
 */
const getAvailablePeers = async (req, res) => {
  try {
    const peers = await PeerRankingSchemaAdapter.getAvailablePeers(
      req.user.personId,
    );
    res.json({ success: true, data: peers });
  } catch (err) {
    logger.error("getAvailablePeers failed", { error: err.message });
    res
      .status(500)
      .json({ success: false, error: "Could not load available peers." });
  }
};

// ============================================================
// SURVEY ENDPOINTS — SRS §4.5.2
// ============================================================

/**
 * GET /api/peer-ranking/traits
 * Get the system's default trait questions for surveys.
 *
 * @description SRS §4.5.2: "System presents questions like:
 * 'Who is strongest in English?' 'Who shows leadership?'"
 */
const getTraitQuestions = async (req, res) => {
  try {
    const traits = await PeerRankingSchemaAdapter.getTraitQuestions();
    res.json({ success: true, data: traits });
  } catch (err) {
    logger.error("getTraitQuestions failed", { error: err.message });
    res
      .status(500)
      .json({ success: false, error: "Could not load survey questions." });
  }
};

/**
 * GET /api/peer-ranking/surveys
 * Get active surveys available to the student.
 *
 * @security Only surveys where student is participant.
 * Includes submission status and draft data.
 * @see SRS §4.5.2
 */
const getActiveSurveys = async (req, res) => {
  try {
    const surveys = await PeerRankingSchemaAdapter.getActiveSurveys(
      req.user.personId,
    );
    res.json({ success: true, data: surveys });
  } catch (err) {
    logger.error("getActiveSurveys failed", { error: err.message });
    res.status(500).json({ success: false, error: "Could not load surveys." });
  }
};

/**
 * POST /api/peer-ranking/surveys/create
 * Student-initiated survey creation from default traits.
 *
 * @description Student picks a peer group + trait questions → system creates survey
 * with createdBy=userId and initiation_mode='student'.
 * @security Survey linked privately to student's group.
 * @constraint Group must have 5+ members.
 * @see SRS §4.5.1, §4.5.2
 *
 * Body: { groupId, traitKeys: string[] }
 */
const createStudentSurvey = async (req, res) => {
  try {
    const { groupId, traitKeys } = req.body;

    if (
      !groupId ||
      !traitKeys ||
      !Array.isArray(traitKeys) ||
      traitKeys.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Please select a peer group and at least one trait to evaluate.",
      });
    }

    const survey = await PeerRankingSchemaAdapter.createStudentSurvey(
      req.user.personId,
      groupId,
      traitKeys,
      req.user.userId,
    );

    broadcastChange("peer_ranking", "created", {
      id: survey.id || survey.survey_id,
    });
    res.status(201).json({ success: true, data: survey });
  } catch (err) {
    logger.error("createStudentSurvey failed", {
      error: err.message,
      userId: req.user?.userId,
    });
    const status = err.message.includes("at least 5")
      ? 422
      : err.message.includes("not found")
        ? 404
        : 500;
    res.status(status).json({ success: false, error: toEmpathetic(err) });
  }
};

/**
 * GET /api/peer-ranking/surveys/:surveyId/peers
 * Get the peers to rank for a specific survey.
 *
 * @security Self excluded. Display info only (name, dept).
 * @constraint SRS §4.5.3: Self-ranking prevention.
 * @see SRS §4.5.2, §4.5.3
 */
const getSurveyPeers = async (req, res) => {
  try {
    const peers = await PeerRankingSchemaAdapter.getSurveyPeers(
      req.params.surveyId,
      req.user.personId,
    );
    res.json({ success: true, data: peers });
  } catch (err) {
    logger.error("getSurveyPeers failed", { error: err.message });
    res
      .status(404)
      .json({ success: false, error: EMPATHETIC_ERRORS.NOT_FOUND });
  }
};

// ============================================================
// RANKING ENDPOINTS — SRS §4.5.2, §4.5.3
// ============================================================

/**
 * POST /api/peer-ranking/surveys/:surveyId/save-draft
 * Save ranking progress (auto-save or manual).
 *
 * @description Rankings saved as draft for resume later.
 * @security Draft stored per-student, not visible to others.
 * @constraint Cannot save draft after final submission.
 * @see SRS §4.5.2
 *
 * Body: { rankings: [{ questionIndex, rankings: [{ personId, rank }] }] }
 */
const saveDraft = async (req, res) => {
  try {
    const { rankings } = req.body;

    if (!rankings || !Array.isArray(rankings)) {
      return res.status(400).json({
        success: false,
        error: "Please provide your ranking data to save.",
      });
    }

    const result = await PeerRankingSchemaAdapter.saveDraft(
      req.params.surveyId,
      req.user.personId,
      rankings,
    );

    broadcastChange("peer_ranking", "draft_saved", { id: req.params.surveyId });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("saveDraft failed", { error: err.message });
    const status = err.message.includes("Already submitted") ? 409 : 500;
    res.status(status).json({ success: false, error: toEmpathetic(err) });
  }
};

/**
 * POST /api/peer-ranking/surveys/:surveyId/submit
 * Submit final ranking — irreversible.
 *
 * @description Passes through adapter to PeerRankingSafeguardService.
 * Service enforces: no self-ranking, no equal ranking,
 * limited top positions, duplicate prevention.
 *
 * @security Individual rankings stored but NEVER exposed (SRS §4.5.3).
 * @constraint Forced ranking: unique consecutive ranks, min 2 ranked.
 * @see SRS §4.5.2, §4.5.3
 *
 * Body: { rankings: [{ questionIndex, rankings: [{ personId, rank }] }] }
 */
const submitRanking = async (req, res) => {
  try {
    const { rankings } = req.body;

    if (!rankings || !Array.isArray(rankings)) {
      return res.status(400).json({
        success: false,
        error: "Please complete your ranking before submitting.",
      });
    }

    const result = await PeerRankingSchemaAdapter.adaptAndSubmit(
      req.params.surveyId,
      req.user.personId,
      rankings,
    );

    broadcastChange("peer_ranking", "submitted", { id: req.params.surveyId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error("submitRanking failed", {
      error: err.message,
      userId: req.user?.userId,
    });
    const status = err.message.includes("SRS 4.5.3")
      ? 422
      : err.message.includes("Duplicate") || err.message.includes("already")
        ? 409
        : err.message.includes("consecutive") ||
            err.message.includes("at least 2")
          ? 422
          : 500;
    res.status(status).json({ success: false, error: toEmpathetic(err) });
  }
};

/**
 * GET /api/peer-ranking/surveys/:surveyId/results
 * Get aggregated (anonymized) survey results.
 *
 * @description SRS §4.5.3: "Individual rankings are never revealed.
 * Only aggregated analytics are used."
 * Returns banded scores only.
 *
 * @security NO individual ranking data. Aggregate bands only.
 * @see SRS §4.5.3, §7.2
 */
const getSurveyResults = async (req, res) => {
  try {
    const results = await PeerRankingSchemaAdapter.getAggregatedResults(
      req.params.surveyId,
    );
    res.json({ success: true, data: results });
  } catch (err) {
    logger.error("getSurveyResults failed", { error: err.message });
    // SRS §4.5.3: If not enough respondents, give supportive message
    if (err.message.includes("at least")) {
      return res.status(422).json({
        success: false,
        error:
          "Not enough responses yet to generate anonymous results. We need at least 3 participants to protect everyone's privacy.",
      });
    }
    res
      .status(500)
      .json({ success: false, error: "Could not load results at this time." });
  }
};

// ============================================================
// Export all handlers
// ============================================================
module.exports = {
  createPeerGroup,
  getMyPeerGroups,
  deletePeerGroup,
  getAvailablePeers,
  getTraitQuestions,
  getActiveSurveys,
  createStudentSurvey,
  getSurveyPeers,
  saveDraft,
  submitRanking,
  getSurveyResults,
};
