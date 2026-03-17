// ============================================================
// COMPARATIVE REVIEW SERVICE — Business Logic Layer
// ============================================================
// Handles all database operations for the Comparative Review Module.
// This is a completely standalone module — no overlap with session planner.
// ============================================================

"use strict";

const { query } = require("../config/database");
const logger = require("../utils/logger");
const { getCurrentAcademicYear, batchToYearLabel } = require("../utils/batchHelper");

class ComparativeReviewService {

  // ============================================================
  // ROUNDS — Admin CRUD
  // ============================================================

  /**
   * Create a new comparative review round with auto-naming (like session planner).
   * Title pattern: "{Mon} {S#} - Batch {year} [{TrackLabel}] CR"
   */
  async createRound({ month, segment, track, batchYear, semester, markPool, createdBy }) {
    const TRACK_LABELS = { core: "Core", it_core: "IT & Core", premium: "Premium" };
    const trackLabel = TRACK_LABELS[track] || track;
    const effBatchYear = batchYear ? parseInt(batchYear) : null;
    const effAcademicYear = getCurrentAcademicYear();
    const effSemester = semester ? parseInt(semester) : 1;
    const effMarkPool = markPool ? parseFloat(markPool) : 5.00;

    // Auto-generate title like session planner: "Mar S1 - Batch 2027 [Core] CR"
    const yearDisplay = effBatchYear ? `Batch ${effBatchYear}` : `AY ${effAcademicYear}`;
    const title = `${month} ${segment} - ${yearDisplay} [${trackLabel}] CR`;

    // Description
    const yearLabel = effBatchYear ? batchToYearLabel(effBatchYear) : "";
    const description = effBatchYear
      ? `Comparative Review | Batch ${effBatchYear} (${yearLabel}) | Track: ${trackLabel}`
      : `Comparative Review | Track: ${trackLabel}`;

    // Check for duplicate
    const existing = await query(
      `SELECT id, title FROM comparative_review_rounds WHERE title = $1`,
      [title]
    );
    if (existing.rows.length > 0) {
      return { duplicate: true, round: existing.rows[0] };
    }

    const result = await query(
      `INSERT INTO comparative_review_rounds
         (title, description, track, academic_year, semester, batch_year, mark_pool, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
       RETURNING *`,
      [title, description, track, effAcademicYear, effSemester, effBatchYear, effMarkPool, createdBy]
    );

    logger.info("Comparative review round created", { roundId: result.rows[0].id, title });
    return { duplicate: false, round: result.rows[0] };
  }

