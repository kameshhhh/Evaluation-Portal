// ============================================================
// APPEALS ROUTES — Student Score Appeals API
// ============================================================
// Mounted at: /api/appeals
// ============================================================

const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const {
  fileAppeal,
  checkEligibility,
  getMyAppeals,
  listAppeals,
  resolveAppeal,
} = require("../controllers/appealsController");
const { query } = require("../config/database");

// ── STUDENT ROUTES ──

// Student: get available sessions they can appeal for
router.get(
  "/available-sessions",
  authenticate,
  authorize("student"),
  async (req, res) => {
    try {
      const studentId = req.user.personId;
      const logger = require("../utils/logger");

      logger.info("📋 AVAILABLE-SESSIONS REQUEST", {
        studentId,
      });

      if (!studentId) {
        logger.error("❌ No studentId found");
        return res
          .status(400)
          .json({ success: false, error: "No student ID found" });
      }

      // Use the SAME query pattern as the working "My Results" page (scarcityController Step 3)
      const result = await query(
        `SELECT
           fes.id AS session_id,
           fes.title AS session_title,
           fes.status,
           COALESCE(AVG(spa.marks), 0) AS student_score,
           fes.finalized_at,
           5 AS scale_max,
           CASE WHEN sa.id IS NOT NULL THEN 'appealed' ELSE 'available' END as appeal_status
         FROM session_planner_assignments spa
         JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
         LEFT JOIN score_appeals sa ON sa.session_id = fes.id AND sa.student_id = $1
         WHERE spa.student_id = $1
           AND spa.status != 'removed'
           AND fes.finalized_at IS NOT NULL
         GROUP BY fes.id, fes.title, fes.status, fes.finalized_at, sa.id
         ORDER BY fes.finalized_at DESC`,
        [studentId]
      );

      logger.info("✅ AVAILABLE-SESSIONS RESPONSE", {
        studentId,
        sessionCount: result.rows.length,
        sessions: result.rows.map(r => ({
          id: r.session_id,
          title: r.session_title,
          score: r.student_score,
        })),
      });

      return res.json({ success: true, data: result.rows || [] });
    } catch (err) {
      const logger = require("../utils/logger");
      logger.error("❌ AVAILABLE-SESSIONS ERROR", {
        error: err.message,
        code: err.code,
        stack: err.stack,
      });
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Student: check if eligible to appeal
router.get(
  "/check/:sessionId",
  authenticate,
  authorize("student"),
  checkEligibility
);

// Student: file an appeal
router.post("/", authenticate, authorize("student"), fileAppeal);

// Student: see my appeals
router.get("/my", authenticate, authorize("student"), getMyAppeals);

// ── ADMIN ROUTES ──

// Admin: list all appeals (?status=pending)
router.get("/", authenticate, authorize("admin"), listAppeals);

// Admin: resolve an appeal
router.put("/:id", authenticate, authorize("admin"), resolveAppeal);

module.exports = router;
