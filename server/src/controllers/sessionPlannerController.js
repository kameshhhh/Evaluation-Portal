// ============================================================
// SESSION PLANNER CONTROLLER — Track, Team & Assignment APIs
// ============================================================
// Handles:
//   1. Student track selection (core / it_core / premium)
//   2. Team formation (leader invites → members accept → admin approves)
//   3. Session planner assignments (faculty → students/teams)
//   4. Password-protected planner access
//
// Tables: student_track_selections, team_formation_requests,
//         team_invitations, session_planner_assignments
// ============================================================

const { query } = require("../config/database");
const logger = require("../utils/logger");
const sessionPlannerService = require("../services/sessionPlannerService");
const facultyScopeService = require("../services/facultyScopeService");
const GovernanceService = require("../services/GovernanceService");
const { batchToYearLabel, admissionToBatch, formatBatch } = require("../utils/batchHelper");
const {
  broadcastChange,
  emitToAll,
  emitToRole,
  emitToPerson,
  EVENTS,
} = require("../socket");

// Planner password — required to access session planner
const PLANNER_PASSWORD = process.env.PLANNER_PASSWORD || "bit!123";

// SRS §4.1.3 — Scarcity pool: each student = 5 points
const POINTS_PER_MEMBER = 5;

// Track configuration — strict team size rules
const TRACK_CONFIG = {
  core: { minSize: 3, maxSize: 4, label: "Core Project", allowSolo: false },
  it_core: { minSize: 1, maxSize: 1, label: "IT / IT & Core", allowSolo: true },
  premium: {
    minSize: 2,
    maxSize: 2,
    label: "Premium Project",
    allowSolo: false,
  },
};

// Helper: ordinal suffix for year labels
function getSuffix(n) {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

// Helper: get year label from admission_year (batch-aware)
// batch_year = admission_year + 4, then derive label from current academic year
function getYearLabel(admissionYear) {
  if (!admissionYear) return "Unknown";
  const batchYear = admissionToBatch(admissionYear);
  return batchToYearLabel(batchYear) || `Batch ${batchYear}`;
}

// ============================================================
// TRACK SELECTION ENDPOINTS
// ============================================================

/**
 * GET /my-track — Get current student's track selection
 */
const getMyTrack = async (req, res) => {
  try {
    const personId = req.user.personId;
    const result = await query(
      `SELECT id, track, academic_year, semester, selected_at
       FROM student_track_selections
       WHERE person_id = $1
       ORDER BY selected_at DESC
       LIMIT 1`,
      [personId],
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null, needsSelection: true });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      needsSelection: false,
      trackConfig: TRACK_CONFIG[result.rows[0].track],
    });
  } catch (error) {
    logger.error("Failed to get track selection", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get track selection" });
  }
};

/**
 * POST /select-track — One-time track selection
 * Body: { track: "core"|"it_core"|"premium", academicYear, semester }
 */
const selectTrack = async (req, res) => {
  try {
    const personId = req.user.personId;
    const { track } = req.body;
    const academicYear = req.body.academicYear || new Date().getFullYear();
    const semester = req.body.semester || 1;

    // Validate track
    if (!TRACK_CONFIG[track]) {
      return res.status(400).json({
        success: false,
        error: `Invalid track. Must be one of: ${Object.keys(TRACK_CONFIG).join(", ")}`,
      });
    }

    // Check if already selected for this year/semester
    const existing = await query(
      `SELECT id FROM student_track_selections
       WHERE person_id = $1 AND academic_year = $2 AND semester = $3`,
      [personId, academicYear, semester],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          "Track already selected for this academic period. Cannot be changed.",
      });
    }

    // Insert track selection
    const result = await query(
      `INSERT INTO student_track_selections (person_id, track, academic_year, semester)
       VALUES ($1, $2, $3, $4)
       RETURNING id, track, academic_year, semester, selected_at`,
      [personId, track, academicYear, semester],
    );

    // For IT/IT-Core students: auto-create a solo project + formation
    if (track === "it_core") {
      await _createSoloTeam(personId, academicYear, semester);
    }

    broadcastChange("student_track", "selected", { personId, track });

    logger.info("Track selected", { personId, track, academicYear, semester });
    return res.status(201).json({
      success: true,
      data: result.rows[0],
      trackConfig: TRACK_CONFIG[track],
      message:
        track === "it_core"
          ? "Track selected. You are automatically registered as a solo team."
          : "Track selected. You can now form your team.",
    });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ success: false, error: "Track already selected." });
    }
    logger.error("Failed to select track", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to select track" });
  }
};

/**
 * GET /track-config — Get track rules (public for students)
 */
const getTrackConfig = async (req, res) => {
  return res.json({ success: true, data: TRACK_CONFIG });
};

// ============================================================
// TEAM FORMATION ENDPOINTS
// ============================================================

/**
 * GET /available-students — Students available for team building
 * Filters: same track, not already in a team, not already invited (pending)
 */
const getAvailableStudents = async (req, res) => {
  try {
    const personId = req.user.personId;
    const { academicYear, semester } = req.query;

    // Get caller's track AND admission_year
    const callerInfo = await query(
      `SELECT sts.track, p.admission_year
       FROM student_track_selections sts
       JOIN persons p ON p.person_id = sts.person_id
       WHERE sts.person_id = $1 AND sts.academic_year = $2 AND sts.semester = $3`,
      [personId, academicYear || new Date().getFullYear(), semester || 1],
    );

    if (callerInfo.rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Select your track first." });
    }

    const track = callerInfo.rows[0].track;
    const callerAdmissionYear = callerInfo.rows[0].admission_year;

    // IT/IT-Core students don't need team formation
    if (track === "it_core") {
      return res.json({
        success: true,
        data: [],
        message: "Solo track — no team formation needed.",
      });
    }

    const yr = academicYear || new Date().getFullYear();
    const sem = semester || 1;

    // Find students with the SAME TRACK + SAME YEAR who are NOT in a team yet
    // Strict rule: same-track AND same-admission_year only
    const result = await query(
      `SELECT 
         sts.person_id,
         p.display_name,
         p.department_code,
         p.admission_year
       FROM student_track_selections sts
       JOIN persons p ON p.person_id = sts.person_id
       WHERE sts.track = $1
         AND sts.academic_year = $2
         AND sts.semester = $3
         AND sts.person_id != $4
         AND LOWER(p.status) IN ('active', 'approved')
         AND p.is_deleted = false
         -- SAME-YEAR enforcement: only students from the same batch
         AND p.admission_year = $5
         -- Exclude students already in an active team formation
         AND NOT EXISTS (
           SELECT 1 FROM team_formation_requests tfr
           WHERE tfr.leader_id = sts.person_id
             AND tfr.academic_year = $2 AND tfr.semester = $3
             AND tfr.status IN ('pending', 'members_accepted', 'admin_approved')
         )
         AND NOT EXISTS (
           SELECT 1 FROM team_invitations ti
           JOIN team_formation_requests tfr2 ON tfr2.id = ti.formation_id
           WHERE ti.invitee_id = sts.person_id
             AND ti.status IN ('pending', 'accepted')
             AND tfr2.academic_year = $2 AND tfr2.semester = $3
             AND tfr2.status IN ('pending', 'members_accepted', 'admin_approved')
         )
       ORDER BY p.display_name`,
      [track, yr, sem, personId, callerAdmissionYear],
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("Failed to get available students", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get available students" });
  }
};

/**
 * POST /create-team — Leader creates a team formation request
 * Body: { memberIds: [uuid, ...], title?, academicYear, semester }
 */
const createTeam = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const leaderId = req.user.personId;
    const { memberIds, title, academicYear, semester } = req.body;

    // Get leader's track
    const trackResult = await client.query(
      `SELECT track FROM student_track_selections
       WHERE person_id = $1 AND academic_year = $2 AND semester = $3`,
      [leaderId, academicYear, semester],
    );

    if (trackResult.rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Select your track first." });
    }

    const track = trackResult.rows[0].track;
    const config = TRACK_CONFIG[track];

    // Validate team size (leader + members)
    const totalSize = 1 + (memberIds?.length || 0);
    if (totalSize < config.minSize || totalSize > config.maxSize) {
      return res.status(400).json({
        success: false,
        error: `${config.label} teams must have ${config.minSize}-${config.maxSize} members. You selected ${totalSize}.`,
      });
    }

    // Get leader's batch year (graduation_year) for same-batch enforcement
    const leaderPersonInfo = await client.query(
      `SELECT admission_year, graduation_year FROM persons WHERE person_id = $1`,
      [leaderId],
    );
    const leaderAdmissionYear = leaderPersonInfo.rows[0]?.admission_year;
    const leaderBatchYear = leaderPersonInfo.rows[0]?.graduation_year || admissionToBatch(leaderAdmissionYear);

    // ── STRICT SAME-TRACK + SAME-YEAR ENFORCEMENT ──
    // Verify ALL invited members have the exact same track AND same admission_year.
    // Core↔Core, IT-Core↔IT-Core, Premium↔Premium ONLY. No cross-track teams.
    // 1st yr↔1st yr, 2nd yr↔2nd yr, etc. No cross-year teams.
    if (memberIds?.length > 0) {
      const memberCheck = await client.query(
        `SELECT sts.person_id, sts.track, p.display_name, p.admission_year
         FROM student_track_selections sts
         JOIN persons p ON p.person_id = sts.person_id
         WHERE sts.person_id = ANY($1)
           AND sts.academic_year = $2 AND sts.semester = $3`,
        [memberIds, academicYear, semester],
      );

      // Check all members have selected a track
      const foundIds = new Set(memberCheck.rows.map((r) => r.person_id));
      const missingTrack = memberIds.filter((id) => !foundIds.has(id));
      if (missingTrack.length > 0) {
        return res.status(400).json({
          success: false,
          error: `${missingTrack.length} invited member(s) have not selected a track yet.`,
        });
      }

      // Check all members are on the SAME track as the leader
      const wrongTrack = memberCheck.rows.filter((r) => r.track !== track);
      if (wrongTrack.length > 0) {
        const names = wrongTrack
          .map((r) => `${r.display_name} (${r.track})`)
          .join(", ");
        return res.status(400).json({
          success: false,
          error: `Cross-track teams are not allowed. These members have a different track: ${names}`,
        });
      }

      // Check all members are from the SAME BATCH as the leader
      const wrongYear = memberCheck.rows.filter(
        (r) => r.admission_year !== leaderAdmissionYear,
      );
      if (wrongYear.length > 0) {
        const names = wrongYear
          .map((r) => {
            const memberBatch = admissionToBatch(r.admission_year);
            const label = memberBatch ? batchToYearLabel(memberBatch) : "?";
            return `${r.display_name} (${label || 'Batch ' + memberBatch})`;
          })
          .join(", ");
        const leaderLabel = batchToYearLabel(leaderBatchYear) || `Batch ${leaderBatchYear}`;
        return res.status(400).json({
          success: false,
          error: `Cross-batch teams are not allowed. You are ${leaderLabel} (Batch ${leaderBatchYear}). These members are from a different batch: ${names}`,
        });
      }
    }

    // Check leader isn't already in a team
    const leaderCheck = await client.query(
      `SELECT 1 FROM team_formation_requests
       WHERE leader_id = $1 AND academic_year = $2 AND semester = $3
         AND status IN ('pending', 'members_accepted', 'admin_approved')`,
      [leaderId, academicYear, semester],
    );
    if (leaderCheck.rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: "You already have an active team." });
    }

    // Check invited members aren't already in active teams
    if (memberIds?.length > 0) {
      const memberTeamCheck = await client.query(
        `SELECT ti.invitee_id, p.display_name
         FROM team_invitations ti
         JOIN team_formation_requests tfr ON tfr.id = ti.formation_id
         JOIN persons p ON p.person_id = ti.invitee_id
         WHERE ti.invitee_id = ANY($1)
           AND tfr.academic_year = $2 AND tfr.semester = $3
           AND tfr.status IN ('pending', 'members_accepted', 'admin_approved')
           AND ti.status IN ('pending', 'accepted')
         UNION
         SELECT tfr.leader_id, p.display_name
         FROM team_formation_requests tfr
         JOIN persons p ON p.person_id = tfr.leader_id
         WHERE tfr.leader_id = ANY($1)
           AND tfr.academic_year = $2 AND tfr.semester = $3
           AND tfr.status IN ('pending', 'members_accepted', 'admin_approved')`,
        [memberIds, academicYear, semester],
      );
      if (memberTeamCheck.rows.length > 0) {
        const names = memberTeamCheck.rows.map(r => r.display_name).join(', ');
        return res.status(409).json({
          success: false,
          error: `These members already belong to an active team: ${names}`,
        });
      }
    }

    await client.query("BEGIN");

    // Create project in draft state
    const projectResult = await client.query(
      `INSERT INTO projects (title, academic_year, semester, start_date, expected_end_date, status, created_by, updated_by)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 'draft', $4, $4)
       RETURNING project_id`,
      [
        title ||
        `${track.toUpperCase()} Team - ${new Date().toLocaleDateString()}`,
        academicYear,
        semester,
        leaderId,
      ],
    );
    const projectId = projectResult.rows[0].project_id;

    // Add leader as project member (team leader)
    await client.query(
      `INSERT INTO project_members (project_id, person_id, role_in_project, created_by)
       VALUES ($1, $2, 'Team Leader', $2)`,
      [projectId, leaderId],
    );

    // Create team formation request
    const formationResult = await client.query(
      `INSERT INTO team_formation_requests (project_id, leader_id, track, academic_year, semester, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status`,
      [
        projectId,
        leaderId,
        track,
        academicYear,
        semester,
        memberIds?.length > 0 ? "pending" : "members_accepted",
      ],
    );
    const formationId = formationResult.rows[0].id;

    // Create invitations for each member
    if (memberIds?.length > 0) {
      for (const memberId of memberIds) {
        await client.query(
          `INSERT INTO team_invitations (formation_id, invitee_id)
           VALUES ($1, $2)`,
          [formationId, memberId],
        );
        // Notify each invited student via socket
        emitToPerson("team:invitation", memberId, {
          formationId,
          leaderId,
          leaderName: req.user.displayName,
          track,
          projectId,
        });
      }
    }

    await client.query("COMMIT");

    broadcastChange("team_formation", "created", {
      formationId,
      projectId,
      track,
    });

    logger.info("Team formation created", {
      formationId,
      leaderId,
      track,
      memberCount: totalSize,
    });
    return res.status(201).json({
      success: true,
      data: {
        formationId,
        projectId,
        track,
        status: formationResult.rows[0].status,
        memberCount: totalSize,
      },
      message:
        memberIds?.length > 0
          ? "Team created! Waiting for members to accept."
          : "Solo team created! Waiting for admin approval.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to create team", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to create team" });
  } finally {
    client.release();
  }
};

