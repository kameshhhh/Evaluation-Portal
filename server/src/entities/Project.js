// ============================================================
// PROJECT ENTITY MODEL — Domain Object for Projects
// ============================================================
// Represents a project in the Bitsathy evaluation system.
// Projects are the CENTRAL entity — everything else orbits them:
//   - Team members (2-4 people per project)
//   - Monthly plans and work logs
//   - Evaluation sessions and scores
//
// Project lifecycle states:
//   DRAFT → ACTIVE → UNDER_REVIEW → LOCKED → ARCHIVED
//
// Projects are IMMUTABLE domain objects. To "change" a project,
// create a new Project instance with the updated data.
// The database tracks all changes via version numbers and
// the project_state_transitions audit table.
// ============================================================

// ============================================================
// PROJECT STATUS ENUM — Matches CHECK constraint in DB
// ============================================================
const ProjectStatus = Object.freeze({
  DRAFT: "draft", // Just created, not yet activated
  ACTIVE: "active", // Team is working on it
  UNDER_REVIEW: "under_review", // Submitted for evaluation
  LOCKED: "locked", // Frozen for scoring — NO changes allowed
  ARCHIVED: "archived", // Permanently archived after evaluation
});

// ============================================================
// VALID STATE TRANSITIONS — Which state changes are allowed
// ============================================================
// This lookup defines the allowed transitions from each state.
// Any transition NOT in this map is ILLEGAL and will be rejected
// by the ProjectStateMachine.
const VALID_TRANSITIONS = Object.freeze({
  [ProjectStatus.DRAFT]: [
    ProjectStatus.ACTIVE, // Activate when team is ready
  ],
  [ProjectStatus.ACTIVE]: [
    ProjectStatus.UNDER_REVIEW, // Submit for evaluation
  ],
  [ProjectStatus.UNDER_REVIEW]: [
    ProjectStatus.LOCKED, // Lock for scoring
    ProjectStatus.ACTIVE, // Return to team for revision
  ],
  [ProjectStatus.LOCKED]: [
    ProjectStatus.ARCHIVED, // Archive after evaluation complete
  ],
  [ProjectStatus.ARCHIVED]: [
    // No transitions allowed — archived is TERMINAL
  ],
});

// ============================================================
// Project class — immutable domain entity
// ============================================================
class Project {
  /**
   * Create a Project domain object from raw data.
   * The created object is FROZEN — no properties can be changed.
   *
   * @param {Object} data - Raw project data (from DB or creation input)
   */
  constructor(data) {
    // Unique identifier for this project (UUID)
    this.projectId = data.project_id || data.projectId;

    // Project title — descriptive name
    this.title = data.title || "";

    // Project description — detailed explanation of what it does
    this.description = data.description || "";

    // Academic year this project belongs to (e.g., 2026)
    this.academicYear = data.academic_year || data.academicYear;

    // Semester: 1 (Odd: June-Nov) or 2 (Even: Dec-May)
    this.semester = data.semester;

    // Project start date — when work begins
    this.startDate = data.start_date || data.startDate || null;

    // Expected completion date — deadline for the project
    this.expectedEndDate =
      data.expected_end_date || data.expectedEndDate || null;

    // Current project status — one of ProjectStatus values
    this.status = data.status || ProjectStatus.DRAFT;

    // Freeze tracking — when/who/what version was frozen
    this.frozenAt = data.frozen_at || data.frozenAt || null;
    this.frozenBy = data.frozen_by || data.frozenBy || null;
    this.freezeVersion = data.freeze_version || data.freezeVersion || null;

    // Audit fields — creation and last modification
    this.createdAt = data.created_at || data.createdAt || null;
    this.createdBy = data.created_by || data.createdBy || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
    this.updatedBy = data.updated_by || data.updatedBy || null;

    // Optimistic concurrency version — incremented on each update
    this.version = data.version || 1;

    // Soft-delete flag — projects are never hard-deleted
    this.isDeleted = data.is_deleted || data.isDeleted || false;

    // Freeze this object to enforce immutability
    Object.freeze(this);
  }

  /**
   * Check if this project is in DRAFT status.
   * @returns {boolean} True if status is 'draft'
   */
  isDraft() {
    return this.status === ProjectStatus.DRAFT;
  }

  /**
   * Check if this project is currently ACTIVE.
   * Active projects can accept work logs and plan submissions.
   * @returns {boolean} True if status is 'active'
   */
  isActive() {
    return this.status === ProjectStatus.ACTIVE;
  }

  /**
   * Check if this project is LOCKED for evaluation.
   * Locked projects cannot be modified in any way.
   * @returns {boolean} True if status is 'locked'
   */
  isLocked() {
    return this.status === ProjectStatus.LOCKED;
  }

  /**
   * Check if this project is ARCHIVED.
   * Archived is the terminal state — no further transitions.
   * @returns {boolean} True if status is 'archived'
   */
  isArchived() {
    return this.status === ProjectStatus.ARCHIVED;
  }

  /**
   * Check if this project is frozen (has a freeze timestamp).
   * Frozen projects cannot accept any data modifications.
   * @returns {boolean} True if frozenAt is set
   */
  isFrozen() {
    return this.frozenAt !== null;
  }

  /**
   * Check if modifications are allowed to this project.
   * Only DRAFT and ACTIVE projects can be modified.
   * Frozen projects are NEVER modifiable regardless of status.
   *
   * @returns {boolean} True if the project can be modified
   */
  isModifiable() {
    // Cannot modify if frozen
    if (this.isFrozen()) return false;

    // Cannot modify if deleted
    if (this.isDeleted) return false;

    // Only draft and active projects accept modifications
    return (
      this.status === ProjectStatus.DRAFT ||
      this.status === ProjectStatus.ACTIVE
    );
  }

  /**
   * Check if a specific state transition is valid.
   * Uses the VALID_TRANSITIONS lookup table.
   *
   * @param {string} targetStatus - The desired new status
   * @returns {boolean} True if the transition is allowed
   */
  canTransitionTo(targetStatus) {
    // Look up allowed transitions from current status
    const allowed = VALID_TRANSITIONS[this.status] || [];

    // Check if the target status is in the allowed list
    return allowed.includes(targetStatus);
  }

  /**
   * Create a snapshot of this project's state.
   * Used for hash chain entries and freeze snapshots.
   *
   * @returns {Object} Plain snapshot of all significant fields
   */
  toSnapshot() {
    return {
      projectId: this.projectId,
      title: this.title,
      description: this.description,
      academicYear: this.academicYear,
      semester: this.semester,
      startDate: this.startDate,
      expectedEndDate: this.expectedEndDate,
      status: this.status,
      version: this.version,
      isDeleted: this.isDeleted,
    };
  }

  /**
   * Convert to a JSON-safe object for API responses.
   * Excludes internal audit fields.
   *
   * @returns {Object} API-safe representation
   */
  toJSON() {
    return {
      projectId: this.projectId,
      title: this.title,
      description: this.description,
      academicYear: this.academicYear,
      semester: this.semester,
      startDate: this.startDate,
      expectedEndDate: this.expectedEndDate,
      status: this.status,
      frozenAt: this.frozenAt,
      version: this.version,
    };
  }
}

// ============================================================
// Export Project class, status enum, and transition map
// ============================================================
module.exports = { Project, ProjectStatus, VALID_TRANSITIONS };
