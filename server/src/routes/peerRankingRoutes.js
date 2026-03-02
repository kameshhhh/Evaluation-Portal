// ============================================================
// PEER RANKING ROUTES — Express Router for SRS §4.5
// ============================================================
// Mounts student-facing peer ranking endpoints:
//   - Peer group management (§4.5.1)
//   - Survey access & trait questions (§4.5.2)
//   - Ranking submission with drafts (§4.5.2)
//   - Aggregated results only (§4.5.3)
//
// All routes require authentication.
// No admin-only routes here — admin uses /api/analytics/peer-rankings.
//
// Mount: app.use("/api/peer-ranking", peerRankingRoutes)
// ============================================================

"use strict";

const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");

const {
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
} = require("../controllers/peerRankingController");

// ============================================================
// All routes require authentication
// ============================================================
router.use(authenticate);

// ============================================================
// PEER GROUP ROUTES — SRS §4.5.1
// ============================================================

// GET /api/peer-ranking/available-peers — Browse peers for group creation
router.get("/available-peers", getAvailablePeers);

// GET /api/peer-ranking/groups — Get my peer groups
router.get("/groups", getMyPeerGroups);

// POST /api/peer-ranking/groups — Create a private peer group
router.post("/groups", createPeerGroup);

// DELETE /api/peer-ranking/groups/:groupId — Deactivate a peer group
router.delete("/groups/:groupId", deletePeerGroup);

// ============================================================
// SURVEY ROUTES — SRS §4.5.2
// ============================================================

// GET /api/peer-ranking/traits — Get default trait questions
router.get("/traits", getTraitQuestions);

// GET /api/peer-ranking/surveys — Get active surveys for student
router.get("/surveys", getActiveSurveys);

// POST /api/peer-ranking/surveys/create — Student-initiated survey
router.post("/surveys/create", createStudentSurvey);

// GET /api/peer-ranking/surveys/:surveyId/peers — Get rankable peers
router.get("/surveys/:surveyId/peers", getSurveyPeers);

// ============================================================
// RANKING ROUTES — SRS §4.5.2, §4.5.3
// ============================================================

// POST /api/peer-ranking/surveys/:surveyId/save-draft — Save progress
router.post("/surveys/:surveyId/save-draft", saveDraft);

// POST /api/peer-ranking/surveys/:surveyId/submit — Final submission
router.post("/surveys/:surveyId/submit", submitRanking);

// GET /api/peer-ranking/surveys/:surveyId/results — Aggregated only
router.get("/surveys/:surveyId/results", getSurveyResults);

module.exports = router;