/**
 * GET /my-team — Get current student's team formation status
 */
const getMyTeam = async (req, res) => {
  try {
    const personId = req.user.personId;
    const { academicYear, semester } = req.query;
    const yr = academicYear || new Date().getFullYear();
    const sem = semester || 1;

    // Check if leader
    let formation = await query(
      `SELECT tfr.*, p.title as project_title
       FROM team_formation_requests tfr
       JOIN projects p ON p.project_id = tfr.project_id
       WHERE tfr.leader_id = $1
         AND tfr.academic_year = $2 AND tfr.semester = $3
         AND tfr.status NOT IN ('cancelled', 'expired', 'admin_rejected')
       ORDER BY tfr.created_at DESC LIMIT 1`,
      [personId, yr, sem],
    );

    // If not leader, check if invited member
    if (formation.rows.length === 0) {
      formation = await query(
        `SELECT tfr.*, p.title as project_title, ti.status as invitation_status
         FROM team_invitations ti
         JOIN team_formation_requests tfr ON tfr.id = ti.formation_id
         JOIN projects p ON p.project_id = tfr.project_id
         WHERE ti.invitee_id = $1
           AND tfr.academic_year = $2 AND tfr.semester = $3
           AND tfr.status NOT IN ('cancelled', 'expired', 'admin_rejected')
         ORDER BY tfr.created_at DESC LIMIT 1`,
        [personId, yr, sem],
      );
    }

    if (formation.rows.length === 0) {
      return res.json({ success: true, data: null, hasTeam: false });
    }

    const f = formation.rows[0];

    // Get all members (leader + accepted invitees)
    const members = await query(
      `SELECT 
         p.person_id, p.display_name, p.department_code, u.email_hash,
         CASE WHEN p.person_id = tfr.leader_id THEN 'Team Leader' ELSE 'Member' END as role,
         COALESCE(ti.status, 'leader') as invitation_status
       FROM team_formation_requests tfr
       JOIN persons p ON p.person_id = tfr.leader_id
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN team_invitations ti ON false
       WHERE tfr.id = $1
       
       UNION ALL
       
       SELECT 
         p.person_id, p.display_name, p.department_code, u.email_hash,
         'Member' as role,
         ti.status as invitation_status
       FROM team_invitations ti
       JOIN persons p ON p.person_id = ti.invitee_id
       JOIN users u ON u.internal_user_id = p.identity_id
       WHERE ti.formation_id = $1`,
      [f.id],
    );

    return res.json({
      success: true,
      data: {
        ...f,
        members: members.rows,
        trackConfig: TRACK_CONFIG[f.track],
      },
      hasTeam: true,
    });
  } catch (error) {
    logger.error("Failed to get my team", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get team" });
  }
};

/**
 * POST /invitations/:invitationId/respond — Accept or reject a team invitation
 * Body: { action: "accept"|"reject" }
 */
const respondToInvitation = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const personId = req.user.personId;
    const { invitationId } = req.params;
    const { action } = req.body;

    if (!["accept", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ success: false, error: "Action must be 'accept' or 'reject'" });
    }

    await client.query("BEGIN");

    // Get invitation + verify it belongs to this student
    const inv = await client.query(
      `SELECT ti.*, tfr.project_id, tfr.leader_id, tfr.id as formation_id
       FROM team_invitations ti
       JOIN team_formation_requests tfr ON tfr.id = ti.formation_id
       WHERE ti.id = $1 AND ti.invitee_id = $2 AND ti.status = 'pending'`,
      [invitationId, personId],
    );

    if (inv.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({
          success: false,
          error: "Invitation not found or already responded.",
        });
    }

    const invitation = inv.rows[0];

    // Update invitation status
    await client.query(
      `UPDATE team_invitations SET status = $1, responded_at = NOW() WHERE id = $2`,
      [action === "accept" ? "accepted" : "rejected", invitationId],
    );

    if (action === "accept") {
      // Add to project_members
      await client.query(
        `INSERT INTO project_members (project_id, person_id, role_in_project, created_by)
         VALUES ($1, $2, 'Member', $2)
         ON CONFLICT DO NOTHING`,
        [invitation.project_id, personId],
      );
    }

    // Check if all invitations are resolved
    const pendingCheck = await client.query(
      `SELECT COUNT(*) as pending FROM team_invitations
       WHERE formation_id = $1 AND status = 'pending'`,
      [invitation.formation_id],
    );

    const allAccepted = await client.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
         COUNT(*) as total
       FROM team_invitations WHERE formation_id = $1`,
      [invitation.formation_id],
    );

    // If all responded and all accepted → move to members_accepted
    if (
      parseInt(pendingCheck.rows[0].pending) === 0 &&
      parseInt(allAccepted.rows[0].accepted) ===
      parseInt(allAccepted.rows[0].total)
    ) {
      await client.query(
        `UPDATE team_formation_requests SET status = 'members_accepted', updated_at = NOW()
         WHERE id = $1`,
        [invitation.formation_id],
      );
    }

    await client.query("COMMIT");

    // Notify leader
    emitToPerson("team:response", invitation.leader_id, {
      inviteeId: personId,
      inviteeName: req.user.displayName,
      action,
      formationId: invitation.formation_id,
    });

    broadcastChange("team_invitation", action, {
      formationId: invitation.formation_id,
    });

    return res.json({
      success: true,
      message:
        action === "accept"
          ? "Invitation accepted! You joined the team."
          : "Invitation rejected.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to respond to invitation", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to respond" });
  } finally {
    client.release();
  }
};

/**
 * GET /pending-invitations — Get my pending team invitations
 */
const getPendingInvitations = async (req, res) => {
  try {
    const personId = req.user.personId;
    const result = await query(
      `SELECT 
         ti.id as invitation_id,
         ti.created_at as invited_at,
         tfr.track,
         tfr.id as formation_id,
         p.title as project_title,
         ldr.display_name as leader_name,
         ldr.department_code as leader_department,
         (SELECT COUNT(*) FROM team_invitations WHERE formation_id = tfr.id) + 1 as team_size
       FROM team_invitations ti
       JOIN team_formation_requests tfr ON tfr.id = ti.formation_id
       JOIN projects p ON p.project_id = tfr.project_id
       JOIN persons ldr ON ldr.person_id = tfr.leader_id
       WHERE ti.invitee_id = $1
         AND ti.status = 'pending'
         AND tfr.status = 'pending'
       ORDER BY ti.created_at DESC`,
      [personId],
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("Failed to get pending invitations", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get invitations" });
  }
};

// ============================================================
// ADMIN TEAM APPROVAL ENDPOINTS
// ============================================================

/**
 * GET /admin/teams — List all team formations (with filters)
 */
const listTeamFormations = async (req, res) => {
  try {
    const { status, track, academicYear, semester } = req.query;

    let sql = `
      SELECT 
        tfr.id, tfr.project_id, tfr.leader_id, tfr.track, tfr.status,
        tfr.academic_year, tfr.semester, tfr.created_at, tfr.reviewed_at,
        tfr.review_note,
        p.title as project_title,
        ldr.display_name as leader_name,
        ldr.department_code as leader_department,
        rv.display_name as reviewer_name,
        (SELECT COUNT(*) FROM team_invitations WHERE formation_id = tfr.id AND status = 'accepted') + 1 as team_size,
        (SELECT json_agg(json_build_object(
           'personId', per.person_id,
           'displayName', per.display_name,
           'department', per.department_code,
           'role', CASE WHEN per.person_id = tfr.leader_id THEN 'Team Leader' ELSE 'Member' END,
           'status', COALESCE(ti.status, 'leader')
         ))
         FROM (
           SELECT tfr.leader_id as person_id, null::uuid as invitation_id FROM team_formation_requests sub WHERE sub.id = tfr.id
           UNION ALL
           SELECT ti2.invitee_id, ti2.id FROM team_invitations ti2 WHERE ti2.formation_id = tfr.id
         ) members
         JOIN persons per ON per.person_id = members.person_id
         LEFT JOIN team_invitations ti ON ti.id = members.invitation_id
        ) as members
      FROM team_formation_requests tfr
      JOIN projects p ON p.project_id = tfr.project_id
      JOIN persons ldr ON ldr.person_id = tfr.leader_id
      LEFT JOIN persons rv ON rv.person_id = tfr.reviewed_by
      WHERE 1=1`;

    const params = [];
    if (status) {
      params.push(status);
      sql += ` AND tfr.status = $${params.length}`;
    }
    if (track) {
      params.push(track);
      sql += ` AND tfr.track = $${params.length}`;
    }
    if (academicYear) {
      params.push(academicYear);
      sql += ` AND tfr.academic_year = $${params.length}`;
    }
    if (semester) {
      params.push(semester);
      sql += ` AND tfr.semester = $${params.length}`;
    }

    sql += ` ORDER BY tfr.created_at DESC`;

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("Failed to list team formations", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to list teams" });
  }
};

/**
 * POST /admin/teams/:formationId/approve — Admin approves a team
 */
const approveTeam = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const { formationId } = req.params;
    const adminId = req.user.personId;
    const { note } = req.body;

    await client.query("BEGIN");

    // Get formation
    const formation = await client.query(
      `SELECT * FROM team_formation_requests WHERE id = $1 AND status = 'members_accepted'`,
      [formationId],
    );

    if (formation.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error:
          "Formation not found or not ready for approval (members must all accept first).",
      });
    }

    const f = formation.rows[0];

    // Approve
    await client.query(
      `UPDATE team_formation_requests 
       SET status = 'admin_approved', reviewed_by = $1, reviewed_at = NOW(), review_note = $2, updated_at = NOW()
       WHERE id = $3`,
      [adminId, note || null, formationId],
    );

    // Activate the project
    await client.query(
      `UPDATE projects SET status = 'active', updated_at = NOW(), updated_by = $1 WHERE project_id = $2`,
      [adminId, f.project_id],
    );

    await client.query("COMMIT");

    // Notify leader + all members
    emitToPerson("team:approved", f.leader_id, {
      formationId,
      projectId: f.project_id,
    });

    const invitees = await query(
      `SELECT invitee_id FROM team_invitations WHERE formation_id = $1 AND status = 'accepted'`,
      [formationId],
    );
    for (const inv of invitees.rows) {
      emitToPerson("team:approved", inv.invitee_id, {
        formationId,
        projectId: f.project_id,
      });
    }

    broadcastChange("team_formation", "approved", {
      formationId,
      projectId: f.project_id,
    });

    logger.info("Team approved by admin", { formationId, adminId });
    return res.json({
      success: true,
      message: "Team approved and project activated.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to approve team", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to approve team" });
  } finally {
    client.release();
  }
};

/**
 * POST /admin/teams/:formationId/reject — Admin rejects a team
 */
const rejectTeam = async (req, res) => {
  try {
    const { formationId } = req.params;
    const adminId = req.user.personId;
    const { note } = req.body;

    const result = await query(
      `UPDATE team_formation_requests
       SET status = 'admin_rejected', reviewed_by = $1, reviewed_at = NOW(), review_note = $2, updated_at = NOW()
       WHERE id = $3 AND status IN ('pending', 'members_accepted')
       RETURNING leader_id`,
      [adminId, note || "Rejected by admin", formationId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Formation not found or already processed.",
        });
    }

    emitToPerson("team:rejected", result.rows[0].leader_id, {
      formationId,
      note,
    });
    broadcastChange("team_formation", "rejected", { formationId });

    return res.json({ success: true, message: "Team rejected." });
  } catch (error) {
    logger.error("Failed to reject team", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to reject team" });
  }
};

// ============================================================
// SESSION PLANNER ENDPOINTS (Password-Protected)
// ============================================================

/**
 * POST /planner/verify-password — Verify planner access password
 */
const verifyPlannerPassword = async (req, res) => {
  const { password } = req.body;
  if (password === PLANNER_PASSWORD) {
    return res.json({ success: true, message: "Access granted." });
  }
  return res.status(403).json({ success: false, error: "Incorrect password." });
};

/**
 * GET /planner/overview/:sessionId — Full session planner overview
 * Shows: all faculty, all students/teams, current assignments
 */
const getPlannerOverview = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // --- GOVERNANCE: Check-on-Access Rollover ---
    await GovernanceService.ensureWeeklyWindow(sessionId);

    // 1. Get session info
    const session = await query(
      `SELECT * FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (session.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found." });
    }

    // 2. Get all faculty (with credibility)
    const faculty = await query(
      `SELECT p.person_id, p.display_name, p.department_code,
              COALESCE(jcm.credibility_score, ep.credibility_score, 1.0) as credibility_score,
              COALESCE(jcm.display_score, ep.credibility_score, 1.0) as display_score,
              jcm.credibility_band,
              (
                SELECT json_agg(
                  json_build_object(
                    'track_id', t.id,
                    'track_name', t.name, 
                    'department_code', fes.department_code
                  )
                )
                FROM faculty_evaluation_scope fes
                JOIN tracks t ON t.id = fes.track_id
                WHERE fes.faculty_id = u.internal_user_id AND fes.is_active = true
              ) as scopes
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = p.person_id
       LEFT JOIN evaluator_profiles ep ON ep.person_id = p.person_id
       WHERE u.user_role IN ('faculty', 'admin')
         AND p.status = 'active' AND p.is_deleted = false
       ORDER BY p.display_name`,
    );

    // 3. Get students (Visible to all authorized planners)
    const studentsRes = await query(
      `SELECT 
         p.person_id, p.display_name, p.department_code, p.admission_year,
         p.graduation_year AS batch_year,
         sts.track,
         tfr.id as formation_id, tfr.status as team_status,
         tfr.project_id,
         prj.title as project_title,
         CASE WHEN tfr.leader_id = p.person_id THEN true ELSE false END as is_leader,
         spa.faculty_id as assigned_faculty_id,
         spa.status as assignment_status,
         afp.display_name as assigned_faculty_name,
         fsr.normalized_score,
         fsr.aggregated_score,
         fsr.confidence_score,
         fsr.judge_count,
         fsr.display_score,
         fsr.rubric_breakdown
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
       LEFT JOIN team_formation_requests tfr ON (
         tfr.leader_id = p.person_id 
         AND tfr.status = 'admin_approved'
       )
       LEFT JOIN team_invitations ti ON (
         ti.invitee_id = p.person_id AND ti.status = 'accepted'
       )
       LEFT JOIN team_formation_requests tfr2 ON (
         tfr2.id = ti.formation_id AND tfr2.status = 'admin_approved'
         AND tfr.id IS NULL
       )
       LEFT JOIN projects prj ON prj.project_id = COALESCE(tfr.project_id, tfr2.project_id)
       LEFT JOIN session_planner_assignments spa ON (
         spa.student_id = p.person_id AND spa.session_id = $1 AND spa.status != 'removed'
       )
       LEFT JOIN persons afp ON afp.person_id = spa.faculty_id
       LEFT JOIN final_student_results fsr ON (
         fsr.session_id = $1 AND fsr.student_id = p.person_id
       )
       WHERE u.user_role = 'student'
         AND p.status = 'active' AND p.is_deleted = false
         AND (
           $2::text = 'admin' OR 
           EXISTS (
             SELECT 1 
             FROM faculty_evaluation_scope fes
             JOIN tracks t ON fes.track_id = t.id
             WHERE fes.faculty_id = $3::uuid
               AND fes.is_active = true
               AND t.name = sts.track
               AND (fes.department_code IS NULL OR fes.department_code = p.department_code)
           )
         )
       ORDER BY p.display_name`,
      [sessionId, req.user.role, req.user.userId || null],
    );
    const students = studentsRes.rows;

    // 4. Get current assignments grouped by faculty
    const assignments = await query(
      `SELECT 
         spa.*,
         sp.display_name as student_name,
         sp.department_code as student_department,
         sp.admission_year as student_admission_year,
         sp.graduation_year as student_batch_year,
         fp.display_name as faculty_name,
         prj.title as project_title,
         assigner.display_name as assigned_by_name,
         COALESCE(assigner_jcm.credibility_score, assigner_ep.credibility_score, 1.0) as assigner_credibility_score,
         COALESCE(fac_jcm.display_score, fac_jcm.credibility_score, 1.0) as faculty_display_score,
         fac_jcm.credibility_band as faculty_cred_band
       FROM session_planner_assignments spa
       JOIN persons sp ON sp.person_id = spa.student_id
       JOIN persons fp ON fp.person_id = spa.faculty_id
       LEFT JOIN projects prj ON prj.project_id = spa.project_id
       LEFT JOIN persons assigner ON assigner.person_id = spa.assigned_by
       LEFT JOIN judge_credibility_metrics assigner_jcm ON assigner_jcm.evaluator_id = spa.assigned_by
       LEFT JOIN evaluator_profiles assigner_ep ON assigner_ep.person_id = spa.assigned_by
       LEFT JOIN judge_credibility_metrics fac_jcm ON fac_jcm.evaluator_id = spa.faculty_id
       WHERE spa.session_id = $1 
         AND spa.status != 'removed'
         AND sp.is_deleted = false AND LOWER(sp.status) IN ('active', 'approved')
       ORDER BY fp.display_name, sp.display_name`,
      [sessionId],
    );

    return res.json({
      success: true,
      data: {
        session: session.rows[0],
        faculty: faculty.rows,
        students: students,
        assignments: assignments.rows,
      },
    });
  } catch (error) {
    logger.error("Failed to get planner overview", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get planner overview" });
  }
};

