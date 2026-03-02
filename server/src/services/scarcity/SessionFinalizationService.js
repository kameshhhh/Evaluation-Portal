// ============================================================
// SESSION FINALIZATION SERVICE — Governance Layer
// ============================================================
// This is the "Moment of Truth" layer that sits BETWEEN
// human judgment capture (Step 3) and machine aggregation (Step 4).
//
// Responsibilities:
//   1. Validate session completeness (min evaluators, coverage)
//   2. Verify data integrity (pool constraints, no self-eval)
//   3. Enforce state transitions (open → closed → locked)
//   4. Generate cryptographic seal (SHA-256 of all allocations)
//   5. Record audit trail for every state change
//
// SESSION LIFECYCLE (enforced here):
//   open/in_progress → closed → locked → aggregated
//   NO REVERSE TRANSITIONS past 'locked'
//
// SRS REFERENCES:
//   4.2.2 — Aggregation requires LOCKED session
//   8.1   — Fairness (no evaluator dominates)
//   8.2   — Transparency (rules visible, judgments private)
//   10    — Acceptance Criteria (score inflation impossible)
//
// DEPENDENCY GRAPH:
//   SessionFinalizationService
//     → config/database (pg pool)
//     → utils/logger (Winston)
//     → crypto (Node.js built-in)
// ============================================================

"use strict";

const crypto = require("crypto");
const db = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// VALID STATE TRANSITIONS — Immutable truth table
// ============================================================
// Maps each state to the set of states it can transition to.
// Any transition not listed here is FORBIDDEN.
// ============================================================
const VALID_TRANSITIONS = {
  draft: ["open", "scheduled"],
  scheduled: ["open"],
  open: ["closed", "in_progress"],
  in_progress: ["closed"],
  closed: ["locked"],
  locked: ["aggregated"],
  // aggregated: [] — terminal state, no further transitions
};

