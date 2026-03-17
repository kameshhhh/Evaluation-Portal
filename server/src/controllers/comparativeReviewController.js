// ============================================================
// COMPARATIVE REVIEW CONTROLLER — Request Handlers
// ============================================================
// Standalone module — no overlap with session planner or other modules.
// ============================================================

"use strict";

const comparativeReviewService = require("../services/ComparativeReviewService");
const logger = require("../utils/logger");

// ============================================================
// ADMIN — Round Management
// ============================================================

const createRound = async (req, res) => {
  try {
    const { month, segment, track, batchYear, semester, markPool } = req.body;

    if (!month || !segment || !track) {
      return res.status(400).json({ success: false, error: "month, segment, and track are required." });
    }

    const result = await comparativeReviewService.createRound({
      month, segment, track, batchYear, semester, markPool,
      createdBy: req.user.personId,
    });

    if (result.duplicate) {
      return res.json({ success: true, data: result.round, duplicate: true,
        message: `Round "${result.round.title}" already exists.` });
    }

    res.status(201).json({ success: true, data: result.round });
  } catch (err) {
    logger.error("Failed to create comparative review round", { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message || "Failed to create round." });
  }
};

const listRounds = async (req, res) => {
  try {
    const { track, status, batchYear } = req.query;
    const rounds = await comparativeReviewService.listRounds({ track, status, batchYear });
    res.json({ success: true, data: rounds });
  } catch (err) {
    logger.error("Failed to list comparative review rounds", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to list rounds." });
  }
};

const getRoundDetail = async (req, res) => {
  try {
    const round = await comparativeReviewService.getRoundDetail(req.params.roundId);
    if (!round) return res.status(404).json({ success: false, error: "Round not found." });
    res.json({ success: true, data: round });
  } catch (err) {
    logger.error("Failed to get round detail", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get round detail." });
  }
};

const updateRound = async (req, res) => {
  try {
    const { status, title } = req.body;
    const round = await comparativeReviewService.updateRound(req.params.roundId, { status, title });
    if (!round) return res.status(404).json({ success: false, error: "Round not found." });
    res.json({ success: true, data: round });
  } catch (err) {
    logger.error("Failed to update round", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to update round." });
  }
};

const getAvailableTeams = async (req, res) => {
  try {
    const teams = await comparativeReviewService.getAvailableTeams(req.params.roundId);
    res.json({ success: true, data: teams });
  } catch (err) {
    logger.error("Failed to get available teams", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get available teams." });
  }
};

const createPairing = async (req, res) => {
  try {
    const { teamIds, soloPersonIds } = req.body;
    const hasTeams = Array.isArray(teamIds) && teamIds.length > 0;
    const hasSolo = Array.isArray(soloPersonIds) && soloPersonIds.length > 0;
    const totalCount = (hasTeams ? teamIds.length : 0) + (hasSolo ? soloPersonIds.length : 0);
    if (totalCount < 2) {
      return res.status(400).json({ success: false, error: "At least 2 teams or solo students required." });
    }
    const pairing = await comparativeReviewService.createPairing(req.params.roundId, teamIds || [], soloPersonIds || []);
    res.status(201).json({ success: true, data: pairing });
  } catch (err) {
    logger.error("Failed to create pairing", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to create pairing." });
  }
};

const assignFaculty = async (req, res) => {
  try {
    const { facultyId } = req.body;
    if (!facultyId) return res.status(400).json({ success: false, error: "facultyId is required." });
    const pairing = await comparativeReviewService.assignFaculty(req.params.pairingId, facultyId);
    if (!pairing) return res.status(404).json({ success: false, error: "Pairing not found." });
    res.json({ success: true, data: pairing });
  } catch (err) {
    logger.error("Failed to assign faculty", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to assign faculty." });
  }
};

const deletePairing = async (req, res) => {
  try {
    const pairing = await comparativeReviewService.deletePairing(req.params.pairingId);
    if (!pairing) return res.status(404).json({ success: false, error: "Pairing not found or already marked." });
    res.json({ success: true, data: pairing });
  } catch (err) {
    logger.error("Failed to delete pairing", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to delete pairing." });
  }
};

const deleteRound = async (req, res) => {
  try {
    const result = await comparativeReviewService.deleteRound(req.params.roundId);
    if (!result) return res.status(404).json({ success: false, error: "Round not found or already finalized." });
    res.json({ success: true, data: { message: "Round deleted." } });
  } catch (err) {
    logger.error("Failed to delete round", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to delete round." });
  }
};

const finalizeRound = async (req, res) => {
  try {
    const result = await comparativeReviewService.finalizeRound(req.params.roundId);
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, data: result.round });
  } catch (err) {
    logger.error("Failed to finalize round", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to finalize round." });
  }
};

// ============================================================
// FACULTY — My pairings + submit marks
// ============================================================

const getMyPairings = async (req, res) => {
  try {
    const pairings = await comparativeReviewService.getMyPairings(req.user.personId);
    res.json({ success: true, data: pairings });
  } catch (err) {
    logger.error("Failed to get faculty pairings", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get pairings." });
  }
};

const getPairingDetail = async (req, res) => {
  try {
    const detail = await comparativeReviewService.getPairingDetail(req.params.pairingId);
    if (!detail) return res.status(404).json({ success: false, error: "Pairing not found." });
    res.json({ success: true, data: detail });
  } catch (err) {
    logger.error("Failed to get pairing detail", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get pairing detail." });
  }
};

const submitMarks = async (req, res) => {
  try {
    const { marks } = req.body;
    if (!marks || !Array.isArray(marks)) {
      return res.status(400).json({ success: false, error: "marks array is required." });
    }
    const result = await comparativeReviewService.submitMarks(
      req.params.pairingId, req.user.personId, marks
    );
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error("Failed to submit marks", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to submit marks." });
  }
};

// ============================================================
// STUDENT — My reviews
// ============================================================

const getMyReviews = async (req, res) => {
  try {
    const reviews = await comparativeReviewService.getMyReviews(req.user.personId);
    res.json({ success: true, data: reviews });
  } catch (err) {
    logger.error("Failed to get student reviews", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get reviews." });
  }
};

// ============================================================
// RANKINGS — Global (accessible to all authenticated users)
// ============================================================

const getGlobalRankings = async (req, res) => {
  try {
    const { track } = req.query;
    const rankings = await comparativeReviewService.getGlobalRankings({ track });
    res.json({ success: true, data: rankings });
  } catch (err) {
    logger.error("Failed to get global rankings", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get rankings." });
  }
};

// ============================================================
// HELPER — Faculty list for assignment dropdown
// ============================================================

const getAllFaculty = async (req, res) => {
  try {
    const faculty = await comparativeReviewService.getAllFaculty();
    res.json({ success: true, data: faculty });
  } catch (err) {
    logger.error("Failed to get faculty list", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to get faculty." });
  }
};

module.exports = {
  createRound,
  listRounds,
  getRoundDetail,
  updateRound,
  deleteRound,
  getAvailableTeams,
  createPairing,
  assignFaculty,
  deletePairing,
  finalizeRound,
  getMyPairings,
  getPairingDetail,
  submitMarks,
  getMyReviews,
  getGlobalRankings,
  getAllFaculty,
};