/**
 * POST /planner/assign-faculty — Assign faculty to student(s) with multi-judge support & team sync
 * Body: { sessionId, studentIds: uuid[], facultyId: uuid }
 */
const assignFaculty = async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    const { sessionId, studentIds, facultyId } = req.body;
    const assignedBy = req.user.personId;

    if (!sessionId || !studentIds || !Array.isArray(studentIds) || !facultyId) {
      return res.status(400).json({
        success: false,
        error: "Session ID, Faculty ID, and Student IDs (array) are required"
      });
    }

    // Guard: cannot assign faculty to a finalized session
    const sesStatusCheck = await query(
      `SELECT status FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]
    );
    if (sesStatusCheck.rows[0]?.status === 'FINALIZED') {
      return res.status(409).json({ success: false, error: "Session is already finalized. Cannot assign faculty." });
    }

    // --- GOVERNANCE: Weekly Window Enforcement ---
    const windowCheck = await GovernanceService.enforceWeeklyWindow(
      sessionId,
      new Date().toISOString(),
      req.user.role,
      req.user.personId,
      req.user.role === 'admin' // Admin always gets override for assignments
    );

    if (!windowCheck.allowed) {
      return res.status(403).json({ success: false, error: windowCheck.reason });
    }

    await client.query("BEGIN");

    let totalAssigned = 0;
    let allAssignedStudents = [];

    // Process each selected student
    for (const directStudentId of studentIds) {

      // SCOPE VALIDATION: Check if faculty is allowed to evaluate this student
      // Admin Override Logic:
      // 1. If user is Admin, they can bypass (implicit power)
      // 2. OR if request has adminOverride=true (explicit override)
      const bypassScope = req.user.role === 'admin' || req.body.adminOverride === true;

      if (!bypassScope) {
        // Strict Check for Faculty
        // Verify target faculty scope against student
        const isAllowed = await facultyScopeService.isStudentAllowed(facultyId, directStudentId);
        if (!isAllowed) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            error: `Assignment Rejected: Student ${directStudentId} is outside the evaluation scope of faculty ${facultyId}.`
          });
        }
      }
      // 1. Identify team members (Team Sync)
      const teamMembers = await client.query(
        `WITH MemberTeam AS (
           SELECT project_id FROM project_members WHERE person_id = $1
         )
         SELECT pm.person_id 
         FROM project_members pm
         JOIN MemberTeam mt ON pm.project_id = mt.project_id
         JOIN projects p ON p.project_id = pm.project_id
         WHERE p.status = 'active'`,
        [directStudentId]
      );

      let studentsToSync = [directStudentId];
      if (teamMembers.rows.length > 0) {
        studentsToSync = teamMembers.rows.map(r => r.person_id);
      }

      // 2. Assign each member (if not already assigned to THIS faculty)
      for (const sId of studentsToSync) {
        // Check for ANY existing assignment (active or removed)
        const existing = await client.query(
          `SELECT id, status FROM session_planner_assignments
           WHERE session_id = $1 AND student_id = $2 AND faculty_id = $3`,
          [sessionId, sId, facultyId]
        );

        if (existing.rows.length > 0) {
          // Record exists. If removed, re-activate it.
          const rec = existing.rows[0];
          if (rec.status === 'removed') {
            await client.query(
              `UPDATE session_planner_assignments 
                SET status = 'assigned', assigned_by = $1, updated_at = NOW()
                WHERE id = $2`,
              [assignedBy, rec.id]
            );
            totalAssigned++;
          }
          // If already assigned, do nothing (idempotent)
        } else {
          // No record exists, insert new
          await client.query(
            `INSERT INTO session_planner_assignments 
               (session_id, faculty_id, student_id, assigned_by, status)
             VALUES ($1, $2, $3, $4, 'assigned')`,
            [sessionId, facultyId, sId, assignedBy]
          );
          totalAssigned++;
        }
        if (!allAssignedStudents.includes(sId)) {
          allAssignedStudents.push(sId);
        }
      }
    }

    await client.query("COMMIT");

    // 3. Real-Time Updates
    const io = require("../socket").getIO();
    io.to(`session:${sessionId}`).emit("assignment:update", {
      sessionId,
      facultyId,
      students: allAssignedStudents,
      assignedByName: req.user.displayName
    });

    // 4. Broadcast global update for dashboards (e.g. Student Dashboard)
    broadcastChange("session_planner", "assignment_created", {
      sessionId,
      facultyId,
      studentIds: allAssignedStudents,
    });

    return res.status(201).json({
      success: true,
      message: `Assigned faculty to ${totalAssigned} students (including teammates).`,
      data: {
        assignedCount: totalAssigned,
        studentIds: allAssignedStudents
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to assign faculty", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to assign faculty" });
  } finally {
    client.release();
  }
};

/**
 * DELETE /planner/unassign — Remove assignment (by faculty, admin, or assigner)
 * Body: { sessionId, studentId, facultyId }
 */
const unassignStudent = async (req, res) => {
  try {
    const { sessionId, studentId, facultyId } = req.body;
    const callerId = req.user.personId;
    const callerRole = req.user.role;

    if (!sessionId || !studentId || !facultyId) {
      return res.status(400).json({
        success: false,
        error: "Session ID, Student ID, and Faculty ID are required."
      });
    }

    // Get the SPECIFIC assignment
    const assignment = await query(
      `SELECT * FROM session_planner_assignments
       WHERE session_id = $1 AND student_id = $2 AND faculty_id = $3 AND status != 'removed'`,
      [sessionId, studentId, facultyId],
    );

    if (assignment.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found." });
    }

    const a = assignment.rows[0];

    // Permission Check:
    // 1. Admin
    // 2. The assigned Faculty (a.faculty_id)
    // 3. The person who created the assignment (a.assigned_by)
    const isAuthorized =
      callerRole === "admin" ||
      a.faculty_id === callerId ||
      a.assigned_by === callerId;

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        error: "You are not authorized to remove this assignment.",
      });
    }

    // Can only remove if 'assigned', 'completed', or 'evaluation_done' (admin only for evaluation_done)
    if (a.status === "assigned" || a.status === "completed" || (a.status === "evaluation_done" && callerRole === "admin")) {

      // Team Sync: Find teammates via project_members (mirror of assignFaculty)
      const teamMembers = await query(
        `WITH MemberTeam AS (
           SELECT project_id FROM project_members WHERE person_id = $1
         )
         SELECT pm.person_id
         FROM project_members pm
         JOIN MemberTeam mt ON pm.project_id = mt.project_id
         JOIN projects p ON p.project_id = pm.project_id
         WHERE p.status = 'active'`,
        [studentId]
      );

      const studentsToUnassign = teamMembers.rows.length > 0
        ? teamMembers.rows.map(r => r.person_id)
        : [studentId];

      // Unassign all team members from this faculty in this session
      const unassignResult = await query(
        `UPDATE session_planner_assignments SET status = 'removed', updated_at = NOW()
         WHERE session_id = $1 AND faculty_id = $2 AND student_id = ANY($3::uuid[])
           AND status IN ('assigned', 'completed'${callerRole === 'admin' ? ", 'evaluation_done'" : ''})`,
        [sessionId, facultyId, studentsToUnassign],
      );

      for (const sId of studentsToUnassign) {
        broadcastChange("session_planner", "unassigned", {
          sessionId,
          studentId: sId,
          facultyId: a.faculty_id,
        });
      }

      // Also emit socket event for real-time UI updates
      const io = require("../socket").getIO();
      io.to(`session:${sessionId}`).emit("assignment:removed", {
        sessionId,
        studentIds: studentsToUnassign,
        facultyId: a.faculty_id
      });

      const count = unassignResult.rowCount || 1;
      return res.json({ success: true, message: `Unassigned ${count} student(s) (including teammates).` });
    }

    return res.status(400).json({
      success: false,
      error: "Cannot unassign during active evaluation. Wait for completion.",
    });
  } catch (error) {
    logger.error("Failed to unassign student", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to unassign" });
  }
};

/**
 * GET /planner/my-assignments — Faculty sees their assigned students
 */
const getMyAssignments = async (req, res) => {
  try {
    const facultyId = req.user.personId;
    const { sessionId } = req.query;

    let sql = `
      SELECT 
        spa.id, spa.session_id, spa.student_id, spa.project_id, spa.status,
        spa.faculty_evaluated_at, spa.student_feedback_at,
        sp.display_name as student_name,
        sp.department_code as student_department,
        sp.admission_year,
        prj.title as project_title,
        fes.title as session_title
      FROM session_planner_assignments spa
      JOIN persons sp ON sp.person_id = spa.student_id
      LEFT JOIN projects prj ON prj.project_id = spa.project_id
      JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      WHERE spa.faculty_id = $1 AND spa.status != 'removed'`;

    const params = [facultyId];
    if (sessionId) {
      params.push(sessionId);
      sql += ` AND spa.session_id = $${params.length}`;
    }
    sql += ` ORDER BY fes.title, sp.display_name`;

    const result = await query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("Failed to get my assignments", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get assignments" });
  }
};

/**
 * GET /planner/my-evaluator — Student sees which faculty is assigned to them
 */
const getMyEvaluator = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { sessionId } = req.query;

    let sql = `
      SELECT 
        spa.id, spa.session_id, spa.faculty_id, spa.status,
        spa.faculty_evaluated_at, spa.student_feedback_at,
        spa.marks, spa.feedback, spa.marks_submitted_at,
        spa.rubric_marks, spa.zero_feedback,
        fp.display_name as faculty_name,
        fp.department_code as faculty_department,
        fes.title as session_title,
        fes.venue as session_venue,
        fes.session_date,
        fes.session_time,
        fes.opens_at as session_opens_at,
        fes.closes_at as session_closes_at,
        es.scheduled_date,
        es.scheduled_time,
        es.venue as scheduled_venue,
        COALESCE(fsr.normalized_score, (
          SELECT SUM(spa2.marks * COALESCE(jcm.credibility_score, 1.0)) / NULLIF(SUM(COALESCE(jcm.credibility_score, 1.0)), 0)
          FROM session_planner_assignments spa2
          LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = spa2.faculty_id
          WHERE spa2.session_id = spa.session_id AND spa2.student_id = spa.student_id AND spa2.status = 'evaluation_done'
        )) as normalized_score,
        fsr.confidence_score,
        fsr.finalized_at,
        fsr.credibility_breakdown,
        fsr.aggregated_score as raw_average,
        fsr.scale_max,
        fsr.display_score,
        fsr.rubric_breakdown
      FROM session_planner_assignments spa
      JOIN persons fp ON fp.person_id = spa.faculty_id
      JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
      LEFT JOIN evaluation_schedules es ON es.session_id = spa.session_id AND es.student_id = spa.student_id AND es.faculty_id = spa.faculty_id
      LEFT JOIN final_student_results fsr ON fsr.session_id = spa.session_id AND fsr.student_id = spa.student_id
      WHERE spa.student_id = $1 AND spa.status != 'removed'`;

    const params = [studentId];
    if (sessionId) {
      params.push(sessionId);
      sql += ` AND spa.session_id = $${params.length}`;
    }
    sql += ` ORDER BY fes.title`;

    const result = await query(sql, params);

    // Build rubric UUID→name mapping for each session's rubric_marks
    const allRubricIds = new Set();
    result.rows.forEach(row => {
      if (row.rubric_marks && typeof row.rubric_marks === 'object') {
        Object.keys(row.rubric_marks).forEach(id => allRubricIds.add(id));
      }
    });
    let rubricNameMap = {};
    if (allRubricIds.size > 0) {
      const nameRes = await query(
        `SELECT head_id, head_name FROM evaluation_heads WHERE head_id = ANY($1::uuid[])`,
        [Array.from(allRubricIds)]
      );
      nameRes.rows.forEach(r => { rubricNameMap[r.head_id] = r.head_name; });
    }
    // Attach rubric_name_map to each row
    const rows = result.rows.map(row => ({ ...row, rubric_name_map: rubricNameMap }));

    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error("Failed to get my evaluator", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get evaluator" });
  }
};

/**
 * GET /all-students — Get all students with track + team info (admin/faculty)
 */
const getAllStudents = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         p.person_id, p.display_name, p.department_code, p.admission_year,
         p.graduation_year AS batch_year,
         sts.track, sts.academic_year, sts.semester,
         tfr.id as formation_id, tfr.status as team_status, tfr.project_id,
         prj.title as project_title,
         CASE WHEN tfr.leader_id = p.person_id THEN true ELSE false END as is_leader
       FROM persons p
       JOIN users u ON u.internal_user_id = p.identity_id
       LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
       LEFT JOIN team_formation_requests tfr ON (
         (tfr.leader_id = p.person_id OR EXISTS (
           SELECT 1 FROM team_invitations ti WHERE ti.formation_id = tfr.id AND ti.invitee_id = p.person_id AND ti.status = 'accepted'
         ))
         AND tfr.status IN ('admin_approved', 'members_accepted')
       )
       LEFT JOIN projects prj ON prj.project_id = tfr.project_id
       WHERE u.user_role = 'student'
         AND p.status = 'active' AND p.is_deleted = false
         AND (
           $1::text = 'admin' OR 
           EXISTS (
             SELECT 1 
             FROM faculty_evaluation_scope fes
             JOIN tracks t ON fes.track_id = t.id
             WHERE fes.faculty_id = $2::uuid
               AND fes.is_active = true
               AND t.name = sts.track
               AND (fes.department_code IS NULL OR fes.department_code = p.department_code)
           )
         )
       ORDER BY p.display_name`,
      [req.user.role, req.user.userId || null]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("Failed to get all students", { error: error.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to get students" });
  }
};

// ============================================================
// HELPER: Create solo team for IT/IT-Core students
// ============================================================
async function _createSoloTeam(personId, academicYear, semester) {
  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    // Create project
    const proj = await client.query(
      `INSERT INTO projects (title, academic_year, semester, start_date, expected_end_date, status, created_by, updated_by)
       VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '6 months', 'draft', $4, $4)
       RETURNING project_id`,
      [
        `IT/IT-Core Individual - ${new Date().toLocaleDateString()}`,
        academicYear,
        semester,
        personId,
      ],
    );

    // Add as sole member
    await client.query(
      `INSERT INTO project_members (project_id, person_id, role_in_project, created_by)
       VALUES ($1, $2, 'Individual', $2)`,
      [proj.rows[0].project_id, personId],
    );

    // Create auto-approved formation (solo = no members to accept, skip to admin_approved)
    await client.query(
      `INSERT INTO team_formation_requests (project_id, leader_id, track, academic_year, semester, status)
       VALUES ($1, $2, 'it_core', $3, $4, 'admin_approved')`,
      [proj.rows[0].project_id, personId, academicYear, semester],
    );

    await client.query("COMMIT");
    return proj.rows[0].project_id;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Failed to create solo team", {
      error: error.message,
      personId,
    });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// POST /planner/submit-marks — Faculty submits PER-RUBRIC marks
