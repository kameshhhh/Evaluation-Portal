// ============================================================
// PROJECT STATE MACHINE — Unit Tests
// ============================================================
// Tests the ProjectStateMachine for:
//   - Valid state transitions (happy path)
//   - Invalid state transitions (rejection)
//   - Guard conditions: draftToActive (2+ members)
//   - Guard conditions: underReviewToLocked (session required)
//   - Guard conditions: underReviewToActive (reason required)
//   - Guard conditions: lockedToArchived (scoring complete)
//   - getAvailableTransitions() for each state
//   - canTransition() boolean checks
//   - Proper error types (StateTransitionError, GuardConditionFailedError)
//
// NOTE: validateTransition(project, targetStatus, context) takes a
//       PROJECT OBJECT (with .status), not a raw string.
//       canTransition(project, targetStatus, context) also takes an object.
//       getAvailableTransitions(statusString) takes a string.
//
// Run: npx jest server/src/entities/__tests__/ProjectStateMachine.test.js
// ============================================================

// Import the state machine (destructure from named export)
const { ProjectStateMachine } = require("../ProjectStateMachine");

// Import error types for instanceof checks
const {
  StateTransitionError,
  GuardConditionFailedError,
} = require("../EntityErrors");

// Helper to create a mock project object with a given status
const mockProject = (status) => ({ status });

