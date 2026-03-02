// ============================================================
// ENTITY EVENTS — Unit Tests
// ============================================================
// Tests the domain event system for:
//   - EventTypes enum completeness and immutability
//   - createEvent factory: generates UUID, timestamp, freezes
//   - Convenience factories with positional parameters
//   - Event immutability (Object.freeze on event, data, metadata)
//   - Event fields (eventId, timestamp, type, data, actorId)
//
// Run: npx jest server/src/events/__tests__/EntityEvents.test.js
// ============================================================
"use strict";

// Import the event module
const {
  EventTypes,
  createEvent,
  projectCreated,
  projectStateChanged,
  memberAdded,
  memberRemoved,
  entityFrozen,
  integrityCheckFailed,
} = require("../EntityEvents");

// ============================================================
// Describe block: EntityEvents
// ============================================================
describe("EntityEvents", () => {
  // ============================================================
  // EventTypes Enum Tests
  // ============================================================
  describe("EventTypes enum", () => {
    // Test: enum has key event types
    test("has PROJECT_CREATED event type", () => {
      expect(EventTypes.PROJECT_CREATED).toBeDefined();
      expect(typeof EventTypes.PROJECT_CREATED).toBe("string");
    });

    // Test: enum has member events
    test("has MEMBER_ADDED and MEMBER_REMOVED event types", () => {
      expect(EventTypes.MEMBER_ADDED).toBeDefined();
      expect(EventTypes.MEMBER_REMOVED).toBeDefined();
    });

    // Test: enum has project lifecycle events
    test("has PROJECT_ACTIVATED event type", () => {
      expect(EventTypes.PROJECT_ACTIVATED).toBeDefined();
    });

    // Test: enum has freeze events
    test("has ENTITY_FROZEN event type", () => {
      expect(EventTypes.ENTITY_FROZEN).toBeDefined();
    });

    // Test: enum has integrity events
    test("has INTEGRITY_CHECK_FAILED event type", () => {
      expect(EventTypes.INTEGRITY_CHECK_FAILED).toBeDefined();
    });

    // Test: enum is immutable (Object.freeze)
    test("EventTypes is frozen", () => {
      expect(Object.isFrozen(EventTypes)).toBe(true);
    });
  });

  // ============================================================
  // createEvent Factory Tests
  // NOTE: Signature is createEvent(type, data, actorId, metadata)
  // Events have .data (not .payload) and .actorId
  // ============================================================
  describe("createEvent()", () => {
    // Test: creates event with all required fields
    test("creates event with eventId, timestamp, type, data, actorId", () => {
      const event = createEvent("TEST_EVENT", { key: "test" }, "actor-001");

      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe("string");
      expect(event.timestamp).toBeDefined();
      expect(event.type).toBe("TEST_EVENT");
      expect(event.data).toEqual({ key: "test" });
      expect(event.actorId).toBe("actor-001");
    });

    // Test: event has a UUID-format eventId
    test("generates a UUID-format eventId", () => {
      const event = createEvent("TEST", {}, "actor-001");
      expect(event.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    // Test: event is frozen (immutable)
    test("created event is frozen", () => {
      const event = createEvent("IMMUTABLE_TEST", { key: "value" }, "a");
      expect(Object.isFrozen(event)).toBe(true);
    });

    // Test: event data is also frozen
    test("event data is frozen", () => {
      const event = createEvent("DATA_FREEZE", { nested: "val" }, "a");
      expect(Object.isFrozen(event.data)).toBe(true);
    });

    // Test: event metadata is frozen
    test("event metadata is frozen", () => {
      const event = createEvent("META_FREEZE", {}, "a");
      expect(Object.isFrozen(event.metadata)).toBe(true);
    });

    // Test: cannot modify event fields
    test("cannot modify event properties after creation", () => {
      const event = createEvent("NO_MODIFY", { safe: true }, "a");
      expect(() => {
        event.type = "HACKED";
      }).toThrow();
    });

    // Test: timestamp is a valid ISO date string
    test("timestamp is recent (within last 5 seconds)", () => {
      const before = Date.now();
      const event = createEvent("TIMING", {}, "a");
      const after = Date.now();
      const eventTime = new Date(event.timestamp).getTime();

      expect(eventTime).toBeGreaterThanOrEqual(before);
      expect(eventTime).toBeLessThanOrEqual(after);
    });

    // Test: metadata includes version
    test("metadata includes version 1", () => {
      const event = createEvent("VER_TEST", {}, "a");
      expect(event.metadata.version).toBe(1);
    });
  });

  // ============================================================
  // Convenience Factory Tests
  // NOTE: These take positional params, not objects
  // ============================================================
  describe("convenience factories", () => {
    // Test: projectCreated(project, actorId)
    test("projectCreated() creates event with project data", () => {
      const project = {
        project_id: "proj-001",
        title: "Smart Campus",
        academic_year: "2024-2025",
        semester: "odd",
      };
      const event = projectCreated(project, "actor-001");

      expect(event.type).toBe(EventTypes.PROJECT_CREATED);
      expect(event.data.projectId).toBe("proj-001");
      expect(event.data.title).toBe("Smart Campus");
      expect(event.data.status).toBe("draft");
      expect(event.actorId).toBe("actor-001");
    });

    // Test: projectStateChanged(projectId, from, to, actorId, reason)
    test("projectStateChanged() maps draft→active to PROJECT_ACTIVATED", () => {
      const event = projectStateChanged(
        "proj-001",
        "draft",
        "active",
        "actor-001",
      );

      expect(event.type).toBe(EventTypes.PROJECT_ACTIVATED);
      expect(event.data.fromStatus).toBe("draft");
      expect(event.data.toStatus).toBe("active");
    });

    // Test: memberAdded(projectId, personId, role, actorId)
    test("memberAdded() creates a member addition event", () => {
      const event = memberAdded("proj-001", "p-001", "member", "actor-001");

      expect(event.type).toBe(EventTypes.MEMBER_ADDED);
      expect(event.data.personId).toBe("p-001");
      expect(event.data.roleInProject).toBe("member");
    });

    // Test: memberRemoved(projectId, personId, reason, actorId)
    test("memberRemoved() creates a member removal event", () => {
      const event = memberRemoved(
        "proj-001",
        "p-002",
        "Graduated",
        "actor-001",
      );

      expect(event.type).toBe(EventTypes.MEMBER_REMOVED);
      expect(event.data.reason).toBe("Graduated");
    });

    // Test: entityFrozen(entityType, entityId, sessionId, stateHash, actorId)
    test("entityFrozen() creates a freeze event", () => {
      const event = entityFrozen(
        "project",
        "proj-001",
        "session-001",
        "hash123",
        "evaluator-001",
      );

      expect(event.type).toBe(EventTypes.ENTITY_FROZEN);
      expect(event.data.entityType).toBe("project");
      expect(event.data.stateHash).toBe("hash123");
    });

    // Test: integrityCheckFailed(entityType, entityId, brokenAt, details, verifiedBy)
    test("integrityCheckFailed() creates an integrity failure event", () => {
      const event = integrityCheckFailed(
        "person",
        "p-001",
        5,
        "Hash mismatch at entry 5",
        "admin-001",
      );

      expect(event.type).toBe(EventTypes.INTEGRITY_CHECK_FAILED);
      expect(event.data.brokenAt).toBe(5);
      expect(event.data.details).toBe("Hash mismatch at entry 5");
    });
  });
});
