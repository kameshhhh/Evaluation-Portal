// ============================================================
// PROJECT MEMBER ENTITY — Unit Tests
// ============================================================
// Tests the ProjectMember value object for:
//   - Correct construction and field mapping
//   - Immutability (Object.freeze)
//   - MemberRole enum values and immutability
//   - Helper methods (isActive, isTeamLead, isMentor)
//   - toSnapshot() / toJSON() serialization
//   - Share percentage is informational only
//
// Run: npx jest server/src/entities/__tests__/ProjectMember.test.js
// ============================================================
"use strict";

// Import the ProjectMember class and enum
const { ProjectMember, MemberRole } = require("../ProjectMember");

// ============================================================
// Describe block: ProjectMember Entity
// ============================================================
describe("ProjectMember Entity", () => {
  // ----------------------------------------------------------
  // Factory helper: make a valid member row
  // ----------------------------------------------------------
  const makeMemberRow = (overrides = {}) => ({
    project_id: "proj-uuid-001", // FK to projects (composite PK part 1)
    person_id: "p-uuid-001", // FK to persons (composite PK part 2)
    role_in_project: "member", // MemberRole value
    joined_at: new Date("2024-06-15"), // Join timestamp
    left_at: null, // Still active
    declared_share_percentage: 25, // Informational only
    created_at: new Date("2024-06-15"), // Created timestamp
    ...overrides, // Merge overrides
  });

  // ============================================================
  // Construction Tests
  // ============================================================
  describe("construction", () => {
    // Test: creates a valid member from DB row
    test("creates a valid project member", () => {
      // Arrange + Act
      const member = new ProjectMember(makeMemberRow());

      // Assert — ProjectMember has no 'id' field; uses projectId + personId
      expect(member.projectId).toBe("proj-uuid-001");
      expect(member.personId).toBe("p-uuid-001");
      expect(member.roleInProject).toBe("member");
      expect(member.leftAt).toBeNull();
      expect(member.declaredSharePercentage).toBe(25);
    });

    // Test: member who has left the project
    test("creates a member who has left the project", () => {
      const leftDate = new Date("2024-09-01");
      const member = new ProjectMember(
        makeMemberRow({
          left_at: leftDate,
        }),
      );

      expect(member.leftAt).toEqual(leftDate);
    });
  });

  // ============================================================
  // Immutability Tests
  // ============================================================
  describe("immutability", () => {
    // Test: member is frozen
    test("cannot modify member properties", () => {
      const member = new ProjectMember(makeMemberRow());
      expect(() => {
        member.roleInProject = "team_lead";
      }).toThrow();
    });

    // Test: cannot add properties
    test("cannot add new properties", () => {
      const member = new ProjectMember(makeMemberRow());
      expect(() => {
        member.secret = "hacked";
      }).toThrow();
    });
  });

  // ============================================================
  // MemberRole Enum Tests
  // ============================================================
  describe("MemberRole enum", () => {
    // Test: all roles exist
    test("has all required member roles", () => {
      expect(MemberRole.TEAM_LEAD).toBe("team_lead");
      expect(MemberRole.MEMBER).toBe("member");
      expect(MemberRole.MENTOR).toBe("mentor");
      expect(MemberRole.CO_MENTOR).toBe("co_mentor");
    });

    // Test: enum is frozen
    test("MemberRole enum is immutable", () => {
      expect(() => {
        MemberRole.ADMIN = "admin";
      }).toThrow();
    });
  });

  // ============================================================
  // Helper Method Tests
  // ============================================================
  describe("helper methods", () => {
    // Test: isActive when left_at is null (still on team)
    test("isActive() returns true when left_at is null", () => {
      const member = new ProjectMember(makeMemberRow({ left_at: null }));
      expect(member.isActive()).toBe(true);
    });

    // Test: isActive returns false when left
    test("isActive() returns false when left_at is set", () => {
      const member = new ProjectMember(
        makeMemberRow({
          left_at: new Date(),
        }),
      );
      expect(member.isActive()).toBe(false);
    });

    // Test: isTeamLead
    test("isTeamLead() returns true for team_lead role", () => {
      const member = new ProjectMember(
        makeMemberRow({
          role_in_project: "team_lead",
        }),
      );
      expect(member.isTeamLead()).toBe(true);
    });

    // Test: isTeamLead returns false for member role
    test("isTeamLead() returns false for member role", () => {
      const member = new ProjectMember(
        makeMemberRow({
          role_in_project: "member",
        }),
      );
      expect(member.isTeamLead()).toBe(false);
    });

    // Test: isMentor
    test("isMentor() returns true for mentor role", () => {
      const member = new ProjectMember(
        makeMemberRow({
          role_in_project: "mentor",
        }),
      );
      expect(member.isMentor()).toBe(true);
    });

    // Test: isMentor returns false for other roles
    test("isMentor() returns false for team_lead role", () => {
      const member = new ProjectMember(
        makeMemberRow({
          role_in_project: "team_lead",
        }),
      );
      expect(member.isMentor()).toBe(false);
    });
  });

  // ============================================================
  // Share Percentage — Informational Only
  // ============================================================
  describe("declared share percentage", () => {
    // Test: percentage is stored but has no business logic impact
    test("stores declared share percentage as informational", () => {
      const member = new ProjectMember(
        makeMemberRow({
          declared_share_percentage: 50,
        }),
      );
      // It's stored — that's all. No calculations depend on it.
      expect(member.declaredSharePercentage).toBe(50);
    });

    // Test: null percentage is valid (not declared)
    test("null share percentage is valid", () => {
      const member = new ProjectMember(
        makeMemberRow({
          declared_share_percentage: null,
        }),
      );
      expect(member.declaredSharePercentage).toBeNull();
    });
  });

  // ============================================================
  // Serialization Tests
  // ============================================================
  describe("serialization", () => {
    // Test: toSnapshot captures full state
    test("toSnapshot() returns complete member state", () => {
      const member = new ProjectMember(makeMemberRow());
      const snapshot = member.toSnapshot();

      // toSnapshot has: projectId, personId, roleInProject, declaredSharePercentage, joinedAt, leftAt
      expect(snapshot.projectId).toBe("proj-uuid-001");
      expect(snapshot.personId).toBe("p-uuid-001");
      expect(snapshot.roleInProject).toBe("member");
      expect(snapshot.declaredSharePercentage).toBe(25);
    });

    // Test: toJSON works
    test("toJSON() returns serializable object", () => {
      const member = new ProjectMember(makeMemberRow());
      const json = member.toJSON();

      // toJSON has: projectId, personId, roleInProject, declaredSharePercentage, joinedAt, leftAt, leftReason, isActive
      expect(json.projectId).toBe("proj-uuid-001");
      expect(json.personId).toBe("p-uuid-001");
      expect(json.isActive).toBe(true);
    });
  });
});
