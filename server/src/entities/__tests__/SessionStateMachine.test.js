// ============================================================
// SESSION STATE MACHINE — Unit Tests
// ============================================================
// Tests the SessionStateMachine for:
//   - Valid state transitions through the session lifecycle
//   - Invalid transitions (skip states, go backwards)
//   - Scoring allowed check (only open/in_progress states)
//   - isLocked check (locked state)
//   - getAvailableTransitions for each state
//
// NOTE: validateTransition(session, target) takes a SESSION OBJECT
//       with .status property, not a raw string.
//       canTransition(session, target) also takes a session object.
//       isScoringAllowed(session) and isLocked(session) take objects.
//       Only getAvailableTransitions(statusString) takes a string.
//
// Run: npx jest server/src/entities/__tests__/SessionStateMachine.test.js
// ============================================================

// Import the session state machine (destructure from named export)
const { SessionStateMachine } = require("../SessionStateMachine");

// Import error for instanceof checks
const { StateTransitionError } = require("../EntityErrors");

// Helper to create a mock session object with a given status
const mockSession = (status) => ({ status });

// ============================================================
// Describe block: SessionStateMachine
// ============================================================
describe("SessionStateMachine", () => {
  // ============================================================
  // Valid Transitions — Happy Path
  // ============================================================
  describe("validateTransition — valid transitions", () => {
    // Test: draft → scheduled
    test("allows draft → scheduled", () => {
      expect(() => {
        SessionStateMachine.validateTransition(
          mockSession("draft"),
          "scheduled",
        );
      }).not.toThrow();
    });

    // Test: scheduled → open
    test("allows scheduled → open", () => {
      expect(() => {
        SessionStateMachine.validateTransition(
          mockSession("scheduled"),
          "open",
        );
      }).not.toThrow();
    });

    // Test: open → in_progress
    test("allows open → in_progress", () => {
      expect(() => {
        SessionStateMachine.validateTransition(
          mockSession("open"),
          "in_progress",
        );
      }).not.toThrow();
    });

    // Test: in_progress → closed
    test("allows in_progress → closed", () => {
      expect(() => {
        SessionStateMachine.validateTransition(
          mockSession("in_progress"),
          "closed",
        );
      }).not.toThrow();
    });

    // Test: closed → locked
    test("allows closed → locked", () => {
      expect(() => {
        SessionStateMachine.validateTransition(mockSession("closed"), "locked");
      }).not.toThrow();
    });
  });

  // ============================================================
  // Invalid Transitions
  // ============================================================
  describe("validateTransition — invalid transitions", () => {
    // Test: cannot skip from draft → in_progress
    test("rejects draft → in_progress (must go through scheduled)", () => {
      expect(() => {
        SessionStateMachine.validateTransition(
          mockSession("draft"),
          "in_progress",
        );
      }).toThrow(StateTransitionError);
    });

    // Test: cannot go backwards from open → draft
    test("rejects open → draft", () => {
      expect(() => {
        SessionStateMachine.validateTransition(mockSession("open"), "draft");
      }).toThrow(StateTransitionError);
    });

    // Test: locked is terminal — cannot transition out
    test("rejects locked → any state", () => {
      expect(() => {
        SessionStateMachine.validateTransition(mockSession("locked"), "open");
      }).toThrow(StateTransitionError);
    });

    // Test: cannot skip from draft → locked
    test("rejects draft → locked", () => {
      expect(() => {
        SessionStateMachine.validateTransition(mockSession("draft"), "locked");
      }).toThrow(StateTransitionError);
    });
  });

  // ============================================================
  // Scoring & Locked Checks
  // NOTE: isScoringAllowed and isLocked take session OBJECTS
  // ============================================================
  describe("isScoringAllowed()", () => {
    // Test: scoring allowed in in_progress
    test("returns true for in_progress state", () => {
      expect(
        SessionStateMachine.isScoringAllowed(mockSession("in_progress")),
      ).toBe(true);
    });

    // Test: scoring not allowed in draft
    test("returns false for draft state", () => {
      expect(SessionStateMachine.isScoringAllowed(mockSession("draft"))).toBe(
        false,
      );
    });

    // Test: scoring not allowed in closed
    test("returns false for closed state", () => {
      expect(SessionStateMachine.isScoringAllowed(mockSession("closed"))).toBe(
        false,
      );
    });

    // Test: scoring not allowed in locked
    test("returns false for locked state", () => {
      expect(SessionStateMachine.isScoringAllowed(mockSession("locked"))).toBe(
        false,
      );
    });
  });

  describe("isLocked()", () => {
    // Test: locked state returns true
    test("returns true for locked state", () => {
      expect(SessionStateMachine.isLocked(mockSession("locked"))).toBe(true);
    });

    // Test: non-locked state returns false
    test("returns false for in_progress state", () => {
      expect(SessionStateMachine.isLocked(mockSession("in_progress"))).toBe(
        false,
      );
    });
  });

  // ============================================================
  // getAvailableTransitions — Takes a STATUS STRING, not an object
  // ============================================================
  describe("getAvailableTransitions()", () => {
    // Test: draft → [scheduled]
    test("returns [scheduled] for draft", () => {
      const transitions = SessionStateMachine.getAvailableTransitions("draft");
      expect(transitions).toContain("scheduled");
    });

    // Test: locked is terminal
    test("returns empty array for locked (terminal)", () => {
      const transitions = SessionStateMachine.getAvailableTransitions("locked");
      expect(transitions).toEqual([]);
    });

    // Test: unknown state returns empty
    test("returns empty array for unknown state", () => {
      const transitions =
        SessionStateMachine.getAvailableTransitions("unknown");
      expect(transitions).toEqual([]);
    });
  });

  // ============================================================
  // canTransition — Takes a SESSION OBJECT, not a string
  // ============================================================
  describe("canTransition()", () => {
    test("returns true for valid draft → scheduled", () => {
      expect(
        SessionStateMachine.canTransition(mockSession("draft"), "scheduled"),
      ).toBe(true);
    });

    test("returns false for invalid draft → locked", () => {
      expect(
        SessionStateMachine.canTransition(mockSession("draft"), "locked"),
      ).toBe(false);
    });
  });
});
