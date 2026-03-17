// ============================================================
// COMPARATIVE REVIEW ROUTES — Head-to-Head Team Comparison API
// ============================================================
// Mounted at: /api/comparative-review
// Completely standalone module — no overlap with session planner.
//
// Sections:
//   1. Admin — Round & pairing management
//   2. Faculty — View pairings & submit relative marks
//   3. Student — View reviews & opponent projects
//   4. Rankings — Global team rankings (all authenticated users)
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
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
} = require("../controllers/comparativeReviewController");

// ============================================================
// 1. ADMIN — Round & Pairing Management
// ============================================================
router.post("/rounds", authenticate, authorize("admin"), createRound);
router.get("/rounds", authenticate, authorize("admin"), listRounds);
router.get("/rounds/:roundId", authenticate, authorize("admin"), getRoundDetail);
router.put("/rounds/:roundId", authenticate, authorize("admin"), updateRound);
router.delete("/rounds/:roundId", authenticate, authorize("admin"), deleteRound);
router.get("/rounds/:roundId/available-teams", authenticate, authorize("admin"), getAvailableTeams);
router.post("/rounds/:roundId/pairings", authenticate, authorize("admin"), createPairing);
router.put("/pairings/:pairingId/assign-faculty", authenticate, authorize("admin"), assignFaculty);
router.delete("/pairings/:pairingId", authenticate, authorize("admin"), deletePairing);
router.put("/rounds/:roundId/finalize", authenticate, authorize("admin"), finalizeRound);
router.get("/faculty-list", authenticate, authorize("admin"), getAllFaculty);

// ============================================================
// 2. FACULTY — View Pairings & Submit Marks
// ============================================================
router.get("/my-pairings", authenticate, authorize("faculty"), getMyPairings);
router.get("/pairings/:pairingId/detail", authenticate, authorize("faculty", "admin"), getPairingDetail);
router.post("/pairings/:pairingId/marks", authenticate, authorize("faculty"), submitMarks);

// ============================================================
// 3. STUDENT — View Reviews
// ============================================================
router.get("/my-reviews", authenticate, authorize("student"), getMyReviews);

// ============================================================
// 4. RANKINGS — Global (all authenticated users)
// ============================================================
router.get("/rankings", authenticate, getGlobalRankings);

module.exports = router;