// ============================================================
// Accepts: { sessionId, studentId, rubricMarks: { rubricId: 0-5 }, zeroFeedback: { rubricId: "text" }, feedback }
// Pool: per-team (team_size × 5), divided per rubric with floor+remainder (alphabetical)
// Zero marks: allowed but require mandatory feedback (20+ chars)
// ============================================================
const CredibilityService = require("../services/credibility/CredibilityService");
const MIN_ZERO_FEEDBACK_LENGTH = 20;
const MAX_MARKS_PER_RUBRIC = 5;

const submitMarks = async (req, res) => {
  try {
    const facultyId = req.user.personId;
    const callerRole = req.user.role;
    const { sessionId, studentId, rubricMarks, zeroFeedback, feedback } = req.body;

    // --- Validate inputs ---
    if (!sessionId || !studentId || !rubricMarks || typeof rubricMarks !== 'object') {
      return res.status(400).json({
        success: false,
        error: "sessionId, studentId, and rubricMarks (object) are required.",
      });
    }

    const rubricIds = Object.keys(rubricMarks);
    if (rubricIds.length === 0 || rubricIds.length > 5) {
      return res.status(400).json({
        success: false,
        error: "rubricMarks must contain 1-5 rubric entries.",
      });
    }

    // Validate each rubric mark is integer 0-5
    for (const [rubricId, mark] of Object.entries(rubricMarks)) {
      const numMark = Number(mark);
      if (!Number.isInteger(numMark) || numMark < 0 || numMark > MAX_MARKS_PER_RUBRIC) {
        return res.status(400).json({
          success: false,
          error: `Marks for rubric ${rubricId} must be an integer 0-${MAX_MARKS_PER_RUBRIC}. Got: ${mark}`,
        });
      }
    }

    // Guard: cannot submit marks on a finalized session
    const sessionStatusCheck = await query(
      `SELECT status FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]
    );
    if (sessionStatusCheck.rows[0]?.status === 'FINALIZED') {
      return res.status(409).json({ success: false, error: "Session is already finalized. Marks cannot be submitted." });
    }

    // Validate zero feedback for rubrics with 0 marks
    const zeroRubrics = Object.entries(rubricMarks).filter(([, m]) => Number(m) === 0);
    if (zeroRubrics.length > 0) {
      const feedbackObj = zeroFeedback || {};
      for (const [rubricId] of zeroRubrics) {
        const fb = (feedbackObj[rubricId] || "").trim();
        if (fb.length < MIN_ZERO_FEEDBACK_LENGTH) {
          return res.status(400).json({
            success: false,
            error: `Zero marks for rubric requires feedback (min ${MIN_ZERO_FEEDBACK_LENGTH} chars). Rubric: ${rubricId}`,
          });
        }
      }
    }

    // Total marks = sum of all rubric marks
    const totalMarks = Object.values(rubricMarks).reduce((sum, m) => sum + Number(m), 0);

    // --- Verify assignment exists ---
    let assignmentSql, assignmentParams;
    if (callerRole === "admin") {
      assignmentSql = `SELECT id, faculty_id, marks_submitted_at, status
                       FROM session_planner_assignments
                       WHERE session_id = $1 AND student_id = $2 AND status != 'removed'
                       ORDER BY created_at ASC LIMIT 1`;
      assignmentParams = [sessionId, studentId];
    } else {
      assignmentSql = `SELECT id, faculty_id, marks_submitted_at, status
                       FROM session_planner_assignments
                       WHERE session_id = $1 AND student_id = $2
                         AND faculty_id = $3 AND status != 'removed'`;
      assignmentParams = [sessionId, studentId, facultyId];
    }

    const assignment = await query(assignmentSql, assignmentParams);
    if (assignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Assignment not found for this faculty and student combination.",
      });
    }

    const a = assignment.rows[0];
    if (a.faculty_id !== facultyId && callerRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only the assigned faculty or an admin can submit marks.",
      });
    }

    // --- One-time submission guard ---
    if (a.marks_submitted_at) {
      return res.status(400).json({
        success: false,
        error: "Marks already submitted. Cannot be edited.",
      });
    }

    // --- Submit marks with pool validation inside transaction (atomic) ---
    const client = await require("../config/database").pool.connect();
    // Declare variables at outer scope so they remain accessible after the transaction
    let effectiveFacultyId;
    let orderedRubrics;
    let rubricPools = {};
    let usedPerRubric = {};
    let rubricNamesRes;
    try {
      await client.query("BEGIN");

      // --- Per-team scarcity pool validation (inside txn with row locking) ---
      effectiveFacultyId = a.faculty_id;

      // Lock team assignments with FOR UPDATE to prevent concurrent pool breaches
      const teamInfo = await client.query(
        `SELECT spa.student_id, spa.marks, spa.marks_submitted_at, spa.rubric_marks,
                spa.team_formation_id
         FROM session_planner_assignments spa
         WHERE spa.session_id = $1 AND spa.faculty_id = $2 AND spa.status != 'removed'
         FOR UPDATE`,
        [sessionId, effectiveFacultyId]
      );

      const allAssignments = teamInfo.rows;
      const thisStudentRow = allAssignments.find(r => r.student_id === studentId);
      const teamFormationId = thisStudentRow?.team_formation_id;

      const teamAssignments = teamFormationId
        ? allAssignments.filter(r => r.team_formation_id === teamFormationId)
        : [thisStudentRow || { student_id: studentId }];

      const teamSize = teamAssignments.length;
      const rubricCount = rubricIds.length;
      const teamPool = teamSize * MAX_MARKS_PER_RUBRIC;

      // Sort rubrics by name for consistent remainder distribution
      rubricNamesRes = await client.query(
        `SELECT head_id, head_name FROM evaluation_heads WHERE head_id = ANY($1::uuid[])
         ORDER BY head_name ASC`,
        [rubricIds]
      );
      const sortedRubricIds = rubricNamesRes.rows.map(r => r.head_id);
      orderedRubrics = sortedRubricIds.length > 0 ? sortedRubricIds : [...rubricIds].sort();

      const basePool = Math.floor(teamPool / rubricCount);
      const poolRemainder = teamPool - (basePool * rubricCount);
      rubricPools = {};
      orderedRubrics.forEach((rid, idx) => {
        rubricPools[rid] = basePool + (idx < poolRemainder ? 1 : 0);
      });

      // Calculate used marks per rubric across team
      usedPerRubric = {};
      orderedRubrics.forEach(rid => { usedPerRubric[rid] = 0; });

      for (const ta of teamAssignments) {
        if (ta.marks_submitted_at && ta.rubric_marks && ta.student_id !== studentId) {
          const rm = typeof ta.rubric_marks === 'string' ? JSON.parse(ta.rubric_marks) : ta.rubric_marks;
          for (const [rid, marks] of Object.entries(rm)) {
            usedPerRubric[rid] = (usedPerRubric[rid] || 0) + Number(marks);
          }
        }
      }

      // Validate each rubric against its pool
      for (const [rubricId, mark] of Object.entries(rubricMarks)) {
        const numMark = Number(mark);
        const pool = rubricPools[rubricId] || (teamPool / rubricCount);
        const used = usedPerRubric[rubricId] || 0;
        const remaining = pool - used;
        if (numMark > remaining) {
          await client.query("ROLLBACK");
          const rubricName = rubricNamesRes.rows.find(r => r.head_id === rubricId)?.head_name || rubricId;
          // Do NOT call client.release() here — finally block handles it
          throw Object.assign(new Error(`Exceeds rubric pool for "${rubricName}". Pool: ${pool}, Used: ${used}, Remaining: ${remaining}, Requested: ${numMark}.`), { statusCode: 400 });
        }
      }

      // --- Pool OK → submit marks (Event Sourcing + State Update) ---

      // 1. Log Event
      await client.query(
        `INSERT INTO assignment_score_events (assignment_id, session_id, marks, submitted_at)
         VALUES ($1, $2, $3, NOW())`,
        [a.id, sessionId, totalMarks]
      );

      // 2. Update Assignment State with per-rubric data
      await client.query(
        `UPDATE session_planner_assignments
         SET marks = $1,
             rubric_marks = $2,
             zero_feedback = $3,
             feedback = $4,
             marks_submitted_at = NOW(),
             faculty_evaluated_at = NOW(),
             status = 'evaluation_done',
             updated_at = NOW()
         WHERE id = $5`,
        [totalMarks, JSON.stringify(rubricMarks), 
         zeroRubrics.length > 0 ? JSON.stringify(zeroFeedback || {}) : null,
         feedback || null, a.id],
      );

      await client.query("COMMIT");
    } catch (txError) {
      // Pool validation errors already rolled back; guard against double-rollback
      try { await client.query("ROLLBACK"); } catch (_) { /* already rolled back */ }
      logger.error("submitMarks transaction failed", { error: txError.message });
      throw txError;
    } finally {
      client.release();
    }

    // --- Real-time notifications ---
    emitToPerson(EVENTS.ASSIGNMENT_UPDATED, studentId, {
      type: "marks_received",
      sessionId,
      rubricMarks,
      totalMarks,
      feedback: feedback || null,
    });

    broadcastChange("session_planner", "marks_submitted", {
      sessionId,
      studentId,
      facultyId: effectiveFacultyId,
    });

    // --- Auto-complete student results when ALL judges submitted ---
    const studentCheck = await query(
      `SELECT 
         COUNT(*)::int as total,
         COUNT(CASE WHEN status = 'evaluation_done' THEN 1 END)::int as received
       FROM session_planner_assignments
       WHERE session_id = $1 AND student_id = $2 AND status != 'removed'`,
      [sessionId, studentId]
    );

    const sCheck = studentCheck.rows[0];
    if (sCheck.total > 0 && sCheck.received === sCheck.total) {
      try {
        await CredibilityService.calculateStudentScore(sessionId, studentId);
        broadcastChange("session_planner", "student_finalized", { sessionId, studentId });
      } catch (err) {
        logger.error("Failed to calculate student real-time score", { sessionId, studentId, error: err.message });
      }
    }

    // --- Auto-complete session ---
    const completionCheck = await query(
      `SELECT 
         (SELECT COUNT(*) FROM session_planner_assignments WHERE session_id = $1 AND status != 'removed') as total,
         (SELECT COUNT(*) FROM session_planner_assignments WHERE session_id = $1 AND status != 'removed' AND marks IS NOT NULL) as received`,
      [sessionId],
    );

    const { total, received } = completionCheck.rows[0];
    if (parseInt(total) > 0 && parseInt(received) === parseInt(total)) {
      CredibilityService.finalizeSession(sessionId)
        .then(result => {
          if (result.status === 'SUCCESS') {
            logger.info("Session finalization triggered successfully", { sessionId });
            broadcastChange("session_planner", "session_completed", { sessionId });
          }
        })
        .catch(err => {
          logger.error("Session finalization failed", { sessionId, error: err.message });
        });
    }

    // Build pool response per rubric
    const poolResponse = {};
    for (const rid of orderedRubrics) {
      const pool = rubricPools[rid] || 0;
      const usedNow = (usedPerRubric[rid] || 0) + (Number(rubricMarks[rid]) || 0);
      poolResponse[rid] = { pool, used: usedNow, remaining: pool - usedNow };
    }

    logger.info("Per-rubric marks submitted", {
      sessionId, studentId, facultyId: effectiveFacultyId,
      totalMarks, rubricCount: rubricIds.length,
    });

    return res.json({
      success: true,
      message: "Per-rubric marks submitted successfully.",
      data: {
        totalMarks,
        rubricMarks,
        feedback: feedback || null,
        rubricPools: poolResponse,
      },
    });
  } catch (error) {
    // Pool validation errors have a statusCode (e.g. 400)
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    logger.error("Failed to submit marks", { error: error.message, stack: error.stack });
    return res.status(500).json({ success: false, error: "Failed to submit marks." });
  }
};

// ============================================================
// GET /my-sessions — Faculty: sessions assigned to me + student details
// ============================================================
const getMySessions = async (req, res) => {
  try {
    const personId = req.user.personId;
    if (!personId) {
      return res
        .status(400)
        .json({ success: false, error: "Person record not found." });
    }

    // Get distinct sessions where this faculty has assignments
    const sessions = await query(
      `SELECT DISTINCT
         fes.id                   AS session_id,
         fes.title,
         fes.description,
         fes.status,
         fes.opens_at,
         fes.closes_at,
         fes.academic_year,
         fes.semester,
         fes.batch_year,
         fes.venue,
         fes.session_date,
         fes.session_time,
         fes.created_at,
         fes.preferred_rubric_ids,
         fes.min_judges
       FROM session_planner_assignments spa
       JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
       WHERE spa.faculty_id = $1
       ORDER BY fes.created_at DESC`,
      [personId],
    );

    // For each session, get the assigned students with details
    const result = [];
    for (const sess of sessions.rows) {
      const students = await query(
        `SELECT
           spa.id             AS assignment_id,
           spa.status         AS assignment_status,
           spa.student_id,
           spa.marks,
           spa.feedback,
           spa.marks_submitted_at,
           spa.rubric_marks,
           spa.zero_feedback,
           p.display_name,
           p.department_code,
           p.admission_year,
           p.graduation_year AS batch_year,
           u.normalized_email AS email,
           sts.track,
           COALESCE(tfr.id, tfr2.id)             AS team_id,
           proj.title         AS team_title,
           es.scheduled_date,
           es.scheduled_time,
           es.venue           AS scheduled_venue,
           (SELECT p2.display_name
            FROM persons p2
            WHERE p2.person_id = COALESCE(tfr.leader_id, tfr2.leader_id)
            LIMIT 1)          AS team_leader_name,
           (SELECT json_agg(json_build_object(
              'personId', mp.person_id,
              'displayName', mp.display_name,
              'departmentCode', mp.department_code,
              'role', CASE WHEN mp.person_id = COALESCE(tfr.leader_id, tfr2.leader_id) THEN 'leader' ELSE 'member' END
            ))
            FROM (
              SELECT COALESCE(tfr.leader_id, tfr2.leader_id) AS pid
              UNION
              SELECT ti3.invitee_id FROM team_invitations ti3
              WHERE ti3.formation_id = COALESCE(tfr.id, tfr2.id) AND ti3.status = 'accepted'
            ) team_pids
            JOIN persons mp ON mp.person_id = team_pids.pid
           ) AS team_members,
           (SELECT json_agg(json_build_object(
              'facultyId', es2.faculty_id,
              'facultyName', f2.display_name,
              'date', es2.scheduled_date,
              'time', es2.scheduled_time,
              'venue', es2.venue
            ))
            FROM evaluation_schedules es2
            JOIN persons f2 ON f2.person_id = es2.faculty_id
            WHERE es2.session_id = $1 AND es2.student_id = spa.student_id
           ) AS all_schedules
         FROM session_planner_assignments spa
         JOIN persons p ON p.person_id = spa.student_id
         LEFT JOIN users u ON u.internal_user_id = p.identity_id
         LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
         LEFT JOIN evaluation_schedules es ON es.session_id = spa.session_id AND es.student_id = spa.student_id AND es.faculty_id = spa.faculty_id
         LEFT JOIN team_formation_requests tfr ON (
           tfr.leader_id = p.person_id
         ) AND tfr.status = 'admin_approved'
         LEFT JOIN team_invitations ti ON ti.invitee_id = p.person_id AND ti.status = 'accepted'
         LEFT JOIN team_formation_requests tfr2 ON (
           tfr2.id = ti.formation_id AND tfr.id IS NULL
         ) AND tfr2.status = 'admin_approved'
         LEFT JOIN projects proj ON proj.project_id = COALESCE(tfr.project_id, tfr2.project_id)
         WHERE spa.session_id = $1 
           AND spa.faculty_id = $2
           AND spa.status != 'removed'
           AND p.is_deleted = false AND p.status = 'active'
         ORDER BY COALESCE(tfr.id, tfr2.id) NULLS LAST, p.display_name`,
        [sess.session_id, personId],
      );

      result.push({
        ...sess,
        studentCount: students.rows.length,
        students: students.rows,
      });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error("getMySessions error", { error: err.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to load sessions." });
  }
};

// ============================================================
// GET /session-history — All sessions with assignment stats (admin view)
// ============================================================
const getSessionHistory = async (req, res) => {
  try {
    const sessions = await query(
      `SELECT
         fes.id              AS session_id,
         fes.title,
         fes.description,
         fes.status,
         fes.opens_at,
         fes.closes_at,
         fes.academic_year,
         fes.semester,
         fes.venue,
         fes.session_date,
         fes.session_time,
         fes.created_at,
         fes.group_id,
         fes.track,
         sg.title            AS group_title,
         COALESCE(stats.total_assignments, 0)   AS total_assignments,
         COALESCE(stats.assigned_students, 0)    AS assigned_students,
         COALESCE(stats.faculty_count, 0)        AS faculty_count,
         COALESCE(student_count.cnt, 0)          AS total_students
       FROM faculty_evaluation_sessions fes
       LEFT JOIN session_groups sg ON sg.id = fes.group_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)                                AS total_assignments,
           COUNT(DISTINCT spa.student_id)          AS assigned_students,
           COUNT(DISTINCT spa.faculty_id)          AS faculty_count
         FROM session_planner_assignments spa
         WHERE spa.session_id = fes.id
       ) stats ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT p.person_id) AS cnt
         FROM persons p
         WHERE p.person_type = 'student' AND p.is_deleted = false
       ) student_count ON true
       ORDER BY fes.created_at DESC`,
    );

    return res.json({ success: true, data: sessions.rows });
  } catch (err) {
    logger.error("getSessionHistory error", { error: err.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to load session history." });
  }
};

// ============================================================
// EXPORTS
// ============================================================

const checkExistingAssignments = async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;

    const result = await query(
      `SELECT 
         spa.id, 
         spa.status,
         f.display_name as faculty_name,
         COALESCE(jcm.credibility_score, ep.credibility_score, 1.0) as credibility_score
       FROM session_planner_assignments spa
       JOIN persons f ON f.person_id = spa.faculty_id
       LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = f.person_id
       LEFT JOIN evaluator_profiles ep ON ep.person_id = f.person_id
       WHERE spa.session_id = $1 AND spa.student_id = $2 AND spa.status != 'removed'`,
      [sessionId, studentId]
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error("Failed to check assignments", { error: error.message });
    return res.status(500).json({ success: false, error: "Check failed" });
  }
};

// ============================================================
// SCHEDULING ENDPOINTS — Faculty sets date/time/venue
// ============================================================

/**
 * POST /planner/set-schedule — Faculty sets date/time/venue for student(s)
 * Body: { sessionId, studentIds: uuid[], date: "YYYY-MM-DD", time: "HH:MM", venue: string }
 * Auto-expands to team members. Validates date within session segment week.
 */
const setSchedule = async (req, res) => {
  try {
    const { sessionId, studentIds, date, time, venue } = req.body;
    const facultyId = req.user.personId;

    if (!sessionId || !studentIds?.length || !date || !time) {
      return res
        .status(400)
        .json({ success: false, error: "sessionId, studentIds, date, and time are required." });
    }

    // --- GOVERNANCE: Weekly Window Enforcement ---
    // For session planner scheduling, the admin already approved the session
    // by setting it to ACTIVE. Faculty are free to schedule their evaluation
    // date at any point while the session remains active, so we only enforce
    // the window for sessions that are NOT yet active (i.e., still being
    // configured). Admins always bypass regardless.
    const schedIsAdmin = req.user.role === "admin";
    if (!schedIsAdmin) {
      // Check session status — if active, skip window enforcement
      const statusRes = await query(
        `SELECT status, session_week_start, session_week_end FROM faculty_evaluation_sessions WHERE id = $1`,
        [sessionId]
      );
      if (statusRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }
      const { status: sesStatus, session_week_start, session_week_end } = statusRes.rows[0];
      // Only enforce window when session is NOT active AND a window IS configured
      if (sesStatus !== "active" && session_week_start && session_week_end) {
        const windowCheck = await GovernanceService.enforceWeeklyWindow(
          sessionId, date, req.user.role, req.user.personId, false, ""
        );
        if (!windowCheck.allowed) {
          return res.status(403).json({ success: false, error: windowCheck.reason });
        }
      }
    }

    // Get session info to validate date within segment week
    const sessionRes = await query(
      `SELECT title, session_date FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    // Expand to team members: for each studentId, find their team and add all team members
    const expandedIds = new Set(studentIds);
    for (const sid of studentIds) {
      // Find via leader
      const asLeader = await query(
        `SELECT ti.invitee_id FROM team_formation_requests tfr
         JOIN team_invitations ti ON ti.formation_id = tfr.id AND ti.status = 'accepted'
         WHERE tfr.leader_id = $1 AND tfr.status = 'admin_approved'`,
        [sid],
      );
      if (asLeader.rows.length > 0) {
        // sid is a leader — add all accepted invitees
        for (const r of asLeader.rows) expandedIds.add(r.invitee_id);
        expandedIds.add(sid); // leader themselves
      }

      // Find via invitee
      const asInvitee = await query(
        `SELECT tfr.leader_id, ti2.invitee_id
         FROM team_invitations ti
         JOIN team_formation_requests tfr ON tfr.id = ti.formation_id AND tfr.status = 'admin_approved'
         LEFT JOIN team_invitations ti2 ON ti2.formation_id = tfr.id AND ti2.status = 'accepted'
         WHERE ti.invitee_id = $1 AND ti.status = 'accepted'`,
        [sid],
      );
      for (const r of asInvitee.rows) {
        expandedIds.add(r.leader_id);
        if (r.invitee_id) expandedIds.add(r.invitee_id);
      }
    }

    // Filter to only students that are actually assigned to this faculty in this session
    const assignedCheck = await query(
      `SELECT student_id FROM session_planner_assignments
       WHERE session_id = $1 AND faculty_id = $2 AND student_id = ANY($3) AND status != 'removed'`,
      [sessionId, facultyId, Array.from(expandedIds)],
    );
    const validIds = assignedCheck.rows.map((r) => r.student_id);

    if (validIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "None of the selected students are assigned to you." });
    }

    // UPSERT schedules for all valid students
    const results = [];
    for (const sid of validIds) {
      const r = await query(
        `INSERT INTO evaluation_schedules (session_id, faculty_id, student_id, scheduled_date, scheduled_time, venue)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (session_id, student_id, faculty_id)
         DO UPDATE SET scheduled_date = $4, scheduled_time = $5, venue = $6, updated_at = NOW()
         RETURNING *`,
        [sessionId, facultyId, sid, date, time, venue || ""],
      );
      results.push(r.rows[0]);
    }

    // Broadcast real-time update
    broadcastChange("session_planner", "schedule_updated", {
      sessionId,
      facultyId,
      studentIds: validIds,
    });

    // Also notify each student individually
    for (const sid of validIds) {
      emitToPerson("schedule_updated", sid, {
        sessionId,
        facultyId,
        date,
        time,
        venue: venue || "",
      });
    }

    logger.info("Schedule set", { sessionId, facultyId, count: validIds.length });
    return res.json({ success: true, data: results });
  } catch (error) {
    logger.error("setSchedule failed", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /planner/student-schedules/:sessionId/:studentId
 * Returns all schedules for a student across ALL faculty in this session
 * (for cross-faculty conflict visibility)
 */
const getStudentSchedules = async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;

    const result = await query(
      `SELECT
         es.id,
         es.faculty_id,
         f.display_name AS faculty_name,
         COALESCE(jcm.credibility_score, ep.credibility_score, 1.0) AS credibility_score,
         es.scheduled_date,
         es.scheduled_time,
         es.venue,
         es.updated_at
       FROM evaluation_schedules es
       JOIN persons f ON f.person_id = es.faculty_id
       LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = f.person_id
       LEFT JOIN evaluator_profiles ep ON ep.person_id = f.person_id
       WHERE es.session_id = $1 AND es.student_id = $2
       ORDER BY es.scheduled_date, es.scheduled_time`,
      [sessionId, studentId],
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("getStudentSchedules failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get schedules" });
  }
};

