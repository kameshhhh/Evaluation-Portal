// ============================================================
// SESSION STATE MACHINE — Evaluation Session Lifecycle
// ============================================================
// Manages the lifecycle of evaluation sessions:
//
//   DRAFT → SCHEDULED → OPEN → IN_PROGRESS → CLOSED → LOCKED
//
// Evaluation sessions are how the college evaluates projects.
// Each session:
//   1. Is linked to an academic period (month)
//   2. Has a time window for when scoring can happen
//   3. Freezes entity states when locked
//   4. Cannot be modified once locked
//
// Session lifecycle explained:
//   DRAFT — Just created, being configured
//   SCHEDULED — Time window set, waiting to open
//   OPEN — Evaluators can start scoring
//   IN_PROGRESS — Scoring is actively happening
//   CLOSED — Scoring window ended, processing results
//   LOCKED — Permanently sealed, results are final
// ============================================================

// Import custom error for invalid transitions
const { StateTransitionError } = require("./EntityErrors");

// Import logger for tracking transitions
const logger = require("../utils/logger");

// ============================================================
// SESSION STATUS ENUM — Matches CHECK constraint in DB
// ============================================================
const SessionStatus = Object.freeze({
  DRAFT: "draft", // Being configured
  SCHEDULED: "scheduled", // Ready but not yet open
  OPEN: "open", // Available for scoring
  IN_PROGRESS: "in_progress", // Scoring actively happening
  CLOSED: "closed", // Scoring window ended
  LOCKED: "locked", // Permanently sealed
});

// ============================================================
// VALID SESSION TRANSITIONS — Allowed state changes
// ============================================================
const SESSION_TRANSITIONS = Object.freeze({
  [SessionStatus.DRAFT]: [
    SessionStatus.SCHEDULED, // Configure and schedule
  ],
  [SessionStatus.SCHEDULED]: [
    SessionStatus.OPEN, // Open for scoring
    SessionStatus.DRAFT, // Return to draft for changes
  ],
  [SessionStatus.OPEN]: [
    SessionStatus.IN_PROGRESS, // Scoring has started
    SessionStatus.CLOSED, // Close early if needed
  ],
  [SessionStatus.IN_PROGRESS]: [
    SessionStatus.CLOSED, // End scoring period
  ],
  [SessionStatus.CLOSED]: [
    SessionStatus.LOCKED, // Permanently seal results
  ],
  [SessionStatus.LOCKED]: [
    // No transitions — locked is TERMINAL
  ],
});

// ============================================================
// SessionStateMachine — manages evaluation session transitions
// ============================================================
class SessionStateMachine {
  /**
   * Validate that a session can transition to the target status.
   * Throws StateTransitionError if the transition is not valid.
   *
   * @param {Object} session - The current session object
   * @param {string} targetStatus - Desired new status
   * @returns {{ allowed: true, from: string, to: string }}
   * @throws {StateTransitionError} If transition is invalid
   */
  static validateTransition(session, targetStatus) {
    // Get the current status of the session
    const currentStatus = session.status;

    // Look up allowed transitions from current status
    const allowedTargets = SESSION_TRANSITIONS[currentStatus] || [];

    // Check if target is in the allowed list
    if (!allowedTargets.includes(targetStatus)) {
      throw new StateTransitionError(
        `Invalid session transition: ${currentStatus} → ${targetStatus}. ` +
          `Allowed: [${allowedTargets.join(", ")}]`,
        {
          currentStatus,
          targetStatus,
          allowedTransitions: allowedTargets,
        },
      );
    }

    // Log the validated transition
    logger.info("Session state transition validated", {
      sessionId: session.session_id || session.sessionId,
      from: currentStatus,
      to: targetStatus,
    });

    return {
      allowed: true,
      from: currentStatus,
      to: targetStatus,
    };
  }

  /**
   * Get available transitions from the current status.
   *
   * @param {string} currentStatus - Current session status
   * @returns {Array<string>} List of valid target statuses
   */
  static getAvailableTransitions(currentStatus) {
    return SESSION_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Non-throwing version: check if a transition is valid.
   *
   * @param {Object} session - The session object
   * @param {string} targetStatus - Desired status
   * @returns {boolean} True if the transition is valid
   */
  static canTransition(session, targetStatus) {
    try {
      SessionStateMachine.validateTransition(session, targetStatus);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the session is in a state where scoring is allowed.
   * Only OPEN and IN_PROGRESS sessions accept scores.
   *
   * @param {Object} session - The session object
   * @returns {boolean} True if scoring is allowed
   */
  static isScoringAllowed(session) {
    return (
      session.status === SessionStatus.OPEN ||
      session.status === SessionStatus.IN_PROGRESS
    );
  }

  /**
   * Check if the session is permanently locked.
   * Locked sessions cannot change in any way.
   *
   * @param {Object} session - The session object
   * @returns {boolean} True if session is locked
   */
  static isLocked(session) {
    return session.status === SessionStatus.LOCKED;
  }
}

// ============================================================
// Export SessionStateMachine, status enum, and transitions
// ============================================================
module.exports = { SessionStateMachine, SessionStatus, SESSION_TRANSITIONS };