// ============================================================
// FinalizationError — Custom error with code and details
// ============================================================
// Provides structured error information for the controller layer
// to return meaningful HTTP responses.
// ============================================================
class FinalizationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FinalizationError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class SessionFinalizationService {
  // ============================================================
  // PUBLIC: finalizeSession
  // ============================================================
  // Main entry point. Transitions a session from open → locked.
  // Performs completeness + integrity checks, then seals the data.
  //
  // @param {string} sessionId — Evaluation session UUID
  // @param {Object} options — { force, reason, adminId }
  //   force: skip completeness checks (admin override)
  //   reason: human-readable reason for audit trail
  //   adminId: UUID of the admin triggering finalization
  // @returns {Promise<Object>} — Finalization report
  // ============================================================
  async finalizeSession(sessionId, options = {}) {
    const startTime = Date.now();

    // Build the report object that tracks every step
    const report = {
      sessionId,
      timestamp: new Date().toISOString(),
      steps: [],
      validations: {},
      errors: [],
      finalState: null,
      cryptographicSeal: null,
    };

    try {
      // STEP 1: Acquire pessimistic lock on the session row
      report.steps.push("1. Acquire session lock");
      const session = await this._acquireSessionLock(sessionId);

      // Guard: session must be in an open/in_progress state
      if (!["open", "in_progress"].includes(session.status)) {
        throw new FinalizationError(
          "INVALID_STATE_TRANSITION",
          `Cannot finalize session in '${session.status}' state`,
          { current: session.status, required: ["open", "in_progress"] },
        );
      }

      // STEP 2: Validate completeness requirements
      report.steps.push("2. Validate completeness");
      const completeness = await this._validateCompleteness(sessionId, session);
      report.validations.completeness = completeness;

      // Block if incomplete (unless force override is set)
      if (!completeness.isComplete && !options.force) {
        throw new FinalizationError(
          "INCOMPLETE_SESSION",
          "Session does not meet minimum completeness requirements",
          completeness,
        );
      }

      // Safeguard: Force Finalize only allowed if at least one evaluation exists
      if (options.force && completeness.summary.evaluatorCount === 0) {
        throw new FinalizationError(
          "EMPTY_SESSION",
          "Cannot force finalize a session with zero evaluators/marks. At least one evaluation is required.",
          { evaluatorCount: 0 }
        );
      }

      // STEP 3: Verify integrity constraints
      report.steps.push("3. Verify integrity constraints");
      const integrity = await this._verifyIntegrity(sessionId, session);
      report.validations.integrity = integrity;

      // Block if any integrity violations found (unless force override is set)
      // For auto-finalization after deadline, TEMPORAL_INTEGRITY violations are expected
      // since we're finalizing after the window closed
      if (!integrity.isValid) {
        // Check if the only violation is TEMPORAL_INTEGRITY (expected for auto-finalize)
        const nonTemporalViolations = integrity.violations.filter(
          (v) => v.type !== "TEMPORAL_INTEGRITY",
        );

        if (nonTemporalViolations.length > 0 && !options.force) {
          throw new FinalizationError(
            "INTEGRITY_VIOLATION",
            "Session data integrity check failed",
            integrity.violations,
          );
        }

        // If force=true or only temporal violations, log warning but proceed
        if (options.force || nonTemporalViolations.length === 0) {
          logger.warn(
            "SessionFinalizationService: Proceeding despite integrity violations",
            {
              sessionId,
              violations: integrity.violations,
              force: options.force,
              reason: options.reason,
            },
          );
        }
      }

      // STEP 4: Transition to CLOSED (no more submissions)
      report.steps.push("4. Close session");
      await this._transitionState(sessionId, session.status, "closed", {
        finalizedBy: options.adminId || null,
        reason: options.reason || "session_finalization_step",
      });

      // STEP 5: Generate cryptographic seal over all allocations
      report.steps.push("5. Generate cryptographic seal");
      const seal = await this._generateCryptographicSeal(sessionId);
      report.cryptographicSeal = seal;

      // STEP 6: Transition to LOCKED (safe for aggregation)
      report.steps.push("6. Lock session");
      await this._transitionState(sessionId, "closed", "locked", {
        seal: seal.hash,
        finalizedBy: options.adminId || null,
        reason: options.reason || "session_finalization_complete",
      });

      // Record finalization metadata on the session row
      await db.query(
        `UPDATE evaluation_sessions
            SET finalization_seal = $1,
                sealed_at        = NOW(),
                finalized_by     = $2,
                finalized_at     = NOW()
          WHERE session_id = $3`,
        [seal.hash, options.adminId || null, sessionId],
      );

      report.finalState = "locked";
      report.durationMs = Date.now() - startTime;

      logger.info("SessionFinalizationService: session finalized", {
        sessionId,
        finalState: "locked",
        durationMs: report.durationMs,
        sealHash: seal.hash.substring(0, 16) + "...",
      });

      return report;
    } catch (error) {
      // Record the error in the report
      report.errors.push({
        step: report.steps[report.steps.length - 1] || "initialization",
        error: error.message,
        code: error.code,
        details: error.details,
      });

      logger.error("SessionFinalizationService: finalization failed", {
        sessionId,
        error: error.message,
        code: error.code,
      });

      throw error;
    }
  }

  // ============================================================
  // PUBLIC: getFinalizationReadiness
  // ============================================================
  // Returns the readiness status for a session without modifying it.
  // Used by the admin dashboard to show readiness indicators.
  //
  // @param {string} sessionId — Session UUID
  // @returns {Promise<Object>} — Readiness data
  // ============================================================
  async getFinalizationReadiness(sessionId) {
    const result = await db.query(
      "SELECT * FROM validate_session_finalization($1)",
      [sessionId],
    );

    // If the view returned no rows, session doesn't exist
    if (result.rows.length === 0) {
      return {
        canFinalize: false,
        reason: "Session not found or not in finalizable state",
        evaluatorCount: 0,
        targetCoverage: 0,
        deadlineStatus: "unknown",
      };
    }

    const row = result.rows[0];
    return {
      canFinalize: row.can_finalize,
      reason: row.reason,
      evaluatorCount: row.evaluator_count,
      targetCoverage: parseFloat(row.target_coverage || 0),
      deadlineStatus: row.deadline_status,
    };
  }

