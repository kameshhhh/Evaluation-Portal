"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");

// Helper: check if github_tokens table exists (cached per process lifecycle)
let _githubTableExists = null;
async function hasGithubTokensTable() {
  if (_githubTableExists !== null) return _githubTableExists;
  try {
    await query(`SELECT 1 FROM github_tokens LIMIT 0`);
    _githubTableExists = true;
  } catch (_) {
    _githubTableExists = false;
  }
  return _githubTableExists;
}

// Helper: check if meet_link column exists (cached per process lifecycle)
let _meetLinkColExists = null;
async function hasMeetLinkColumn() {
  if (_meetLinkColExists !== null) return _meetLinkColExists;
  try {
    await query(`SELECT meet_link FROM evaluation_schedules LIMIT 0`);
    _meetLinkColExists = true;
  } catch (_) {
    _meetLinkColExists = false;
  }
  return _meetLinkColExists;
}

// ============================================================
// GET /eval-activity/overview — Aggregated evaluation stats
// ============================================================
const getOverview = async (req, res) => {
  try {
    const gtExists = await hasGithubTokensTable();

    const result = await query(`
      SELECT
        (SELECT COUNT(DISTINCT p.person_id)
         FROM persons p
         JOIN users u ON u.internal_user_id = p.identity_id
         WHERE u.user_role = 'student' AND p.status = 'active' AND p.is_deleted = false
        ) AS total_students,

        (SELECT COUNT(DISTINCT spa.student_id)
         FROM session_planner_assignments spa
         WHERE spa.status != 'removed'
        ) AS assigned_students,

        (SELECT COUNT(DISTINCT spa.student_id)
         FROM session_planner_assignments spa
         WHERE spa.status IN ('evaluation_done', 'completed')
        ) AS evaluated_students,

        (SELECT COUNT(DISTINCT spa.student_id)
         FROM session_planner_assignments spa
         WHERE spa.status = 'assigned'
        ) AS pending_students,

        ${gtExists ? `(SELECT COUNT(*) FROM github_tokens gt WHERE gt.is_valid = true)` : `0`} AS github_tokens_linked,

        (SELECT COUNT(*)
         FROM faculty_evaluation_sessions fes
         WHERE fes.status = 'active'
        ) AS active_sessions,

        (SELECT COUNT(*)
         FROM faculty_evaluation_sessions fes
        ) AS total_sessions
    `);

    // Per-session breakdown
    const sessions = await query(`
      SELECT
        fes.id AS session_id,
        fes.title,
        fes.status,
        fes.session_date,
        fes.track,
        COUNT(DISTINCT spa.student_id) FILTER (WHERE spa.status != 'removed') AS assigned_count,
        COUNT(DISTINCT spa.student_id) FILTER (WHERE spa.status IN ('evaluation_done', 'completed')) AS evaluated_count,
        COUNT(DISTINCT spa.student_id) FILTER (WHERE spa.status = 'assigned') AS pending_count
      FROM faculty_evaluation_sessions fes
      LEFT JOIN session_planner_assignments spa ON spa.session_id = fes.id
      GROUP BY fes.id, fes.title, fes.status, fes.session_date, fes.track
      ORDER BY fes.created_at DESC
    `);

    return res.json({
      success: true,
      data: {
        ...result.rows[0],
        sessions: sessions.rows,
      },
    });
  } catch (error) {
    logger.error("getEvalActivityOverview failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to load overview" });
  }
};

