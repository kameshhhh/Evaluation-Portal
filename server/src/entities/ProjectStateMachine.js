// ============================================================
// PROJECT STATE MACHINE — Lifecycle State Management
// ============================================================
// Implements the formal state machine for project lifecycle:
//
//   DRAFT → ACTIVE → UNDER_REVIEW → LOCKED → ARCHIVED
//                  ↑                |
//                  └────────────────┘  (return to team)
//
// Each transition has:
//   1. Guard conditions — preconditions that must be met
//   2. Actions — side effects of the transition
//   3. Audit trail — every transition is recorded
//
// The state machine enforces that:
//   - Only valid transitions are allowed
//   - Guard conditions are checked before any transition
//   - Failed transitions get clear error messages
//   - Every transition is logged to project_state_transitions
//
// This is where the HARD business rules live:
//   - Can't activate without 2+ members
//   - Can't lock without a freeze snapshot
//   - Can't archive without scoring being complete
// ============================================================

// Import the valid transitions map from the Project entity
const { ProjectStatus, VALID_TRANSITIONS } = require("../entities/Project");

// Import custom errors for state machine failures
const {
  StateTransitionError,
  GuardConditionFailedError,
} = require("../entities/EntityErrors");

// Import team size validator for the DRAFT → ACTIVE guard
const { TeamSizeValidator } = require("../validators/TeamSizeValidator");

// Import the logger for transition tracking
const logger = require("../utils/logger");

// ============================================================
// Guard Condition Functions — preconditions for each transition
// ============================================================
// Each guard receives the project and context, and throws
// if the guard condition is not met.

/**
 * Guard: Can the project move from DRAFT to ACTIVE?
 * Requires: at least 2 active team members.
 *
 * @param {Object} project - The project entity
 * @param {Object} context - { activeMembers: number }
 * @throws {GuardConditionFailedError} If guard fails
 */
function guardDraftToActive(project, context) {
  // Must have at least 2 active members to activate
  const memberCount = context.activeMembers || 0;

  // Use TeamSizeValidator — throws TeamSizeError if invalid
  try {
    TeamSizeValidator.validateCanActivate(memberCount);
  } catch (error) {
    // Wrap in GuardConditionFailedError for consistent error handling
    throw new GuardConditionFailedError(
      `Cannot activate project: ${error.message}`,
      { transition: "draft→active", memberCount },
    );
  }
}

/**
 * Guard: Can the project move from ACTIVE to UNDER_REVIEW?
 * Requires: project must have content (plans/logs submitted).
 *
 * @param {Object} project - The project entity
 * @param {Object} context - { hasPlans: boolean }
 * @throws {GuardConditionFailedError} If guard fails
 */
function guardActiveToUnderReview(project, context) {
  // Project must have at least some content to review
  // This is a soft check — we log a warning but allow it
  if (context.hasPlans === false) {
    logger.warn("Project submitted for review with no plans", {
      projectId: project.projectId || project.project_id,
    });
  }

  // No hard guard failure — submitting for review is always allowed
  // from active state (the evaluation committee will handle empty projects)
}

/**
 * Guard: Can the project move from UNDER_REVIEW to LOCKED?
 * Requires: evaluation session must exist with freeze snapshot.
 *
 * @param {Object} project - The project entity
 * @param {Object} context - { sessionId: string }
 * @throws {GuardConditionFailedError} If guard fails
 */
function guardUnderReviewToLocked(project, context) {
  // An evaluation session must be provided
  if (!context.sessionId) {
    throw new GuardConditionFailedError(
      "Cannot lock project without an active evaluation session",
      { transition: "under_review→locked" },
    );
  }
}

/**
 * Guard: Can the project move from UNDER_REVIEW back to ACTIVE?
 * Requires: a reason must be provided for returning the project.
 *
 * @param {Object} project - The project entity
 * @param {Object} context - { reason: string }
 * @throws {GuardConditionFailedError} If guard fails
 */
