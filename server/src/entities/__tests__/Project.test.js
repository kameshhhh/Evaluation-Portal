// ============================================================
// PROJECT ENTITY — Unit Tests
// ============================================================
// Tests the Project value object for:
//   - Correct construction and field mapping
//   - Immutability (Object.freeze enforcement)
//   - ProjectStatus enum values and immutability
//   - VALID_TRANSITIONS map correctness
//   - Helper methods (isDraft, isActive, isLocked, etc.)
//   - canTransitionTo() logic against the transition map
//   - toSnapshot() and toJSON() serialization
//
// Run: npx jest server/src/entities/__tests__/Project.test.js
// ============================================================
"use strict";

// Import the Project class, enums, and transition map
const { Project, ProjectStatus, VALID_TRANSITIONS } = require("../Project");

// ============================================================
// Describe block: Project Entity
// ============================================================
describe("Project Entity", () => {
  // ----------------------------------------------------------
  // Factory helper: make a valid project row
  // ----------------------------------------------------------
  const makeProjectRow = (overrides = {}) => ({
    project_id: "proj-uuid-001", // UUID primary key
    title: "Smart Campus IoT", // Project title
    description: "IoT sensors for campus", // Description
    academic_year: "2024-2025", // Academic year string
    semester: "odd", // odd or even
    status: "draft", // Current status
    frozen_at: null, // Not frozen by default
    frozen_by: null, // No freeze actor
    version: 1, // Optimistic lock version
    is_deleted: false, // Not soft-deleted
    created_at: new Date("2024-06-01"), // Creation timestamp
    updated_at: new Date("2024-06-01"), // Last update timestamp
    ...overrides, // Merge overrides
  });

  // ============================================================
  // Construction Tests
  // ============================================================
  describe("construction", () => {
    // Test: creates a valid project from a row
    test("creates a valid project from a database row", () => {
      // Arrange — build raw DB row
      const row = makeProjectRow();

      // Act — create Project instance
      const project = new Project(row);

      // Assert — all fields mapped
      expect(project.projectId).toBe("proj-uuid-001");
      expect(project.title).toBe("Smart Campus IoT");
      expect(project.description).toBe("IoT sensors for campus");
      expect(project.academicYear).toBe("2024-2025");
      expect(project.semester).toBe("odd");
      expect(project.status).toBe("draft");
      expect(project.frozenAt).toBeNull();
      expect(project.frozenBy).toBeNull();
      expect(project.version).toBe(1);
      expect(project.isDeleted).toBe(false);
    });

    // Test: frozen project has timestamp and actor
    test("creates a frozen project with freeze metadata", () => {
      // Arrange — a project that has been frozen
      const freezeDate = new Date("2024-10-15");
      const row = makeProjectRow({
        status: "locked",
        frozen_at: freezeDate,
        frozen_by: "evaluator-uuid-001",
      });

      // Act
      const project = new Project(row);

      // Assert
      expect(project.frozenAt).toEqual(freezeDate);
      expect(project.frozenBy).toBe("evaluator-uuid-001");
      expect(project.status).toBe("locked");
    });
  });

  // ============================================================
  // Immutability Tests
  // ============================================================
  describe("immutability", () => {
    // Test: cannot modify project title
    test("project properties are frozen", () => {
      const project = new Project(makeProjectRow());
      expect(() => {
        project.title = "Hacked Title";
      }).toThrow();
    });

    // Test: cannot add properties
    test("cannot add new properties", () => {
      const project = new Project(makeProjectRow());
      expect(() => {
        project.hackField = true;
      }).toThrow();
    });
  });

  // ============================================================
  // ProjectStatus Enum Tests
  // ============================================================
  describe("ProjectStatus enum", () => {
    // Test: all statuses defined
    test("has all required project statuses", () => {
      expect(ProjectStatus.DRAFT).toBe("draft");
      expect(ProjectStatus.ACTIVE).toBe("active");
      expect(ProjectStatus.UNDER_REVIEW).toBe("under_review");
      expect(ProjectStatus.LOCKED).toBe("locked");
      expect(ProjectStatus.ARCHIVED).toBe("archived");
    });

    // Test: enum is immutable
    test("ProjectStatus enum is frozen", () => {
      expect(() => {
        ProjectStatus.CANCELLED = "cancelled";
      }).toThrow();
    });
  });

  // ============================================================
  // VALID_TRANSITIONS Map Tests
  // ============================================================
  describe("VALID_TRANSITIONS", () => {
    // Test: draft → active is allowed
    test("draft can transition to active", () => {
      expect(VALID_TRANSITIONS.draft).toContain("active");
    });

    // Test: active → under_review
    test("active can transition to under_review", () => {
      expect(VALID_TRANSITIONS.active).toContain("under_review");
    });

    // Test: under_review → locked or active (rollback)
    test("under_review can transition to locked or active", () => {
      expect(VALID_TRANSITIONS.under_review).toContain("locked");
      expect(VALID_TRANSITIONS.under_review).toContain("active");
    });

    // Test: locked → archived
    test("locked can transition to archived", () => {
      expect(VALID_TRANSITIONS.locked).toContain("archived");
    });

    // Test: archived is terminal (no transitions)
    test("archived has no valid transitions", () => {
      // Archived should either not exist or be empty
      const archivedTransitions = VALID_TRANSITIONS.archived || [];
      expect(archivedTransitions.length).toBe(0);
    });
  });

  // ============================================================
  // Helper Method Tests
  // ============================================================
  describe("helper methods", () => {
    // Test: isDraft returns true for draft status
    test("isDraft() returns true when status is draft", () => {
      const project = new Project(makeProjectRow({ status: "draft" }));
      expect(project.isDraft()).toBe(true);
    });

    // Test: isActive returns true for active status
    test("isActive() returns true when status is active", () => {
      const project = new Project(makeProjectRow({ status: "active" }));
      expect(project.isActive()).toBe(true);
    });

    // Test: isLocked returns true for locked status
    test("isLocked() returns true when status is locked", () => {
      const project = new Project(makeProjectRow({ status: "locked" }));
      expect(project.isLocked()).toBe(true);
    });

    // Test: isArchived returns true for archived status
    test("isArchived() returns true when status is archived", () => {
      const project = new Project(makeProjectRow({ status: "archived" }));
      expect(project.isArchived()).toBe(true);
    });

    // Test: isFrozen checks frozen_at timestamp
    test("isFrozen() returns true when frozen_at is set", () => {
      const project = new Project(
        makeProjectRow({
          frozen_at: new Date(),
        }),
      );
      expect(project.isFrozen()).toBe(true);
    });

    // Test: isFrozen returns false when no freeze timestamp
    test("isFrozen() returns false when frozen_at is null", () => {
      const project = new Project(makeProjectRow({ frozen_at: null }));
      expect(project.isFrozen()).toBe(false);
    });

    // Test: isModifiable checks status and freeze
    test("isModifiable() returns true for draft unfrozen project", () => {
      const project = new Project(
        makeProjectRow({
          status: "draft",
          frozen_at: null,
        }),
      );
      expect(project.isModifiable()).toBe(true);
    });

    // Test: locked project is not modifiable
    test("isModifiable() returns false for locked project", () => {
      const project = new Project(
        makeProjectRow({
          status: "locked",
        }),
      );
      expect(project.isModifiable()).toBe(false);
    });

    // Test: frozen project is not modifiable even if active
    test("isModifiable() returns false if frozen even when active", () => {
      const project = new Project(
        makeProjectRow({
          status: "active",
          frozen_at: new Date(),
        }),
      );
      expect(project.isModifiable()).toBe(false);
    });
  });

  // ============================================================
  // canTransitionTo Tests
  // ============================================================
  describe("canTransitionTo()", () => {
    // Test: draft → active is valid
    test("returns true for valid transition draft → active", () => {
      const project = new Project(makeProjectRow({ status: "draft" }));
      expect(project.canTransitionTo("active")).toBe(true);
    });

    // Test: draft → locked is invalid (must go through active)
    test("returns false for invalid transition draft → locked", () => {
      const project = new Project(makeProjectRow({ status: "draft" }));
      expect(project.canTransitionTo("locked")).toBe(false);
    });

    // Test: archived → anything is invalid (terminal state)
    test("returns false for any transition from archived", () => {
      const project = new Project(makeProjectRow({ status: "archived" }));
      expect(project.canTransitionTo("draft")).toBe(false);
      expect(project.canTransitionTo("active")).toBe(false);
    });
  });

  // ============================================================
  // Serialization Tests
  // ============================================================
  describe("serialization", () => {
    // Test: toSnapshot captures full state
    test("toSnapshot() returns complete state", () => {
      const project = new Project(makeProjectRow());
      const snapshot = project.toSnapshot();

      expect(snapshot.projectId).toBe("proj-uuid-001");
      expect(snapshot.title).toBe("Smart Campus IoT");
      expect(snapshot.status).toBe("draft");
    });

    // Test: toJSON returns serializable object
    test("toJSON() returns JSON-safe object", () => {
      const project = new Project(makeProjectRow());
      const json = project.toJSON();

      expect(json.projectId).toBe("proj-uuid-001");
      expect(typeof json).toBe("object");
    });
  });
});
