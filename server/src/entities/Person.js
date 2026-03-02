// ============================================================
// PERSON ENTITY MODEL — Domain Object for People
// ============================================================
// Represents a person (student, faculty, staff, external) in
// the Bitsathy evaluation system. This is a DOMAIN MODEL,
// not a database model — it contains business logic and
// validation rules.
//
// The Person model:
//   - Wraps raw database rows with business methods
//   - Enforces immutability through Object.freeze
//   - Supports versioning for optimistic concurrency control
//   - Links to the existing auth system via identity_id (FK → users)
//
// Person types: student, faculty, staff, external
// Person statuses: active, inactive, graduated, suspended
// ============================================================

// Import custom errors for person-specific failures
const { PersonNotFoundError } = require("./EntityErrors");

// ============================================================
// PERSON TYPE AND STATUS ENUMS — Frozen for safety
// ============================================================

// Valid person types — matches CHECK constraint in persons table
const PersonType = Object.freeze({
  STUDENT: "student", // Currently enrolled student
  FACULTY: "faculty", // Teaching staff
  STAFF: "staff", // Administrative/support staff
  EXTERNAL: "external", // External evaluator or industry person
});

// Valid person statuses — matches CHECK constraint in persons table
const PersonStatus = Object.freeze({
  ACTIVE: "active", // Currently active in the system
  INACTIVE: "inactive", // Temporarily inactive
  GRADUATED: "graduated", // Student who has completed their program
  SUSPENDED: "suspended", // Suspended from the system
});

// ============================================================
// Person class — immutable domain entity
// ============================================================
class Person {
  /**
   * Create a Person domain object from raw data.
   * The created object is FROZEN — no properties can be changed.
   *
   * @param {Object} data - Raw person data (from DB or creation input)
   */
  constructor(data) {
    // Unique identifier for this person (UUID)
    this.personId = data.person_id || data.personId;

    // Foreign key to the users table — links person to auth identity
    // This is how we connect PEMM persons to the existing login system
    this.identityId = data.identity_id || data.identityId;

    // Person type: student, faculty, staff, or external
    this.personType = data.person_type || data.personType;

    // Current status: active, inactive, graduated, or suspended
    this.status = data.status || PersonStatus.ACTIVE;

    // Year of admission (for students) — nullable for non-students
    this.admissionYear = data.admission_year || data.admissionYear || null;

    // Department code (e.g., 'CSE', 'ECE', 'MECH')
    this.departmentCode = data.department_code || data.departmentCode || null;

    // Expected or actual graduation year — nullable for non-students
    this.graduationYear = data.graduation_year || data.graduationYear || null;

    // Display name for UI rendering
    this.displayName = data.display_name || data.displayName || "";

    // Audit fields — who created/modified this record and when
    this.createdAt = data.created_at || data.createdAt || null;
    this.createdBy = data.created_by || data.createdBy || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
    this.updatedBy = data.updated_by || data.updatedBy || null;

    // Version number for optimistic concurrency control
    // If two people try to update the same person simultaneously,
    // the second update will fail because the version won't match
    this.version = data.version || 1;

    // Soft-delete flag — we never hard-delete persons
    this.isDeleted = data.is_deleted || data.isDeleted || false;

    // Freeze this object to enforce immutability
    // Any attempt to modify properties will throw in strict mode
    Object.freeze(this);
  }

  /**
   * Check if this person is a student.
   * @returns {boolean} True if person_type is 'student'
   */
  isStudent() {
    return this.personType === PersonType.STUDENT;
  }

  /**
   * Check if this person is faculty.
   * @returns {boolean} True if person_type is 'faculty'
   */
  isFaculty() {
    return this.personType === PersonType.FACULTY;
  }

  /**
   * Check if this person is currently active.
   * @returns {boolean} True if status is 'active'
   */
  isActive() {
    return this.status === PersonStatus.ACTIVE;
  }

  /**
   * Check if this person can be a project team member.
   * Only active students and faculty can be team members.
   *
   * @returns {boolean} True if eligible for project membership
   */
  canBeTeamMember() {
    // Must be active
    if (!this.isActive()) return false;

    // Must not be deleted
    if (this.isDeleted) return false;

    // Only students and faculty can be team members
    return (
      this.personType === PersonType.STUDENT ||
      this.personType === PersonType.FACULTY
    );
  }

  /**
   * Create a snapshot of this person's state.
   * Used for hash chain entries and freeze snapshots.
   * Returns a plain object (not a Person instance).
   *
   * @returns {Object} Plain snapshot of all fields
   */
  toSnapshot() {
    return {
      personId: this.personId,
      identityId: this.identityId,
      personType: this.personType,
      status: this.status,
      admissionYear: this.admissionYear,
      departmentCode: this.departmentCode,
      graduationYear: this.graduationYear,
      displayName: this.displayName,
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
      personId: this.personId,
      personType: this.personType,
      status: this.status,
      admissionYear: this.admissionYear,
      departmentCode: this.departmentCode,
      graduationYear: this.graduationYear,
      displayName: this.displayName,
      version: this.version,
    };
  }
}

// ============================================================
// Export Person class and enums
// ============================================================
module.exports = { Person, PersonType, PersonStatus };