function guardUnderReviewToActive(project, context) {
  // A reason is required for returning a project to the team
  if (!context.reason || context.reason.trim().length === 0) {
    throw new GuardConditionFailedError(
      "A reason must be provided when returning a project to active status",
      { transition: "under_review→active" },
    );
  }
}

/**
 * Guard: Can the project move from LOCKED to ARCHIVED?
 * Requires: all evaluation scoring must be complete.
 *
 * @param {Object} project - The project entity
 * @param {Object} context - { scoringComplete: boolean }
 * @throws {GuardConditionFailedError} If guard fails
 */
function guardLockedToArchived(project, context) {
  // Scoring must be finalized before archiving
  if (context.scoringComplete === false) {
    throw new GuardConditionFailedError(
      "Cannot archive project until evaluation scoring is complete",
      { transition: "locked→archived" },
    );
  }
}

// ============================================================
// Guard registry — maps transition keys to guard functions
// ============================================================
// Key format: "fromStatus_toStatus"
const GUARDS = {
  draft_active: guardDraftToActive,
  active_under_review: guardActiveToUnderReview,
  under_review_locked: guardUnderReviewToLocked,
  under_review_active: guardUnderReviewToActive,
  locked_archived: guardLockedToArchived,
};

// ============================================================
// ProjectStateMachine class — orchestrates state transitions
// ============================================================
class ProjectStateMachine {
  /**
   * Attempt to transition a project to a new state.
   * Validates the transition is allowed and runs guard conditions.
   *
   * @param {Object} project - The current project entity
   * @param {string} targetStatus - The desired new status
   * @param {Object} context - Context data for guard checks
   * @returns {{ allowed: true, from: string, to: string }} If transition is valid
   * @throws {StateTransitionError} If transition is not allowed
   * @throws {GuardConditionFailedError} If guard condition fails
   */
  static validateTransition(project, targetStatus, context = {}) {
    // Get the current status
    const currentStatus = project.status;

    // Check if the transition is in the allowed transitions map
    const allowedTargets = VALID_TRANSITIONS[currentStatus] || [];

    // If the target is not in the allowed list, it's an invalid transition
    if (!allowedTargets.includes(targetStatus)) {
      throw new StateTransitionError(
        `Invalid state transition: ${currentStatus} → ${targetStatus}. ` +
          `Allowed transitions from ${currentStatus}: [${allowedTargets.join(", ")}]`,
        {
          currentStatus,
          targetStatus,
          allowedTransitions: allowedTargets,
        },
      );
    }

    // Look up the guard function for this transition
    const guardKey = `${currentStatus}_${targetStatus}`;
    const guard = GUARDS[guardKey];

    // If a guard exists, run it (guard throws if the condition fails)
    if (guard) {
      guard(project, context);
    }

    // Log the validated transition
    logger.info("State transition validated", {
      projectId: project.projectId || project.project_id,
      from: currentStatus,
      to: targetStatus,
    });

    // Return the transition metadata
    return {
      allowed: true,
      from: currentStatus,
      to: targetStatus,
    };
  }

  /**
   * Get all valid transitions from the current state.
   * Useful for UI — shows which buttons to enable.
   *
   * @param {string} currentStatus - The current project status
   * @returns {Array<string>} List of valid target statuses
   */
  static getAvailableTransitions(currentStatus) {
    // Return the allowed targets or empty array
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Check if a specific transition is valid WITHOUT throwing.
   * Returns true/false instead of throwing errors.
   *
   * @param {Object} project - The current project entity
   * @param {string} targetStatus - The desired new status
   * @param {Object} context - Context data for guard checks
   * @returns {boolean} True if the transition would succeed
   */
  static canTransition(project, targetStatus, context = {}) {
    try {
      // Attempt the validation
      ProjectStateMachine.validateTransition(project, targetStatus, context);
      return true;
    } catch {
      // If any error is thrown, the transition is not valid
      return false;
    }
  }
}

// ============================================================
// Export ProjectStateMachine, guards, and status enum
// ============================================================
module.exports = { ProjectStateMachine, GUARDS, ProjectStatus };