  /**
   * List all rounds with optional filters.
   */
  async listRounds({ track, status, batchYear } = {}) {
    let sql = `
      SELECT crr.*,
        p.display_name AS created_by_name,
        (SELECT COUNT(*) FROM comparative_review_pairings WHERE round_id = crr.id) AS pairing_count,
        (SELECT COUNT(*) FROM comparative_review_pairings WHERE round_id = crr.id AND status = 'marked') AS marked_count
      FROM comparative_review_rounds crr
      LEFT JOIN persons p ON p.person_id = crr.created_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (track) {
      sql += ` AND crr.track = $${idx++}`;
      params.push(track);
    }
    if (status) {
      sql += ` AND crr.status = $${idx++}`;
      params.push(status);
    }
    if (batchYear) {
      sql += ` AND crr.batch_year = $${idx++}`;
      params.push(parseInt(batchYear));
    }

    sql += ` ORDER BY crr.created_at DESC`;
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get round detail including all pairings, teams, and marks.
   */
  async getRoundDetail(roundId) {
    // Get round
    const roundRes = await query(
      `SELECT crr.*, p.display_name AS created_by_name
       FROM comparative_review_rounds crr
       LEFT JOIN persons p ON p.person_id = crr.created_by
       WHERE crr.id = $1`,
      [roundId]
    );
    if (roundRes.rows.length === 0) return null;
    const round = roundRes.rows[0];

    // Get pairings with faculty info
    const pairingsRes = await query(
      `SELECT crp.*,
        fp.display_name AS faculty_name
       FROM comparative_review_pairings crp
       LEFT JOIN persons fp ON fp.person_id = crp.faculty_id
       WHERE crp.round_id = $1
       ORDER BY crp.created_at ASC`,
      [roundId]
    );

    // For each pairing, get teams and marks
    const pairings = [];
    for (const pairing of pairingsRes.rows) {
      // Teams
      const teamsRes = await query(
        `SELECT crpt.*,
          tfr.leader_id, tfr.track, tfr.status AS team_status,
          proj.title AS project_title, proj.description AS project_description,
          lp.display_name AS leader_name,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = tfr.project_id AND pm.left_at IS NULL) AS member_count
         FROM comparative_review_pairing_teams crpt
         JOIN team_formation_requests tfr ON tfr.id = crpt.team_id
         LEFT JOIN projects proj ON proj.project_id = crpt.project_id
         LEFT JOIN persons lp ON lp.person_id = tfr.leader_id
         WHERE crpt.pairing_id = $1`,
        [pairing.id]
      );

      // Marks
      const marksRes = await query(
        `SELECT crm.*, fp.display_name AS faculty_name
         FROM comparative_review_marks crm
         LEFT JOIN persons fp ON fp.person_id = crm.faculty_id
         WHERE crm.pairing_id = $1`,
        [pairing.id]
      );

      pairings.push({
        ...pairing,
        teams: teamsRes.rows,
        marks: marksRes.rows,
      });
    }

    return { ...round, pairings };
  }

  /**
   * Update round (status transitions, title).
   */
  async updateRound(roundId, { status, title }) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (status) {
      fields.push(`status = $${idx++}`);
      params.push(status);
      if (status === "finalized") {
        fields.push(`finalized_at = NOW()`);
      }
    }
    if (title) {
      fields.push(`title = $${idx++}`);
      params.push(title);
    }
    fields.push(`updated_at = NOW()`);

    params.push(roundId);
    const result = await query(
      `UPDATE comparative_review_rounds SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  // ============================================================
  // AVAILABLE TEAMS — Teams in the round's track not yet paired
  // ============================================================

  async getAvailableTeams(roundId) {
    // Get round's track, year, semester
    const roundRes = await query(
      `SELECT track, academic_year, semester, batch_year FROM comparative_review_rounds WHERE id = $1`,
      [roundId]
    );
    if (roundRes.rows.length === 0) return [];
    const { track, batch_year } = roundRes.rows[0];

    // Part 1: Formal approved teams in this track, not yet paired in this round
    let teamSql = `
      SELECT tfr.id AS team_id, tfr.project_id, tfr.leader_id, tfr.track, tfr.status,
        tfr.academic_year, tfr.semester,
        proj.title AS project_title, proj.description AS project_description,
        lp.display_name AS leader_name, lp.admission_year,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = tfr.project_id AND pm.left_at IS NULL) AS member_count,
        (SELECT string_agg(mp.display_name, ', ')
         FROM project_members pm2
         JOIN persons mp ON mp.person_id = pm2.person_id
         WHERE pm2.project_id = tfr.project_id AND pm2.left_at IS NULL) AS member_names,
        'team' AS team_type,
        NULL::uuid AS person_id
      FROM team_formation_requests tfr
      JOIN projects proj ON proj.project_id = tfr.project_id
      JOIN persons lp ON lp.person_id = tfr.leader_id
      WHERE tfr.track = $1
        AND tfr.status = 'admin_approved'
        AND tfr.id NOT IN (
          SELECT crpt.team_id
          FROM comparative_review_pairing_teams crpt
          JOIN comparative_review_pairings crp ON crp.id = crpt.pairing_id
          WHERE crp.round_id = $2
        )
    `;
    const teamParams = [track, roundId];

    if (batch_year) {
      teamSql += ` AND lp.graduation_year = $3`;
      teamParams.push(batch_year);
    }

    teamSql += ` ORDER BY proj.title ASC`;
    const teamResult = await query(teamSql, teamParams);

    // Part 2: Solo students — on this track but not in any approved team
    let soloSql = `
      SELECT
        NULL::uuid AS team_id,
        proj.project_id,
        p.person_id AS leader_id,
        sts.track,
        'solo' AS status,
        sts.academic_year, sts.semester,
        proj.title AS project_title, proj.description AS project_description,
        p.display_name AS leader_name, p.admission_year,
        1 AS member_count,
        p.display_name AS member_names,
        'solo' AS team_type,
        p.person_id
      FROM persons p
      JOIN student_track_selections sts ON sts.person_id = p.person_id
      LEFT JOIN project_members pm ON pm.person_id = p.person_id AND pm.left_at IS NULL
      LEFT JOIN projects proj ON proj.project_id = pm.project_id
      WHERE p.person_type = 'student'
        AND p.status = 'active'
        AND p.is_deleted = false
        AND sts.track = $1
        AND p.person_id NOT IN (
          SELECT tfr2.leader_id FROM team_formation_requests tfr2
          WHERE tfr2.status = 'admin_approved'
        )
        AND p.person_id NOT IN (
          SELECT ti.invitee_id FROM team_invitations ti
          JOIN team_formation_requests tfr3 ON tfr3.id = ti.formation_id
          WHERE ti.status = 'accepted' AND tfr3.status = 'admin_approved'
        )
        AND p.person_id NOT IN (
          SELECT tfr4.leader_id FROM team_formation_requests tfr4
          JOIN comparative_review_pairing_teams crpt2 ON crpt2.team_id = tfr4.id
          JOIN comparative_review_pairings crp2 ON crp2.id = crpt2.pairing_id
          WHERE crp2.round_id = $2
        )
    `;
    const soloParams = [track, roundId];

    if (batch_year) {
      soloSql += ` AND p.graduation_year = $3`;
      soloParams.push(batch_year);
    }

    soloSql += ` ORDER BY p.display_name ASC`;
    const soloResult = await query(soloSql, soloParams);

    return [...teamResult.rows, ...soloResult.rows];
  }

