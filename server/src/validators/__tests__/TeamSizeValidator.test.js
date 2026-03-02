// ============================================================
// TEAM SIZE VALIDATOR — Unit Tests
// ============================================================
// Tests the TeamSizeValidator for enforcement of the hard rule:
//   2 ≤ team_size ≤ 4
//
// Validates:
//   - validateTeamSize: accepts 2, 3, 4; rejects 0, 1, 5+
//   - validateCanAddMember: checks against MAX before adding
//   - validateCanRemoveMember: checks against MIN before removing
//   - validateCanActivate: project must have 2+ for activation
//   - Correct error types (TeamSizeError)
//
// Run: npx jest server/src/validators/__tests__/TeamSizeValidator.test.js
// ============================================================

// Import the validator (destructure from named export)
const { TeamSizeValidator } = require("../TeamSizeValidator");

// Import error type for instanceof checks
const { TeamSizeError } = require("../../entities/EntityErrors");

// ============================================================
// Describe block: TeamSizeValidator
// ============================================================
describe("TeamSizeValidator", () => {
  // ============================================================
  // validateTeamSize — boundary tests
  // ============================================================
  describe("validateTeamSize()", () => {
    // Test: exactly 2 is the minimum (valid)
    test("accepts team size of 2 (minimum)", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(2);
      }).not.toThrow();
    });

    // Test: exactly 3 is valid
    test("accepts team size of 3", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(3);
      }).not.toThrow();
    });

    // Test: exactly 4 is the maximum (valid)
    test("accepts team size of 4 (maximum)", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(4);
      }).not.toThrow();
    });

    // Test: 0 is below minimum
    test("rejects team size of 0", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(0);
      }).toThrow(TeamSizeError);
    });

    // Test: 1 is below minimum
    test("rejects team size of 1", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(1);
      }).toThrow(TeamSizeError);
    });

    // Test: 5 is above maximum
    test("rejects team size of 5", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(5);
      }).toThrow(TeamSizeError);
    });

    // Test: large number is rejected
    test("rejects team size of 100", () => {
      expect(() => {
        TeamSizeValidator.validateTeamSize(100);
      }).toThrow(TeamSizeError);
    });
  });

  // ============================================================
  // validateCanAddMember
  // ============================================================
  describe("validateCanAddMember()", () => {
    // Test: can add when current count is 1 (would become 2)
    test("allows adding when currentCount is 1", () => {
      expect(() => {
        TeamSizeValidator.validateCanAddMember(1);
      }).not.toThrow();
    });

    // Test: can add when current count is 2 (would become 3)
    test("allows adding when currentCount is 2", () => {
      expect(() => {
        TeamSizeValidator.validateCanAddMember(2);
      }).not.toThrow();
    });

    // Test: can add when current count is 3 (would become 4 = max)
    test("allows adding when currentCount is 3 (becomes max 4)", () => {
      expect(() => {
        TeamSizeValidator.validateCanAddMember(3);
      }).not.toThrow();
    });

    // Test: cannot add when already at 4 (would become 5)
    test("rejects adding when currentCount is 4 (would exceed max)", () => {
      expect(() => {
        TeamSizeValidator.validateCanAddMember(4);
      }).toThrow(TeamSizeError);
    });

    // Test: cannot add when above max
    test("rejects adding when currentCount is 5", () => {
      expect(() => {
        TeamSizeValidator.validateCanAddMember(5);
      }).toThrow(TeamSizeError);
    });
  });

  // ============================================================
  // validateCanRemoveMember
  // ============================================================
  describe("validateCanRemoveMember()", () => {
    // Test: can remove when count is 4 (becomes 3)
    test("allows removing when currentCount is 4", () => {
      expect(() => {
        TeamSizeValidator.validateCanRemoveMember(4, false);
      }).not.toThrow();
    });

    // Test: can remove when count is 3 (becomes 2 = min)
    test("allows removing when currentCount is 3", () => {
      expect(() => {
        TeamSizeValidator.validateCanRemoveMember(3, false);
      }).not.toThrow();
    });

    // Test: cannot remove when count is 2 (would become 1)
    test("rejects removing when currentCount is 2 (non-draft)", () => {
      expect(() => {
        TeamSizeValidator.validateCanRemoveMember(2, false);
      }).toThrow(TeamSizeError);
    });

    // Test: draft projects have relaxed rules
    test("allows removing when currentCount is 2 for draft projects", () => {
      expect(() => {
        TeamSizeValidator.validateCanRemoveMember(2, "draft");
      }).not.toThrow();
    });
  });

  // ============================================================
  // validateCanActivate
  // ============================================================
  describe("validateCanActivate()", () => {
    // Test: can activate with 2 members
    test("allows activation with 2 members", () => {
      expect(() => {
        TeamSizeValidator.validateCanActivate(2);
      }).not.toThrow();
    });

    // Test: can activate with 4 members
    test("allows activation with 4 members", () => {
      expect(() => {
        TeamSizeValidator.validateCanActivate(4);
      }).not.toThrow();
    });

    // Test: cannot activate with 1 member
    test("rejects activation with 1 member", () => {
      expect(() => {
        TeamSizeValidator.validateCanActivate(1);
      }).toThrow(TeamSizeError);
    });

    // Test: cannot activate with 0 members
    test("rejects activation with 0 members", () => {
      expect(() => {
        TeamSizeValidator.validateCanActivate(0);
      }).toThrow(TeamSizeError);
    });
  });
});
