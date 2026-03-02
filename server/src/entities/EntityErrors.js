// ============================================================
// ENTITY MODELING ERROR HIERARCHY — Domain-Specific Errors
// ============================================================
// Every error class in the PEMM module lives here.
// Extends the existing AppError from our error handler so the
// global error handler middleware still catches and formats
// all these errors automatically — ZERO changes to errorHandler.js.
//
// Hierarchy:
//   AppError (existing)
//     └── EntityModelingError (base for this module)
//           ├── BusinessRuleViolationError (422)
//           │     ├── TeamSizeError (422)
//           │     ├── DuplicateMemberError (422)
//           │     └── InvalidMembershipError (422)
//           ├── TemporalValidationError (422)
//           │     └── PeriodFrozenError (423)
//           ├── FreezeViolationError (423)
//           ├── StateTransitionError (409)
//           │     └── GuardConditionFailedError (409)
//           ├── ProjectNotFoundError (404)
//           ├── PersonNotFoundError (404)
//           ├── ProjectCreationError (500)
//           ├── IntegrityViolationError (500)
//           └── ImmutableDataError (423)
// ============================================================

// Import the existing AppError class — our system's base error type
// This keeps compatibility with the global errorHandler middleware
const { AppError } = require("../middleware/errorHandler");

// ============================================================
// BASE CLASS: EntityModelingError
// All PEMM errors extend this for clean instanceof checks.
// Adds metadata, timestamp, and log level on top of AppError.
// ============================================================
class EntityModelingError extends AppError {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} statusCode - HTTP status code (4xx or 5xx)
   * @param {string} code - Machine-readable error code for clients
   * @param {Object} metadata - Structured data for logging/debugging
   */
  constructor(
    message,
    statusCode = 500,
    code = "ENTITY_MODELING_ERROR",
    metadata = {},
  ) {
    // Call AppError constructor — keeps errorHandler compatibility
    super(message, statusCode, code);

    // Set the error name so stack traces show the correct class name
    this.name = "EntityModelingError";

    // Attach structured metadata for observability pipelines
    // Example: { projectId: 'uuid', teamSize: 5 }
    this.metadata = metadata;

    // ISO timestamp of when the error was created
    this.timestamp = new Date().toISOString();

    // Default log level — subclasses override as needed
    this.logLevel = "error";
  }
}

// ============================================================
// BUSINESS RULE VIOLATION — HTTP 422 Unprocessable Entity
// Thrown when valid data violates a business rule.
// Example: trying to create a team with 5 members
// ============================================================
class BusinessRuleViolationError extends EntityModelingError {
  /**
   * @param {string} message - What rule was violated
   * @param {string} code - Machine-readable rule code
   * @param {number} httpStatus - HTTP status (default 422)
   * @param {Object} metadata - Context about the violation
   */
  constructor(
    message,
    code = "BUSINESS_RULE_VIOLATION",
    httpStatus = 422,
    metadata = {},
  ) {
    // 422 = "I understood your request but the data breaks a rule"
    super(message, httpStatus, code, metadata);

    // Override name for clear stack traces
    this.name = "BusinessRuleViolationError";

    // Business rule violations are warnings, not critical errors
    // They indicate user error, not system failure
    this.logLevel = "warn";
  }
}

// ============================================================
// TEAM SIZE ERROR — HTTP 422
// Specific error when the 2-4 member constraint is violated.
// This is a HARD constraint — the most critical business rule.
// ============================================================
class TeamSizeError extends BusinessRuleViolationError {
  /**
   * @param {string} message - Description of the violation
   * @param {string} code - 'TEAM_SIZE_TOO_SMALL' or 'TEAM_SIZE_TOO_LARGE'
   * @param {Object} metadata - { currentSize, minRequired, maxAllowed }
   */
  constructor(message, code = "TEAM_SIZE_INVALID", metadata = {}) {
    // Delegate to BusinessRuleViolationError with 422 status
    super(message, code, 422, metadata);

    // Override name for instanceof checks
    this.name = "TeamSizeError";
  }
}

