// ============================================================
// MEMBERSHIP VALIDATOR — Unit Tests
// ============================================================
// Tests the MembershipValidator for:
//   - validateAddMemberInput: Zod schema validation
//   - validateNotDuplicate: rejects existing members
//   - validatePersonEligibility: requires canBeTeamMember
//   - validateProjectAcceptsMemberChanges: project must be modifiable
//
// Run: npx jest server/src/validators/__tests__/MembershipValidator.test.js
// ============================================================

// Import the validator (destructure from named export)
const { MembershipValidator } = require("../MembershipValidator");

// Import error types
const {
  DuplicateMemberError,
  InvalidMembershipError,
} = require("../../entities/EntityErrors");

// ============================================================
// Describe block: MembershipValidator
// ============================================================
describe("MembershipValidator", () => {
  // ============================================================
  // validateAddMemberInput
  // NOTE: Requires projectId (UUID) + personId (UUID).
  //       Returns validated data on success, THROWS on failure.
  // ============================================================
  describe("validateAddMemberInput()", () => {
    // Test: valid input passes — returns validated data
    test("accepts valid member input", () => {
      const input = {
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        personId: "550e8400-e29b-41d4-a716-446655440002",
        roleInProject: "member",
      };
      const result = MembershipValidator.validateAddMemberInput(input);
      expect(result.personId).toBe("550e8400-e29b-41d4-a716-446655440002");
      expect(result.roleInProject).toBe("member");
    });

    // Test: team_lead role is valid
    test("accepts team_lead role", () => {
      const input = {
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        personId: "550e8400-e29b-41d4-a716-446655440002",
        roleInProject: "team_lead",
      };
      const result = MembershipValidator.validateAddMemberInput(input);
      expect(result.roleInProject).toBe("team_lead");
    });

    // Test: mentor role is valid
    test("accepts mentor role", () => {
      const input = {
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        personId: "550e8400-e29b-41d4-a716-446655440003",
        roleInProject: "mentor",
      };
      const result = MembershipValidator.validateAddMemberInput(input);
      expect(result.roleInProject).toBe("mentor");
    });

    // Test: missing personId THROWS
    test("rejects input without personId", () => {
      const input = {
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        roleInProject: "member",
      };
      expect(() => MembershipValidator.validateAddMemberInput(input)).toThrow();
    });

    // Test: invalid role THROWS
    test("rejects invalid roleInProject", () => {
      const input = {
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        personId: "550e8400-e29b-41d4-a716-446655440002",
        roleInProject: "emperor",
      };
      expect(() => MembershipValidator.validateAddMemberInput(input)).toThrow();
    });
  });

  // ============================================================
  // validateNotDuplicate
  // ============================================================
  describe("validateNotDuplicate()", () => {
    // Test: non-duplicate passes
    test("passes when person is not already a member", () => {
      // existingMembers is an array of person objects
      const existingMembers = [{ personId: "p-001" }, { personId: "p-002" }];
      expect(() => {
        MembershipValidator.validateNotDuplicate("p-003", existingMembers);
      }).not.toThrow();
    });

    // Test: duplicate throws DuplicateMemberError
    test("throws DuplicateMemberError for duplicate member", () => {
      const existingMembers = [{ personId: "p-001" }, { personId: "p-002" }];
      expect(() => {
        MembershipValidator.validateNotDuplicate("p-001", existingMembers);
      }).toThrow(DuplicateMemberError);
    });

    // Test: empty member list always passes
    test("passes with empty existing members list", () => {
      expect(() => {
        MembershipValidator.validateNotDuplicate("p-001", []);
      }).not.toThrow();
    });
  });

  // ============================================================
  // validatePersonEligibility
  // ============================================================
  describe("validatePersonEligibility()", () => {
    // Test: active student is eligible
    test("passes for person who canBeTeamMember", () => {
      // Mock person with canBeTeamMember() returning true
      const person = { canBeTeamMember: () => true, displayName: "Kamesh" };
      expect(() => {
        MembershipValidator.validatePersonEligibility(person);
      }).not.toThrow();
    });

    // Test: suspended person is not eligible
    test("throws InvalidMembershipError for ineligible person", () => {
      const person = {
        canBeTeamMember: () => false,
        displayName: "Suspended User",
      };
      expect(() => {
        MembershipValidator.validatePersonEligibility(person);
      }).toThrow(InvalidMembershipError);
    });
  });

  // ============================================================
  // validateProjectAcceptsMemberChanges
  // ============================================================
  describe("validateProjectAcceptsMemberChanges()", () => {
    // Test: modifiable project accepts changes
    test("passes for modifiable project", () => {
      const project = { isModifiable: () => true };
      expect(() => {
        MembershipValidator.validateProjectAcceptsMemberChanges(project);
      }).not.toThrow();
    });

    // Test: locked project rejects changes
    test("throws for non-modifiable project", () => {
      const project = { isModifiable: () => false };
      expect(() => {
        MembershipValidator.validateProjectAcceptsMemberChanges(project);
      }).toThrow();
    });
  });
});
