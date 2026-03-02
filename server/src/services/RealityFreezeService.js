// ============================================================
// REALITY FREEZE SERVICE — Entity State Capture for Evaluation
// ============================================================
// Captures the EXACT state of entities at a point in time
// for evaluation purposes. Think of it as taking a "snapshot"
// or "photograph" of a project and its members.
//
// WHY FREEZE?
//   - Evaluators need to see the project as it WAS, not as it IS
//   - If a student modifies their work log AFTER evaluation starts,
//     the evaluator should still see the ORIGINAL submission
//   - The freeze creates an immutable record that can't be altered
//
// The freeze process:
//   1. Capture the entity's current state as JSON
//   2. Calculate a SHA-256 hash of the state
//   3. Chain the hash with the previous snapshot's hash
//   4. Store everything in entity_freeze_snapshots
//   5. Mark the entity as frozen (frozen_at timestamp)
//
// Once frozen, the entity CANNOT be modified until unfrozen.
// ============================================================

// Import database functions
const { query, getClient } = require("../config/database");

// Import hash chain service for integrity
const HashChainService = require("../lib/immutable/HashChainService");

// Import domain events
const {
  entityFrozen,
  createEvent,
  EventTypes,
} = require("../events/EntityEvents");

// Import custom errors
const {
  FreezeViolationError,
  ProjectNotFoundError,
  IntegrityViolationError,
} = require("../entities/EntityErrors");

// Import logger
const logger = require("../utils/logger");

// Import crypto for UUID generation
const crypto = require("crypto");