// ============================================================
// DUPLICATE MEMBER ERROR — HTTP 422
// Thrown when the same person is added to a team twice.
// ============================================================
class DuplicateMemberError extends BusinessRuleViolationError {
  /**
   * @param {string} personId - The duplicate person's ID
   */
  constructor(personId) {
    // Human-readable message tells the caller exactly what went wrong
    super(
      `Person ${personId} is already a member of this project`,
      "DUPLICATE_TEAM_MEMBER",
      422,
      { personId },
    );

    // Override name for stack traces
    this.name = "DuplicateMemberError";
  }
}

// ============================================================
// INVALID MEMBERSHIP ERROR — HTTP 422
// Thrown when a person isn't eligible to be in a project.
// Example: trying to add a graduated student to a new project
// ============================================================
class InvalidMembershipError extends BusinessRuleViolationError {
  /**
   * @param {string} message - Why the membership is invalid
   * @param {Object} metadata - { personId, projectId, reason }
   */
  constructor(message, metadata = {}) {
    super(message, "INVALID_MEMBERSHIP", 422, metadata);

    // Override name for instanceof checks
    this.name = "InvalidMembershipError";
  }
}

// ============================================================
// TEMPORAL VALIDATION ERROR — HTTP 422
// Thrown when a time-based business rule is violated.
// Example: submitting a work log for a month that hasn't started
// ============================================================
class TemporalValidationError extends EntityModelingError {
  /**
   * @param {string} message - What temporal rule was broken
   * @param {string} code - Machine-readable code
   * @param {Object} metadata - { periodId, date, reason }
   */
  constructor(message, code = "TEMPORAL_VALIDATION_ERROR", metadata = {}) {
    // 422 = data is well-formed but violates temporal rules
    super(message, 422, code, metadata);

    // Override name for clean stack traces
    this.name = "TemporalValidationError";

    // Temporal errors are warnings — user tried something at wrong time
    this.logLevel = "warn";
  }
}

// ============================================================
// PERIOD FROZEN ERROR — HTTP 423 Locked
// Thrown when trying to modify data in a frozen evaluation period.
// 423 = "The resource is locked" — perfect for frozen entities.
// ============================================================
class PeriodFrozenError extends TemporalValidationError {
  /**
   * @param {string} message - Which period is frozen
   * @param {Object} metadata - { projectId, periodId, frozenAt }
   */
  constructor(message, metadata = {}) {
    super(message, "PERIOD_FROZEN", metadata);

    // Override HTTP status to 423 Locked
    this.statusCode = 423;

    // Override name for instanceof checks
    this.name = "PeriodFrozenError";
  }
}

// ============================================================
// FREEZE VIOLATION ERROR — HTTP 423 Locked
// Thrown when ANY modification is attempted on a frozen entity.
// More general than PeriodFrozenError — covers team changes,
// metadata edits, etc. during evaluation freeze.
// ============================================================
class FreezeViolationError extends EntityModelingError {
  /**
   * @param {string} message - What was attempted on frozen entity
   * @param {Object} metadata - { entityType, entityId, frozenAt }
   */
  constructor(message, metadata = {}) {
    // 423 Locked = the resource exists but is locked for modification
    super(message, 423, "FREEZE_VIOLATION", metadata);

    // Override name for clear stack traces
    this.name = "FreezeViolationError";

    // Freeze violations should be logged as warnings
    // They indicate attempted tampering or UI bugs, not system failure
    this.logLevel = "warn";
  }
}

// ============================================================
// STATE TRANSITION ERROR — HTTP 409 Conflict
// Thrown when a project state transition is not allowed.
// Example: trying to go from 'archived' to 'active'
// 409 = "The request conflicts with the current state"
// ============================================================
class StateTransitionError extends EntityModelingError {
  /**
   * @param {string} message - What transition was attempted
   * @param {string} transitionKey - 'fromState→toState' format
   * @param {Object} metadata - { projectId, currentState, requestedState }
   */
  constructor(message, transitionKey = "", metadata = {}) {
    // 409 Conflict = the request can't be processed given current state
    super(message, 409, "INVALID_STATE_TRANSITION", {
      ...metadata,
      transitionKey,
    });

    // Override name for instanceof checks
    this.name = "StateTransitionError";

    // Log level: warn — this is usually a client-side logic error
    this.logLevel = "warn";
  }
}

