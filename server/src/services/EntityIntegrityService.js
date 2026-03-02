// ============================================================
// ENTITY INTEGRITY SERVICE — Hash Chain Verification
// ============================================================
// Verifies the integrity of data by checking hash chains.
// If any data was tampered with (e.g., direct SQL UPDATE to
// change grades), the hash chain will be broken and this
// service will detect it.
//
// What we verify:
//   1. Person history hash chains — detect if person records were altered
//   2. Freeze snapshot hash chains — detect if frozen states were modified
//
// How it works:
//   - Each record stores its own hash AND the previous record's hash
//   - We walk the chain from oldest to newest
//   - At each step, we recalculate the hash from the stored data
//   - If the recalculated hash doesn't match, TAMPERING DETECTED
//
// This service is typically run:
//   - Before evaluation sessions (ensure data wasn't altered)
//   - As a scheduled nightly job
//   - On-demand by administrators
// ============================================================

// Import database query function
const { query } = require("../config/database");

// Import hash chain service for verification
const HashChainService = require("../lib/immutable/HashChainService");

// Import domain events
const {
  integrityCheckFailed,
  createEvent,
  EventTypes,
} = require("../events/EntityEvents");

// Import custom errors
const { IntegrityViolationError } = require("../entities/EntityErrors");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// EntityIntegrityService — integrity verification engine
// ============================================================
class EntityIntegrityService {
  /**
   * Verify the hash chain for a person's history.
   * Walks through all person_history records and checks
   * that each hash is correct and properly linked.
   *
   * @param {string} personId - UUID of the person
   * @returns {Promise<{ valid: boolean, checksRun: number, brokenAt: number|null, details: string }>}
   */
  static async verifyPersonIntegrity(personId) {
    // Fetch all history records in chronological order
    const result = await query(
      `SELECT * FROM person_history
       WHERE person_id = $1
       ORDER BY changed_at ASC`,
      [personId],
    );

    const history = result.rows;

    // No history means nothing to verify
    if (history.length === 0) {
      return {
        valid: true,
        checksRun: 0,
        brokenAt: null,
        details: "No history records to verify",
      };
    }

    // Build the chain array for verification
    const chain = history.map((entry) => ({
      data: entry.snapshot,
      previousHash: entry.previous_hash,
      currentHash: entry.current_hash,
    }));

    // Verify the chain using HashChainService
    const verification = HashChainService.verifyChain(chain);

    // If chain is broken, log and emit event
    if (!verification.valid) {
      logger.error("Person integrity verification FAILED", {
        personId,
        brokenAt: verification.brokenAt,
        details: verification.details,
      });

      const event = integrityCheckFailed(
        "person",
        personId,
        verification.brokenAt,
        verification.details,
        "system",
      );

      // Record the failure in integrity_verifications table
      await EntityIntegrityService._recordVerification(
        "person_history_chain",
        "system",
        verification.valid ? history.length : verification.brokenAt,
        verification.valid ? 0 : 1,
        verification.valid ? null : [{ personId, ...verification }],
      );
    }

    return {
      valid: verification.valid,
      checksRun: history.length,
      brokenAt: verification.brokenAt,
      details: verification.details,
    };
  }

  /**
   * Verify all freeze snapshots for a project.
   * Checks that each snapshot's hash matches its content
   * and that the chain links are intact.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<{ valid: boolean, checksRun: number, details: string }>}
   */
  static async verifyFreezeSnapshotIntegrity(projectId) {
    // Fetch all snapshots in chronological order
    const result = await query(
      `SELECT * FROM entity_freeze_snapshots
       WHERE entity_type = 'project' AND entity_id = $1
       ORDER BY frozen_at ASC`,
      [projectId],
    );

    const snapshots = result.rows;

    if (snapshots.length === 0) {
      return {
        valid: true,
        checksRun: 0,
        details: "No freeze snapshots to verify",
      };
    }

    // Verify each snapshot's hash individually
    let isValid = true;
    let failureDetails = null;

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];

      // Recalculate hash from the stored frozen state
      const recalculated = HashChainService.calculateHash(
        snapshot.frozen_state,
      );

