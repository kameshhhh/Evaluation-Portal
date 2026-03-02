// ============================================================
// COMPARATIVE EVALUATION SERVICE — SRS §4.3 Business Logic
// ============================================================
// Hybrid model: Admin creates rounds with criteria + project pool,
// Judges select 3-5 projects and allocate across a criteria matrix.
//
// Follows existing patterns:
//   - Static class methods (like ScarcityEngine)
//   - Pure validation (like AllocationValidator)
//   - DB via { query, getClient } from database.js
// ============================================================

const { query, getClient } = require("../config/database");
const { ZeroScoreReasonService } = require("./ZeroScoreReasonService");

// ============================================================
// DEFAULT CRITERIA — SRS §4.3.2 Evaluation Heads
// ============================================================
const DEFAULT_CRITERIA = Object.freeze([
  {
    key: "quality",
    name: "Project Quality",
    weight: 30,
    description: "Technical quality, code standards, architecture",
  },
  {
    key: "effectiveness",
    name: "Team Effectiveness",
    weight: 25,
    description: "Collaboration, delivery, sprint outcomes",
  },
  {
    key: "value",
    name: "Project Value",
    weight: 25,
    description: "Impact, innovation, stakeholder value",
  },
  {
    key: "leadership",
    name: "Project Leadership",
    weight: 20,
    description: "Vision, decision-making, team growth",
  },
]);

// ============================================================
// VALIDATION HELPERS
// ============================================================
const ROUND_STATUSES = Object.freeze(["draft", "active", "closed", "archived"]);
const SESSION_STATUSES = Object.freeze([
  "draft",
  "in_progress",
  "submitted",
  "locked",
]);

const ROUND_TRANSITIONS = Object.freeze({
  draft: ["active"],
  active: ["closed"],
  closed: ["archived"],
  archived: [],
});

const SESSION_TRANSITIONS = Object.freeze({
  draft: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["locked"],
  locked: [],
});

function distributePool(totalPool, criteria) {
  // Distribute total pool across criteria proportional to weights
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  return criteria.map((c) => ({
    ...c,
    pool: Math.round((c.weight / totalWeight) * totalPool * 100) / 100,
  }));
}

// ============================================================
// COMPARATIVE EVALUATION SERVICE
// ============================================================
class ComparativeEvaluationService {
  // --------------------------------------------------------
  // ROUND MANAGEMENT (Admin operations)
  // --------------------------------------------------------

