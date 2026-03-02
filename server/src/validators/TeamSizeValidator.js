// ============================================================
// TEAM SIZE VALIDATOR — Enforces 2-4 Member Constraint
// ============================================================
// The most critical business rule in the PEMM module:
// Every project team MUST have between 2 and 4 active members.
//
// This constraint is enforced at THREE levels:
//   1. Database trigger (check_team_size_constraint in migration 002)
//   2. This application-level validator (defense-in-depth)
//   3. API input validation (in controllers)
//
// Why triple enforcement?
//   - DB trigger catches direct SQL manipulation
//   - Application validator gives clear error messages
//   - API validation fails fast before hitting the DB
//
// The "2 to 4" rule is a HARD constraint — no exceptions.
// ============================================================

// Import custom error for team size violations
const { TeamSizeError } = require("../entities/EntityErrors");

// ============================================================
// TEAM SIZE CONSTANTS — Single source of truth
// ============================================================

// Minimum number of active members in a project team
const MIN_TEAM_SIZE = 2;

// Maximum number of active members in a project team
const MAX_TEAM_SIZE = 4;

// ============================================================
// TeamSizeValidator class — validates team composition
// ============================================================
class TeamSizeValidator {
  /**
   * Validate that a team size is within the allowed range.
   * Throws TeamSizeError if the constraint is violated.
   *
   * @param {number} currentActiveMembers - Current count of active members
   * @param {string} operation - Description of what's being attempted
   * @throws {TeamSizeError} If team size would be invalid
   */
  static validateTeamSize(currentActiveMembers, operation = "team operation") {
    // Check if team is too small
    if (currentActiveMembers < MIN_TEAM_SIZE) {
      throw new TeamSizeError(
        `Team has ${currentActiveMembers} active members, ` +
          `minimum required is ${MIN_TEAM_SIZE}. Operation: ${operation}`,
        {
          current: currentActiveMembers,
          min: MIN_TEAM_SIZE,
          max: MAX_TEAM_SIZE,
        },
      );
    }

    // Check if team is too large
    if (currentActiveMembers > MAX_TEAM_SIZE) {
      throw new TeamSizeError(
        `Team has ${currentActiveMembers} active members, ` +
          `maximum allowed is ${MAX_TEAM_SIZE}. Operation: ${operation}`,
        {
          current: currentActiveMembers,
          min: MIN_TEAM_SIZE,
          max: MAX_TEAM_SIZE,
        },
      );
    }

    // If we get here, team size is valid (2, 3, or 4)
    return true;
  }

  /**
   * Check if adding a member would violate the max team size.
   * Call this BEFORE actually adding the member.
   *
   * @param {number} currentActiveMembers - Current active member count
   * @throws {TeamSizeError} If adding would exceed max
   */
  static validateCanAddMember(currentActiveMembers) {
    // Adding one member would make the team this size
    const afterAdd = currentActiveMembers + 1;

    // Check against maximum
    if (afterAdd > MAX_TEAM_SIZE) {
      throw new TeamSizeError(
        `Cannot add member: team already has ${currentActiveMembers} ` +
          `active members (max ${MAX_TEAM_SIZE})`,
        {
          current: currentActiveMembers,
          afterOperation: afterAdd,
          max: MAX_TEAM_SIZE,
        },
      );
    }

    // Valid — can add
    return true;
  }

  /**
   * Check if removing a member would violate the min team size.
   * Call this BEFORE actually removing the member.
   *
   * Note: We only enforce minimum during ACTIVE project status.
   * DRAFT projects can have fewer than 2 members while being set up.
   *
   * @param {number} currentActiveMembers - Current active member count
   * @param {string} projectStatus - Current project status
   * @throws {TeamSizeError} If removing would go below min (for active projects)
   */
  static validateCanRemoveMember(
    currentActiveMembers,
    projectStatus = "active",
  ) {
    // Removing one member would make the team this size
    const afterRemove = currentActiveMembers - 1;

    // Only enforce minimum for active projects
    // Draft projects can have 0-1 members while being assembled
    if (projectStatus !== "draft" && afterRemove < MIN_TEAM_SIZE) {
      throw new TeamSizeError(
        `Cannot remove member: team would have ${afterRemove} ` +
          `active members (min ${MIN_TEAM_SIZE} for ${projectStatus} projects)`,
        {
          current: currentActiveMembers,
          afterOperation: afterRemove,
          min: MIN_TEAM_SIZE,
        },
      );
    }

    // Valid — can remove
    return true;
  }

  /**
   * Validate that a project can be activated (requires 2+ members).
   * Called when transitioning from DRAFT → ACTIVE.
   *
   * @param {number} currentActiveMembers - Current active member count
   * @throws {TeamSizeError} If team doesn't meet minimum requirement
   */
  static validateCanActivate(currentActiveMembers) {
    // Must have at least MIN_TEAM_SIZE members to activate
    if (currentActiveMembers < MIN_TEAM_SIZE) {
      throw new TeamSizeError(
        `Cannot activate project: team has ${currentActiveMembers} ` +
          `members, need at least ${MIN_TEAM_SIZE}`,
        { current: currentActiveMembers, min: MIN_TEAM_SIZE },
      );
    }

    // Valid — can activate
    return true;
  }
}

// ============================================================
// Export validator class and constants
// ============================================================
module.exports = { TeamSizeValidator, MIN_TEAM_SIZE, MAX_TEAM_SIZE };
