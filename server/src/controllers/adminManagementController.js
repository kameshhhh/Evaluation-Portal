// ============================================================
// ADMIN MANAGEMENT CONTROLLER — Session Delete & Credibility Reset
// ============================================================
// DELETE /api/admin-manage/sessions/:sessionId  — Delete a session + all data
// POST   /api/admin-manage/credibility/reset    — Reset credibility (selected or all)
// GET    /api/admin-manage/sessions             — List all sessions (for admin management)
// GET    /api/admin-manage/credibility/faculty   — List faculty with credibility info
// ============================================================

"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");
const { broadcastChange, emitToAll, EVENTS } = require("../socket");

// ============================================================
// GET /api/admin-manage/sessions — List all sessions for management
// ============================================================
const listAllSessions = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         fes.id,
         fes.title,
         fes.status,
         fes.track,
         fes.group_id,
         fes.created_at,
         fes.session_date,
         fes.opens_at,
         fes.finalized_at,
         sg.title AS group_title,
         (SELECT COUNT(*) FROM session_planner_assignments spa
          WHERE spa.session_id = fes.id AND spa.status != 'removed') AS assignment_count,
         (SELECT COUNT(DISTINCT spa.student_id) FROM session_planner_assignments spa
          WHERE spa.session_id = fes.id AND spa.status != 'removed') AS student_count,
         (SELECT COUNT(DISTINCT spa.faculty_id) FROM session_planner_assignments spa
          WHERE spa.session_id = fes.id AND spa.status != 'removed') AS faculty_count,
         (SELECT COUNT(*) FROM final_student_results fsr
          WHERE fsr.session_id = fes.id) AS finalized_results_count
       FROM faculty_evaluation_sessions fes
       LEFT JOIN session_groups sg ON sg.id = fes.group_id
       ORDER BY COALESCE(fes.session_date, fes.opens_at, fes.created_at) DESC`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error("listAllSessions error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// DELETE /api/admin-manage/sessions/:sessionId — Delete session + cascade
// ============================================================
const deleteSession = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const { sessionId } = req.params;
    const adminId = req.user.personId;

    // Verify session exists
    const session = await client.query(
      `SELECT id, title, status, group_id FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Session not found." });
    }

    const sessionTitle = session.rows[0].title;
    const groupId = session.rows[0].group_id;

    await client.query("BEGIN");

    // 1. Delete non-cascading child tables first
    //    (tables that reference sessions WITHOUT ON DELETE CASCADE)
    await client.query(
      `DELETE FROM assignment_score_events WHERE session_id = $1`,
      [sessionId]
    );
    await client.query(
      `DELETE FROM final_student_results WHERE session_id = $1`,
      [sessionId]
    );
    await client.query(
      `DELETE FROM faculty_alerts WHERE session_id = $1`,
      [sessionId]
    );
    await client.query(
      `DELETE FROM score_appeals WHERE session_id = $1`,
      [sessionId]
    );

    // 2. Delete the session itself (cascading tables auto-cleanup)
    //    Tables with ON DELETE CASCADE: session_planner_assignments,
    //    faculty_evaluation_assignments, faculty_schedules,
    //    normalized_evaluation_scores, exposure_normalization_runs, etc.
    await client.query(
      `DELETE FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId]
    );

    // 3. If this was the last session in a group, delete the group too
    if (groupId) {
      const remaining = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM faculty_evaluation_sessions WHERE group_id = $1`,
        [groupId]
      );
      if (remaining.rows[0].cnt === 0) {
        await client.query(`DELETE FROM session_groups WHERE id = $1`, [groupId]);
        logger.info("Deleted empty session group", { groupId });
      }
    }

    await client.query("COMMIT");

    logger.info("Admin deleted session", {
      sessionId,
      sessionTitle,
      adminId,
    });

    // Real-time broadcast — all connected clients update immediately
    broadcastChange("session_planner", "session_deleted", {
      sessionId,
      sessionTitle,
    });
    emitToAll(EVENTS.FACULTY_SESSION_DELETED, {
      sessionId,
      title: sessionTitle,
      deletedBy: adminId,
    });

    return res.json({
      success: true,
      message: `Session "${sessionTitle}" and all associated data deleted successfully.`,
      data: { sessionId, sessionTitle },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("deleteSession error", { error: err.message, sessionId: req.params.sessionId });
    return res.status(500).json({ success: false, error: "Failed to delete session: " + err.message });
  } finally {
    client.release();
  }
};

