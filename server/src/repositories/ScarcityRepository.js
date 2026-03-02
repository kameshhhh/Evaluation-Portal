// ============================================================
// SCARCITY REPOSITORY — Database Operations for Scarcity Tables
// ============================================================
// Handles all database interactions for the scarcity evaluation
// system. Implements the REPOSITORY PATTERN — service layer talks
// to this repository, never directly to the database.
//
// TABLES MANAGED:
//   - evaluation_sessions (scarcity columns: pool_size, mode)
//   - session_evaluators (evaluator ↔ session links)
//   - scarcity_allocations (point distributions)
//   - zero_score_interpretations (analytics data)
//
// KEY FEATURES:
//   - Atomic allocation storage (transaction-safe)
//   - Pool usage calculation (aggregation queries)
//   - Evaluator isolation at query level (SRS 4.2.1)
//   - All methods accept optional client for transaction support
//
// FOLLOWS EXISTING PATTERNS:
//   - Static class (same as PersonRepository)
//   - Parameterized queries ($1, $2, ...)
//   - client-or-pool pattern for transaction support
//   - Returns domain objects or null (never throws on not-found)
// ============================================================

// Import database query function and client checkout
const { query, getClient } = require("../config/database");

// Import logger for operation tracking
const logger = require("../utils/logger");

// ============================================================
// ScarcityRepository — Static class for scarcity DB operations
// ============================================================
class ScarcityRepository {
  // ============================================================
  // SESSION OPERATIONS
  // ============================================================

  /**
   * Get an evaluation session by ID.
   * Returns null if not found (does not throw).
   *
   * @param {string} sessionId - UUID of the session
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object|null>} Session record or null
   */
  static async getSession(sessionId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    // Select the session with its scarcity configuration
    const sql = `
      SELECT
        session_id,
        session_type,
        intent,
        status,
        scarcity_pool_size,
        evaluation_mode,
        evaluation_window_start,
        evaluation_window_end,
        frozen_entities,
        created_at,
        created_by
      FROM evaluation_sessions
      WHERE session_id = $1
    `;

    const result = await queryFn(sql, [sessionId]);

    // Return null if not found (standard repository pattern)
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Configure scarcity settings on an existing evaluation session.
   * Updates the scarcity_pool_size and evaluation_mode columns.
   *
   * @param {string} sessionId - UUID of the session to configure
   * @param {string} mode - Evaluation mode (project_member/cross_project/faculty/peer)
   * @param {number} poolSize - Calculated pool size
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object>} Updated session record
   * @throws {Error} If session not found
   */
  static async configureSessionScarcity(
    sessionId,
    mode,
    poolSize,
    client = null,
  ) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    // Update scarcity columns on the existing session
    const sql = `
      UPDATE evaluation_sessions
      SET
        scarcity_pool_size = $2,
        evaluation_mode = $3
      WHERE session_id = $1
      RETURNING *
    `;

    const result = await queryFn(sql, [sessionId, poolSize, mode]);

    // Throw if session not found (update should match a row)
    if (result.rows.length === 0) {
      throw new Error(`Evaluation session not found: ${sessionId}`);
    }

    logger.info("ScarcityRepository: Session scarcity configured", {
      sessionId,
      mode,
      poolSize,
    });

