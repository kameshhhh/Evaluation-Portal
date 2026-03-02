// ============================================================
// RUBRIC SERVICE — Rubric-Based Distribution (SRS §4.1.4)
// ============================================================
// Manages evaluation rubrics (evaluation_heads) and their
// attachment to evaluation sessions (session_evaluation_heads).
//
// POOL RULE (enforced here):
//   totalPool = team_size × 5 (NEVER changes)
//   perRubricPool[i] = floor(totalPool / rubricCount)
//   Remainder distributed 1pt each to first rubrics.
//   Example: pool=10, 3 rubrics → [4, 3, 3]
//            pool=15, 3 rubrics → [5, 5, 5]
//            pool=20, 3 rubrics → [7, 7, 6]
//
// SRS §4.1.4: "Total score pool remains unchanged.
//   Judge may distribute points across Members AND Questions.
//   System enforces global total constraint."
// ============================================================

"use strict";

const { query, getClient } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// computeRubricPools — Pure function: divide pool among rubrics
// ============================================================
/**
 * Distribute a total pool among N rubrics.
 * Integer division; remainder goes to first rubrics (1pt each).
 *
 * @param {number} totalPool   - Session scarcity pool (e.g. 15)
 * @param {number} rubricCount - Number of rubrics (e.g. 3)
 * @returns {number[]}         - Array of per-rubric pool sizes
 *
 * @example
 * computeRubricPools(15, 3) // → [5, 5, 5]
 * computeRubricPools(10, 3) // → [4, 3, 3]
 * computeRubricPools(20, 3) // → [7, 7, 6]
 * computeRubricPools(5,  3) // → [2, 2, 1]
 */
function computeRubricPools(totalPool, rubricCount) {
  if (rubricCount <= 0) return [];
  const base = Math.floor(totalPool / rubricCount);
  const remainder = totalPool % rubricCount;
  // Start with base, then add 1 to the first `remainder` rubrics
  return Array.from({ length: rubricCount }, (_, i) =>
    i < remainder ? base + 1 : base
  );
}

// ============================================================
// RubricService class
// ============================================================
class RubricService {

  // ----------------------------------------------------------
  // LIST RUBRICS — Return all active default rubrics
  // ----------------------------------------------------------
  /**
   * List all active evaluation rubrics available in the system.
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.applicableEntity] - 'person'|'project'|'team'
   * @returns {Promise<Array>} Array of rubric objects
   */
  static async listRubrics(filters = {}) {
    let sql = `
      SELECT
        head_id,
        head_name,
        description,
        applicable_entity,
        max_score,
        scarcity_pool_size,
        is_active,
        version,
        effective_from,
        effective_until,
        created_at
      FROM evaluation_heads
      WHERE is_active = TRUE
    `;
    const params = [];

    if (filters.applicableEntity) {
      params.push(filters.applicableEntity);
      sql += ` AND applicable_entity = $${params.length}`;
    }
    sql += ` ORDER BY head_name ASC`;

    const result = await query(sql, params);
    return result.rows;
  }

  // ----------------------------------------------------------
  // GET RUBRIC — Get a single rubric by ID
  // ----------------------------------------------------------
  /**
   * Fetch a single evaluation rubric by its UUID.
   * @param {string} headId - UUID of the evaluation head
   * @returns {Promise<Object|null>}
   */
  static async getRubric(headId) {
    const result = await query(
      `SELECT head_id, head_name, description, applicable_entity,
              max_score, scarcity_pool_size, is_active, version,
              effective_from, effective_until, created_at
       FROM evaluation_heads
       WHERE head_id = $1`,
      [headId]
    );
    return result.rows[0] || null;
  }