// ============================================================
// GET /api/admin-manage/credibility/faculty — List faculty + credibility
// ============================================================
const listFacultyCredibility = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         p.person_id,
         p.display_name,
         u.normalized_email AS email,
         p.department_code,
         jcm.credibility_score,
         jcm.credibility_band,
         jcm.alignment_score,
         jcm.stability_score,
         jcm.discipline_score,
         jcm.deviation_index,
         jcm.participation_count,
         jcm.last_updated AS credibility_updated_at,
         (SELECT COUNT(DISTINCT spa.session_id)
          FROM session_planner_assignments spa
          WHERE spa.faculty_id = p.person_id AND spa.status != 'removed') AS sessions_evaluated
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = p.person_id
       WHERE u.user_role IN ('faculty', 'admin')
         AND p.is_deleted = false
       ORDER BY p.display_name`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error("listFacultyCredibility error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ============================================================
// POST /api/admin-manage/credibility/reset — Reset credibility
// Body: { facultyIds?: string[] }
//   - If facultyIds provided: reset only those faculty
//   - If empty/omitted: reset ALL faculty credibility
// ============================================================
const resetCredibility = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const { facultyIds } = req.body;
    const adminId = req.user.personId;

    await client.query("BEGIN");

    let resetCount = 0;

    if (facultyIds && Array.isArray(facultyIds) && facultyIds.length > 0) {
      // Reset SELECTED faculty only — ALL 3 credibility tables
      const result = await client.query(
        `UPDATE judge_credibility_metrics
         SET credibility_score = 1.0,
             display_score = NULL,
             alignment_score = NULL,
             stability_score = NULL,
             discipline_score = NULL,
             credibility_band = 'NEW',
             deviation_index = 0,
             participation_count = 0,
             history = '[]'::jsonb,
             last_updated = NOW()
         WHERE evaluator_id = ANY($1::uuid[])`,
        [facultyIds]
      );
      resetCount = result.rowCount;

      // Also reset evaluator_credibility_profiles (old scarcity pipeline)
      await client.query(
        `UPDATE evaluator_credibility_profiles
         SET credibility_score = 1.0,
             credibility_band = 'NEW',
             alignment_component = NULL,
             stability_component = NULL,
             discipline_component = NULL,
             session_count = 0,
             mean_alignment_deviation = NULL,
             alignment_deviation_variance = NULL,
             last_alignment_score = NULL,
             mean_pool_usage = NULL,
             mean_zero_ratio = NULL,
             profile_version = 0,
             updated_at = NOW()
         WHERE evaluator_id = ANY($1::uuid[])`,
        [facultyIds]
      );

      // Also reset evaluator_profiles (legacy table)
      await client.query(
        `UPDATE evaluator_profiles
         SET credibility_score = 1.0,
             total_evaluations = 0,
             deviation_score = 0,
             variance_score = 0,
             last_updated_at = NOW()
         WHERE person_id = ANY($1::uuid[])`,
        [facultyIds]
      );

      logger.info("Admin reset credibility (selected) — all 3 tables", {
        adminId,
        facultyIds,
        resetCount,
      });
    } else {
      // Reset ALL faculty credibility — ALL 3 tables
      const result = await client.query(
        `UPDATE judge_credibility_metrics
         SET credibility_score = 1.0,
             display_score = NULL,
             alignment_score = NULL,
             stability_score = NULL,
             discipline_score = NULL,
             credibility_band = 'NEW',
             deviation_index = 0,
             participation_count = 0,
             history = '[]'::jsonb,
             last_updated = NOW()`
      );
      resetCount = result.rowCount;

      // Also reset evaluator_credibility_profiles (old scarcity pipeline)
      await client.query(
        `UPDATE evaluator_credibility_profiles
         SET credibility_score = 1.0,
             credibility_band = 'NEW',
             alignment_component = NULL,
             stability_component = NULL,
             discipline_component = NULL,
             session_count = 0,
             mean_alignment_deviation = NULL,
             alignment_deviation_variance = NULL,
             last_alignment_score = NULL,
             mean_pool_usage = NULL,
             mean_zero_ratio = NULL,
             profile_version = 0,
             updated_at = NOW()`
      );

      // Also reset evaluator_profiles (legacy table)
      await client.query(
        `UPDATE evaluator_profiles
         SET credibility_score = 1.0,
             total_evaluations = 0,
             deviation_score = 0,
             variance_score = 0,
             last_updated_at = NOW()`
      );

      logger.info("Admin reset ALL credibility — all 3 tables", {
        adminId,
        resetCount,
      });
    }

    await client.query("COMMIT");

    // Real-time broadcast — credibility dashboard + reports update
    broadcastChange("credibility", "reset", {
      facultyIds: facultyIds || "all",
      resetCount,
      resetBy: adminId,
    });
    emitToAll(EVENTS.CREDIBILITY_UPDATED, {
      type: "reset",
      count: resetCount,
    });

    const scope = facultyIds?.length ? `${resetCount} selected faculty` : `all ${resetCount} faculty`;
    return res.json({
      success: true,
      message: `Credibility reset for ${scope}. All scores set to 1.0 (neutral).`,
      data: { resetCount },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("resetCredibility error", { error: err.message });
    return res.status(500).json({ success: false, error: "Failed to reset credibility: " + err.message });
  } finally {
    client.release();
  }
};

module.exports = {
  listAllSessions,
  deleteSession,
  listFacultyCredibility,
  resetCredibility,
};
