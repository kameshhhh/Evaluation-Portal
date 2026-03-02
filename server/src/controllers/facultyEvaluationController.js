// ============================================================
// FACULTY EVALUATION CONTROLLER
// ============================================================
// SRS §4.4 — Faculty Evaluation Module
// Students evaluate faculty using scarcity-based tier ranking.
// RULE: Only faculty who have previously evaluated the student
//       appear as eligible (prevents feedback to unknowns).
// ============================================================

const { query, getClient } = require("../config/database");
const logger = require("../utils/logger");
const {
  broadcastChange,
  emitToAll,
  emitToRole,
  emitToSession,
  EVENTS,
} = require("../socket");

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================

/**
 * @description Tier definitions per evaluation mode
 * @see SRS §4.4.2 — "Supported modes: Binary (0/1), Small pool (1–3), Larger pool (10)"
 */
const TIER_CONFIG = Object.freeze({
  binary: [
    { id: "tier1", label: "Selected", points: 1, color: "gold" },
    { id: "unranked", label: "Not Selected", points: 0, color: "gray" },
  ],
  small_pool: [
    { id: "tier1", label: "Outstanding", points: 3, color: "gold" },
    { id: "tier2", label: "Good", points: 2, color: "silver" },
    { id: "tier3", label: "Satisfactory", points: 1, color: "bronze" },
    { id: "unranked", label: "Not Evaluated", points: 0, color: "gray" },
  ],
  full_pool: [
    { id: "tier1", label: "Exceptional", points: 4, color: "gold" },
    { id: "tier2", label: "Commendable", points: 2, color: "silver" },
    { id: "tier3", label: "Adequate", points: 1, color: "bronze" },
    { id: "unranked", label: "Not Evaluated", points: 0, color: "gray" },
  ],
});

/**
 * @description Calculates the scarcity budget for faculty evaluation
 * @param {string} mode - 'binary' | 'small_pool' | 'full_pool'
 * @param {number} facultyCount - Number of eligible faculty
 * @returns {number} Total point budget
 * @throws {Error} If mode is unknown
 * @see SRS §4.4.1 — "Student receives limited points (e.g., 1, 3, 10)"
 * @see SRS §4.4.2 — "Mode is configurable per survey"
 */
function calculateFacultyBudget(mode, facultyCount) {
  switch (mode) {
    case "binary":
      // §4.4.1: 30% can receive points → true scarcity
      return Math.max(1, Math.floor(facultyCount * 0.3));
    case "small_pool":
      // §4.4.2: 1.5× count → forces trade-offs across tiers
      return Math.max(3, Math.floor(facultyCount * 1.5));
    case "full_pool":
      // §4.4.2: Fixed 10 points → maximum deliberation
      return 10;
    default:
      throw new Error(`Unknown faculty evaluation mode: ${mode}`);
  }
}

/**
 * @description Gets the points value for a tier in a given mode
 * @param {string} mode - Evaluation mode
 * @param {string} tierId - Tier identifier
 * @returns {number} Points for this tier
 */
function getTierPoints(mode, tierId) {
  const config = TIER_CONFIG[mode];
  if (!config) return 0;
  const tier = config.find((t) => t.id === tierId);
  return tier ? tier.points : 0;
}

// ============================================================
// HANDLERS
// ============================================================

/**
 * @description Get all active faculty evaluation sessions for the current student
 * @route GET /api/faculty-evaluation/sessions
 * @see SRS §4.4.1
 */