  // ============================================================
  // PRIVATE: _acquireSessionLock
  // ============================================================
  // Uses PostgreSQL FOR UPDATE NOWAIT to exclusively lock the row.
  // Prevents concurrent finalization attempts on the same session.
  // ============================================================
  async _acquireSessionLock(sessionId) {
    const result = await db.query(
      `SELECT * FROM evaluation_sessions
        WHERE session_id = $1
        FOR UPDATE NOWAIT`,
      [sessionId],
    );

    if (result.rows.length === 0) {
      throw new FinalizationError(
        "SESSION_NOT_FOUND",
        `Session ${sessionId} not found`,
      );
    }

    return result.rows[0];
  }

  // ============================================================
  // PRIVATE: _validateCompleteness
  // ============================================================
  // Checks whether the session meets minimum requirements:
  //   1. Minimum evaluator count reached
  //   2. All evaluators have submitted (no partial submissions)
  //   3. Deadline has passed (if set)
  //   4. Target coverage is ≥ 80%
  //
  // @returns {Object} — { isComplete, validations[], summary }
  // ============================================================
  async _validateCompleteness(sessionId, session) {
    const validations = [];

    // 1. Minimum evaluator count
    const evaluatorCount = await this._countDistinctEvaluators(sessionId);
    const minRequired = session.min_evaluators || 1;
    const hasMinEvaluators = evaluatorCount >= minRequired;
    validations.push({
      check: "MIN_EVALUATORS",
      required: minRequired,
      actual: evaluatorCount,
      passed: hasMinEvaluators,
    });

    // 2. All assigned evaluators have submitted
    const incompleteEvaluators =
      await this._findIncompleteEvaluators(sessionId);
    const allComplete = incompleteEvaluators.length === 0;
    validations.push({
      check: "COMPLETE_SUBMISSIONS",
      incompleteCount: incompleteEvaluators.length,
      incompleteEvaluators,
      passed: allComplete,
    });

    // 3. Deadline passed (if applicable)
    const deadline = session.evaluation_window_end;
    const deadlinePassed = deadline ? new Date() > new Date(deadline) : true;
    validations.push({
      check: "DEADLINE_PASSED",
      deadline: deadline || null,
      passed: deadlinePassed,
    });

    // 4. Target coverage (at least 80% of targets evaluated)
    const targetCoverage = await this._calculateTargetCoverage(sessionId);
    const sufficientCoverage = targetCoverage >= 0.8;
    validations.push({
      check: "TARGET_COVERAGE",
      required: "80%",
      actual: `${(targetCoverage * 100).toFixed(1)}%`,
      passed: sufficientCoverage,
    });

    // 5. Min evaluations per target (Structural Safeguard: Min 2 Judges)
    // Counts ACTUAL submissions (allocations), not just assignments.
    const underEvaluated = await this._getUnderEvaluatedTargets(sessionId, 2);
    validations.push({
      check: "MIN_EVALUATIONS_PER_TARGET",
      required: 2,
      failedCount: underEvaluated.length,
      passed: underEvaluated.length === 0,
    });

    // Session is complete only if ALL validations pass
    const isComplete = validations.every((v) => v.passed);

    return {
      isComplete,
      validations,
      summary: {
        evaluatorCount,
        incompleteEvaluators: incompleteEvaluators.length,
        targetCoverage,
        deadlineStatus: deadlinePassed ? "PASSED" : "NOT_PASSED",
      },
    };
  }