  // ============================================================
  // PAIRINGS — Create, assign faculty, delete
  // ============================================================

  async createPairing(roundId, teamIds, soloPersonIds = []) {
    // Get round info for auto-creating solo student TFRs
    const roundRes = await query(
      `SELECT track, academic_year, semester FROM comparative_review_rounds WHERE id = $1`,
      [roundId]
    );
    if (roundRes.rows.length === 0) throw new Error("Round not found");
    const { track, academic_year, semester } = roundRes.rows[0];

    // Auto-create team_formation_requests for solo students
    const allTeamIds = [...teamIds];
    for (const personId of soloPersonIds) {
      // Check if student already has an active project
      const projRes = await query(
        `SELECT proj.project_id FROM project_members pm
         JOIN projects proj ON proj.project_id = pm.project_id
         WHERE pm.person_id = $1 AND pm.left_at IS NULL
         LIMIT 1`,
        [personId]
      );

      let projectId;
      if (projRes.rows.length > 0) {
        projectId = projRes.rows[0].project_id;
      } else {
        const nameRes = await query(
          `SELECT display_name FROM persons WHERE person_id = $1`,
          [personId]
        );
        const studentName = nameRes.rows[0]?.display_name || 'Solo Student';

        const newProj = await query(
          `INSERT INTO projects (title, academic_year, semester, start_date, expected_end_date, created_by, updated_by)
           VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', $4, $4)
           RETURNING project_id`,
          [`${studentName} - Solo Project`, academic_year, semester, personId]
        );
        projectId = newProj.rows[0].project_id;

        await query(
          `INSERT INTO project_members (project_id, person_id, role_in_project, joined_at, created_by)
           VALUES ($1, $2, 'Solo', NOW(), $2)`,
          [projectId, personId]
        );
      }

      // Create team_formation_request so pairing_teams FK is satisfied
      const tfrRes = await query(
        `INSERT INTO team_formation_requests (project_id, leader_id, track, status, academic_year, semester)
         VALUES ($1, $2, $3, 'admin_approved', $4, $5)
         RETURNING id`,
        [projectId, personId, track, academic_year, semester]
      );
      allTeamIds.push(tfrRes.rows[0].id);
    }

    // Get current pairing count for auto label
    const countRes = await query(
      `SELECT COUNT(*) AS cnt FROM comparative_review_pairings WHERE round_id = $1`,
      [roundId]
    );
    const pairingNumber = parseInt(countRes.rows[0].cnt) + 1;
    const pairingLabel = `Pairing ${pairingNumber}`;

    // Create pairing
    const pairingRes = await query(
      `INSERT INTO comparative_review_pairings (round_id, pairing_label, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [roundId, pairingLabel]
    );
    const pairing = pairingRes.rows[0];

    // Link teams to pairing
    for (const teamId of allTeamIds) {
      // Get project_id from team
      const teamRes = await query(
        `SELECT project_id FROM team_formation_requests WHERE id = $1`,
        [teamId]
      );
      const projectId = teamRes.rows[0]?.project_id || null;

      await query(
        `INSERT INTO comparative_review_pairing_teams (pairing_id, team_id, project_id)
         VALUES ($1, $2, $3)`,
        [pairing.id, teamId, projectId]
      );
    }

    // If round is draft, move to active
    await query(
      `UPDATE comparative_review_rounds SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND status = 'draft'`,
      [roundId]
    );

    logger.info("Comparative review pairing created", { pairingId: pairing.id, roundId, teamIds: allTeamIds, soloPersonIds });
    return pairing;
  }

  async assignFaculty(pairingId, facultyId) {
    const result = await query(
      `UPDATE comparative_review_pairings
       SET faculty_id = $1, status = 'assigned', updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [facultyId, pairingId]
    );

    // Move round to 'active' if not already
    if (result.rows[0]) {
      await query(
        `UPDATE comparative_review_rounds SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status = 'draft'`,
        [result.rows[0].round_id]
      );
    }

    return result.rows[0];
  }