// ============================================================
// GUARD CONDITION FAILED ERROR — HTTP 409 Conflict
// Thrown when a state machine guard blocks a transition.
// Example: trying to activate a project with only 1 team member
// ============================================================
class GuardConditionFailedError extends StateTransitionError {
  /**
   * @param {string} message - Which guard condition failed
   * @param {string} transitionKey - 'fromState→toState' format
   * @param {Object} metadata - Additional context
   */
  constructor(message, transitionKey = "", metadata = {}) {
    super(message, transitionKey, metadata);

    // Override the error code to be more specific
    this.code = "GUARD_CONDITION_FAILED";

    // Override name for instanceof checks
    this.name = "GuardConditionFailedError";
  }
}

// ============================================================
// PROJECT NOT FOUND ERROR — HTTP 404
// Thrown when a requested project doesn't exist.
// ============================================================
class ProjectNotFoundError extends EntityModelingError {
  /**
   * @param {string} projectId - The ID that wasn't found
   */
  constructor(projectId) {
    super(`Project ${projectId} not found`, 404, "PROJECT_NOT_FOUND", {
      projectId,
    });

    // Override name for stack traces
    this.name = "ProjectNotFoundError";

    // Not-found is informational — not a system error
    this.logLevel = "info";
  }
}

// ============================================================
// PERSON NOT FOUND ERROR — HTTP 404
// Thrown when a requested person doesn't exist.
// ============================================================
class PersonNotFoundError extends EntityModelingError {
  /**
   * @param {string} personId - The ID that wasn't found
   */
  constructor(personId) {
    super(`Person ${personId} not found`, 404, "PERSON_NOT_FOUND", {
      personId,
    });

    // Override name for stack traces
    this.name = "PersonNotFoundError";

    // Not-found is informational — not a system error
    this.logLevel = "info";
  }
}

// ============================================================
// PROJECT CREATION ERROR — HTTP 500
// Thrown when project creation fails for unexpected reasons.
// Wraps the original error for debugging without exposing it.
// ============================================================
class ProjectCreationError extends EntityModelingError {
  /**
   * @param {string} message - High-level error description
   * @param {Object} metadata - { cause, context }
   */
  constructor(message, metadata = {}) {
    super(message, 500, "PROJECT_CREATION_FAILED", metadata);

    // Override name for stack traces
    this.name = "ProjectCreationError";

    // This is a critical error — system failure during creation
    this.logLevel = "error";
  }
}

// ============================================================
// INTEGRITY VIOLATION ERROR — HTTP 500
// Thrown when data integrity checks fail.
// Example: hash chain broken, team size out of range in DB
// This is a CRITICAL error — may indicate tampering.
// ============================================================
class IntegrityViolationError extends EntityModelingError {
  /**
   * @param {string} message - What integrity check failed
   * @param {Object} metadata - { violations, entityType, entityId }
   */
  constructor(message, metadata = {}) {
    super(message, 500, "INTEGRITY_VIOLATION", metadata);

    // Override name for stack traces
    this.name = "IntegrityViolationError";

    // CRITICAL: data may be corrupted or tampered with
    this.logLevel = "error";
  }
}

// ============================================================
// IMMUTABLE DATA ERROR — HTTP 423 Locked
// Thrown when trying to modify data that is permanently immutable.
// Example: trying to edit a freeze snapshot after creation.
// ============================================================
class ImmutableDataError extends EntityModelingError {
  /**
   * @param {string} message - What immutable data was targeted
   * @param {Object} metadata - { entityType, entityId }
   */
  constructor(message, metadata = {}) {
    // 423 Locked = the data exists but can never be changed
    super(message, 423, "IMMUTABLE_DATA", metadata);

    // Override name for instanceof checks
    this.name = "ImmutableDataError";

    // Warn level — someone tried to break immutability
    this.logLevel = "warn";
  }
}

// ============================================================
// Export ALL error classes for use across the PEMM module
// ============================================================
module.exports = {
  EntityModelingError,
  BusinessRuleViolationError,
  TeamSizeError,
  DuplicateMemberError,
  InvalidMembershipError,
  TemporalValidationError,
  PeriodFrozenError,
  FreezeViolationError,
  StateTransitionError,
  GuardConditionFailedError,
  ProjectNotFoundError,
  PersonNotFoundError,
  ProjectCreationError,
  IntegrityViolationError,
  ImmutableDataError,
};