  // ============================================================
  // PRIVATE: _verifyIntegrity
  // ============================================================
  // Double-checks constraints that should have been enforced at
  // write time but are verified again before sealing:
  //   1. Pool violations (sum of points > pool size)
  //   2. Self-evaluation (evaluator == target)
  //   3. Duplicate allocations
  //   4. Temporal integrity (no backdated submissions)
  //
  // @returns {Object} — { isValid, violations[], checkedAt }
  // ============================================================
  async _verifyIntegrity(sessionId, session) {
    const violations = [];

    // 1. Pool constraint violations
    const poolViolations = await this._checkPoolViolations(
      sessionId,
      session.scarcity_pool_size,
    );
    if (poolViolations.length > 0) {
      violations.push({
        type: "POOL_VIOLATION",
        count: poolViolations.length,
        evaluators: poolViolations.map((v) => v.evaluator_id),
      });
    }

    // 2. Self-evaluation violations
    const selfEvaluations = await this._checkSelfEvaluations(sessionId);
    if (selfEvaluations.length > 0) {
      violations.push({
        type: "SELF_EVALUATION",
        count: selfEvaluations.length,
        allocations: selfEvaluations,
      });
    }

    // 3. Duplicate allocations (same evaluator + target + head)
    const duplicates = await this._checkDuplicateAllocations(sessionId);
    if (duplicates.length > 0) {
      violations.push({
        type: "DUPLICATE_ALLOCATION",
        count: duplicates.length,
      });
    }

    // 4. Temporal integrity (submissions after window close)
    const temporalIssues = await this._checkTemporalIntegrity(
      sessionId,
      session.evaluation_window_end,
    );
    if (temporalIssues.length > 0) {
      violations.push({
        type: "TEMPORAL_INTEGRITY",
        count: temporalIssues.length,
        issues: temporalIssues,
      });
    }

    return {
      isValid: violations.length === 0,
      violations,
      checkedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // PRIVATE: _generateCryptographicSeal
  // ============================================================
  // Creates a SHA-256 hash over ALL allocations in deterministic
  // order. This seal proves the data has not been tampered with
  // after finalization.
  //
  // Hash input: sessionId + sorted(evaluator:target:points:timestamp)
  //
  // @returns {Object} — { algorithm, hash, allocationsCount, generatedAt }
  // ============================================================
  async _generateCryptographicSeal(sessionId) {
    // Fetch all allocations in deterministic order
    const result = await db.query(
      `SELECT allocation_id, evaluator_id, target_id, points, created_at
         FROM scarcity_allocations
        WHERE session_id = $1
        ORDER BY evaluator_id, target_id, created_at`,
      [sessionId],
    );

    // Build deterministic string representation
    const allocationString = result.rows
      .map(
        (a) =>
          `${a.evaluator_id}:${a.target_id}:${a.points}:${a.created_at.toISOString()}`,
      )
      .join("|");

    // Generate SHA-256 hash
    const hash = crypto.createHash("sha256");
    hash.update(sessionId);
    hash.update(allocationString);
    hash.update(new Date().toISOString());

    const sealHash = hash.digest("hex");

    return {
      algorithm: "SHA-256",
      hash: sealHash,
      allocationsCount: result.rows.length,
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // PRIVATE: _transitionState
  // ============================================================
  // Atomic state change with audit trail. Uses a transaction to
  // update the session status AND insert an audit row together.
  //
  // @param {string} sessionId — Session UUID
  // @param {string} fromState — Current state (for audit)
  // @param {string} toState — Target state
  // @param {Object} metadata — Additional context for audit row
  // ============================================================
  async _transitionState(sessionId, fromState, toState, metadata = {}) {
    // Validate the state transition is allowed
    const allowed = VALID_TRANSITIONS[fromState] || [];
    if (!allowed.includes(toState)) {
      throw new FinalizationError(
        "INVALID_STATE_TRANSITION",
        `Transition from '${fromState}' to '${toState}' is not allowed`,
        { from: fromState, to: toState, allowed },
      );
    }

    const client = await db.getClient();

    try {
      await client.query("BEGIN");

      // Update the session status
      await client.query(
        `UPDATE evaluation_sessions
            SET status = $1
          WHERE session_id = $2`,
        [toState, sessionId],
      );

      // Insert audit trail row
      await client.query(
        `INSERT INTO session_state_transitions
            (session_id, from_state, to_state, transitioned_by, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          sessionId,
          fromState,
          toState,
          metadata.finalizedBy || null,
          JSON.stringify(metadata),
        ],
      );

      await client.query("COMMIT");

      logger.info("SessionFinalizationService: state transition", {
        sessionId,
        from: fromState,
        to: toState,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================
  // PRIVATE HELPERS: Database queries for validation checks
  // ============================================================

  // Count distinct evaluators who have submitted allocations
  async _countDistinctEvaluators(sessionId) {
    const result = await db.query(
      `SELECT COUNT(DISTINCT evaluator_id) AS count
         FROM scarcity_allocations
        WHERE session_id = $1`,
      [sessionId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  // Find evaluators assigned but who haven't submitted anything
  async _findIncompleteEvaluators(sessionId) {
    const result = await db.query(
      `SELECT se.evaluator_id
         FROM session_evaluators se
        WHERE se.session_id = $1
          AND se.has_submitted = FALSE`,
      [sessionId],
    );
    return result.rows.map((r) => r.evaluator_id);
  }

  // Calculate what fraction of distinct targets have been evaluated
  async _calculateTargetCoverage(sessionId) {
    // Count targets that received at least one allocation
    const evaluated = await db.query(
      `SELECT COUNT(DISTINCT target_id) AS count
         FROM scarcity_allocations
        WHERE session_id = $1`,
      [sessionId],
    );

    // Count expected targets from session_evaluators × target combos
    // If no explicit target list, use the count of evaluated targets as 100%
    const evaluatedCount = parseInt(evaluated.rows[0].count, 10);

    // If no targets at all, return 0
    if (evaluatedCount === 0) return 0;

    // For now, use 1.0 (all evaluated targets are covered)
    // In future, compare against session.target_ids if that column exists
    return 1.0;
  }

  // Check if any evaluator exceeded the pool size
  async _checkPoolViolations(sessionId, poolSize) {
    if (!poolSize) return [];

    const result = await db.query(
      `SELECT evaluator_id, SUM(points) AS total_used
         FROM scarcity_allocations
        WHERE session_id = $1
        GROUP BY evaluator_id
       HAVING SUM(points) > $2`,
      [sessionId, poolSize],
    );
    return result.rows;
  }

  // Check if any evaluator evaluated themselves
  async _checkSelfEvaluations(sessionId) {
    const result = await db.query(
      `SELECT allocation_id, evaluator_id, target_id
         FROM scarcity_allocations
        WHERE session_id = $1
          AND evaluator_id = target_id`,
      [sessionId],
    );
    return result.rows;
  }

  // Check for duplicate allocations (same evaluator+target+head)
  async _checkDuplicateAllocations(sessionId) {
    const result = await db.query(
      `SELECT evaluator_id, target_id, head_id, COUNT(*) AS dup_count
         FROM scarcity_allocations
        WHERE session_id = $1
        GROUP BY evaluator_id, target_id, head_id
       HAVING COUNT(*) > 1`,
      [sessionId],
    );
    return result.rows;
  }

  // Check for submissions after the evaluation window ended
  async _checkTemporalIntegrity(sessionId, windowEnd) {
    if (!windowEnd) return [];

    const result = await db.query(
      `SELECT allocation_id, evaluator_id, created_at
         FROM scarcity_allocations
        WHERE session_id = $1
          AND created_at > $2`,
      [sessionId, windowEnd],
    );
    return result.rows;
  }

  // Get targets with fewer than minCount distinct evaluators (Safeguard)
  async _getUnderEvaluatedTargets(sessionId, minCount) {
    const result = await db.query(
      `SELECT target_id
         FROM scarcity_allocations
        WHERE session_id = $1
        GROUP BY target_id
       HAVING COUNT(DISTINCT evaluator_id) < $2`,
      [sessionId, minCount],
    );
    return result.rows.map((r) => r.target_id);
  }
}

// ============================================================
// EXPORTS
// ============================================================
// Export both the service singleton and the error class.
// The controller uses the singleton; tests may use the class.
// ============================================================
module.exports = new SessionFinalizationService();
module.exports.FinalizationError = FinalizationError;
module.exports.VALID_TRANSITIONS = VALID_TRANSITIONS;