  async deletePairing(pairingId) {
    // Only allow deleting if not already marked
    const result = await query(
      `DELETE FROM comparative_review_pairings
       WHERE id = $1 AND status IN ('pending', 'assigned')
       RETURNING *`,
      [pairingId]
    );
    return result.rows[0];
  }

  async deleteRound(roundId) {
    // Only allow deleting if not finalized
    const result = await query(
      `DELETE FROM comparative_review_rounds
       WHERE id = $1 AND status != 'finalized'
       RETURNING *`,
      [roundId]
    );
    return result.rows[0];
  }

  // ============================================================
  // FINALIZE ROUND — Lock all marks
  // ============================================================

  async finalizeRound(roundId) {
    // Check all pairings are marked
    const unmarked = await query(
      `SELECT COUNT(*) AS cnt FROM comparative_review_pairings
       WHERE round_id = $1 AND status != 'marked'`,
      [roundId]
    );
    if (parseInt(unmarked.rows[0].cnt) > 0) {
      return { error: "All pairings must be marked before finalizing." };
    }

    // Finalize all pairings
    await query(
      `UPDATE comparative_review_pairings SET status = 'finalized', updated_at = NOW()
       WHERE round_id = $1`,
      [roundId]
    );

    // Finalize round
    const result = await query(
      `UPDATE comparative_review_rounds
       SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [roundId]
    );

    logger.info("Comparative review round finalized", { roundId });
    return { success: true, round: result.rows[0] };
  }

  // ============================================================
  // FACULTY — My pairings + submit marks
  // ============================================================

  async getMyPairings(facultyId) {
    const result = await query(
      `SELECT crp.*,
        crr.title AS round_title, crr.track, crr.mark_pool, crr.status AS round_status, crr.batch_year
       FROM comparative_review_pairings crp
       JOIN comparative_review_rounds crr ON crr.id = crp.round_id
       WHERE crp.faculty_id = $1
       ORDER BY crp.created_at DESC`,
      [facultyId]
    );

    // For each pairing, get teams
    const pairings = [];
    for (const pairing of result.rows) {
      const teamsRes = await query(
        `SELECT crpt.*,
          tfr.leader_id, tfr.track,
          proj.title AS project_title, proj.description AS project_description,
          lp.display_name AS leader_name,
          (SELECT string_agg(mp.display_name, ', ')
           FROM project_members pm
           JOIN persons mp ON mp.person_id = pm.person_id
           WHERE pm.project_id = tfr.project_id AND pm.left_at IS NULL) AS member_names,
          (SELECT json_agg(json_build_object(
            'name', mp.display_name,
            'person_id', mp.person_id,
            'has_github', COALESCE(gt.is_valid, false),
            'github_username', gt.github_username
          ))
           FROM project_members pm2
           JOIN persons mp ON mp.person_id = pm2.person_id
           LEFT JOIN github_tokens gt ON gt.person_id = pm2.person_id
           WHERE pm2.project_id = tfr.project_id AND pm2.left_at IS NULL) AS members_detail
         FROM comparative_review_pairing_teams crpt
         JOIN team_formation_requests tfr ON tfr.id = crpt.team_id
         LEFT JOIN projects proj ON proj.project_id = crpt.project_id
         LEFT JOIN persons lp ON lp.person_id = tfr.leader_id
         WHERE crpt.pairing_id = $1`,
        [pairing.id]
      );

      // Get existing marks
      const marksRes = await query(
        `SELECT * FROM comparative_review_marks WHERE pairing_id = $1`,
        [pairing.id]
      );

      pairings.push({
        ...pairing,
        teams: teamsRes.rows,
        marks: marksRes.rows,
      });
    }

    return pairings;
  }

  async getPairingDetail(pairingId) {
    // Pairing info
    const pairingRes = await query(
      `SELECT crp.*,
        crr.title AS round_title, crr.track, crr.mark_pool, crr.status AS round_status,
        fp.display_name AS faculty_name
       FROM comparative_review_pairings crp
       JOIN comparative_review_rounds crr ON crr.id = crp.round_id
       LEFT JOIN persons fp ON fp.person_id = crp.faculty_id
       WHERE crp.id = $1`,
      [pairingId]
    );
    if (pairingRes.rows.length === 0) return null;

    // Teams with full details
    const teamsRes = await query(
      `SELECT crpt.*,
        tfr.leader_id, tfr.track,
        proj.title AS project_title, proj.description AS project_description,
        lp.display_name AS leader_name,
        (SELECT json_agg(json_build_object('name', mp.display_name, 'person_id', mp.person_id))
         FROM project_members pm
         JOIN persons mp ON mp.person_id = pm.person_id
         WHERE pm.project_id = tfr.project_id AND pm.left_at IS NULL) AS members
       FROM comparative_review_pairing_teams crpt
       JOIN team_formation_requests tfr ON tfr.id = crpt.team_id
       LEFT JOIN projects proj ON proj.project_id = crpt.project_id
       LEFT JOIN persons lp ON lp.person_id = tfr.leader_id
       WHERE crpt.pairing_id = $1`,
      [pairingId]
    );

    // Existing marks
    const marksRes = await query(
      `SELECT * FROM comparative_review_marks WHERE pairing_id = $1`,
      [pairingId]
    );

    return {
      ...pairingRes.rows[0],
      teams: teamsRes.rows,
      marks: marksRes.rows,
    };
  }

  async submitMarks(pairingId, facultyId, marksArray) {
    // marksArray: [{ teamId, marks, feedback }]
    // Validate pool sum
    const pairingRes = await query(
      `SELECT crp.*, crr.mark_pool
       FROM comparative_review_pairings crp
       JOIN comparative_review_rounds crr ON crr.id = crp.round_id
       WHERE crp.id = $1`,
      [pairingId]
    );
    if (pairingRes.rows.length === 0) return { error: "Pairing not found." };

    const pairing = pairingRes.rows[0];
    const markPool = parseFloat(pairing.mark_pool);

    // Check sum
    const totalMarks = marksArray.reduce((sum, m) => sum + parseFloat(m.marks), 0);
    if (Math.abs(totalMarks - markPool) > 0.01) {
      return { error: `Total marks must equal ${markPool}. Got ${totalMarks.toFixed(2)}.` };
    }

    // Check pairing isn't already finalized
    if (pairing.status === "finalized") {
      return { error: "This pairing is already finalized." };
    }

    // Insert/update marks for each team
    for (const m of marksArray) {
      await query(
        `INSERT INTO comparative_review_marks (pairing_id, team_id, faculty_id, marks, feedback)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (pairing_id, team_id)
         DO UPDATE SET marks = $4, feedback = $5, faculty_id = $3, submitted_at = NOW()`,
        [pairingId, m.teamId, facultyId, parseFloat(m.marks), m.feedback || null]
      );
    }

    // Update pairing status to marked
    await query(
      `UPDATE comparative_review_pairings SET status = 'marked', updated_at = NOW() WHERE id = $1`,
      [pairingId]
    );

    // Move round to 'marking' if not already
    await query(
      `UPDATE comparative_review_rounds SET status = 'marking', updated_at = NOW()
       WHERE id = $1 AND status IN ('draft', 'active')`,
      [pairing.round_id]
    );

    logger.info("Comparative review marks submitted", { pairingId, facultyId, totalMarks });
    return { success: true };
  }

  // ============================================================
  // STUDENT — My reviews
  // ============================================================

  async getMyReviews(studentId) {
    // Find teams where this student is a member
    const result = await query(
      `SELECT crpt.pairing_id, crpt.team_id,
        crp.pairing_label, crp.status AS pairing_status,
        crr.id AS round_id, crr.title AS round_title, crr.track, crr.mark_pool,
        crr.status AS round_status, crr.batch_year,
        proj.title AS my_project_title,
        -- My team's mark
        crm_my.marks AS my_marks, crm_my.feedback AS my_feedback
       FROM comparative_review_pairing_teams crpt
       JOIN comparative_review_pairings crp ON crp.id = crpt.pairing_id
       JOIN comparative_review_rounds crr ON crr.id = crp.round_id
       JOIN team_formation_requests tfr ON tfr.id = crpt.team_id
       LEFT JOIN projects proj ON proj.project_id = tfr.project_id
       LEFT JOIN comparative_review_marks crm_my ON crm_my.pairing_id = crpt.pairing_id AND crm_my.team_id = crpt.team_id
       WHERE tfr.project_id IN (
         SELECT pm.project_id FROM project_members pm WHERE pm.person_id = $1 AND pm.left_at IS NULL
       )
       ORDER BY crr.created_at DESC`,
      [studentId]
    );

    // For each review, get opponent teams
    const reviews = [];
    for (const row of result.rows) {
      const opponentsRes = await query(
        `SELECT crpt.team_id,
          proj.title AS project_title, proj.description AS project_description,
          lp.display_name AS leader_name,
          crm.marks, crm.feedback,
          (SELECT string_agg(mp.display_name, ', ')
           FROM project_members pm
           JOIN persons mp ON mp.person_id = pm.person_id
           WHERE pm.project_id = tfr.project_id AND pm.left_at IS NULL) AS member_names
         FROM comparative_review_pairing_teams crpt
         JOIN team_formation_requests tfr ON tfr.id = crpt.team_id
         LEFT JOIN projects proj ON proj.project_id = tfr.project_id
         LEFT JOIN persons lp ON lp.person_id = tfr.leader_id
         LEFT JOIN comparative_review_marks crm ON crm.pairing_id = crpt.pairing_id AND crm.team_id = crpt.team_id
         WHERE crpt.pairing_id = $1 AND crpt.team_id != $2`,
        [row.pairing_id, row.team_id]
      );

      reviews.push({
        ...row,
        opponents: opponentsRes.rows,
      });
    }

    return reviews;
  }

  // ============================================================
  // RANKINGS — Global team rankings (visible to everyone)
  // ============================================================

  async getGlobalRankings({ track } = {}) {
    let sql = `
      SELECT
        team_id,
        project_id,
        project_title,
        track,
        leader_id,
        leader_name,
        ROUND(AVG(marks)::numeric, 2) AS marks,
        ROUND(AVG(mark_pool)::numeric, 1) AS mark_pool,
        COUNT(*) AS rounds_participated,
        RANK() OVER (ORDER BY AVG(marks) DESC) AS global_rank,
        RANK() OVER (PARTITION BY track ORDER BY AVG(marks) DESC) AS track_rank
      FROM comparative_review_rankings
      WHERE 1=1
    `;
    const params = [];
    if (track) {
      sql += ` AND track = $1`;
      params.push(track);
    }
    sql += ` GROUP BY team_id, project_id, project_title, track, leader_id, leader_name`;
    sql += ` ORDER BY global_rank ASC`;
    const result = await query(sql, params);
    return result.rows;
  }

  // ============================================================
  // HELPER — Get all faculty for assignment dropdown
  // ============================================================

  async getAllFaculty() {
    const result = await query(
      `SELECT person_id, display_name, department_code
       FROM persons
       WHERE person_type = 'faculty' AND status = 'active' AND is_deleted = false
       ORDER BY display_name ASC`
    );
    return result.rows;
  }
}

module.exports = new ComparativeReviewService();