// ============================================================
// GET /eval-activity/students — Paginated student list with filters
// ============================================================
const getStudents = async (req, res) => {
  try {
    const gtExists = await hasGithubTokensTable();
    const {
      sessionId,
      search,
      dateFrom,
      dateTo,
      status, // assigned | evaluated | not_assigned
      hasGithubToken, // true | false
      track, // core | it_core | premium
      scoreMin,
      scoreMax,
      admissionYear, // year-wise filter (e.g. 2022, 2023)
      batchYear, // graduation year filter
      page = 1,
      pageSize = 50,
    } = req.query;

    const params = [];
    const conditions = [`u.user_role = 'student'`, `p.status = 'active'`, `p.is_deleted = false`];
    let paramIdx = 0;

    // Search filter
    if (search) {
      paramIdx++;
      params.push(`%${search}%`);
      conditions.push(`(p.display_name ILIKE $${paramIdx} OR p.department_code ILIKE $${paramIdx} OR u.normalized_email ILIKE $${paramIdx})`);
    }

    // Track filter
    if (track) {
      paramIdx++;
      params.push(track);
      conditions.push(`sts.track = $${paramIdx}`);
    }

    // Year-wise filters
    if (admissionYear) {
      paramIdx++;
      params.push(parseInt(admissionYear));
      conditions.push(`p.admission_year = $${paramIdx}`);
    }
    if (batchYear) {
      paramIdx++;
      params.push(parseInt(batchYear));
      conditions.push(`p.graduation_year = $${paramIdx}`);
    }

    // GitHub token filter (only if table exists)
    if (gtExists && hasGithubToken === "true") {
      conditions.push(`gt.id IS NOT NULL AND gt.is_valid = true`);
    } else if (gtExists && hasGithubToken === "false") {
      conditions.push(`(gt.id IS NULL OR gt.is_valid = false)`);
    }

    // Session filter
    if (sessionId) {
      paramIdx++;
      params.push(sessionId);
      conditions.push(`spa.session_id = $${paramIdx}`);
    }

    // Status filter
    if (status === "assigned") {
      conditions.push(`spa.id IS NOT NULL AND spa.status = 'assigned'`);
    } else if (status === "evaluated") {
      conditions.push(`spa.id IS NOT NULL AND spa.status IN ('evaluation_done', 'completed')`);
    } else if (status === "not_assigned") {
      conditions.push(`spa.id IS NULL`);
    }

    // Date range filter
    if (dateFrom) {
      paramIdx++;
      params.push(dateFrom);
      conditions.push(`(spa.created_at >= $${paramIdx}::date OR fes.session_date >= $${paramIdx}::date)`);
    }
    if (dateTo) {
      paramIdx++;
      params.push(dateTo);
      conditions.push(`(spa.created_at <= ($${paramIdx}::date + interval '1 day') OR fes.session_date <= ($${paramIdx}::date + interval '1 day'))`);
    }

    // Score filter
    if (scoreMin) {
      paramIdx++;
      params.push(parseFloat(scoreMin));
      conditions.push(`COALESCE(spa.marks, 0) >= $${paramIdx}`);
    }
    if (scoreMax) {
      paramIdx++;
      params.push(parseFloat(scoreMax));
      conditions.push(`COALESCE(spa.marks, 0) <= $${paramIdx}`);
    }

    const whereClause = conditions.join(" AND ");

    const gtJoin = gtExists ? `LEFT JOIN github_tokens gt ON gt.person_id = p.person_id` : ``;
    const gtSelectCount = gtExists ? `, gt.github_username, gt.is_valid, gt.updated_at, gt.created_at` : ``;
    const gtGroupBy = gtExists ? `, gt.github_username, gt.is_valid, gt.updated_at, gt.created_at` : ``;

    // Count total
    const countSql = `
      SELECT COUNT(DISTINCT p.person_id) AS total
      FROM persons p
      JOIN users u ON u.internal_user_id = p.identity_id
      LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
      ${gtJoin}
      LEFT JOIN session_planner_assignments spa ON spa.student_id = p.person_id AND spa.status != 'removed'
      LEFT JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      WHERE ${whereClause}
    `;
    const countRes = await query(countSql, params);

    // Fetch students with aggregated info
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    paramIdx++;
    params.push(parseInt(pageSize));
    const limitParam = paramIdx;
    paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx;

    const dataSql = `
      SELECT
        p.person_id,
        p.display_name,
        p.department_code,
        p.admission_year,
        p.graduation_year AS batch_year,
        u.normalized_email AS email,
        sts.track
        ${gtExists ? `,
        gt.github_username,
        gt.is_valid AS has_github_token,
        gt.updated_at AS github_token_updated_at,
        gt.created_at AS github_token_created_at` : ``},
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status != 'removed') AS total_assignments,
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status IN ('evaluation_done', 'completed')) AS evaluations_done,
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status = 'assigned') AS evaluations_pending,
        (SELECT json_agg(json_build_object(
           'sessionId', spa3.session_id,
           'sessionTitle', fes3.title,
           'status', spa3.status,
           'marks', spa3.marks,
           'facultyName', fp3.display_name,
           'marksSubmittedAt', spa3.marks_submitted_at
         ) ORDER BY fes3.created_at DESC)
         FROM session_planner_assignments spa3
         JOIN faculty_evaluation_sessions fes3 ON fes3.id = spa3.session_id
         JOIN persons fp3 ON fp3.person_id = spa3.faculty_id
         WHERE spa3.student_id = p.person_id AND spa3.status != 'removed'
        ) AS assignments
      FROM persons p
      JOIN users u ON u.internal_user_id = p.identity_id
      LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
      ${gtJoin}
      LEFT JOIN session_planner_assignments spa ON spa.student_id = p.person_id AND spa.status != 'removed'
      LEFT JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      WHERE ${whereClause}
      GROUP BY p.person_id, p.display_name, p.department_code, p.admission_year, p.graduation_year,
               u.normalized_email, sts.track${gtGroupBy}
      ORDER BY p.display_name
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const dataRes = await query(dataSql, params);

    return res.json({
      success: true,
      data: {
        students: dataRes.rows,
        total: parseInt(countRes.rows[0].total),
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    });
  } catch (error) {
    logger.error("getEvalActivityStudents failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to load students" });
  }
};

// ============================================================
// GET /eval-activity/students/:personId/detail — Single student deep-dive
// ============================================================
const getStudentDetail = async (req, res) => {
  try {
    const { personId } = req.params;
    const gtExists = await hasGithubTokensTable();
    const mlExists = await hasMeetLinkColumn();

    // Student info
    const studentRes = await query(
      `SELECT
         p.person_id, p.display_name, p.department_code, p.admission_year,
         p.graduation_year AS batch_year,
         u.normalized_email AS email,
         sts.track
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
       WHERE p.person_id = $1`,
      [personId]
    );
    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    // GitHub token status (safe)
    let githubToken = null;
    if (gtExists) {
      try {
        const tokenRes = await query(
          `SELECT github_username, github_avatar_url, is_valid, token_scopes,
                  last_validated_at, created_at, updated_at
           FROM github_tokens WHERE person_id = $1`,
          [personId]
        );
        githubToken = tokenRes.rows[0] || null;
      } catch (_) {}
    }

    // All assignments with detailed info
    const meetLinkSelect = mlExists ? `, es.meet_link` : ``;
    const assignmentsRes = await query(
      `SELECT
         spa.id AS assignment_id,
         spa.session_id,
         fes.title AS session_title,
         fes.status AS session_status,
         fes.session_date,
         fes.track AS session_track,
         spa.status AS assignment_status,
         spa.marks,
         spa.feedback,
         spa.marks_submitted_at,
         spa.rubric_marks,
         spa.created_at AS assigned_at,
         fp.display_name AS faculty_name,
         fp.person_id AS faculty_id,
         es.scheduled_date,
         es.scheduled_time,
         es.venue
         ${meetLinkSelect}
       FROM session_planner_assignments spa
       JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
       JOIN persons fp ON fp.person_id = spa.faculty_id
       LEFT JOIN evaluation_schedules es ON es.session_id = spa.session_id
         AND es.student_id = spa.student_id AND es.faculty_id = spa.faculty_id
       WHERE spa.student_id = $1 AND spa.status != 'removed'
       ORDER BY fes.created_at DESC`,
      [personId]
    );

    return res.json({
      success: true,
      data: {
        student: studentRes.rows[0],
        githubToken,
        assignments: assignmentsRes.rows,
        summary: {
          totalAssignments: assignmentsRes.rows.length,
          evaluationsDone: assignmentsRes.rows.filter(a => ['evaluation_done', 'completed'].includes(a.assignment_status)).length,
          evaluationsPending: assignmentsRes.rows.filter(a => a.assignment_status === 'assigned').length,
          hasGithubToken: !!githubToken?.is_valid,
        },
      },
    });
  } catch (error) {
    logger.error("getEvalActivityStudentDetail failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to load student detail" });
  }
};

// ============================================================
// GET /eval-activity/export — CSV export of filtered student data
// ============================================================
const exportStudents = async (req, res) => {
  try {
    const gtExists = await hasGithubTokensTable();
    const {
      sessionId,
      search,
      status,
      hasGithubToken,
      track,
      admissionYear,
      batchYear,
    } = req.query;

    const params = [];
    const conditions = [`u.user_role = 'student'`, `p.status = 'active'`, `p.is_deleted = false`];
    let paramIdx = 0;

    if (search) { paramIdx++; params.push(`%${search}%`); conditions.push(`(p.display_name ILIKE $${paramIdx} OR p.department_code ILIKE $${paramIdx})`); }
    if (track) { paramIdx++; params.push(track); conditions.push(`sts.track = $${paramIdx}`); }
    if (admissionYear) { paramIdx++; params.push(parseInt(admissionYear)); conditions.push(`p.admission_year = $${paramIdx}`); }
    if (batchYear) { paramIdx++; params.push(parseInt(batchYear)); conditions.push(`p.graduation_year = $${paramIdx}`); }
    if (gtExists && hasGithubToken === "true") conditions.push(`gt.id IS NOT NULL AND gt.is_valid = true`);
    else if (gtExists && hasGithubToken === "false") conditions.push(`(gt.id IS NULL OR gt.is_valid = false)`);
    if (sessionId) { paramIdx++; params.push(sessionId); conditions.push(`spa.session_id = $${paramIdx}`); }
    if (status === "assigned") conditions.push(`spa.id IS NOT NULL AND spa.status = 'assigned'`);
    else if (status === "evaluated") conditions.push(`spa.id IS NOT NULL AND spa.status IN ('evaluation_done', 'completed')`);
    else if (status === "not_assigned") conditions.push(`spa.id IS NULL`);

    const whereClause = conditions.join(" AND ");
    const gtJoin = gtExists ? `LEFT JOIN github_tokens gt ON gt.person_id = p.person_id` : ``;
    const gtSelectExport = gtExists
      ? `,\n        COALESCE(gt.github_username, 'Not Linked') AS "GitHub Username",\n        CASE WHEN gt.is_valid = true THEN 'Yes' ELSE 'No' END AS "GitHub Linked"`
      : `,\n        'N/A' AS "GitHub Username",\n        'N/A' AS "GitHub Linked"`;
    const gtGroupByExport = gtExists ? `, gt.github_username, gt.is_valid` : ``;

    const dataSql = `
      SELECT
        p.display_name AS "Student Name",
        p.department_code AS "Department",
        sts.track AS "Track",
        u.normalized_email AS "Email"
        ${gtSelectExport},
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status != 'removed') AS "Total Assignments",
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status IN ('evaluation_done', 'completed')) AS "Evaluations Done",
        (SELECT COUNT(*) FROM session_planner_assignments spa2
         WHERE spa2.student_id = p.person_id AND spa2.status = 'assigned') AS "Evaluations Pending"
      FROM persons p
      JOIN users u ON u.internal_user_id = p.identity_id
      LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
      ${gtJoin}
      LEFT JOIN session_planner_assignments spa ON spa.student_id = p.person_id AND spa.status != 'removed'
      LEFT JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      WHERE ${whereClause}
      GROUP BY p.person_id, p.display_name, p.department_code, sts.track,
               u.normalized_email${gtGroupByExport}
      ORDER BY p.display_name
    `;

    const dataRes = await query(dataSql, params);

    // Build CSV
    if (dataRes.rows.length === 0) {
      return res.status(200).send("No data");
    }
    const headers = Object.keys(dataRes.rows[0]);
    const csvRows = [headers.join(",")];
    for (const row of dataRes.rows) {
      csvRows.push(headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(","));
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=evaluation_activity.csv");
    return res.send(csvRows.join("\n"));
  } catch (error) {
    logger.error("exportEvalActivity failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to export data" });
  }
};

module.exports = {
  getOverview,
  getStudents,
  getStudentDetail,
  exportStudents,
};
