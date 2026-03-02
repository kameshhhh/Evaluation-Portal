// ============================================================
// SESSION ISOLATION SERVICE — Evaluator Independence Enforcement
// ============================================================
// Ensures that evaluators cannot see each other's allocations
// during an active evaluation session.
//
// SRS 4.2.1: "Each judge evaluates independently"
//            "Judges do not see others' scores during evaluation"
//
// ISOLATION RULES:
//   1. An evaluator can ONLY see their own allocations
//   2. Other evaluators' allocations are never returned in responses
//   3. Aggregated results are only visible AFTER session is closed
//   4. The session must be in 'open' or 'in_progress' status
//
// This module provides the permission checks and query filters
// needed to enforce isolation at the application layer.
// The ScarcityRepository uses these filters to scope DB queries.
// ============================================================

// Import logger for audit trail of isolation enforcement
const logger = require("../../utils/logger");

// ============================================================
// SESSION STATES — Where isolation applies
// ============================================================

// Sessions in these states have active isolation
// Evaluators can only see their own allocations
const ISOLATED_STATES = Object.freeze(["open", "in_progress"]);

// Sessions in these states show aggregated results
// Individual evaluator data is still hidden; only averages/totals shown
const RESULTS_VISIBLE_STATES = Object.freeze(["closed", "locked"]);

// ============================================================
// checkEvaluatorAccess — Permission check
// ============================================================
/**
 * Check if an evaluator has access to a session and what they can see.
 *
 * Returns an access descriptor that the repository uses to
 * scope queries appropriately.
 *
 * @param {Object} session - The evaluation session record
 * @param {string} session.status - Current session status
 * @param {string} session.session_id - Session UUID
 * @param {string} evaluatorId - The evaluator requesting access
 * @param {Array<string>} assignedEvaluatorIds - List of evaluator IDs assigned to this session
 * @returns {Object} Access descriptor { allowed, scope, reason }
 *
 * @example
 * checkEvaluatorAccess(session, 'eval-1', ['eval-1', 'eval-2'])
 * // → { allowed: true, scope: 'own_only', reason: 'Session is in_progress...' }
 */
function checkEvaluatorAccess(session, evaluatorId, assignedEvaluatorIds) {
  // ---------------------------------------------------------
  // CHECK 1: Is the evaluator assigned to this session?
  // ---------------------------------------------------------
  if (!assignedEvaluatorIds.includes(evaluatorId)) {
    logger.warn("SessionIsolation: Unauthorized access attempt", {
      sessionId: session.session_id,
      evaluatorId,
      reason: "Not assigned to session",
    });

    return {
      allowed: false,
      scope: "none",
      reason: "Evaluator is not assigned to this session",
    };
  }

  // ---------------------------------------------------------
  // CHECK 2: Is the session in draft or scheduled state?
  // Draft/scheduled sessions are not ready for evaluation
  // ---------------------------------------------------------
  if (session.status === "draft" || session.status === "scheduled") {
    return {
      allowed: false,
      scope: "none",
      reason: `Session is in '${session.status}' state — not yet open for evaluation`,
    };
  }

  // ---------------------------------------------------------
  // CHECK 3: Is the session in an isolated state (open/in_progress)?
  // Evaluators can only see their own allocations
  // SRS 4.2.1: "Judges do not see others' scores during evaluation"
  // ---------------------------------------------------------
  if (ISOLATED_STATES.includes(session.status)) {
    logger.debug("SessionIsolation: Own-only access granted", {
      sessionId: session.session_id,
      evaluatorId,
      sessionStatus: session.status,
    });

    return {
      allowed: true,
      scope: "own_only", // Only see own allocations
      reason: `Session is ${session.status} — isolation active`,
    };
  }

  // ---------------------------------------------------------
  // CHECK 4: Is the session closed/locked?
  // Aggregated results are visible, but individual evaluator
  // data remains private (only averages/totals shown)
  // ---------------------------------------------------------
  if (RESULTS_VISIBLE_STATES.includes(session.status)) {
    logger.debug("SessionIsolation: Aggregated results access granted", {
      sessionId: session.session_id,
      evaluatorId,
      sessionStatus: session.status,
    });

    return {
      allowed: true,
      scope: "aggregated", // See aggregated results + own allocations
      reason: `Session is ${session.status} — results available`,
    };
  }

  // ---------------------------------------------------------
  // FALLBACK: Unknown status — deny access for safety
  // ---------------------------------------------------------
  logger.warn("SessionIsolation: Unknown session status", {
    sessionId: session.session_id,
    status: session.status,
  });

  return {
    allowed: false,
    scope: "none",
    reason: `Unknown session status: ${session.status}`,
  };
}

// ============================================================
// canSubmitAllocations — Submission permission check
// ============================================================
/**
 * Check if a session allows submission of new allocations.
 *
 * Allocations can only be submitted when the session is in
 * 'open' or 'in_progress' state. Other states are read-only.
 *
 * @param {Object} session - The evaluation session record
 * @returns {Object} { allowed, reason }
 */
function canSubmitAllocations(session) {
  // Only open or in_progress sessions accept allocations
  if (ISOLATED_STATES.includes(session.status)) {
    return {
      allowed: true,
      reason: `Session is ${session.status} — accepting allocations`,
    };
  }

  return {
    allowed: false,
    reason: `Session is '${session.status}' — allocations are no longer accepted`,
  };
}

/**
 * Build the WHERE clause filter for scoping allocation queries.
 * This ensures the database only returns data the evaluator is
 * allowed to see based on the session's isolation rules.
 *
 * @param {string} scope - Access scope from checkEvaluatorAccess
 * @param {string} evaluatorId - The evaluator making the query
 * @returns {Object} { whereClause, evaluatorFilter } for SQL query building
 */
function buildIsolationFilter(scope, evaluatorId) {
  // Route based on the access scope
  switch (scope) {
    case "own_only":
      // Only return this evaluator's allocations
      return {
        whereClause: "AND sa.evaluator_id = $EVAL_ID",
        evaluatorFilter: evaluatorId,
      };

    case "aggregated":
      // Return all allocations (service layer strips individual data)
      return {
        whereClause: "", // No filter — service layer handles privacy
        evaluatorFilter: null,
      };

    case "none":
    default:
      // Return nothing — access denied
      return {
        whereClause: "AND 1 = 0", // Always false — no results
        evaluatorFilter: null,
      };
  }
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  // Main access control functions
  checkEvaluatorAccess,
  canSubmitAllocations,
  buildIsolationFilter,

  // Constants (exported for tests)
  ISOLATED_STATES,
  RESULTS_VISIBLE_STATES,
};
