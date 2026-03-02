// ============================================================
// MEMBERSHIP VALIDATOR — Team Composition Rule Enforcement
// ============================================================
// Validates membership-related business rules:
//
//   - Person not already a member of the project
//   - Person is eligible (active student or faculty)
//   - Share percentages are valid (0-100)
//   - Project is in a modifiable state
//   - No duplicate memberships
//
// Works in conjunction with:
//   - TeamSizeValidator (team count constraints)
//   - Person entity (eligibility checks)
//   - Project entity (state checks)
// ============================================================

// Import custom errors
const {
  DuplicateMemberError,
  InvalidMembershipError,
  BusinessRuleViolationError,
} = require("../entities/EntityErrors");

// Import Zod for schema validation
const { z } = require("zod");

// Import member role enum for validation
const { MemberRole } = require("../entities/ProjectMember");

// ============================================================
// ZOD SCHEMA — Validates add-member input
// ============================================================
const addMemberSchema = z.object({
  // UUID of the project to add the member to
  projectId: z.string().uuid("projectId must be a valid UUID"),

  // UUID of the person to add as a member
  personId: z.string().uuid("personId must be a valid UUID"),

  // Role in the project — must be a valid MemberRole
  roleInProject: z
    .enum(
      [
        MemberRole.TEAM_LEAD,
        MemberRole.MEMBER,
        MemberRole.MENTOR,
        MemberRole.CO_MENTOR,
      ],
      {
        errorMap: () => ({
          message:
            "roleInProject must be team_lead, member, mentor, or co_mentor",
        }),
      },
    )
    .optional()
    .default(MemberRole.MEMBER),

  // Declared share percentage — informational only, 0-100
  declaredSharePercentage: z
    .number()
    .min(0, "Share percentage must be at least 0")
    .max(100, "Share percentage must be at most 100")
    .optional()
    .nullable(),
});

// ============================================================
// MembershipValidator class — validates team membership rules
// ============================================================
class MembershipValidator {
  /**
   * Validate the input data for adding a new member.
   * Uses Zod schema for type/format validation.
   *
   * @param {Object} data - Raw add-member input
   * @returns {Object} Validated and sanitized data
   * @throws {BusinessRuleViolationError} If input is invalid
   */
  static validateAddMemberInput(data) {
    // Run Zod schema validation
    const result = addMemberSchema.safeParse(data);

    // If validation fails, throw with details
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      );

      throw new BusinessRuleViolationError(
        `Add member validation failed: ${issues.join("; ")}`,
        { issues: result.error.issues },
      );
    }

    // Return validated data
    return result.data;
  }

  /**
   * Check that a person is not already an active member of the project.
   * A person CAN rejoin after leaving (left_at is set), but cannot
   * have two active memberships simultaneously.
   *
   * @param {string} personId - UUID of the person
   * @param {Array<Object>} existingMembers - Current active members
   * @throws {DuplicateMemberError} If person is already an active member
   */
  static validateNotDuplicate(personId, existingMembers) {
    // Check if the person is already in the active members list
    const isDuplicate = existingMembers.some(
      (member) =>
        (member.person_id || member.personId) === personId &&
        (member.left_at === null || member.left_at === undefined),
    );

    // If already an active member, throw duplicate error
    if (isDuplicate) {
      throw new DuplicateMemberError(
        `Person ${personId} is already an active member of this project`,
        { personId },
      );
    }

    return true;
  }

  /**
   * Check that a person is eligible to join a project team.
   * Only active students and faculty can be team members.
   *
   * @param {Object} person - Person entity object
   * @throws {InvalidMembershipError} If person is not eligible
   */
  static validatePersonEligibility(person) {
    // Person must exist
    if (!person) {
      throw new InvalidMembershipError("Person not found", {
        reason: "Person does not exist",
      });
    }

    // Use the Person entity's canBeTeamMember() method
    if (!person.canBeTeamMember()) {
      throw new InvalidMembershipError(
        `Person ${person.personId || person.person_id} is not eligible ` +
          `for team membership. Status: ${person.status}, Type: ${person.personType || person.person_type}`,
        {
          personId: person.personId || person.person_id,
          status: person.status,
          personType: person.personType || person.person_type,
        },
      );
    }

    return true;
  }

  /**
   * Check that the project is in a state that allows membership changes.
   * Only DRAFT and ACTIVE projects can have members added/removed.
   *
   * @param {Object} project - Project entity object
   * @throws {InvalidMembershipError} If project doesn't allow membership changes
   */
  static validateProjectAcceptsMemberChanges(project) {
    // Project must exist
    if (!project) {
      throw new InvalidMembershipError("Project not found", {
        reason: "Project does not exist",
      });
    }

    // Use the Project entity's isModifiable() method
    if (!project.isModifiable()) {
      throw new InvalidMembershipError(
        `Project ${project.projectId || project.project_id} is in ` +
          `${project.status} status and cannot accept membership changes`,
        {
          projectId: project.projectId || project.project_id,
          status: project.status,
          isFrozen: project.isFrozen(),
        },
      );
    }

    return true;
  }
}

// ============================================================
// Export MembershipValidator and schema
// ============================================================
module.exports = { MembershipValidator, addMemberSchema };