// ============================================================
// RealityFreezeService — captures and verifies frozen states
// ============================================================
class RealityFreezeService {
  /**
   * Freeze a project for evaluation.
   * Captures the project state, team composition, work logs,
   * and plans into an immutable snapshot.
   *
   * @param {string} projectId - UUID of the project to freeze
   * @param {string} sessionId - UUID of the evaluation session
   * @param {string} actorId - Who is performing the freeze
   * @returns {Promise<Object>} The freeze snapshot record
   */
  static async freezeProject(projectId, sessionId, actorId) {
    const client = await getClient();

    try {
      await client.query("BEGIN");

      // Step 1: Fetch the project's current state
      const projectResult = await client.query(
        "SELECT * FROM projects WHERE project_id = $1 AND is_deleted = false",
        [projectId],
      );

      if (projectResult.rows.length === 0) {
        throw new ProjectNotFoundError(`Project ${projectId} not found`);
      }

      const project = projectResult.rows[0];

      // Step 2: Fetch all active team members
      const membersResult = await client.query(
        `SELECT pm.*, p.display_name, p.person_type
         FROM project_members pm
         JOIN persons p ON pm.person_id = p.person_id
         WHERE pm.project_id = $1 AND pm.left_at IS NULL`,
        [projectId],
      );

      // Step 3: Fetch work logs for this project
      const workLogsResult = await client.query(
        `SELECT * FROM work_logs
         WHERE project_id = $1
         ORDER BY period_id ASC`,
        [projectId],
      );

      // Step 4: Fetch monthly plans
      const plansResult = await client.query(
        `SELECT * FROM project_month_plans
         WHERE project_id = $1
         ORDER BY period_id ASC, version DESC`,
        [projectId],
      );

      // Step 5: Build the comprehensive frozen state object
      const frozenState = {
        project: {
          projectId: project.project_id,
          title: project.title,
          description: project.description,
          academicYear: project.academic_year,
          semester: project.semester,
          status: project.status,
          version: project.version,
        },
        members: membersResult.rows.map((m) => ({
          personId: m.person_id,
          displayName: m.display_name,
          personType: m.person_type,
          roleInProject: m.role_in_project,
          declaredSharePercentage: m.declared_share_percentage,
          joinedAt: m.joined_at,
        })),
        workLogs: workLogsResult.rows.map((w) => ({
          logId: w.log_id,
          personId: w.person_id,
          periodId: w.period_id,
          workDescription: w.work_description,
          hoursSpent: w.hours_spent,
        })),
        plans: plansResult.rows.map((p) => ({
          planId: p.plan_id,
          periodId: p.period_id,
          planText: p.plan_text,
          version: p.version,
        })),
        frozenAt: new Date().toISOString(),
        frozenBy: actorId,
      };

      // Step 6: Calculate the hash of the frozen state
      const stateHash = HashChainService.calculateHash(frozenState);

      // Step 7: Get the previous snapshot hash for chain continuity
      const prevSnapshot = await client.query(
        `SELECT state_hash FROM entity_freeze_snapshots
         WHERE entity_type = 'project' AND entity_id = $1
         ORDER BY frozen_at DESC LIMIT 1`,
        [projectId],
      );
      const previousHash = prevSnapshot.rows[0]?.state_hash || null;

      // Step 8: Insert the freeze snapshot
      const snapshotId = crypto.randomUUID();
      await client.query(
        `INSERT INTO entity_freeze_snapshots (
           snapshot_id, session_id, entity_type, entity_id,
           frozen_state, state_hash, previous_snapshot_hash
         ) VALUES ($1, $2, 'project', $3, $4, $5, $6)`,
        [
          snapshotId,
          sessionId,
          projectId,
          JSON.stringify(frozenState),
          stateHash,
          previousHash,
        ],
      );

      // Step 9: Mark the project as frozen
      await client.query(
        `UPDATE projects
         SET frozen_at = NOW(), frozen_by = $1, freeze_version = version,
             updated_at = NOW(), updated_by = $1
         WHERE project_id = $2`,
        [actorId, projectId],
      );

      // Step 10: Freeze all work logs for this project
      await client.query(
        `UPDATE work_logs
         SET is_frozen = true, frozen_at = NOW()
         WHERE project_id = $1 AND is_frozen = false`,
        [projectId],
      );

      // Commit the transaction
      await client.query("COMMIT");

      // Emit domain event
      const event = entityFrozen(
        "project",
        projectId,
        sessionId,
        stateHash,
        actorId,
      );
      logger.info("Project frozen for evaluation", {
        projectId,
        sessionId,
        stateHash,
        snapshotId,
      });

      return {
        snapshotId,
        entityType: "project",
        entityId: projectId,
        sessionId,
        stateHash,
        previousHash,
        frozenState,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("Project freeze failed", {
        projectId,
        error: error.message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify a frozen snapshot's integrity.
   * Recalculates the hash and compares it to the stored hash.
   *
   * @param {string} snapshotId - UUID of the snapshot to verify
   * @returns {Promise<{ valid: boolean, details: string }>}
   */
  static async verifySnapshot(snapshotId) {
    // Fetch the snapshot
    const result = await query(
      "SELECT * FROM entity_freeze_snapshots WHERE snapshot_id = $1",
      [snapshotId],
    );

    if (result.rows.length === 0) {
      throw new IntegrityViolationError(`Snapshot ${snapshotId} not found`);
    }

    const snapshot = result.rows[0];

    // Recalculate the hash from the stored frozen state
    const recalculatedHash = HashChainService.calculateHash(
      snapshot.frozen_state,
    );

    // Compare with the stored hash
    const isValid = recalculatedHash === snapshot.state_hash;

    if (!isValid) {
      logger.error("Snapshot integrity violation detected", {
        snapshotId,
        expectedHash: snapshot.state_hash,
        actualHash: recalculatedHash,
      });
    }

    return {
      valid: isValid,
      snapshotId,
      entityType: snapshot.entity_type,
      entityId: snapshot.entity_id,
      details: isValid
        ? "Snapshot integrity verified — no tampering detected"
        : "INTEGRITY VIOLATION: Stored hash does not match recalculated hash",
    };
  }

  /**
   * Get all frozen snapshots for a project.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Array>} Snapshot records
   */
  static async getProjectSnapshots(projectId) {
    const result = await query(
      `SELECT * FROM entity_freeze_snapshots
       WHERE entity_type = 'project' AND entity_id = $1
       ORDER BY frozen_at ASC`,
      [projectId],
    );

    return result.rows;
  }
}

// ============================================================
// Export RealityFreezeService class
// ============================================================
module.exports = RealityFreezeService;