    return result.rows[0];
  }

  // ============================================================
  // EVALUATOR ASSIGNMENT OPERATIONS
  // ============================================================

  /**
   * Assign evaluators to an evaluation session.
   * Creates entries in the session_evaluators junction table.
   * Silently skips duplicates (ON CONFLICT DO NOTHING).
   *
   * @param {string} sessionId - UUID of the session
   * @param {Array<string>} evaluatorIds - Array of person UUIDs
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<number>} Number of evaluators assigned
   */
  static async assignEvaluators(sessionId, evaluatorIds, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    // Build multi-row INSERT with ON CONFLICT for idempotency
    // Each evaluator gets their own row in the junction table
    let assignedCount = 0;

    for (const evaluatorId of evaluatorIds) {
      const sql = `
        INSERT INTO session_evaluators (session_id, evaluator_id)
        VALUES ($1, $2)
        ON CONFLICT (session_id, evaluator_id) DO NOTHING
      `;

      const result = await queryFn(sql, [sessionId, evaluatorId]);
      // rowCount is 1 if inserted, 0 if conflict (already assigned)
      assignedCount += result.rowCount;
    }

    logger.debug("ScarcityRepository: Evaluators assigned", {
      sessionId,
      requested: evaluatorIds.length,
      newlyAssigned: assignedCount,
    });

    return assignedCount;
  }

  /**
   * Get all evaluator person IDs assigned to a session.
   *
   * @param {string} sessionId - UUID of the session
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array<string>>} Array of evaluator person UUIDs
   */
  static async getSessionEvaluatorIds(sessionId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT evaluator_id
      FROM session_evaluators
      WHERE session_id = $1
    `;

    const result = await queryFn(sql, [sessionId]);

    // Return array of evaluator IDs
    return result.rows.map((row) => row.evaluator_id);
  }

  /**
   * Mark an evaluator as having submitted their evaluation.
   *
   * @param {string} sessionId - UUID of the session
   * @param {string} evaluatorId - UUID of the evaluator
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<boolean>} True if updated, false if not found
   */
  static async markEvaluatorSubmitted(sessionId, evaluatorId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      UPDATE session_evaluators
      SET has_submitted = TRUE, submitted_at = NOW()
      WHERE session_id = $1 AND evaluator_id = $2
    `;

    const result = await queryFn(sql, [sessionId, evaluatorId]);

    return result.rowCount > 0;
  }

  // ============================================================
  // ALLOCATION OPERATIONS
  // ============================================================

  /**
   * Store allocations atomically for an evaluator in a session.
   * Replaces all existing allocations (DELETE + INSERT in transaction).
   *
   * WHY REPLACE-ALL instead of upsert?
   *   - Simpler mental model (full snapshot, not partial update)
   *   - Pool constraint is validated once on the full set
   *   - Avoids race conditions between concurrent upserts
   *
   * @param {string} sessionId - UUID of the session
   * @param {string} evaluatorId - UUID of the evaluator
   * @param {Array<Object>} allocations - Array of { targetId, points, headId? }
   * @param {Object} [externalClient] - Optional DB client for external transaction
   * @returns {Promise<Object>} { allocationCount, totalPoints }
   */
  static async storeAllocations(
    sessionId,
    evaluatorId,
    allocations,
    externalClient = null,
  ) {
    // ---------------------------------------------------------
    // TRANSACTION HANDLING: Atomic delete + insert
    // Same pattern as PersonRepository.create()
    // ---------------------------------------------------------
    const ownTransaction = !externalClient;
    const txnClient = externalClient || (await getClient());

    try {
      // Begin transaction if we own it
      if (ownTransaction) {
        await txnClient.query("BEGIN");
      }

      // Bind the query function to the transaction client
      const queryFn = txnClient.query.bind(txnClient);

      // Delete existing allocations for this evaluator in this session
      // This ensures a clean slate before inserting new ones
      await queryFn(
        `DELETE FROM scarcity_allocations
         WHERE session_id = $1 AND evaluator_id = $2`,
        [sessionId, evaluatorId],
      );

      // Insert new allocations one by one
      // Each INSERT triggers the check_scarcity_constraint trigger
      let totalPoints = 0;
      for (const alloc of allocations) {
        const sql = `
          INSERT INTO scarcity_allocations (
            session_id,
            evaluator_id,
            target_id,
            head_id,
            points,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await queryFn(sql, [
          sessionId, // $1: session
          evaluatorId, // $2: evaluator
          alloc.targetId, // $3: target person
          alloc.headId || null, // $4: evaluation head (optional)
          alloc.points, // $5: allocated points
          evaluatorId, // $6: created_by (same as evaluator)
        ]);

        totalPoints += alloc.points;
      }

      // Mark evaluator as submitted
      await queryFn(
        `UPDATE session_evaluators
         SET has_submitted = TRUE, submitted_at = NOW()
         WHERE session_id = $1 AND evaluator_id = $2`,
        [sessionId, evaluatorId],
      );

      // Commit transaction if we own it
      if (ownTransaction) {
        await txnClient.query("COMMIT");
      }

      logger.info("ScarcityRepository: Allocations stored atomically", {
        sessionId,
        evaluatorId,
        allocationCount: allocations.length,
        totalPoints,
      });

      return {
        sessionId,
        evaluatorId,
        allocationCount: allocations.length,
        totalPoints,
      };
    } catch (error) {
      // Rollback on any error — ensures atomic operation
      if (ownTransaction) {
        await txnClient.query("ROLLBACK");
      }
      throw error;
    } finally {
      // Always release the client back to the pool
      if (ownTransaction) {
        txnClient.release();
      }
    }
  }

  /**
   * Get all allocations by a specific evaluator in a session.
   *
   * @param {string} sessionId - UUID of the session
   * @param {string} evaluatorId - UUID of the evaluator
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of allocation records
   */
  static async getAllocationsByEvaluator(
    sessionId,
    evaluatorId,
    client = null,
  ) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT
        allocation_id,
        session_id,
        evaluator_id,
        target_id,
        head_id,
        points,
        created_at,
        version
      FROM scarcity_allocations
      WHERE session_id = $1 AND evaluator_id = $2
      ORDER BY created_at ASC
    `;

    const result = await queryFn(sql, [sessionId, evaluatorId]);
    return result.rows;
  }

  /**
   * Get all allocations for a session (admin/aggregation use).
   * Only call this for closed/locked sessions or admin access.
   *
   * @param {string} sessionId - UUID of the session
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of all allocation records
   */
  static async getAllocationsForSession(sessionId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT
        sa.allocation_id,
        sa.evaluator_id,
        sa.target_id,
        sa.head_id,
        sa.points,
        sa.created_at
      FROM scarcity_allocations sa
      WHERE sa.session_id = $1
      ORDER BY sa.evaluator_id, sa.target_id
    `;

    const result = await queryFn(sql, [sessionId]);
    return result.rows;
  }

  // ============================================================
  // POOL USAGE QUERIES
  // ============================================================

  /**
   * Get pool usage for an evaluator in a session.
   * Returns pool size, total allocated, and remaining pool.
   *
   * @param {string} sessionId - UUID of the session
   * @param {string} evaluatorId - UUID of the evaluator
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Object|null>} Pool usage info or null
   */
  static async getPoolUsage(sessionId, evaluatorId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    // Calculate pool usage on the fly (no materialized view needed)
    const sql = `
      SELECT
        es.scarcity_pool_size,
        COALESCE(SUM(sa.points), 0) AS allocated_total,
        es.scarcity_pool_size - COALESCE(SUM(sa.points), 0) AS remaining_pool
      FROM evaluation_sessions es
      LEFT JOIN scarcity_allocations sa
        ON sa.session_id = es.session_id
        AND sa.evaluator_id = $2
      WHERE es.session_id = $1
      GROUP BY es.session_id, es.scarcity_pool_size
    `;

    const result = await queryFn(sql, [sessionId, evaluatorId]);

    // Return null if session not found
    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  // ============================================================
  // SESSION TARGET QUERIES
  // ============================================================

  /**
   * Get the evaluation targets for a session.
   * Targets are the persons stored in frozen_entities JSON array.
   *
   * NOTE: frozen_entities stores an array of person UUIDs
   *   (selected by faculty during session creation), NOT project UUIDs.
   *   We unnest the JSON array and join directly to the persons table.
   *
   * @param {string} sessionId - UUID of the session
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of target persons with metadata
   */
  static async getSessionTargets(sessionId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    // Unnest the frozen_entities JSON array of person UUIDs
    // and join to the persons table for display metadata.
    // jsonb_array_elements_text() converts ["uuid1","uuid2"] → rows
    // NOTE: alias is 'display_name' to match what frontend components expect
    const sql = `
      SELECT DISTINCT
        p.person_id AS target_id,
        p.display_name,
        p.person_type,
        p.department_code
      FROM evaluation_sessions es,
        jsonb_array_elements_text(es.frozen_entities) AS target_uuid
      JOIN persons p
        ON p.person_id = target_uuid::UUID
        AND p.is_deleted = FALSE
      WHERE es.session_id = $1
        AND es.frozen_entities IS NOT NULL
    `;

    const result = await queryFn(sql, [sessionId]);
    return result.rows;
  }

  // ============================================================
  // EVALUATOR SESSION QUERIES
  // ============================================================

  /**
   * Get all evaluation sessions assigned to an evaluator.
   * Includes pool info and submission status.
   *
   * @param {string} evaluatorId - UUID of the evaluator
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Array>} Array of session summaries
   */
  static async getSessionsByEvaluator(evaluatorId, client = null) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT
        es.session_id,
        es.session_type,
        es.evaluation_mode,
        es.intent,
        es.status,
        es.scarcity_pool_size,
        es.evaluation_window_start,
        es.evaluation_window_end,
        se.has_submitted,
        se.submitted_at,
        COALESCE(
          (SELECT SUM(sa.points)
           FROM scarcity_allocations sa
           WHERE sa.session_id = es.session_id
             AND sa.evaluator_id = $1),
          0
        ) AS allocated_total,
        (SELECT COUNT(*)
         FROM scarcity_allocations sa
         WHERE sa.session_id = es.session_id
           AND sa.evaluator_id = $1
        ) AS allocation_count
      FROM session_evaluators se
      JOIN evaluation_sessions es
        ON es.session_id = se.session_id
      WHERE se.evaluator_id = $1
      ORDER BY es.created_at DESC
    `;

    const result = await queryFn(sql, [evaluatorId]);
    return result.rows;
  }

  // ============================================================
  // ZERO SCORE INTERPRETATION STORAGE
  // ============================================================

  /**
   * Store zero-score interpretations for analytics.
   * Uses upsert (ON CONFLICT) to handle re-interpretations.
   *
   * @param {string} sessionId - UUID of the session (for logging)
   * @param {string} evaluatorId - UUID of the evaluator (for logging)
   * @param {Array<Object>} interpretations - Array of interpretation objects
   *   Each: { targetId, inferredReason, confidence, context }
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<number>} Number of interpretations stored
   */
  static async storeZeroInterpretations(
    sessionId,
    evaluatorId,
    interpretations,
    client = null,
  ) {
    // Use provided client or default pool query
    const queryFn = client ? client.query.bind(client) : query;

    let storedCount = 0;

    for (const interp of interpretations) {
      // First, find the allocation_id for this target
      const findSql = `
        SELECT allocation_id
        FROM scarcity_allocations
        WHERE session_id = $1
          AND evaluator_id = $2
          AND target_id = $3
          AND points = 0
        LIMIT 1
      `;

      const findResult = await queryFn(findSql, [
        sessionId,
        evaluatorId,
        interp.targetId,
      ]);

      // Skip if no matching zero allocation found
      if (findResult.rows.length === 0) {
        continue;
      }

      const allocationId = findResult.rows[0].allocation_id;

      // Upsert the interpretation
      const upsertSql = `
        INSERT INTO zero_score_interpretations (
          allocation_id,
          inferred_reason,
          confidence_score,
          context_data
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (allocation_id)
        DO UPDATE SET
          inferred_reason = EXCLUDED.inferred_reason,
          confidence_score = EXCLUDED.confidence_score,
          context_data = EXCLUDED.context_data,
          created_at = NOW()
      `;

      await queryFn(upsertSql, [
        allocationId,
        interp.inferredReason,
        interp.confidence,
        JSON.stringify(interp.context),
      ]);

      storedCount++;
    }

    logger.debug("ScarcityRepository: Zero interpretations stored", {
      sessionId,
      evaluatorId,
      interpretationCount: storedCount,
    });

    return storedCount;
  }
}

// ============================================================
// Export the ScarcityRepository class
// All methods are static — no instance needed (matches PersonRepository pattern)
// ============================================================
module.exports = ScarcityRepository;