      // Compare with stored hash
      if (recalculated !== snapshot.state_hash) {
        isValid = false;
        failureDetails = {
          snapshotId: snapshot.snapshot_id,
          index: i,
          expectedHash: snapshot.state_hash,
          actualHash: recalculated,
        };

        logger.error("Freeze snapshot integrity FAILED", failureDetails);
        break;
      }

      // Check chain link (previous_snapshot_hash should match prior entry)
      if (
        i > 0 &&
        snapshot.previous_snapshot_hash !== snapshots[i - 1].state_hash
      ) {
        isValid = false;
        failureDetails = {
          snapshotId: snapshot.snapshot_id,
          index: i,
          details: "Chain link broken: previous_snapshot_hash mismatch",
        };

        logger.error("Freeze snapshot chain link broken", failureDetails);
        break;
      }
    }

    // Record the verification result
    await EntityIntegrityService._recordVerification(
      "freeze_snapshot_chain",
      "system",
      isValid ? snapshots.length : failureDetails?.index || 0,
      isValid ? 0 : 1,
      isValid ? null : [failureDetails],
    );

    return {
      valid: isValid,
      checksRun: snapshots.length,
      details: isValid
        ? "All freeze snapshots verified — integrity intact"
        : `Integrity violation at snapshot index ${failureDetails?.index}`,
    };
  }

  /**
   * Run a full integrity check across all persons and projects.
   * This is the "nightly job" version — checks everything.
   *
   * @param {string} verifiedBy - Who initiated the check
   * @returns {Promise<{ totalChecks: number, passed: number, failed: number, failures: Array }>}
   */
  static async runFullIntegrityCheck(verifiedBy = "system") {
    let totalChecks = 0;
    let passed = 0;
    let failed = 0;
    const failures = [];

    // Check all persons
    const persons = await query(
      "SELECT person_id FROM persons WHERE is_deleted = false",
    );

    for (const row of persons.rows) {
      totalChecks++;
      const result = await EntityIntegrityService.verifyPersonIntegrity(
        row.person_id,
      );
      if (result.valid) {
        passed++;
      } else {
        failed++;
        failures.push({
          entityType: "person",
          entityId: row.person_id,
          details: result.details,
        });
      }
    }

    // Check all project freeze snapshots
    const projects = await query(
      "SELECT project_id FROM projects WHERE is_deleted = false",
    );

    for (const row of projects.rows) {
      totalChecks++;
      const result = await EntityIntegrityService.verifyFreezeSnapshotIntegrity(
        row.project_id,
      );
      if (result.valid) {
        passed++;
      } else {
        failed++;
        failures.push({
          entityType: "project_freeze",
          entityId: row.project_id,
          details: result.details,
        });
      }
    }

    // Record the overall verification result
    await EntityIntegrityService._recordVerification(
      "full_integrity_check",
      verifiedBy,
      passed,
      failed,
      failures.length > 0 ? failures : null,
    );

    logger.info("Full integrity check complete", {
      totalChecks,
      passed,
      failed,
    });

    return { totalChecks, passed, failed, failures };
  }

  /**
   * Internal helper: record a verification result in the database.
   *
   * @param {string} verificationType - Type of check performed
   * @param {string} verifiedBy - Who ran the check
   * @param {number} checksPassed - Number of checks that passed
   * @param {number} checksFailed - Number of checks that failed
   * @param {Array|null} failureDetails - Details of failures
   * @private
   */
  static async _recordVerification(
    verificationType,
    verifiedBy,
    checksPassed,
    checksFailed,
    failureDetails,
  ) {
    try {
      await query(
        `INSERT INTO integrity_verifications (
           verification_type, verified_by, checks_passed, checks_failed,
           failure_details, manual_intervention_required
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          verificationType,
          verifiedBy,
          checksPassed,
          checksFailed,
          failureDetails ? JSON.stringify(failureDetails) : null,
          checksFailed > 0, // Manual intervention needed if anything failed
        ],
      );
    } catch (error) {
      // Don't let verification recording failures crash the check
      logger.error("Failed to record verification result", {
        error: error.message,
      });
    }
  }
}

// ============================================================
// Export EntityIntegrityService class
// ============================================================
module.exports = EntityIntegrityService;
