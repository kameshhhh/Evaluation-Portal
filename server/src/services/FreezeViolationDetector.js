// ============================================================
// FREEZE VIOLATION DETECTOR — Catches Illegal Modifications
// ============================================================
// After an entity is frozen for evaluation, NO modifications
// should be possible. This service detects if someone somehow
// bypassed the freeze guard (e.g., via direct SQL).
//
// It works by:
//   1. Fetching the frozen snapshot from entity_freeze_snapshots
//   2. Fetching the CURRENT state from the live tables
//   3. Comparing them field-by-field
//   4. If any field differs, a FREEZE VIOLATION is detected
//
// This is a DETECTIVE control (not preventive).
// The preventive controls are:
//   - FreezeGuard middleware (blocks HTTP requests)
//   - Application-level checks (isModifiable() on entities)
//   - Database triggers
// This service is the "double-check" — trust but verify.
// ============================================================

// Import database query function
const { query } = require("../config/database");

// Import domain events
const { createEvent, EventTypes } = require("../events/EntityEvents");

// Import custom errors
const { FreezeViolationError } = require("../entities/EntityErrors");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// FreezeViolationDetector — compares frozen vs live state
// ============================================================
class FreezeViolationDetector {
  /**
   * Check if a frozen project has been modified since freezing.
   * Compares the frozen snapshot with the current live state.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} sessionId - UUID of the evaluation session
   * @returns {Promise<{ violated: boolean, violations: Array }>}
   */
  static async checkProjectViolations(projectId, sessionId) {
    // Fetch the frozen snapshot for this project and session
    const snapshotResult = await query(
      `SELECT * FROM entity_freeze_snapshots
       WHERE entity_type = 'project'
         AND entity_id = $1
         AND session_id = $2
       ORDER BY frozen_at DESC
       LIMIT 1`,
      [projectId, sessionId],
    );

    // If no snapshot exists, nothing to check
    if (snapshotResult.rows.length === 0) {
      return {
        violated: false,
        violations: [],
        details: "No frozen snapshot found for this project/session",
      };
    }

    const snapshot = snapshotResult.rows[0];
    const frozenState = snapshot.frozen_state;

    // Fetch the current live state
    const projectResult = await query(
      "SELECT * FROM projects WHERE project_id = $1",
      [projectId],
    );

    if (projectResult.rows.length === 0) {
      return {
        violated: true,
        violations: [
          {
            field: "project",
            type: "DELETED",
            details: "Project no longer exists",
          },
        ],
      };
    }

    const liveProject = projectResult.rows[0];
    const violations = [];

    // Compare key fields between frozen and live state
    const fieldsToCheck = [
      {
        frozen: frozenState.project?.title,
        live: liveProject.title,
        field: "title",
      },
      {
        frozen: frozenState.project?.description,
        live: liveProject.description,
        field: "description",
      },
      {
        frozen: frozenState.project?.status,
        live: liveProject.status,
        field: "status",
      },
    ];

    // Check each field
    for (const check of fieldsToCheck) {
      if (check.frozen !== undefined && check.frozen !== check.live) {
        violations.push({
          field: check.field,
          type: "MODIFIED",
          frozenValue: check.frozen,
          liveValue: check.live,
        });
      }
    }

    // Check work logs — look for modifications after freeze
    const frozenWorkLogIds = (frozenState.workLogs || []).map((w) => w.logId);
    if (frozenWorkLogIds.length > 0) {
      const liveWorkLogs = await query(
        `SELECT * FROM work_logs
         WHERE project_id = $1 AND log_id = ANY($2::uuid[])`,
        [projectId, frozenWorkLogIds],
      );

      // Check if any work log was modified after the freeze
      for (const liveLog of liveWorkLogs.rows) {
        if (liveLog.last_modified_at > snapshot.frozen_at) {
          violations.push({
            field: "work_log",
            type: "MODIFIED_AFTER_FREEZE",
            logId: liveLog.log_id,
            modifiedAt: liveLog.last_modified_at,
            frozenAt: snapshot.frozen_at,
          });
        }
      }
    }

    // Log if violations found
    if (violations.length > 0) {
      logger.error("FREEZE VIOLATIONS DETECTED", {
        projectId,
        sessionId,
        violationCount: violations.length,
        violations,
      });
    }

    return {
      violated: violations.length > 0,
      violations,
      details:
        violations.length > 0
          ? `${violations.length} violation(s) detected`
          : "No violations — frozen state is consistent with live state",
    };
  }

  /**
   * Run violation detection for all frozen entities in a session.
   *
   * @param {string} sessionId - UUID of the evaluation session
   * @returns {Promise<{ totalChecked: number, totalViolations: number, results: Array }>}
   */
  static async checkAllSessionViolations(sessionId) {
    // Get all frozen snapshots for this session
    const snapshots = await query(
      `SELECT DISTINCT entity_type, entity_id
       FROM entity_freeze_snapshots
       WHERE session_id = $1`,
      [sessionId],
    );

    let totalChecked = 0;
    let totalViolations = 0;
    const results = [];

    // Check each frozen entity
    for (const row of snapshots.rows) {
      totalChecked++;

      if (row.entity_type === "project") {
        const result = await FreezeViolationDetector.checkProjectViolations(
          row.entity_id,
          sessionId,
        );

        if (result.violated) {
          totalViolations += result.violations.length;
        }

        results.push({
          entityType: row.entity_type,
          entityId: row.entity_id,
          ...result,
        });
      }
    }

    logger.info("Session violation check complete", {
      sessionId,
      totalChecked,
      totalViolations,
    });

    return { totalChecked, totalViolations, results };
  }
}

// ============================================================
// Export FreezeViolationDetector class
// ============================================================
module.exports = FreezeViolationDetector;