// ============================================================
// Describe block: ProjectStateMachine
// ============================================================
describe("ProjectStateMachine", () => {
  // ============================================================
  // validateTransition — Happy Path Tests
  // NOTE: First param must be an object with .status property
  // ============================================================
  describe("validateTransition — valid transitions", () => {
    // Test: draft → active with enough members
    test("allows draft → active when activeMembers >= 2", () => {
      // Arrange — project object + context with 3 active members
      // NOTE: guardDraftToActive reads context.activeMembers (not memberCount)
      const project = mockProject("draft");
      const context = { activeMembers: 3 };

      // Act + Assert — should not throw
      expect(() => {
        ProjectStateMachine.validateTransition(project, "active", context);
      }).not.toThrow();
    });

    // Test: active → under_review
    test("allows active → under_review", () => {
      const project = mockProject("active");
      expect(() => {
        ProjectStateMachine.validateTransition(project, "under_review", {});
      }).not.toThrow();
    });

    // Test: under_review → locked with sessionId
    test("allows under_review → locked with sessionId", () => {
      const project = mockProject("under_review");
      const context = { sessionId: "session-uuid-001" };
      expect(() => {
        ProjectStateMachine.validateTransition(project, "locked", context);
      }).not.toThrow();
    });

    // Test: under_review → active (rollback) with reason
    test("allows under_review → active with reason", () => {
      const project = mockProject("under_review");
      const context = { reason: "Evaluation postponed" };
      expect(() => {
        ProjectStateMachine.validateTransition(project, "active", context);
      }).not.toThrow();
    });

    // Test: locked → archived with scoring complete
    test("allows locked → archived when scoringComplete is true", () => {
      const project = mockProject("locked");
      const context = { scoringComplete: true };
      expect(() => {
        ProjectStateMachine.validateTransition(project, "archived", context);
      }).not.toThrow();
    });
  });

  // ============================================================
  // validateTransition — Invalid Transitions
  // ============================================================
  describe("validateTransition — invalid transitions", () => {
    // Test: draft → locked (not allowed, must go through active)
    test("rejects draft → locked", () => {
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("draft"),
          "locked",
          {},
        );
      }).toThrow(StateTransitionError);
    });

    // Test: active → draft (no going backwards)
    test("rejects active → draft", () => {
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("active"),
          "draft",
          {},
        );
      }).toThrow(StateTransitionError);
    });

    // Test: archived → anything (terminal state)
    test("rejects any transition from archived", () => {
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("archived"),
          "active",
          {},
        );
      }).toThrow(StateTransitionError);
    });

    // Test: locked → active (cannot unlock back to active)
    test("rejects locked → active", () => {
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("locked"),
          "active",
          {},
        );
      }).toThrow(StateTransitionError);
    });
  });

  // ============================================================
  // Guard Conditions — Failure Cases
  // ============================================================
  describe("guard conditions — failures", () => {
    // Test: draft → active fails with only 1 active member
    test("rejects draft → active when activeMembers < 2", () => {
      const context = { activeMembers: 1 };
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("draft"),
          "active",
          context,
        );
      }).toThrow(GuardConditionFailedError);
    });

    // Test: draft → active fails with 0 active members
    test("rejects draft → active when activeMembers is 0", () => {
      const context = { activeMembers: 0 };
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("draft"),
          "active",
          context,
        );
      }).toThrow(GuardConditionFailedError);
    });

    // Test: under_review → locked fails without sessionId
    test("rejects under_review → locked without sessionId", () => {
      const context = {}; // No sessionId
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("under_review"),
          "locked",
          context,
        );
      }).toThrow(GuardConditionFailedError);
    });

    // Test: under_review → active fails without reason
    test("rejects under_review → active without reason", () => {
      const context = {}; // No reason
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("under_review"),
          "active",
          context,
        );
      }).toThrow(GuardConditionFailedError);
    });

    // Test: locked → archived fails without scoring complete
    test("rejects locked → archived when scoringComplete is false", () => {
      const context = { scoringComplete: false };
      expect(() => {
        ProjectStateMachine.validateTransition(
          mockProject("locked"),
          "archived",
          context,
        );
      }).toThrow(GuardConditionFailedError);
    });
  });

  // ============================================================
  // getAvailableTransitions Tests
  // NOTE: This method takes a STATUS STRING, not a project object
  // ============================================================
  describe("getAvailableTransitions()", () => {
    // Test: draft has exactly [active]
    test("returns [active] for draft state", () => {
      const transitions = ProjectStateMachine.getAvailableTransitions("draft");
      expect(transitions).toContain("active");
      expect(transitions.length).toBe(1);
    });

    // Test: active has exactly [under_review]
    test("returns [under_review] for active state", () => {
      const transitions = ProjectStateMachine.getAvailableTransitions("active");
      expect(transitions).toContain("under_review");
    });

    // Test: under_review has [locked, active]
    test("returns [locked, active] for under_review state", () => {
      const transitions =
        ProjectStateMachine.getAvailableTransitions("under_review");
      expect(transitions).toContain("locked");
      expect(transitions).toContain("active");
    });

    // Test: locked has [archived]
    test("returns [archived] for locked state", () => {
      const transitions = ProjectStateMachine.getAvailableTransitions("locked");
      expect(transitions).toContain("archived");
    });

    // Test: archived has no transitions
    test("returns empty array for archived state", () => {
      const transitions =
        ProjectStateMachine.getAvailableTransitions("archived");
      expect(transitions).toEqual([]);
    });

    // Test: unknown state returns empty array
    test("returns empty array for unknown state", () => {
      const transitions =
        ProjectStateMachine.getAvailableTransitions("nonexistent");
      expect(transitions).toEqual([]);
    });
  });

  // ============================================================
  // canTransition Tests
  // NOTE: canTransition(project, targetStatus, context) takes a project object
  // ============================================================
  describe("canTransition()", () => {
    // Test: returns true for valid transition
    test("returns true for draft → active", () => {
      const project = mockProject("draft");
      expect(
        ProjectStateMachine.canTransition(project, "active", {
          activeMembers: 2,
        }),
      ).toBe(true);
    });

    // Test: returns false for invalid transition
    test("returns false for draft → locked", () => {
      expect(
        ProjectStateMachine.canTransition(mockProject("draft"), "locked"),
      ).toBe(false);
    });

    // Test: returns false for archived → anything
    test("returns false for archived → active", () => {
      expect(
        ProjectStateMachine.canTransition(mockProject("archived"), "active"),
      ).toBe(false);
    });
  });
});
