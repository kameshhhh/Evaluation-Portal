// ============================================================
// DOMAIN EVENTS — Entity Lifecycle Event Definitions
// ============================================================
// Defines immutable event objects for everything that happens
// in the PEMM module. Events are used for:
//
//   1. Audit logging — every significant action produces an event
//   2. Decoupling — services emit events, listeners react
//   3. Temporal tracking — events capture WHEN things happened
//
// Events are plain data objects (not classes) for simplicity.
// Each event has a type, timestamp, actor, and event-specific data.
//
// IMPORTANT: Events are IMMUTABLE once created. Never modify
// an event after creation — create a new corrective event instead.
// ============================================================

// Import Node.js crypto for generating unique event IDs
const crypto = require("crypto");

// ============================================================
// EVENT TYPES — Enumeration of all possible event types
// ============================================================
// Using frozen object to prevent accidental modification
const EventTypes = Object.freeze({
  // ---- Person Events ----
  PERSON_CREATED: "PERSON_CREATED", // New person registered
  PERSON_UPDATED: "PERSON_UPDATED", // Person info changed
  PERSON_DEACTIVATED: "PERSON_DEACTIVATED", // Person marked inactive

  // ---- Project Lifecycle Events ----
  PROJECT_CREATED: "PROJECT_CREATED", // New project created (DRAFT)
  PROJECT_ACTIVATED: "PROJECT_ACTIVATED", // DRAFT → ACTIVE
  PROJECT_SUBMITTED: "PROJECT_SUBMITTED", // ACTIVE → UNDER_REVIEW
  PROJECT_LOCKED: "PROJECT_LOCKED", // UNDER_REVIEW → LOCKED
  PROJECT_ARCHIVED: "PROJECT_ARCHIVED", // LOCKED → ARCHIVED
  PROJECT_RETURNED: "PROJECT_RETURNED", // UNDER_REVIEW → ACTIVE (sent back)
  PROJECT_UPDATED: "PROJECT_UPDATED", // Project details modified

  // ---- Team Membership Events ----
  MEMBER_ADDED: "MEMBER_ADDED", // Person joined a project team
  MEMBER_REMOVED: "MEMBER_REMOVED", // Person left a project team
  SHARE_UPDATED: "SHARE_UPDATED", // Work share percentage changed

  // ---- Work Log Events ----
  WORK_LOG_SUBMITTED: "WORK_LOG_SUBMITTED", // Monthly work log created
  WORK_LOG_UPDATED: "WORK_LOG_UPDATED", // Work log modified (before freeze)
  WORK_LOG_FROZEN: "WORK_LOG_FROZEN", // Work log frozen (no more edits)

  // ---- Plan Events ----
  PLAN_SUBMITTED: "PLAN_SUBMITTED", // Monthly plan submitted
  PLAN_REVISED: "PLAN_REVISED", // Plan revised (new version)

  // ---- Evaluation Events ----
  SESSION_CREATED: "SESSION_CREATED", // Evaluation session created
  SESSION_OPENED: "SESSION_OPENED", // Session opened for scoring
  SESSION_CLOSED: "SESSION_CLOSED", // Session closed
  SESSION_LOCKED: "SESSION_LOCKED", // Session permanently locked

  // ---- Freeze Events ----
  ENTITY_FROZEN: "ENTITY_FROZEN", // Entity state captured (frozen)
  FREEZE_VIOLATION: "FREEZE_VIOLATION", // Attempted change to frozen entity

  // ---- Integrity Events ----
  INTEGRITY_CHECK_PASSED: "INTEGRITY_CHECK_PASSED", // Hash chain verified OK
  INTEGRITY_CHECK_FAILED: "INTEGRITY_CHECK_FAILED", // Tampering detected
});

// ============================================================
// createEvent — Factory function for creating domain events
// ============================================================
/**
 * Create a new domain event.
 * All events are immutable (frozen) once created.
 *
 * @param {string} type - One of EventTypes (e.g., 'PROJECT_CREATED')
 * @param {Object} data - Event-specific payload data
 * @param {string} actorId - UUID of the user who triggered this event
 * @param {Object} [metadata={}] - Optional metadata (requestId, ip, etc.)
 * @returns {Object} Frozen event object
 */
function createEvent(type, data, actorId, metadata = {}) {
  // Generate a unique event ID using UUID v4
  const eventId = crypto.randomUUID();

  // Capture the exact timestamp of event creation
  const timestamp = new Date().toISOString();

  // Build the event object
  const event = {
    eventId, // Unique identifier for this event
    type, // Event type from EventTypes enum
    timestamp, // ISO 8601 timestamp of creation
    actorId, // Who triggered this event
    data, // Event-specific payload (varies by type)
    metadata: {
      ...metadata, // Spread any additional metadata
      version: 1, // Event schema version (for future evolution)
    },
  };

  // Freeze the event to prevent modification
  // Deep freeze the data and metadata as well
  Object.freeze(event);
  Object.freeze(event.data);
  Object.freeze(event.metadata);

  // Return the immutable event
  return event;
}