  // ----------------------------------------------------------
  // ATTACH TO SESSION — Link exactly 3 rubrics to a session
  // ----------------------------------------------------------
  /**
   * Attach selected rubrics to an evaluation session.
   * Calculates per-rubric pool sizes and stores them.
   *
   * Rules:
   *   - Exactly 3 rubrics must be selected (SRS §4.1.4)
   *   - Per-rubric pools are calculated via computeRubricPools()
   *   - Weights are set equally (1/3 each ≈ 33.33%)
   *   - An existing session rubric config is fully replaced
   *
   * @param {string} sessionId    - Evaluation session UUID
   * @param {string[]} headIds    - Exactly 3 head_id UUIDs
   * @param {number}   totalPool  - Session total pool (team_size × 5)
   * @param {string}   actorId    - Person ID of the admin performing the action
   * @returns {Promise<Object>}  { sessionId, rubrics: [{headId, headName, poolSize}] }
   */
  static async attachToSession(sessionId, headIds, totalPool, actorId) {
    if (!Array.isArray(headIds) || headIds.length !== 3) {
      throw new Error("Exactly 3 rubrics must be selected per session. (SRS §4.1.4)");
    }
    if (!totalPool || totalPool < 3) {
      throw new Error("Total pool must be at least 3 to distribute among 3 rubrics.");
    }

    const poolSizes = computeRubricPools(totalPool, headIds.length);
    const equalWeight = parseFloat((100 / headIds.length).toFixed(2));

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Remove any existing rubric config for this session
      await client.query(
        `DELETE FROM session_evaluation_heads WHERE session_id = $1`,
        [sessionId]
      );

      // Insert new rubric assignments
      for (let i = 0; i < headIds.length; i++) {
        await client.query(
          `INSERT INTO session_evaluation_heads
             (session_id, head_id, weight, is_required, rubric_pool_size)
           VALUES ($1, $2, $3, TRUE, $4)`,
          [sessionId, headIds[i], i === headIds.length - 1
            ? (100 - equalWeight * (headIds.length - 1)).toFixed(2) // Last gets remainder to sum to 100
            : equalWeight,
           poolSizes[i]]
        );
      }

      // Update rubric_count on the session
      await client.query(
        `UPDATE evaluation_sessions
         SET rubric_count = $1
         WHERE session_id = $2`,
        [headIds.length, sessionId]
      );

      await client.query("COMMIT");

      // Return confirmation
      const rubrics = await this.getSessionRubrics(sessionId);
      logger.info("RubricService: Rubrics attached to session", {
        sessionId,
        rubricCount: headIds.length,
        totalPool,
        poolSizes,
        actorId,
      });

      return { sessionId, rubrics };
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("RubricService: Failed to attach rubrics", {
        sessionId,
        error: err.message,
      });
      throw err;
    } finally {
      client.release();
    }
  }

  // ----------------------------------------------------------
  // GET SESSION RUBRICS — Get all rubrics for a session
  // ----------------------------------------------------------
  /**
   * Retrieve all rubrics configured for a session, with pool sizes.
   * Returns empty array if session has no rubrics (global pool mode).
   *
   * @param {string} sessionId  - Evaluation session UUID
   * @returns {Promise<Array>}  Array of { headId, headName, description, poolSize, weight }
   */
  static async getSessionRubrics(sessionId) {
    const result = await query(
      `SELECT
         eh.head_id     AS "headId",
         eh.head_name   AS "headName",
         eh.description,
         seh.rubric_pool_size AS "poolSize",
         seh.weight,
         seh.is_required AS "isRequired"
       FROM session_evaluation_heads seh
       JOIN evaluation_heads eh ON eh.head_id = seh.head_id
       WHERE seh.session_id = $1
         AND eh.is_active = TRUE
       ORDER BY eh.head_name ASC`,
      [sessionId]
    );
    return result.rows;
  }

  // ----------------------------------------------------------
  // SESSION HAS RUBRICS — Quick check
  // ----------------------------------------------------------
  /**
   * Check if the given session uses rubric-based evaluation.
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  static async sessionHasRubrics(sessionId) {
    const result = await query(
      `SELECT rubric_count FROM evaluation_sessions WHERE session_id = $1`,
      [sessionId]
    );
    return (result.rows[0]?.rubric_count ?? 0) > 0;
  }

  // ----------------------------------------------------------
  // GET RUBRIC POOL ALLOCATIONS — Per-rubric allocated totals
  // Used by the evaluation UI to show remaining per rubric
  // ----------------------------------------------------------
  /**
   * For a session + evaluator, return how many points have been
   * allocated per rubric so far.
   *
   * @param {string} sessionId
   * @param {string} evaluatorId
   * @returns {Promise<Object>} { [headId]: allocatedPoints }
   */
  static async getRubricAllocationTotals(sessionId, evaluatorId) {
    const result = await query(
      `SELECT
         head_id AS "headId",
         COALESCE(SUM(points), 0) AS allocated
       FROM scarcity_allocations
       WHERE session_id   = $1
         AND evaluator_id = $2
         AND head_id IS NOT NULL
       GROUP BY head_id`,
      [sessionId, evaluatorId]
    );

    return result.rows.reduce((acc, row) => {
      acc[row.headId] = parseFloat(row.allocated);
      return acc;
    }, {});
  }

  // ----------------------------------------------------------
  // GET RUBRIC RESULTS — Aggregated scores per rubric per target
  // Used by results display to show per-rubric breakdown
  // ----------------------------------------------------------
  /**
   * Get raw aggregated (average) scores per target per rubric for a session.
   *
   * @param {string} sessionId
   * @returns {Promise<Array>} [{ targetId, headId, headName, rawAvg, totalPoints }]
   */
  static async getRubricResults(sessionId) {
    const result = await query(
      `SELECT
         sa.target_id     AS "targetId",
         sa.head_id       AS "headId",
         eh.head_name     AS "headName",
         AVG(sa.points)   AS "rawAvg",
         SUM(sa.points)   AS "totalPoints",
         COUNT(DISTINCT sa.evaluator_id) AS "judgeCount"
       FROM scarcity_allocations sa
       JOIN evaluation_heads eh ON eh.head_id = sa.head_id
       WHERE sa.session_id = $1
         AND sa.head_id IS NOT NULL
       GROUP BY sa.target_id, sa.head_id, eh.head_name
       ORDER BY sa.target_id, eh.head_name`,
      [sessionId]
    );
    return result.rows;
  }
}

// ============================================================
// Export pure helper + service class
// ============================================================
module.exports = RubricService;
module.exports.computeRubricPools = computeRubricPools;
