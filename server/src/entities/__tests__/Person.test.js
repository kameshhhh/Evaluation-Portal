// ============================================================
// PERSON ENTITY — Unit Tests
// ============================================================
// Tests the Person value object for:
//   - Correct construction from raw data
//   - Immutability (Object.freeze enforcement)
//   - Enum validation (PersonType, PersonStatus)
//   - Helper methods (isStudent, isFaculty, isActive, etc.)
//   - toSnapshot() / toJSON() serialization
//   - Edge cases (null fields, missing fields)
//
// Run: npx jest server/src/entities/__tests__/Person.test.js
// ============================================================
"use strict";

// Import the Person class and enums
const { Person, PersonType, PersonStatus } = require("../Person");

// ============================================================
// Describe block: Person Entity
// ============================================================
describe("Person Entity", () => {
  // ----------------------------------------------------------
  // Factory helper to create a valid person row
  // ----------------------------------------------------------
  const makePersonRow = (overrides = {}) => ({
    person_id: "p-uuid-001", // UUID primary key
    identity_id: "u-uuid-001", // FK to users table
    person_type: "student", // One of PersonType enum
    status: "active", // One of PersonStatus enum
    admission_year: 2023, // Academic admission year
    department_code: "CSE", // Department code string
    graduation_year: 2027, // Expected graduation year
    display_name: "Kamesh", // Display name
    version: 1, // Optimistic lock version
    created_at: new Date("2024-01-01"), // Timestamp of creation
    updated_at: new Date("2024-01-01"), // Timestamp of last update
    ...overrides, // Merge any overrides
  });

  // ============================================================
  // Construction Tests
  // ============================================================
  describe("construction", () => {
    // Test: valid person is created correctly
    test("creates a valid person from a database row", () => {
      // Arrange — build a raw row
      const row = makePersonRow();

      // Act — create Person instance
      const person = new Person(row);

      // Assert — all fields mapped correctly
      expect(person.personId).toBe("p-uuid-001");
      expect(person.identityId).toBe("u-uuid-001");
      expect(person.personType).toBe("student");
      expect(person.status).toBe("active");
      expect(person.admissionYear).toBe(2023);
      expect(person.departmentCode).toBe("CSE");
      expect(person.graduationYear).toBe(2027);
      expect(person.displayName).toBe("Kamesh");
      expect(person.version).toBe(1);
    });

    // Test: person with null optional fields
    test("handles null optional fields gracefully", () => {
      // Arrange — faculty won't have admission/graduation years
      const row = makePersonRow({
        person_type: "faculty",
        admission_year: null,
        graduation_year: null,
      });

      // Act — create Person
      const person = new Person(row);

      // Assert — null fields preserved
      expect(person.admissionYear).toBeNull();
      expect(person.graduationYear).toBeNull();
      expect(person.personType).toBe("faculty");
    });

    // Test: person with empty row defaults
    test("handles missing fields with undefined", () => {
      // Arrange — minimal row
      const row = { person_id: "p-min" };

      // Act — create Person
      const person = new Person(row);

      // Assert — missing fields are undefined
      expect(person.personId).toBe("p-min");
      expect(person.identityId).toBeUndefined();
      expect(person.personType).toBeUndefined();
    });
  });

  // ============================================================
  // Immutability Tests
  // ============================================================
  describe("immutability", () => {
    // Test: person object is frozen
    test("cannot modify person properties after creation", () => {
      // Arrange — create a person
      const person = new Person(makePersonRow());

      // Act + Assert — attempting to modify throws in strict mode
      // Object.freeze makes the object immutable
      expect(() => {
        person.displayName = "Hacked";
      }).toThrow();
    });

    // Test: cannot add new properties
    test("cannot add new properties to person", () => {
      // Arrange
      const person = new Person(makePersonRow());

      // Act + Assert
      expect(() => {
        person.newField = "not allowed";
      }).toThrow();
    });

    // Test: cannot delete properties
    test("cannot delete properties from person", () => {
      // Arrange
      const person = new Person(makePersonRow());

      // Act + Assert
      expect(() => {
        delete person.personId;
      }).toThrow();
    });
  });

  // ============================================================
  // PersonType Enum Tests
  // ============================================================
  describe("PersonType enum", () => {
    // Test: all expected types exist
    test("has all required person types", () => {
      expect(PersonType.STUDENT).toBe("student");
      expect(PersonType.FACULTY).toBe("faculty");
      expect(PersonType.STAFF).toBe("staff");
      expect(PersonType.EXTERNAL).toBe("external");
    });

    // Test: enum is frozen (immutable)
    test("PersonType enum is immutable", () => {
      expect(() => {
        PersonType.NEW_TYPE = "hacker";
      }).toThrow();
    });
  });

  // ============================================================
  // PersonStatus Enum Tests
  // ============================================================
  describe("PersonStatus enum", () => {
    // Test: all expected statuses exist
    test("has all required person statuses", () => {
      expect(PersonStatus.ACTIVE).toBe("active");
      expect(PersonStatus.INACTIVE).toBe("inactive");
      expect(PersonStatus.GRADUATED).toBe("graduated");
      expect(PersonStatus.SUSPENDED).toBe("suspended");
    });

    // Test: enum is frozen
    test("PersonStatus enum is immutable", () => {
      expect(() => {
        PersonStatus.DELETED = "deleted";
      }).toThrow();
    });
  });

  // ============================================================
  // Helper Method Tests
  // ============================================================
  describe("helper methods", () => {
    // Test: isStudent returns true for students
    test("isStudent() returns true for student type", () => {
      const person = new Person(makePersonRow({ person_type: "student" }));
      expect(person.isStudent()).toBe(true);
    });

    // Test: isStudent returns false for non-students
    test("isStudent() returns false for faculty type", () => {
      const person = new Person(makePersonRow({ person_type: "faculty" }));
      expect(person.isStudent()).toBe(false);
    });

    // Test: isFaculty returns true for faculty
    test("isFaculty() returns true for faculty type", () => {
      const person = new Person(makePersonRow({ person_type: "faculty" }));
      expect(person.isFaculty()).toBe(true);
    });

    // Test: isActive returns true for active status
    test("isActive() returns true for active status", () => {
      const person = new Person(makePersonRow({ status: "active" }));
      expect(person.isActive()).toBe(true);
    });

    // Test: isActive returns false for inactive status
    test("isActive() returns false for graduated status", () => {
      const person = new Person(makePersonRow({ status: "graduated" }));
      expect(person.isActive()).toBe(false);
    });

    // Test: canBeTeamMember requires active status
    test("canBeTeamMember() returns true for active student", () => {
      const person = new Person(
        makePersonRow({
          person_type: "student",
          status: "active",
        }),
      );
      expect(person.canBeTeamMember()).toBe(true);
    });

    // Test: canBeTeamMember rejects inactive persons
    test("canBeTeamMember() returns false for suspended person", () => {
      const person = new Person(makePersonRow({ status: "suspended" }));
      expect(person.canBeTeamMember()).toBe(false);
    });
  });

  // ============================================================
  // Serialization Tests
  // ============================================================
  describe("serialization", () => {
    // Test: toSnapshot captures the full state
    test("toSnapshot() returns a complete state snapshot", () => {
      // Arrange
      const person = new Person(makePersonRow());

      // Act
      const snapshot = person.toSnapshot();

      // Assert — snapshot includes all fields
      expect(snapshot.personId).toBe("p-uuid-001");
      expect(snapshot.identityId).toBe("u-uuid-001");
      expect(snapshot.personType).toBe("student");
      expect(snapshot.status).toBe("active");
      expect(snapshot.admissionYear).toBe(2023);
      expect(snapshot.departmentCode).toBe("CSE");
    });

    // Test: toJSON returns the same as toSnapshot
    test("toJSON() returns serializable representation", () => {
      // Arrange
      const person = new Person(makePersonRow());

      // Act
      const json = person.toJSON();

      // Assert — JSON includes key fields
      expect(json.personId).toBe("p-uuid-001");
      expect(json.displayName).toBe("Kamesh");
    });

    // Test: snapshot is a plain object (not Person instance)
    test("toSnapshot() returns a plain object", () => {
      const person = new Person(makePersonRow());
      const snapshot = person.toSnapshot();

      // It should NOT be a Person instance
      expect(snapshot).not.toBeInstanceOf(Person);
      // It should be a plain object
      expect(typeof snapshot).toBe("object");
    });
  });
});