// ============================================================
// Convenience factory functions for common events
// ============================================================

/**
 * Create a PROJECT_CREATED event.
 * Emitted when a new project is created in DRAFT status.
 *
 * @param {Object} project - The created project data
 * @param {string} actorId - Who created the project
 * @returns {Object} Frozen event
 */
function projectCreated(project, actorId) {
  return createEvent(
    EventTypes.PROJECT_CREATED,
    {
      projectId: project.project_id, // UUID of the new project
      title: project.title, // Project title
      academicYear: project.academic_year,
      semester: project.semester,
      status: "draft", // Always starts as draft
    },
    actorId,
  );
}

/**
 * Create a state transition event for a project.
 * Emitted whenever a project moves between states.
 *
 * @param {string} projectId - UUID of the project
 * @param {string} fromStatus - Previous state
 * @param {string} toStatus - New state
 * @param {string} actorId - Who triggered the transition
 * @param {string} [reason] - Why the transition happened
 * @returns {Object} Frozen event
 */
function projectStateChanged(
  projectId,
  fromStatus,
  toStatus,
  actorId,
  reason = "",
) {
  // Map from/to status to the appropriate event type
  const typeMap = {
    draft_active: EventTypes.PROJECT_ACTIVATED,
    active_under_review: EventTypes.PROJECT_SUBMITTED,
    under_review_locked: EventTypes.PROJECT_LOCKED,
    locked_archived: EventTypes.PROJECT_ARCHIVED,
    under_review_active: EventTypes.PROJECT_RETURNED,
  };

  // Build the lookup key
  const key = `${fromStatus}_${toStatus}`;

  // Use the mapped type or fall back to PROJECT_UPDATED
  const eventType = typeMap[key] || EventTypes.PROJECT_UPDATED;

  return createEvent(
    eventType,
    {
      projectId,
      fromStatus,
      toStatus,
      reason,
    },
    actorId,
  );
}

/**
 * Create a MEMBER_ADDED event.
 * Emitted when a person joins a project team.
 *
 * @param {string} projectId - UUID of the project
 * @param {string} personId - UUID of the person joining
 * @param {string} roleInProject - Their role (e.g., 'team_lead')
 * @param {string} actorId - Who added the member
 * @returns {Object} Frozen event
 */
function memberAdded(projectId, personId, roleInProject, actorId) {
  return createEvent(
    EventTypes.MEMBER_ADDED,
    {
      projectId,
      personId,
      roleInProject,
    },
    actorId,
  );
}

/**
 * Create a MEMBER_REMOVED event.
 * Emitted when a person leaves a project team.
 *
 * @param {string} projectId - UUID of the project
 * @param {string} personId - UUID of the person leaving
 * @param {string} reason - Why they left
 * @param {string} actorId - Who removed the member
 * @returns {Object} Frozen event
 */
function memberRemoved(projectId, personId, reason, actorId) {
  return createEvent(
    EventTypes.MEMBER_REMOVED,
    {
      projectId,
      personId,
      reason,
    },
    actorId,
  );
}

/**
 * Create an ENTITY_FROZEN event.
 * Emitted when an entity's state is captured for evaluation.
 *
 * @param {string} entityType - 'project' or 'person'
 * @param {string} entityId - UUID of the entity
 * @param {string} sessionId - UUID of the evaluation session
 * @param {string} stateHash - SHA-256 hash of the frozen state
 * @param {string} actorId - Who triggered the freeze
 * @returns {Object} Frozen event
 */
function entityFrozen(entityType, entityId, sessionId, stateHash, actorId) {
  return createEvent(
    EventTypes.ENTITY_FROZEN,
    {
      entityType,
      entityId,
      sessionId,
      stateHash,
    },
    actorId,
  );
}

/**
 * Create an INTEGRITY_CHECK_FAILED event.
 * Emitted when hash chain verification detects tampering.
 *
 * @param {string} entityType - Type of entity with broken chain
 * @param {string} entityId - UUID of the affected entity
 * @param {number} brokenAt - Index where the chain broke
 * @param {string} details - Description of the failure
 * @param {string} verifiedBy - Who ran the verification
 * @returns {Object} Frozen event
 */
function integrityCheckFailed(
  entityType,
  entityId,
  brokenAt,
  details,
  verifiedBy,
) {
  return createEvent(
    EventTypes.INTEGRITY_CHECK_FAILED,
    {
      entityType,
      entityId,
      brokenAt,
      details,
    },
    verifiedBy,
  );
}

// ============================================================
// Export all event types and factory functions
// ============================================================
module.exports = {
  EventTypes,
  createEvent,
  projectCreated,
  projectStateChanged,
  memberAdded,
  memberRemoved,
  entityFrozen,
  integrityCheckFailed,
};