  /**
   * Create a new comparative round.
   * @param {Object} params
   * @param {string} params.name - Round display name
   * @param {string} [params.description] - Round description
   * @param {number} params.totalPool - Total scarcity pool
   * @param {Array} [params.criteria] - Evaluation criteria (defaults to SRS §4.3.2)
   * @param {Object} [params.selectionRules] - { min_projects: 3, max_projects: 5 }
   * @param {string} [params.evaluationWindowStart] - ISO timestamp
   * @param {string} [params.evaluationWindowEnd] - ISO timestamp
   * @param {string} params.createdBy - Admin userId
   * @returns {Object} Created round
   */
  static async createRound({
    name,
    description,
    totalPool,
    criteria,
    selectionRules,
    evaluationWindowStart,
    evaluationWindowEnd,
    createdBy,
  }) {
    if (!name || !totalPool || !createdBy) {
      throw new Error("Missing required fields: name, totalPool, createdBy");
    }

    if (totalPool <= 0) {
      throw new Error("totalPool must be greater than 0");
    }

    // Use default criteria if not provided, then distribute pool
    const resolvedCriteria = distributePool(
      totalPool,
      criteria && criteria.length > 0 ? criteria : DEFAULT_CRITERIA,
    );

    const rules = selectionRules || { min_projects: 3, max_projects: 5 };

    const result = await query(
      `INSERT INTO comparative_rounds 
        (name, description, total_pool, criteria, selection_rules,
         evaluation_window_start, evaluation_window_end, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        description || null,
        totalPool,
        JSON.stringify(resolvedCriteria),
        JSON.stringify(rules),
        evaluationWindowStart || null,
        evaluationWindowEnd || null,
        createdBy,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get a round by ID with summary data.
   */
  static async getRound(roundId) {
    const result = await query(
      `SELECT cr.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'project_id', rep.project_id, 'priority', rep.priority
          )) FROM round_eligible_projects rep WHERE rep.round_id = cr.round_id),
          '[]'::json
        ) AS eligible_projects,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'judge_id', rej.judge_id, 'credibility_score', rej.credibility_score, 'status', rej.status
          )) FROM round_eligible_judges rej WHERE rej.round_id = cr.round_id),
          '[]'::json
        ) AS eligible_judges
       FROM comparative_rounds cr
       WHERE cr.round_id = $1`,
      [roundId],
    );

    if (result.rows.length === 0) {
      throw new Error(`Round not found: ${roundId}`);
    }

    return result.rows[0];
  }

  /**
   * List all rounds (optionally filtered by status).
   */
  static async listRounds(status = null) {
    let sql = `SELECT * FROM comparative_round_summary`;
    const params = [];

    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Update round status with transition validation.
   */
  static async updateRoundStatus(roundId, newStatus) {
    const round = await this.getRound(roundId);
    const allowed = ROUND_TRANSITIONS[round.status] || [];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid round transition: ${round.status} → ${newStatus}. Allowed: ${allowed.join(", ")}`,
      );
    }

    const result = await query(
      `UPDATE comparative_rounds SET status = $1, updated_at = NOW() WHERE round_id = $2 RETURNING *`,
      [newStatus, roundId],
    );

    return result.rows[0];
  }

  /**
   * Update round configuration (only in draft status).
   */
  static async updateRound(roundId, updates) {
    const round = await this.getRound(roundId);
    if (round.status !== "draft") {
      throw new Error("Can only update rounds in draft status");
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = [
      "name",
      "description",
      "total_pool",
      "criteria",
      "selection_rules",
      "evaluation_window_start",
      "evaluation_window_end",
      "min_judge_credibility",
    ];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (allowedFields.includes(dbKey)) {
        fields.push(`${dbKey} = $${paramIndex}`);
        values.push(
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? JSON.stringify(value)
            : value,
        );
        paramIndex++;
      }
    }

    if (fields.length === 0) return round;

    fields.push("updated_at = NOW()");
    values.push(roundId);

    const result = await query(
      `UPDATE comparative_rounds SET ${fields.join(", ")} WHERE round_id = $${paramIndex} RETURNING *`,
      values,
    );

    return result.rows[0];
  }

  // --------------------------------------------------------
  // PROJECT POOL MANAGEMENT (Admin operations)
  // --------------------------------------------------------

  /**
   * Add projects to a round's eligible pool.
   * @param {string} roundId
   * @param {Array<{projectId: string, priority?: number}>} projects
   */
  static async addProjectsToRound(roundId, projects) {
    const round = await this.getRound(roundId);
    if (!["draft", "active"].includes(round.status)) {
      throw new Error("Can only add projects to draft or active rounds");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      for (const { projectId, priority = 3 } of projects) {
        await client.query(
          `INSERT INTO round_eligible_projects (round_id, project_id, priority)
           VALUES ($1, $2, $3)
           ON CONFLICT (round_id, project_id) DO UPDATE SET priority = $3`,
          [roundId, projectId, priority],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return this.getRound(roundId);
  }

  /**
   * Remove a project from a round's pool.
   */
  static async removeProjectFromRound(roundId, projectId) {
    await query(
      `DELETE FROM round_eligible_projects WHERE round_id = $1 AND project_id = $2`,
      [roundId, projectId],
    );
  }

  // --------------------------------------------------------
  // JUDGE MANAGEMENT (Admin operations)
  // --------------------------------------------------------

  /**
   * Assign judges to a round.
   * @param {string} roundId
   * @param {Array<{judgeId: string, credibilityScore?: number}>} judges
   */
  static async assignJudgesToRound(roundId, judges) {
    const round = await this.getRound(roundId);
    if (!["draft", "active"].includes(round.status)) {
      throw new Error("Can only assign judges to draft or active rounds");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      for (const { judgeId, credibilityScore = 0.0 } of judges) {
        await client.query(
          `INSERT INTO round_eligible_judges (round_id, judge_id, credibility_score)
           VALUES ($1, $2, $3)
           ON CONFLICT (round_id, judge_id) DO UPDATE SET credibility_score = $3`,
          [roundId, judgeId, credibilityScore],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return this.getRound(roundId);
  }

  /**
   * Remove a judge from a round.
   */
  static async removeJudgeFromRound(roundId, judgeId) {
    await query(
      `DELETE FROM round_eligible_judges WHERE round_id = $1 AND judge_id = $2`,
      [roundId, judgeId],
    );
  }

  // --------------------------------------------------------
  // SESSION MANAGEMENT (Judge operations)
  // --------------------------------------------------------

  /**
   * Get eligible projects for a judge in a round, with project details.
   */
  static async getEligibleProjects(roundId, judgeId) {
    // Verify judge is assigned to this round
    const judgeCheck = await query(
      `SELECT * FROM round_eligible_judges WHERE round_id = $1 AND judge_id = $2`,
      [roundId, judgeId],
    );

    if (judgeCheck.rows.length === 0) {
      throw new Error("Judge is not assigned to this round");
    }

    // Get eligible projects with basic info from projects table
    const result = await query(
      `SELECT rep.project_id, rep.priority,
              p.title AS project_name, p.description AS project_description,
              p.status AS project_status
       FROM round_eligible_projects rep
       LEFT JOIN projects p ON p.project_id = rep.project_id
       WHERE rep.round_id = $1
       ORDER BY rep.priority ASC, p.title ASC`,
      [roundId],
    );

    return result.rows;
  }

  /**
   * Judge creates a session by selecting 3-5 projects from the round pool.
   * @param {Object} params
   * @param {string} params.roundId
   * @param {string} params.judgeId
   * @param {string[]} params.projectIds - 3-5 project IDs from eligible pool
   * @returns {Object} Created session
   */
  static async createSession({ roundId, judgeId, projectIds }) {
    if (!roundId || !judgeId || !projectIds) {
      throw new Error("Missing required fields: roundId, judgeId, projectIds");
    }

    if (
      !Array.isArray(projectIds) ||
      projectIds.length < 3 ||
      projectIds.length > 5
    ) {
      throw new Error("Must select between 3 and 5 projects");
    }

    // Load round and validate
    const round = await this.getRound(roundId);

    if (round.status !== "active") {
      throw new Error(
        `Round is ${round.status}, must be active to create sessions`,
      );
    }

    // Verify judge is assigned
    const judgeCheck = await query(
      `SELECT * FROM round_eligible_judges WHERE round_id = $1 AND judge_id = $2`,
      [roundId, judgeId],
    );

    if (judgeCheck.rows.length === 0) {
      throw new Error("Judge is not assigned to this round");
    }

    // Verify all selected projects are in the eligible pool
    const eligibleCheck = await query(
      `SELECT project_id FROM round_eligible_projects WHERE round_id = $1`,
      [roundId],
    );
    const eligibleIds = new Set(eligibleCheck.rows.map((r) => r.project_id));

    for (const pid of projectIds) {
      if (!eligibleIds.has(pid)) {
        throw new Error(`Project ${pid} is not eligible in this round`);
      }
    }

    // Check for existing session (one per judge per round)
    const existingSession = await query(
      `SELECT session_id, status FROM comparative_sessions WHERE round_id = $1 AND judge_id = $2`,
      [roundId, judgeId],
    );

    if (existingSession.rows.length > 0) {
      throw new Error(
        `Judge already has a session in this round (status: ${existingSession.rows[0].status})`,
      );
    }

    // Distribute pool across criteria
    const criteriaWithPools = distributePool(round.total_pool, round.criteria);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Create session
      const sessionResult = await client.query(
        `INSERT INTO comparative_sessions
          (round_id, judge_id, project_ids, total_pool, criteria, judge_credibility_score)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          roundId,
          judgeId,
          projectIds,
          round.total_pool,
          JSON.stringify(criteriaWithPools),
          judgeCheck.rows[0].credibility_score || 0.0,
        ],
      );

      const session = sessionResult.rows[0];

      // Initialize zero allocations for all criterion × project combinations
      for (const criterion of criteriaWithPools) {
        for (const projectId of projectIds) {
          await client.query(
            `INSERT INTO comparative_allocations (session_id, criterion_key, project_id, points)
             VALUES ($1, $2, $3, 0)`,
            [session.session_id, criterion.key, projectId],
          );
        }
      }

      // Update judge status in round
      await client.query(
        `UPDATE round_eligible_judges SET status = 'in_progress' WHERE round_id = $1 AND judge_id = $2`,
        [roundId, judgeId],
      );

      await client.query("COMMIT");

      return session;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get a session with full allocation data for the judge.
   */
  static async getSession(sessionId) {
    const sessionResult = await query(
      `SELECT cs.*, cr.name AS round_name, cr.status AS round_status,
              cr.evaluation_window_start, cr.evaluation_window_end
       FROM comparative_sessions cs
       JOIN comparative_rounds cr ON cr.round_id = cs.round_id
       WHERE cs.session_id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const session = sessionResult.rows[0];

    // Get allocations
    const allocations = await query(
      `SELECT criterion_key, project_id, points
       FROM comparative_allocations
       WHERE session_id = $1
       ORDER BY criterion_key, project_id`,
      [sessionId],
    );

    // Get project details
    const projectDetails = await query(
      `SELECT p.project_id, p.title AS project_name, p.description AS project_description
       FROM projects p
       WHERE p.project_id = ANY($1)`,
      [session.project_ids],
    );

    // Build allocation matrix: { criterion_key: { project_id: points } }
    const allocationMatrix = {};
    for (const alloc of allocations.rows) {
      if (!allocationMatrix[alloc.criterion_key]) {
        allocationMatrix[alloc.criterion_key] = {};
      }
      allocationMatrix[alloc.criterion_key][alloc.project_id] = parseFloat(
        alloc.points,
      );
    }

    // Compute pool info per criterion
    const criteria = session.criteria || [];
    const criteriaPoolInfo = criteria.map((c) => {
      const allocsForCriterion = allocationMatrix[c.key] || {};
      const allocated = Object.values(allocsForCriterion).reduce(
        (sum, v) => sum + v,
        0,
      );
      return {
        ...c,
        allocated,
        remaining: c.pool - allocated,
        utilization:
          c.pool > 0 ? Math.round((allocated / c.pool) * 10000) / 100 : 0,
        isExceeded: allocated > c.pool,
      };
    });

    // Overall pool info
    const totalAllocated = criteriaPoolInfo.reduce(
      (sum, c) => sum + c.allocated,
      0,
    );

    return {
      ...session,
      projects: projectDetails.rows,
      allocationMatrix,
      criteriaPoolInfo,
      poolInfo: {
        totalPool: parseFloat(session.total_pool),
        totalAllocated,
        remaining: parseFloat(session.total_pool) - totalAllocated,
        utilization:
          session.total_pool > 0
            ? Math.round(
                (totalAllocated / parseFloat(session.total_pool)) * 10000,
              ) / 100
            : 0,
        isExceeded: totalAllocated > parseFloat(session.total_pool),
      },
    };
  }

  /**
   * Get all sessions for a judge.
   */
  static async getJudgeSessions(judgeId) {
    const result = await query(
      `SELECT cs.*, cr.name AS round_name, cr.status AS round_status
       FROM comparative_sessions cs
       JOIN comparative_rounds cr ON cr.round_id = cs.round_id
       WHERE cs.judge_id = $1
       ORDER BY cs.created_at DESC`,
      [judgeId],
    );

    return result.rows;
  }

  /**
   * Get all active rounds available to a judge.
   */
  static async getActiveRoundsForJudge(judgeId) {
    const result = await query(
      `SELECT cr.*, rej.credibility_score, rej.status AS judge_status,
              (SELECT COUNT(*) FROM round_eligible_projects rep WHERE rep.round_id = cr.round_id) AS project_count,
              cs.session_id AS existing_session_id, cs.status AS existing_session_status
       FROM comparative_rounds cr
       JOIN round_eligible_judges rej ON rej.round_id = cr.round_id AND rej.judge_id = $1
       LEFT JOIN comparative_sessions cs ON cs.round_id = cr.round_id AND cs.judge_id = $1
       WHERE cr.status = 'active'
       ORDER BY cr.created_at DESC`,
      [judgeId],
    );

    return result.rows;
  }

  // --------------------------------------------------------
  // ALLOCATION OPERATIONS (Judge operations)
  // --------------------------------------------------------

  /**
   * Save allocations for a criterion (partial save — one row of the matrix).
   * @param {string} sessionId
   * @param {string} criterionKey
   * @param {Object} allocations - { projectId: points, ... }
   */
  static async saveAllocationsForCriterion(
    sessionId,
    criterionKey,
    allocations,
  ) {
    const session = await this.getSession(sessionId);

    if (!["draft", "in_progress"].includes(session.status)) {
      throw new Error(`Cannot modify allocations in ${session.status} session`);
    }

    // Find criterion config
    const criterion = (session.criteria || []).find(
      (c) => c.key === criterionKey,
    );
    if (!criterion) {
      throw new Error(`Unknown criterion: ${criterionKey}`);
    }

    // Validate: total for this criterion must not exceed its pool
    const total = Object.values(allocations).reduce((sum, pts) => sum + pts, 0);
    if (total > criterion.pool) {
      throw new Error(
        `Allocation total (${total}) exceeds criterion pool (${criterion.pool}) for ${criterionKey}`,
      );
    }

    // Validate: no negative values
    for (const [projectId, points] of Object.entries(allocations)) {
      if (points < 0) {
        throw new Error(
          `Negative allocation not allowed for project ${projectId}`,
        );
      }
    }

    // Validate: all projects belong to this session
    const validProjectIds = new Set(session.project_ids.map(String));
    for (const projectId of Object.keys(allocations)) {
      if (!validProjectIds.has(projectId)) {
        throw new Error(`Project ${projectId} is not in this session`);
      }
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      for (const [projectId, points] of Object.entries(allocations)) {
        await client.query(
          `UPDATE comparative_allocations 
           SET points = $1, updated_at = NOW()
           WHERE session_id = $2 AND criterion_key = $3 AND project_id = $4`,
          [points, sessionId, criterionKey, projectId],
        );
      }

      // Transition to in_progress if still draft
      if (session.status === "draft") {
        await client.query(
          `UPDATE comparative_sessions SET status = 'in_progress', started_at = NOW() WHERE session_id = $1`,
          [sessionId],
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return this.getSession(sessionId);
  }

  /**
   * Save full allocation matrix (all criteria at once).
   * @param {string} sessionId
   * @param {Object} allocationMatrix - { criterion_key: { project_id: points, ... }, ... }
   */
  static async saveAllAllocations(sessionId, allocationMatrix) {
    const session = await this.getSession(sessionId);

    if (!["draft", "in_progress"].includes(session.status)) {
      throw new Error(`Cannot modify allocations in ${session.status} session`);
    }

    const criteria = session.criteria || [];
    const validProjectIds = new Set(session.project_ids.map(String));

    // Validate all criteria
    for (const criterion of criteria) {
      const allocsForCriterion = allocationMatrix[criterion.key] || {};
      const total = Object.values(allocsForCriterion).reduce(
        (sum, pts) => sum + pts,
        0,
      );

      if (total > criterion.pool) {
        throw new Error(
          `Criterion "${criterion.key}" allocation (${total}) exceeds pool (${criterion.pool})`,
        );
      }

      for (const [projectId, points] of Object.entries(allocsForCriterion)) {
        if (points < 0) {
          throw new Error(
            `Negative allocation for ${criterion.key}/${projectId}`,
          );
        }
        if (!validProjectIds.has(projectId)) {
          throw new Error(`Project ${projectId} not in session`);
        }
      }
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      for (const [criterionKey, projectAllocations] of Object.entries(
        allocationMatrix,
      )) {
        for (const [projectId, points] of Object.entries(projectAllocations)) {
          await client.query(
            `UPDATE comparative_allocations 
             SET points = $1, updated_at = NOW()
             WHERE session_id = $2 AND criterion_key = $3 AND project_id = $4`,
            [points, sessionId, criterionKey, projectId],
          );
        }
      }

      // Transition to in_progress if still draft
      if (session.status === "draft") {
        await client.query(
          `UPDATE comparative_sessions SET status = 'in_progress', started_at = NOW() WHERE session_id = $1`,
          [sessionId],
        );
      }

      // Auto-save snapshot
      await client.query(
        `INSERT INTO comparison_snapshots (session_id, allocation_data, snapshot_type)
         VALUES ($1, $2, 'auto')`,
        [sessionId, JSON.stringify(allocationMatrix)],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return this.getSession(sessionId);
  }

  /**
   * Submit session — finalize all allocations.
   * Validates all criteria pools are within limits, then transitions to "submitted".
   * Optionally stores evaluator-provided zero-score reasons (SRS §4.1.5).
   * @param {string} sessionId
   * @param {Array<Object>} [zeroScoreReasons] - Optional evaluator-provided zero reasons
   */
  static async submitSession(sessionId, zeroScoreReasons = []) {
    const session = await this.getSession(sessionId);

    if (!["draft", "in_progress"].includes(session.status)) {
      throw new Error(`Cannot submit session in ${session.status} status`);
    }

    // Validate all criteria pools
    const violations = [];
    for (const criterion of session.criteriaPoolInfo) {
      if (criterion.isExceeded) {
        violations.push(
          `${criterion.key}: ${criterion.allocated}/${criterion.pool}`,
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(`Pool exceeded for criteria: ${violations.join(", ")}`);
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Transition session to submitted
      await client.query(
        `UPDATE comparative_sessions SET status = 'submitted', submitted_at = NOW() WHERE session_id = $1`,
        [sessionId],
      );

      // Save final snapshot
      await client.query(
        `INSERT INTO comparison_snapshots (session_id, allocation_data, snapshot_type)
         VALUES ($1, $2, 'submit')`,
        [sessionId, JSON.stringify(session.allocationMatrix)],
      );

      // Update judge status in round
      await client.query(
        `UPDATE round_eligible_judges SET status = 'completed' WHERE round_id = $1 AND judge_id = $2`,
        [session.round_id, session.judge_id],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Store evaluator-provided zero-score reasons (non-blocking, SRS §4.1.5)
    if (zeroScoreReasons && zeroScoreReasons.length > 0) {
      try {
        await ZeroScoreReasonService.recordReasons({
          evaluationType: "comparative",
          sessionId,
          evaluatorId: session.judge_id,
          reasons: zeroScoreReasons,
        });
      } catch (reasonErr) {
        // Non-critical — log but don't fail the submission
        console.warn(
          "ComparativeEvaluationService: Zero-score reason storage failed:",
          reasonErr.message,
        );
      }
    }

    return this.getSession(sessionId);
  }

  // --------------------------------------------------------
  // SNAPSHOTS
  // --------------------------------------------------------

  /**
   * Create a manual save snapshot.
   */
  static async saveSnapshot(sessionId) {
    const session = await this.getSession(sessionId);

    await query(
      `INSERT INTO comparison_snapshots (session_id, allocation_data, snapshot_type)
       VALUES ($1, $2, 'manual')`,
      [sessionId, JSON.stringify(session.allocationMatrix)],
    );

    return { saved: true, timestamp: new Date().toISOString() };
  }

  /**
   * Get all snapshots for a session.
   */
  static async getSnapshots(sessionId) {
    const result = await query(
      `SELECT * FROM comparison_snapshots WHERE session_id = $1 ORDER BY created_at DESC`,
      [sessionId],
    );

    return result.rows;
  }

  /**
   * Restore from snapshot.
   */
  static async restoreSnapshot(sessionId, snapshotId) {
    const snapshot = await query(
      `SELECT * FROM comparison_snapshots WHERE snapshot_id = $1 AND session_id = $2`,
      [snapshotId, sessionId],
    );

    if (snapshot.rows.length === 0) {
      throw new Error("Snapshot not found");
    }

    return this.saveAllAllocations(sessionId, snapshot.rows[0].allocation_data);
  }

  // --------------------------------------------------------
  // RESULTS & ANALYTICS
  // --------------------------------------------------------

  /**
   * Get aggregated scores for a round (admin view).
   */
  static async getRoundResults(roundId) {
    const scores = await query(
      `SELECT * FROM comparative_project_scores WHERE round_id = $1`,
      [roundId],
    );

    // Group by project
    const projectScores = {};
    for (const row of scores.rows) {
      if (!projectScores[row.project_id]) {
        projectScores[row.project_id] = {
          project_id: row.project_id,
          criteria: {},
          overall: 0,
        };
      }
      projectScores[row.project_id].criteria[row.criterion_key] = {
        avg: parseFloat(row.avg_score),
        total: parseFloat(row.total_score),
        judgeCount: parseInt(row.judge_count),
        min: parseFloat(row.min_score),
        max: parseFloat(row.max_score),
        stddev: row.score_stddev ? parseFloat(row.score_stddev) : 0,
      };
    }

    // Calculate weighted overall for each project
    const round = await this.getRound(roundId);
    const criteria = round.criteria || [];

    for (const pid of Object.keys(projectScores)) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const c of criteria) {
        const cScore = projectScores[pid].criteria[c.key];
        if (cScore) {
          weightedSum += cScore.avg * (c.weight / 100);
          totalWeight += c.weight / 100;
        }
      }
      projectScores[pid].overall =
        totalWeight > 0
          ? Math.round((weightedSum / totalWeight) * 100) / 100
          : 0;
    }

    // Sort by overall descending
    const ranked = Object.values(projectScores).sort(
      (a, b) => b.overall - a.overall,
    );
    ranked.forEach((p, idx) => (p.rank = idx + 1));

    return {
      roundId,
      roundName: round.name,
      projects: ranked,
      criteriaConfig: criteria,
    };
  }
}

module.exports = ComparativeEvaluationService;
module.exports.DEFAULT_CRITERIA = DEFAULT_CRITERIA;
module.exports.ROUND_STATUSES = ROUND_STATUSES;
module.exports.SESSION_STATUSES = SESSION_STATUSES;
