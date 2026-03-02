// ============================================================
// ACADEMIC CALENDAR — Unit Tests
// ============================================================
// Tests the AcademicCalendar pure utility for:
//   - getAcademicYear: maps calendar dates to academic start year
//   - getAcademicPeriod: determines semester number (1=odd, 2=even)
//   - Semester boundary dates (start/end of odd/even)
//   - isDateInPeriod: date-range membership checks with period object
//   - isFutureDate: future detection
//   - Edge cases: January (even semester), June (odd start)
//
// Bitsathy academic calendar:
//   Odd semester (1):  June → November
//   Even semester (2): December → May
//
// Run: npx jest server/src/lib/__tests__/AcademicCalendar.test.js
// ============================================================

// Import the module (destructure from named export)
const { AcademicCalendar } = require("../temporal/AcademicCalendar");

// ============================================================
// Describe block: AcademicCalendar
// ============================================================
describe("AcademicCalendar", () => {
  // ============================================================
  // getAcademicYear Tests
  // NOTE: Returns a NUMBER (the starting year), not a string
  // ============================================================
  describe("getAcademicYear()", () => {
    // Test: June 2024 is start of 2024-2025 academic year
    test("maps June 2024 to 2024", () => {
      const result = AcademicCalendar.getAcademicYear(new Date("2024-06-15"));
      expect(result).toBe(2024);
    });

    // Test: November 2024 is still 2024 academic year
    test("maps November 2024 to 2024", () => {
      const result = AcademicCalendar.getAcademicYear(new Date("2024-11-30"));
      expect(result).toBe(2024);
    });

    // Test: January 2025 belongs to 2024 academic year (even sem)
    test("maps January 2025 to 2024 (even semester)", () => {
      const result = AcademicCalendar.getAcademicYear(new Date("2025-01-15"));
      expect(result).toBe(2024);
    });

    // Test: May 2025 is end of 2024 academic year
    test("maps May 2025 to 2024", () => {
      const result = AcademicCalendar.getAcademicYear(new Date("2025-05-31"));
      expect(result).toBe(2024);
    });

    // Test: December 2024 starts even sem of 2024 academic year
    test("maps December 2024 to 2024", () => {
      const result = AcademicCalendar.getAcademicYear(new Date("2024-12-01"));
      expect(result).toBe(2024);
    });
  });

  // ============================================================
  // getAcademicPeriod Tests
  // NOTE: semester is a NUMBER: 1=odd, 2=even
  // ============================================================
  describe("getAcademicPeriod()", () => {
    // Test: July is odd semester (1)
    test("July is semester 1 (odd)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2024-07-15"));
      expect(period.semester).toBe(1);
    });

    // Test: October is odd semester (1)
    test("October is semester 1 (odd)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2024-10-15"));
      expect(period.semester).toBe(1);
    });

    // Test: January is even semester (2)
    test("January is semester 2 (even)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2025-01-15"));
      expect(period.semester).toBe(2);
    });

    // Test: March is even semester (2)
    test("March is semester 2 (even)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2025-03-15"));
      expect(period.semester).toBe(2);
    });

    // Test: June boundary — start of odd
    test("June is semester 1 (start of odd)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2024-06-01"));
      expect(period.semester).toBe(1);
    });

    // Test: December boundary — start of even
    test("December is semester 2 (start of even)", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2024-12-01"));
      expect(period.semester).toBe(2);
    });

    // Test: period has academicYear and monthName
    test("returns academicYear and monthName fields", () => {
      const period = AcademicCalendar.getAcademicPeriod(new Date("2024-07-15"));
      expect(period.academicYear).toBeDefined();
      expect(period.monthName).toBeDefined();
    });
  });

  // ============================================================
  // Semester Boundary Tests
  // ============================================================
  describe("semester boundaries", () => {
    // Test: odd semester start is June 1
    test("odd semester starts June 1", () => {
      const start = AcademicCalendar.getOddSemesterStart(2024);
      expect(start.getMonth()).toBe(5); // June (0-indexed)
      expect(start.getDate()).toBe(1);
      expect(start.getFullYear()).toBe(2024);
    });

    // Test: odd semester ends November 30
    test("odd semester ends November 30", () => {
      const end = AcademicCalendar.getOddSemesterEnd(2024);
      expect(end.getMonth()).toBe(10); // November (0-indexed)
      expect(end.getFullYear()).toBe(2024);
    });

    // Test: even semester starts December 1
    test("even semester starts December 1", () => {
      const start = AcademicCalendar.getEvenSemesterStart(2024);
      expect(start.getMonth()).toBe(11); // December (0-indexed)
      expect(start.getFullYear()).toBe(2024);
    });

    // Test: even semester ends May 31 of NEXT year
    test("even semester ends May 31 of next year", () => {
      const end = AcademicCalendar.getEvenSemesterEnd(2024);
      expect(end.getMonth()).toBe(4); // May (0-indexed)
      expect(end.getFullYear()).toBe(2025);
    });
  });

  // ============================================================
  // isDateInPeriod Tests
  // NOTE: Takes (date, period) where period has { start_date, end_date }
  // ============================================================
  describe("isDateInPeriod()", () => {
    // Test: date within range
    test("returns true for date within period", () => {
      const period = {
        start_date: "2024-06-01",
        end_date: "2024-11-30",
      };
      const date = new Date("2024-08-15");
      expect(AcademicCalendar.isDateInPeriod(date, period)).toBe(true);
    });

    // Test: date outside range
    test("returns false for date outside period", () => {
      const period = {
        start_date: "2024-06-01",
        end_date: "2024-11-30",
      };
      const date = new Date("2025-01-15");
      expect(AcademicCalendar.isDateInPeriod(date, period)).toBe(false);
    });

    // Test: date exactly on start boundary
    test("returns true for date on start boundary", () => {
      const period = {
        start_date: "2024-06-01",
        end_date: "2024-11-30",
      };
      const date = new Date("2024-06-01");
      expect(AcademicCalendar.isDateInPeriod(date, period)).toBe(true);
    });
  });

  // ============================================================
  // isFutureDate Tests
  // ============================================================
  describe("isFutureDate()", () => {
    // Test: past date
    test("returns false for past date", () => {
      expect(AcademicCalendar.isFutureDate(new Date("2020-01-01"))).toBe(false);
    });

    // Test: future date
    test("returns true for future date", () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      expect(AcademicCalendar.isFutureDate(nextYear)).toBe(true);
    });
  });
});
