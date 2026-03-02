// ============================================================
// PROJECT MEMBER ENTITY — Team Membership Domain Object
// ============================================================
// Represents a person's membership in a project team.
// This is a junction entity connecting persons to projects
// with additional metadata (role, share percentage).
//
// KEY DESIGN DECISIONS:
//   - declared_share_percentage is INFORMATIONAL ONLY
//   - It NEVER affects scoring or evaluation
//   - role_in_project is also informational
//   - Both exist for reporting and transparency, not computation
//
// Team size constraint: 2 ≤ active_members ≤ 4
// Enforced at BOTH database (trigger) and application level.
//
// A person can leave a team (left_at is set) but the
// membership record is never deleted — it's historical data.
// ============================================================

// ============================================================
// ROLE IN PROJECT ENUM — Informational only
// ============================================================
const MemberRole = Object.freeze({
  TEAM_LEAD: "team_lead", // Leads the project team
  MEMBER: "member", // Regular team member
  MENTOR: "mentor", // Faculty mentor/guide
  CO_MENTOR: "co_mentor", // Additional faculty mentor
});

// ============================================================
// ProjectMember class — immutable domain entity
// ============================================================
class ProjectMember {
  /**
   * Create a ProjectMember domain object.
   * Frozen upon creation — immutable.
   *
   * @param {Object} data - Raw membership data
   */
  constructor(data) {
    // UUID of the project this membership belongs to
    this.projectId = data.project_id || data.projectId;

    // UUID of the person who is a member
    this.personId = data.person_id || data.personId;

    // Informational role (team_lead, member, mentor, co_mentor)
    // Does NOT affect scoring — purely for display/reporting
    this.roleInProject =
      data.role_in_project || data.roleInProject || MemberRole.MEMBER;

    // Declared work share percentage (0-100)
    // INFORMATIONAL ONLY — never used in score calculation
    // Example: In a 3-person team, each might declare 33%
    this.declaredSharePercentage =
      data.declared_share_percentage || data.declaredSharePercentage || null;

    // When the person joined this project team
    this.joinedAt = data.joined_at || data.joinedAt || null;

    // When the person left (null if still active)
    this.leftAt = data.left_at || data.leftAt || null;

    // Reason for leaving (null if still active)
    this.leftReason = data.left_reason || data.leftReason || null;

    // Audit: who recorded this membership
    this.createdAt = data.created_at || data.createdAt || null;
    this.createdBy = data.created_by || data.createdBy || null;

    // Freeze for immutability
    Object.freeze(this);
  }

  /**
   * Check if this person is still an active member of the team.
   * Active means they joined but haven't left yet.
   *
   * @returns {boolean} True if still active (left_at is null)
   */
  isActive() {
    return this.leftAt === null;
  }

  /**
   * Check if this member has the team lead role.
   *
   * @returns {boolean} True if role is 'team_lead'
   */
  isTeamLead() {
    return this.roleInProject === MemberRole.TEAM_LEAD;
  }

  /**
   * Check if this member is a mentor.
   *
   * @returns {boolean} True if role is 'mentor' or 'co_mentor'
   */
  isMentor() {
    return (
      this.roleInProject === MemberRole.MENTOR ||
      this.roleInProject === MemberRole.CO_MENTOR
    );
  }

  /**
   * Create a snapshot for audit/freeze purposes.
   *
   * @returns {Object} Plain snapshot of membership data
   */
  toSnapshot() {
    return {
      projectId: this.projectId,
      personId: this.personId,
      roleInProject: this.roleInProject,
      declaredSharePercentage: this.declaredSharePercentage,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
    };
  }

  /**
   * Convert to JSON for API responses.
   *
   * @returns {Object} API-safe representation
   */
  toJSON() {
    return {
      projectId: this.projectId,
      personId: this.personId,
      roleInProject: this.roleInProject,
      declaredSharePercentage: this.declaredSharePercentage,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
      leftReason: this.leftReason,
      isActive: this.isActive(),
    };
  }
}

// ============================================================
// Export ProjectMember class and role enum
// ============================================================
module.exports = { ProjectMember, MemberRole };