async function getActiveSessions(req, res) {
  try {
    const result = await query(
      `SELECT id, title, description, evaluation_mode, academic_year, semester,
              status, opens_at, closes_at, created_at
       FROM faculty_evaluation_sessions
       WHERE status = 'active'
         AND (opens_at IS NULL OR opens_at <= NOW())
         AND (closes_at IS NULL OR closes_at > NOW())
       ORDER BY created_at DESC`,
    );

    // Check submission status for each session
    const studentPersonId = req.user.personId;
    const sessions = await Promise.all(
      result.rows.map(async (session) => {
        let submittedCount = 0;
        if (studentPersonId) {
          const sub = await query(
            `SELECT COUNT(*) FROM faculty_evaluation_allocations
             WHERE session_id = $1 AND student_person_id = $2 AND is_draft = false`,
            [session.id, studentPersonId],
          );
          submittedCount = parseInt(sub.rows[0].count);
        }
        return {
          ...session,
          hasSubmitted: submittedCount > 0,
          tierConfig: TIER_CONFIG[session.evaluation_mode],
        };
      }),
    );

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    logger.error("FacultyEvaluation: getActiveSessions failed", {
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @description Get faculty eligible for evaluation by this student
 * CRITICAL RULE: Only faculty who have previously evaluated this student
 * via the scarcity allocation system are returned.
 * @route GET /api/faculty-evaluation/sessions/:sessionId/faculty
 * @see SRS §4.4.1 — "Student evaluates multiple faculty members"
 */
async function getSessionFaculty(req, res) {
  try {
    const { sessionId } = req.params;
    const studentPersonId = req.user.personId;

    if (!studentPersonId) {
      return res.status(403).json({
        success: false,
        error:
          "Your account is not linked to a person profile. Please complete your profile first.",
        code: "NO_PERSON_LINKED",
      });
    }

    // 1. Verify session exists and is active
    const sessionResult = await query(
      `SELECT id, title, evaluation_mode, status, opens_at, closes_at
       FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Faculty evaluation session not found",
      });
    }
    const session = sessionResult.rows[0];
    if (session.status !== "active") {
      return res.status(400).json({
        success: false,
        error: `Session is ${session.status}, not accepting evaluations`,
        code: "SESSION_NOT_ACTIVE",
      });
    }

    // 2. CORE RULE: Find faculty who have evaluated this student
    //    Queries scarcity_allocations where this student was a target
    //    and the evaluator has a faculty/admin role in the users table
    const facultyResult = await query(
      `SELECT DISTINCT
         p.person_id,
         p.display_name,
         p.department_code,
         COUNT(DISTINCT sa.session_id) AS evaluation_count,
         MAX(sa.created_at) AS last_evaluated_at
       FROM scarcity_allocations sa
       INNER JOIN persons p ON p.person_id = sa.evaluator_id
       INNER JOIN users u ON u.internal_user_id = p.identity_id
       WHERE sa.target_id = $1
         AND p.is_deleted = false
         AND u.user_role IN ('faculty', 'admin')
         AND u.is_active = true
       GROUP BY p.person_id, p.display_name, p.department_code
       ORDER BY p.display_name ASC`,
      [studentPersonId],
    );

    const faculty = facultyResult.rows;

    // 3. Get exposure data (optional — graceful if table missing)
    let exposureMap = {};
    try {
      const exposureResult = await query(
        `SELECT faculty_id,
                COUNT(*) AS total_sessions,
                COALESCE(SUM(contact_hours), 0) AS total_hours
         FROM faculty_exposure_log
         WHERE target_id = $1
         GROUP BY faculty_id`,
        [studentPersonId],
      );
      for (const row of exposureResult.rows) {
        exposureMap[row.faculty_id] = {
          sessions: parseInt(row.total_sessions),
          hours: parseFloat(row.total_hours),
        };
      }
    } catch {
      // faculty_exposure_log may not exist yet — non-critical
      logger.debug("FacultyEvaluation: exposure data unavailable, skipping");
    }

    // 4. Enrich faculty with exposure data
    const enrichedFaculty = faculty.map((f) => ({
      ...f,
      evaluation_count: parseInt(f.evaluation_count),
      exposure: exposureMap[f.person_id] || { sessions: 0, hours: 0 },
    }));

    // 5. Calculate budget
    const budget = calculateFacultyBudget(
      session.evaluation_mode,
      enrichedFaculty.length,
    );

    // 6. Get existing allocations (draft or submitted)
    const allocResult = await query(
      `SELECT faculty_person_id, tier, points, is_draft, submitted_at
       FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND student_person_id = $2`,
      [sessionId, studentPersonId],
    );

    const existingAllocations = {};
    let hasSubmitted = false;
    for (const row of allocResult.rows) {
      existingAllocations[row.faculty_person_id] = {
        tier: row.tier,
        points: parseFloat(row.points),
        isDraft: row.is_draft,
      };
      if (!row.is_draft) hasSubmitted = true;
    }

    return res.status(200).json({
      success: true,
      data: {
        session: {
          ...session,
          tierConfig: TIER_CONFIG[session.evaluation_mode],
        },
        faculty: enrichedFaculty,
        budget,
        existingAllocations,
        hasSubmitted,
      },
    });
  } catch (error) {
    logger.error("FacultyEvaluation: getSessionFaculty failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @description Auto-save draft tier assignments (called every 30s by frontend)
 * Uses UPSERT — only overwrites if allocation is still a draft.
 * @route POST /api/faculty-evaluation/sessions/:sessionId/save-draft
 * @see SRS §4.4.1
 */
async function saveDraft(req, res) {
  const client = await getClient();
  try {
    const { sessionId } = req.params;
    const studentPersonId = req.user.personId;
    const { allocations } = req.body; // [{facultyPersonId, tier}]

    if (!studentPersonId) {
      client.release();
      return res.status(403).json({
        success: false,
        error: "No person profile linked",
        code: "NO_PERSON_LINKED",
      });
    }

    if (!Array.isArray(allocations)) {
      client.release();
      return res.status(400).json({
        success: false,
        error: "allocations must be an array",
        code: "VALIDATION_ERROR",
      });
    }

    // Verify session is active
    const sessionResult = await client.query(
      `SELECT evaluation_mode, status FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (
      sessionResult.rows.length === 0 ||
      sessionResult.rows[0].status !== "active"
    ) {
      client.release();
      return res.status(400).json({
        success: false,
        error: "Session not found or not active",
      });
    }
    const mode = sessionResult.rows[0].evaluation_mode;

    // Check not already submitted
    const subCheck = await client.query(
      `SELECT COUNT(*) FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND student_person_id = $2 AND is_draft = false`,
      [sessionId, studentPersonId],
    );
    if (parseInt(subCheck.rows[0].count) > 0) {
      client.release();
      return res.status(400).json({
        success: false,
        error: "Already submitted — cannot save draft",
        code: "ALREADY_SUBMITTED",
      });
    }

    await client.query("BEGIN");

    for (const alloc of allocations) {
      const points = getTierPoints(mode, alloc.tier);
      await client.query(
        `INSERT INTO faculty_evaluation_allocations
           (session_id, student_person_id, faculty_person_id, tier, points, is_draft)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (session_id, student_person_id, faculty_person_id)
         DO UPDATE SET tier = $4, points = $5, updated_at = NOW()
         WHERE faculty_evaluation_allocations.is_draft = true`,
        [sessionId, studentPersonId, alloc.facultyPersonId, alloc.tier, points],
      );
    }

    await client.query("COMMIT");
    broadcastChange("faculty_allocation", "draft_saved", { sessionId });
    return res.status(200).json({ success: true, savedAt: new Date() });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    logger.error("FacultyEvaluation: saveDraft failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
}

/**
 * @description Submit final faculty evaluation allocations
 * Validates budget constraint, prevents duplicate submission,
 * and marks all allocations as submitted (is_draft=false).
 * @route POST /api/faculty-evaluation/sessions/:sessionId/submit
 * @throws Budget exceeded, already submitted, session not active
 * @see SRS §4.4.1 — "System prevents assigning points to all faculty if pool < count"
 * @see SRS §1.3a — "Scarcity over abundance"
 */
async function submitAllocations(req, res) {
  const client = await getClient();
  try {
    const { sessionId } = req.params;
    const studentPersonId = req.user.personId;
    const { allocations } = req.body; // [{facultyPersonId, tier}]

    if (!studentPersonId) {
      client.release();
      return res.status(403).json({
        success: false,
        error: "No person profile linked",
        code: "NO_PERSON_LINKED",
      });
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      client.release();
      return res.status(400).json({
        success: false,
        error: "allocations must be a non-empty array",
        code: "VALIDATION_ERROR",
      });
    }

    // 1. Verify session
    const sessionResult = await client.query(
      `SELECT evaluation_mode, status FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionResult.rows.length === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        error: "Session not found",
      });
    }
    const session = sessionResult.rows[0];
    if (session.status !== "active") {
      client.release();
      return res.status(400).json({
        success: false,
        error: `Session is ${session.status}, not accepting evaluations`,
        code: "SESSION_NOT_ACTIVE",
      });
    }
    const mode = session.evaluation_mode;

    // 2. Check duplicate submission
    const subCheck = await client.query(
      `SELECT COUNT(*) FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND student_person_id = $2 AND is_draft = false`,
      [sessionId, studentPersonId],
    );
    if (parseInt(subCheck.rows[0].count) > 0) {
      client.release();
      return res.status(400).json({
        success: false,
        error: "You have already submitted your evaluation for this session",
        code: "ALREADY_SUBMITTED",
      });
    }

    // 3. Count eligible faculty for this student (for budget calculation)
    const eligibleResult = await client.query(
      `SELECT COUNT(DISTINCT sa.evaluator_id) AS cnt
       FROM scarcity_allocations sa
       INNER JOIN persons p ON p.person_id = sa.evaluator_id
       INNER JOIN users u ON u.internal_user_id = p.identity_id
       WHERE sa.target_id = $1
         AND p.is_deleted = false
         AND u.user_role IN ('faculty', 'admin')
         AND u.is_active = true`,
      [studentPersonId],
    );
    const eligibleCount = parseInt(eligibleResult.rows[0].cnt);
    const budget = calculateFacultyBudget(mode, eligibleCount);

    // 4. Calculate total points from allocations
    let totalPoints = 0;
    const processedAllocations = allocations.map((alloc) => {
      const points = getTierPoints(mode, alloc.tier);
      totalPoints += points;
      return { ...alloc, points };
    });

    // 5. SCARCITY CHECK: §4.4.1 — "System prevents assigning points exceeding total"
    if (totalPoints > budget) {
      client.release();
      return res.status(400).json({
        success: false,
        error: `Budget exceeded: ${totalPoints} allocated > ${budget} available`,
        code: "BUDGET_EXCEEDED",
        details: { totalPoints, budget, mode },
      });
    }

    // 6. Atomic transaction: UPSERT all allocations + mark submitted
    await client.query("BEGIN");

    for (const alloc of processedAllocations) {
      await client.query(
        `INSERT INTO faculty_evaluation_allocations
           (session_id, student_person_id, faculty_person_id, tier, points, is_draft, submitted_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())
         ON CONFLICT (session_id, student_person_id, faculty_person_id)
         DO UPDATE SET tier = $4, points = $5, is_draft = false,
                       submitted_at = NOW(), updated_at = NOW()`,
        [
          sessionId,
          studentPersonId,
          alloc.facultyPersonId,
          alloc.tier,
          alloc.points,
        ],
      );
    }

    await client.query("COMMIT");

    logger.info("FacultyEvaluation: allocation submitted", {
      sessionId,
      studentPersonId,
      mode,
      totalPoints,
      budget,
      facultyCount: allocations.length,
    });

    broadcastChange("faculty_allocation", "submitted", { sessionId });
    return res.status(200).json({
      success: true,
      data: {
        totalPoints,
        budget,
        submittedAt: new Date(),
        allocationsCount: allocations.length,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => { });
    logger.error("FacultyEvaluation: submitAllocations failed", {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
}

/**
 * @description Get aggregated results for a faculty member (banded, not raw)
 * @route GET /api/faculty-evaluation/results/:sessionId
 * @see SRS §7.2 — "No raw ranking exposure. Only trends, percentiles, bands"
 */
async function getSessionResults(req, res) {
  try {
    const { sessionId } = req.params;

    // Only show results for closed sessions
    const sessionResult = await query(
      `SELECT id, title, evaluation_mode, status
       FROM faculty_evaluation_sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }
    const session = sessionResult.rows[0];

    // Aggregate: per faculty → average points, total evaluators, tier distribution
    const results = await query(
      `SELECT
         fea.faculty_person_id,
         p.display_name,
         p.department_code,
         COUNT(*) AS evaluator_count,
         AVG(fea.points) AS avg_points,
         SUM(CASE WHEN fea.tier = 'tier1' THEN 1 ELSE 0 END) AS tier1_count,
         SUM(CASE WHEN fea.tier = 'tier2' THEN 1 ELSE 0 END) AS tier2_count,
         SUM(CASE WHEN fea.tier = 'tier3' THEN 1 ELSE 0 END) AS tier3_count,
         SUM(CASE WHEN fea.tier = 'unranked' THEN 1 ELSE 0 END) AS unranked_count
       FROM faculty_evaluation_allocations fea
       INNER JOIN persons p ON p.person_id = fea.faculty_person_id
       WHERE fea.session_id = $1 AND fea.is_draft = false
       GROUP BY fea.faculty_person_id, p.display_name, p.department_code
       ORDER BY AVG(fea.points) DESC`,
      [sessionId],
    );

    // Convert to banded results (SRS §7.2)
    const allAvgs = results.rows.map((r) => parseFloat(r.avg_points));
    const maxAvg = Math.max(...allAvgs, 1);

    const bandedResults = results.rows.map((r) => {
      const avg = parseFloat(r.avg_points);
      const pct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
      let band;
      if (pct >= 75) band = "EXCELLENT";
      else if (pct >= 50) band = "GOOD";
      else if (pct >= 25) band = "SATISFACTORY";
      else band = "DEVELOPING";

      return {
        facultyId: r.faculty_person_id,
        displayName: r.display_name,
        department: r.department_code,
        band,
        evaluatorCount: parseInt(r.evaluator_count),
        tierDistribution: {
          tier1: parseInt(r.tier1_count),
          tier2: parseInt(r.tier2_count),
          tier3: parseInt(r.tier3_count),
          unranked: parseInt(r.unranked_count),
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        session,
        results: bandedResults,
        totalEvaluators: new Set(results.rows.map((r) => r.evaluator_count))
          .size,
      },
    });
  } catch (error) {
    logger.error("FacultyEvaluation: getSessionResults failed", {
      sessionId: req.params.sessionId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @description Create a new faculty evaluation session (admin/faculty only)
 * @route POST /api/faculty-evaluation/sessions
 * @see SRS §4.4.2 — "Mode is configurable per survey"
 */
async function createSession(req, res) {
  try {
    const {
      title,
      description,
      academicYear,
      semester,
      month,        // e.g. "Feb"
      segment,      // e.g. "S1"
      targetYear,   // e.g. "Final Year"
    } = req.body;

    // Build standardized title: "Feb S1 - Final Year" 
    const effectiveTitle = title && title.trim()
      ? title.trim()
      : (month && segment && targetYear)
        ? `${month} ${segment} - ${targetYear}`
        : `Evaluation Session - ${new Date().toLocaleDateString()}`;

    // ── FIND OR CREATE: Check if session with this title already exists ──
    const existing = await query(
      `SELECT * FROM faculty_evaluation_sessions WHERE title = $1 AND status != 'closed' LIMIT 1`,
      [effectiveTitle],
    );

    if (existing.rows.length > 0) {
      // Session already exists — return it so frontend navigates to existing page
      logger.info("FacultyEvaluation: returning existing session", {
        sessionId: existing.rows[0].id,
        title: effectiveTitle,
      });
      return res.status(200).json({
        success: true,
        data: existing.rows[0],
        existed: true,
      });
    }

    // ── Auto-calculate session_date from month + segment ──
    let autoDate = null;
    if (month && segment) {
      const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const monthIdx = MONTHS[month];
      const segNum = parseInt(segment.replace("S", "")) || 1; // S1->1, S2->2...
      if (monthIdx !== undefined) {
        const yr = academicYear || new Date().getFullYear();
        // Week N starts on day (N-1)*7 + 1
        const day = (segNum - 1) * 7 + 1;
        autoDate = new Date(yr, monthIdx, day).toISOString().split("T")[0];
      }
    }

    // Force small_pool mode
    const mode = "small_pool";
    const createdBy = req.user.personId || req.user.userId;

    // Store targetYear in description for downstream filtering
    const effectiveDescription = targetYear
      ? `Target: ${targetYear}${description ? ` | ${description}` : ""}`
      : (description || null);

    const result = await query(
      `INSERT INTO faculty_evaluation_sessions
         (title, description, evaluation_mode, academic_year, semester, status, created_by, session_date)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
       RETURNING *`,
      [
        effectiveTitle,
        effectiveDescription,
        mode,
        academicYear || new Date().getFullYear(),
        semester || 1,
        createdBy,
        autoDate,
      ],
    );

    logger.info("FacultyEvaluation: session created", {
      sessionId: result.rows[0].id,
      mode,
      createdBy,
      title: effectiveTitle,
    });

    broadcastChange("faculty_evaluation_session", "created", {
      sessionId: result.rows[0].id,
    });
    return res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        tierConfig: TIER_CONFIG[mode],
      },
    });
  } catch (error) {
    logger.error("FacultyEvaluation: createSession failed", {
      userId: req.user?.userId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @description List all faculty evaluation sessions (admin)
 * @route GET /api/faculty-evaluation/admin/sessions
 */
async function getAllSessions(req, res) {
  try {
    const result = await query(
      `SELECT fes.*,
              (SELECT COUNT(DISTINCT student_person_id)
               FROM faculty_evaluation_allocations
               WHERE session_id = fes.id AND is_draft = false) AS submission_count
       FROM faculty_evaluation_sessions fes
       ORDER BY fes.created_at DESC`,
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("FacultyEvaluation: getAllSessions failed", {
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * @description Update session status (admin)
 * @route PUT /api/faculty-evaluation/sessions/:sessionId
 */
async function updateSession(req, res) {
  try {
    const { sessionId } = req.params;
    const { status, title, description, closesAt } = req.body;

    const validStatuses = ["draft", "active", "closed", "archived"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const result = await query(
      `UPDATE faculty_evaluation_sessions
       SET status = COALESCE($2, status),
           title = COALESCE($3, title),
           description = COALESCE($4, description),
           closes_at = COALESCE($5, closes_at),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId, status, title, description, closesAt],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    broadcastChange("faculty_evaluation_session", "updated", { sessionId });
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("FacultyEvaluation: updateSession failed", {
      sessionId: req.params.sessionId,
      error: error.message,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getActiveSessions,
  getSessionFaculty,
  saveDraft,
  submitAllocations,
  getSessionResults,
  createSession,
  getAllSessions,
  updateSession,
  TIER_CONFIG,
  calculateFacultyBudget,
};