/**
 * GET /planner/my-schedules — Student sees all their scheduled evaluations
 */
const getMySchedules = async (req, res) => {
  try {
    const studentId = req.user.personId;

    const result = await query(
      `SELECT
         es.id,
         es.session_id,
         fes.title AS session_title,
         es.faculty_id,
         f.display_name AS faculty_name,
         f.department_code AS faculty_department,
         es.scheduled_date,
         es.scheduled_time,
         es.venue,
         es.updated_at
       FROM evaluation_schedules es
       JOIN faculty_evaluation_sessions fes ON fes.id = es.session_id
       JOIN persons f ON f.person_id = es.faculty_id
       WHERE es.student_id = $1
       ORDER BY es.scheduled_date, es.scheduled_time`,
      [studentId],
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("getMySchedules failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get schedules" });
  }
};

/**
 * GET /planner/my-results/:sessionId — Student sees final results or progress
 */
const getMyResults = async (req, res) => {
  try {
    const studentId = req.user.personId;
    const { sessionId } = req.params;

    // Get Session Status
    const sessionRes = await query(
      `SELECT status FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }

    const status = sessionRes.rows[0].status;

    if (status === 'FINALIZED') {
      // Fetch Frozen Results
      const result = await query(
        `SELECT
           aggregated_score,
           normalized_score,
           confidence_score,
           judge_count,
           snapshot_version,
           display_score,
           rubric_breakdown,
           scale_max
         FROM final_student_results
         WHERE session_id = $1 AND student_id = $2`,
        [sessionId, studentId]
      );

      return res.json({
        success: true,
        data: {
          status: 'FINALIZED',
          results: result.rows[0] || null
        }
      });
    } else {
      // Fetch Real-time Progress (Assignments status) + Real-time Score
      const progress = await query(
        `SELECT
           COUNT(*) as total_judges,
           COUNT(CASE WHEN status = 'evaluation_done' THEN 1 END) as completed_evaluations,
           (
             SELECT SUM(spa2.marks * COALESCE(jcm.credibility_score, 1.0)) / NULLIF(SUM(COALESCE(jcm.credibility_score, 1.0)), 0)
             FROM session_planner_assignments spa2
             LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = spa2.faculty_id
             WHERE spa2.session_id = $1 AND spa2.student_id = $2 AND spa2.status = 'evaluation_done'
           ) as real_time_score
         FROM session_planner_assignments
         WHERE session_id = $1 AND student_id = $2 AND status != 'removed'`,
        [sessionId, studentId]
      );

      return res.json({
        success: true,
        data: {
          status: 'OPEN',
          progress: progress.rows[0],
          results: progress.rows[0].completed_evaluations > 0 ? {
            normalized_score: progress.rows[0].real_time_score,
            is_real_time: true
          } : null
        }
      });
    }
  } catch (error) {
    logger.error("getMyResults failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to get results" });
  }
};

// ============================================================
// AUTO-ASSIGNMENT
// ============================================================
const suggestEvaluators = async (req, res) => {
  try {
    const { sessionId, studentId } = req.body;
    if (!sessionId || !studentId) {
      return res.status(400).json({ success: false, error: "Session ID and Student ID are required" });
    }

    const AutoAssignmentService = require("../services/autoAssignmentService");
    const suggestions = await AutoAssignmentService.getSuggestions(sessionId, studentId);

    return res.json({ success: true, data: suggestions });
  } catch (error) {
    logger.error("Failed to get evaluator suggestions", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to suggest evaluators" });
  }
};

// ============================================================
// TEST AUTO-ASSIGNMENT ENDPOINTS (ADMIN ONLY)
// ============================================================

/**
 * POST /test-auto-assign — Trigger instant auto-assignment for visible students
 * Acts as a simulation of the weekly scheduler but runs immediately.
 */
const testAutoAssign = async (req, res) => {
  try {
    // 1. Admin Verification
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized: Admins only." });
    }

    // minJudges: admin can choose 2 or 3 judges per student (clamped to 2-3)
    // rubricIds: exactly 3 evaluation head UUIDs chosen in the modal
    const { sessionId, minJudges: rawMinJudges, rubricIds } = req.body;
    const minJudges = Math.min(Math.max(parseInt(rawMinJudges) || 2, 2), 3);
    const adminId = req.user.userId;

    // Validate rubricIds — must be array of exactly 3 UUIDs
    if (!rubricIds || !Array.isArray(rubricIds) || rubricIds.length !== 3) {
      return res.status(400).json({
        success: false,
        error: "Exactly 3 rubric IDs are required to run auto-assignment.",
      });
    }

    // 2. Block auto-assign if ANY marks have been submitted in this session
    const marksCheck = await query(
      `SELECT COUNT(*)::int AS count FROM session_planner_assignments
       WHERE session_id = $1 AND marks IS NOT NULL AND status != 'removed'`,
      [sessionId]
    );
    if (marksCheck.rows[0].count > 0) {
      return res.status(409).json({
        success: false,
        error: "Cannot run auto-assignment after marks have been submitted. Reset evaluations first."
      });
    }

    // 3. Block if session is already FINALIZED
    const statusCheck = await query(
      `SELECT status FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]
    );
    if (statusCheck.rows[0]?.status === 'FINALIZED') {
      return res.status(409).json({
        success: false,
        error: "Cannot run auto-assignment on a finalized session."
      });
    }

    const AutoAssignmentService = require("../services/autoAssignmentService");
    const RubricService = require("../services/scarcity/RubricService");

    // Trigger Batch Assignment with admin-chosen judge count (2 or 3)
    const result = await AutoAssignmentService.assignBatch(sessionId, req.user.personId, 'test_auto', minJudges);

    // Persist admin preferences on the session row
    await query(
      `UPDATE faculty_evaluation_sessions
         SET preferred_rubric_ids = $1,
             min_judges           = $2
       WHERE id = $3`,
      [rubricIds, minJudges, sessionId]
    );

    // Attach rubrics to linked scarcity session if one exists.
    // Note: evaluation_sessions uses 'scarcity_pool_size', not 'pool_size'.
    try {
      const scarcityRow = await query(
        `SELECT es.session_id, es.scarcity_pool_size AS pool_size
           FROM evaluation_sessions es
          WHERE es.session_id = $1
          LIMIT 1`,
        [sessionId]
      );
      if (scarcityRow.rows.length > 0) {
        const { session_id: scId, pool_size } = scarcityRow.rows[0];
        await RubricService.attachToSession(scId, rubricIds, pool_size, req.user.personId);
      }
    } catch (rubricErr) {
      // Non-fatal — log and continue
      logger.warn("AutoAssign: rubric attach failed (non-fatal)", { error: rubricErr.message });
    }

    // Broadcast update
    emitToRole('planner:update', 'admin', { count: result.count });

    return res.json({
      success: true,
      message: `Adaptive batch auto-assignment complete. Created ${result.count} assignments.`,
      count: result.count,
      rubricIds,
      minJudges,
      track: result.track || null,
      warnings: result.warnings || [],
    });

  } catch (error) {
    logger.error("Test Auto-Assign Failed", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /test-auto-assign — Reset/Clear all test assignments
 */
const resetTestAssignments = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { sessionId } = req.body || {};

    // Delete assignments (scoped to session if provided)
    // Must delete child rows in assignment_score_events first (FK constraint)
    let result;
    if (sessionId) {
      // Delete dependent score events for test_auto assignments in this session
      await query(`
          DELETE FROM assignment_score_events
          WHERE assignment_id IN (
            SELECT id FROM session_planner_assignments
            WHERE session_id = $1 AND assignment_source = 'test_auto'
          )`, [sessionId]);
      result = await query(`
          DELETE FROM session_planner_assignments
          WHERE session_id = $1 AND assignment_source = 'test_auto'
          RETURNING id`, [sessionId]);
      // Reset the auto_suggested flag for the specific session
      await query(
        `UPDATE faculty_evaluation_sessions SET auto_suggested = FALSE, updated_at = NOW() WHERE id = $1`,
        [sessionId]
      );
    } else {
      // Collect affected sessions before deleting
      const affected = await query(
        `SELECT DISTINCT session_id FROM session_planner_assignments WHERE assignment_source = 'test_auto'`
      );
      // Delete dependent score events for all test_auto assignments
      await query(`
          DELETE FROM assignment_score_events
          WHERE assignment_id IN (
            SELECT id FROM session_planner_assignments
            WHERE assignment_source = 'test_auto'
          )`);
      result = await query(`
          DELETE FROM session_planner_assignments
          WHERE assignment_source = 'test_auto'
          RETURNING id`);
      // Reset auto_suggested for all affected sessions
      if (affected.rows.length > 0) {
        const ids = affected.rows.map(r => r.session_id);
        await query(
          `UPDATE faculty_evaluation_sessions SET auto_suggested = FALSE, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
          [ids]
        );
      }
    }

    // Broadcast update
    emitToRole('planner:update', 'admin', { count: result.rows.length, action: 'reset' });

    return res.json({
      success: true,
      message: `Removed ${result.rows.length} test assignments.`,
      count: result.rows.length
    });
  } catch (error) {
    logger.error("Reset Test Assignments Failed", { error: error.message });
    return res.status(500).json({ success: false, error: "Failed to reset" });
  }
};

// ============================================================
// MANUAL FINALIZATION (Admin Only)
// ============================================================

/**
 * POST /planner/finalize — Admin-triggered session finalization
 * Freezes credibility snapshot → weighted aggregation → NormDev updates → seal
 */
const finalizeSessionManual = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized: Admins only." });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: "sessionId is required" });
    }

    // Guard: already finalized
    const statusCheck = await query(
      `SELECT status FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]
    );
    if (!statusCheck.rows[0]) {
      return res.status(404).json({ success: false, error: "Session not found" });
    }
    if (statusCheck.rows[0].status === 'FINALIZED') {
      return res.status(409).json({ success: false, error: "Session is already finalized." });
    }

    // Guard: must have at least some submitted marks
    const marksCheck = await query(
      `SELECT COUNT(*)::int AS count FROM session_planner_assignments
       WHERE session_id = $1 AND status = 'evaluation_done'`,
      [sessionId]
    );
    if (marksCheck.rows[0].count === 0) {
      return res.status(400).json({ success: false, error: "No evaluations completed yet. Cannot finalize an empty session." });
    }

    const CredibilityService = require("../services/credibility/CredibilityService");
    const result = await CredibilityService.finalizeSession(sessionId);

    // Run anomaly detection after finalization
    const anomalyDetectionService = require("../services/anomalyDetectionService");
    const anomalyResult = await anomalyDetectionService.detectAnomalies(sessionId);

    // Broadcast
    emitToRole('planner:update', 'admin', { action: 'finalized', sessionId });
    broadcastChange('session_planner', 'session_completed', { sessionId });

    const protectionNote = result.firstSessionProtection
      ? " (first-session two-pass protection applied)"
      : "";

    logger.info("Session manually finalized by admin", {
      sessionId,
      adminId: req.user.personId,
      studentsScored: result.studentsScored,
      alertsDetected: anomalyResult.alerts.length,
      firstSessionProtection: result.firstSessionProtection,
    });

    return res.json({
      success: true,
      message: `Session finalized. ${result.studentsScored} students scored using credibility-weighted aggregation${protectionNote}.`,
      studentsScored: result.studentsScored,
      alerts: anomalyResult.alerts,
      firstSessionProtection: result.firstSessionProtection || false,
    });
  } catch (error) {
    logger.error("Manual finalization failed", { error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================
// SESSION GROUPS — Parent-Child Track-Based Sessions
// ============================================================

/**
 * POST /session-groups — Create a session group with one child per track
 * Body: { month, segment, targetYear, academicYear, semester }
 *
 * Creates:
 *   1. A parent row in session_groups
 *   2. One faculty_evaluation_sessions row per track (core, it_core, premium)
 *      each linked via group_id + track column
 */
const createSessionGroup = async (req, res) => {
  try {
    const {
      month,       // e.g. "Feb"
      segment,     // e.g. "S1"
      targetYear,  // e.g. "Final Year" (legacy, optional)
      batchYear,   // e.g. 2027 (NEW: permanent batch identifier)
      academicYear,
      semester,
    } = req.body;

    // Accept either batchYear (new) or targetYear (legacy)
    const effBatchYear = batchYear ? parseInt(batchYear) : null;
    const effTargetYear = targetYear || (effBatchYear ? batchToYearLabel(effBatchYear) : null);

    if (!month || !segment || (!effBatchYear && !effTargetYear)) {
      return res.status(400).json({
        success: false,
        error: "month, segment and batchYear (or targetYear) are required.",
      });
    }

    const createdBy = req.user.personId || req.user.userId;
    const effAcademicYear = academicYear || new Date().getFullYear();
    const effSemester = semester || 1;
    // Title now shows batch year: "Feb S1 - Batch 2027 (Final Year)"
    const yearDisplay = effBatchYear
      ? `Batch ${effBatchYear}` 
      : effTargetYear;
    const groupTitle = `${month} ${segment} - ${yearDisplay}`;

    // ── Duplicate guard: check if a group with this exact title already exists ──
    const existingGroup = await query(
      `SELECT sg.id, sg.title,
              json_agg(json_build_object(
                'id', fes.id, 'track', fes.track, 'title', fes.title, 'status', fes.status
              )) AS sessions
       FROM session_groups sg
       JOIN faculty_evaluation_sessions fes ON fes.group_id = sg.id
       WHERE sg.title = $1
       GROUP BY sg.id`,
      [groupTitle],
    );
    if (existingGroup.rows.length > 0) {
      return res.status(200).json({
        success: true,
        existed: true,
        data: existingGroup.rows[0],
      });
    }

    // ── Compute session_date from month + segment ──
    let autoDate = null;
    const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const monthIdx = MONTHS[month];
    const segNum = parseInt(segment.replace("S", "")) || 1;
    if (monthIdx !== undefined) {
      const day = (segNum - 1) * 7 + 1;
      autoDate = new Date(effAcademicYear, monthIdx, day).toISOString().split("T")[0];
    }

    // ── 1. Create parent session_group ──
    const groupRes = await query(
      `INSERT INTO session_groups (title, session_date, target_year, academic_year, semester, created_by, batch_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [groupTitle, autoDate, effTargetYear, effAcademicYear, effSemester, createdBy, effBatchYear],
    );
    const group = groupRes.rows[0];

    // ── 2. Create one child session per track ──
    const TRACKS = ["core", "it_core", "premium"];
    const TRACK_LABELS = { core: "Core", it_core: "IT & Core", premium: "Premium" };
    const childSessions = [];

    for (const track of TRACKS) {
      const childTitle = `${groupTitle} [${TRACK_LABELS[track]}]`;
      const childDesc = effBatchYear
        ? `Batch ${effBatchYear} (${effTargetYear || ''}) | Track: ${TRACK_LABELS[track]}`
        : `Target: ${effTargetYear} | Track: ${TRACK_LABELS[track]}`;
      const childRes = await query(
        `INSERT INTO faculty_evaluation_sessions
           (title, description, evaluation_mode, academic_year, semester, status,
            created_by, session_date, group_id, track, batch_year)
         VALUES ($1, $2, 'small_pool', $3, $4, 'active', $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          childTitle,
          childDesc,
          effAcademicYear,
          effSemester,
          createdBy,
          autoDate,
          group.id,
          track,
          effBatchYear,
        ],
      );
      childSessions.push(childRes.rows[0]);
    }

    logger.info("SessionGroup created", {
      groupId: group.id,
      title: groupTitle,
      childCount: childSessions.length,
      createdBy,
    });

    broadcastChange("session_group", "created", { groupId: group.id });

    return res.status(201).json({
      success: true,
      data: {
        ...group,
        sessions: childSessions,
      },
    });
  } catch (err) {
    logger.error("createSessionGroup error", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /session-groups — List all session groups with their child sessions
 * Returns groups in reverse chronological order, each with its track sessions.
 */
const listSessionGroups = async (req, res) => {
  try {
    const groups = await query(
      `SELECT
         sg.id              AS group_id,
         sg.title,
         sg.session_date,
         sg.target_year,
         sg.academic_year,
         sg.semester,
         sg.batch_year,
         sg.created_at,
         json_agg(
           json_build_object(
             'id', fes.id,
             'title', fes.title,
             'track', fes.track,
             'status', fes.status,
             'session_date', fes.session_date,
             'auto_suggested', fes.auto_suggested,
             'finalized_at', fes.finalized_at,
             'totalAssignments', (SELECT COUNT(*) FROM session_planner_assignments spa WHERE spa.session_id = fes.id AND spa.status != 'removed'),
             'assignedStudents', (SELECT COUNT(DISTINCT spa.student_id) FROM session_planner_assignments spa WHERE spa.session_id = fes.id AND spa.status != 'removed'),
             'facultyCount', (SELECT COUNT(DISTINCT spa.faculty_id) FROM session_planner_assignments spa WHERE spa.session_id = fes.id AND spa.status != 'removed')
           ) ORDER BY fes.track
         ) AS sessions
       FROM session_groups sg
       JOIN faculty_evaluation_sessions fes ON fes.group_id = sg.id
       GROUP BY sg.id
       ORDER BY sg.created_at DESC`,
    );

    return res.json({ success: true, data: groups.rows });
  } catch (err) {
    logger.error("listSessionGroups error", { error: err.message });
    return res.status(500).json({ success: false, error: "Failed to load session groups." });
  }
};

/**
 * GET /session-groups/:groupId — Get a single session group with full details
 */
const getSessionGroupDetail = async (req, res) => {
  try {
    const { groupId } = req.params;

    const groupRes = await query(
      `SELECT * FROM session_groups WHERE id = $1`,
      [groupId],
    );
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Session group not found." });
    }
    const group = groupRes.rows[0];

    const sessionsRes = await query(
      `SELECT fes.*,
              (SELECT COUNT(*) FROM session_planner_assignments spa
               WHERE spa.session_id = fes.id AND spa.status != 'removed') AS total_assignments,
              (SELECT COUNT(DISTINCT spa.student_id) FROM session_planner_assignments spa
               WHERE spa.session_id = fes.id AND spa.status != 'removed') AS assigned_students,
              (SELECT COUNT(DISTINCT spa.faculty_id) FROM session_planner_assignments spa
               WHERE spa.session_id = fes.id AND spa.status != 'removed') AS faculty_count
       FROM faculty_evaluation_sessions fes
       WHERE fes.group_id = $1
       ORDER BY fes.track`,
      [groupId],
    );

    return res.json({
      success: true,
      data: {
        ...group,
        sessions: sessionsRes.rows,
      },
    });
  } catch (err) {
    logger.error("getSessionGroupDetail error", { error: err.message });
    return res.status(500).json({ success: false, error: "Failed to load session group." });
  }
};

module.exports = {
  // Track
  getMyTrack,
  selectTrack,
  getTrackConfig,
  // Team
  getAvailableStudents,
  createTeam,
  getMyTeam,
  respondToInvitation,
  getPendingInvitations,
  // Admin team management
  listTeamFormations,
  approveTeam,
  rejectTeam,
  // Session planner
  verifyPlannerPassword,
  getPlannerOverview,
  assignFaculty,
  checkExistingAssignments,
  unassignStudent,
  getMyAssignments,
  getMyEvaluator,
  getAllStudents,
  getMySessions,
  getSessionHistory,
  submitMarks,
  // Scheduling
  setSchedule,
  getStudentSchedules,
  getMySchedules,
  getMyResults,
  // Auto-Assignment
  suggestEvaluators,
  testAutoAssign,
  resetTestAssignments,
  // Finalization
  finalizeSessionManual,
  // Session Groups
  createSessionGroup,
  listSessionGroups,
  getSessionGroupDetail,
};
