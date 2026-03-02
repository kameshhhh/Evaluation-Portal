// ============================================================
// ACADEMIC CALENDAR — Bitsathy College Date Calculations
// ============================================================
// Provides college-specific academic calendar logic.
// Converts between calendar dates and academic periods.
//
// Bitsathy academic year structure:
//   Odd semester:  June(month_index=1) → November(month_index=6)
//   Even semester: December(month_index=1) → May(month_index=6)
//
// Academic year starts in June and ends in May of the next year.
// Example: Academic year 2026 = June 2026 to May 2027.
//
// This module is stateless — all methods are pure functions.
// No database calls, no side effects, fully testable.
// ============================================================

// ============================================================
// MONTH MAPPINGS — Maps calendar months to academic periods
// ============================================================

// Calendar month number (1=Jan) → { semester, month_index }
// This is the core lookup table for date → academic period conversion
const MONTH_TO_ACADEMIC = {
  1: { semester: 2, monthIndex: 2, monthName: "January" }, // Even sem, month 2
  2: { semester: 2, monthIndex: 3, monthName: "February" }, // Even sem, month 3
  3: { semester: 2, monthIndex: 4, monthName: "March" }, // Even sem, month 4
  4: { semester: 2, monthIndex: 5, monthName: "April" }, // Even sem, month 5
  5: { semester: 2, monthIndex: 6, monthName: "May" }, // Even sem, month 6
  6: { semester: 1, monthIndex: 1, monthName: "June" }, // Odd sem, month 1
  7: { semester: 1, monthIndex: 2, monthName: "July" }, // Odd sem, month 2
  8: { semester: 1, monthIndex: 3, monthName: "August" }, // Odd sem, month 3
  9: { semester: 1, monthIndex: 4, monthName: "September" }, // Odd sem, month 4
  10: { semester: 1, monthIndex: 5, monthName: "October" }, // Odd sem, month 5
  11: { semester: 1, monthIndex: 6, monthName: "November" }, // Odd sem, month 6
  12: { semester: 2, monthIndex: 1, monthName: "December" }, // Even sem, month 1
};

// ============================================================
// AcademicCalendar class — pure date-to-period calculations
// ============================================================
class AcademicCalendar {
  /**
   * Get the academic year for a given calendar date.
   * Academic year starts in June.
   *
   * June 2026 → academic_year 2026
   * January 2027 → academic_year 2026 (still in 2026 academic year)
   * May 2027 → academic_year 2026
   * June 2027 → academic_year 2027
   *
   * @param {Date} date - Calendar date
   * @returns {number} Academic year (e.g., 2026)
   */
  static getAcademicYear(date) {
    // Get the calendar month (0-indexed in JS, so +1)
    const month = date.getMonth() + 1;

    // Get the calendar year
    const year = date.getFullYear();

    // If month is Jan-May, we're still in the PREVIOUS academic year
    // Because even semester (Dec-May) belongs to the year that started in June
    if (month >= 1 && month <= 5) {
      return year - 1;
    }

    // June-December: we're in the current academic year
    return year;
  }

  /**
   * Get the semester and month index for a given calendar date.
   * Uses the MONTH_TO_ACADEMIC lookup table.
   *
   * @param {Date} date - Calendar date
   * @returns {{ academicYear: number, semester: number, monthIndex: number, monthName: string }}
   */
  static getAcademicPeriod(date) {
    // Get calendar month (1-indexed)
    const month = date.getMonth() + 1;

    // Look up the academic period for this calendar month
    const period = MONTH_TO_ACADEMIC[month];

    // Combine with the academic year
    return {
      academicYear: AcademicCalendar.getAcademicYear(date),
      semester: period.semester,
      monthIndex: period.monthIndex,
      monthName: period.monthName,
    };
  }

  /**
   * Get the start date of an academic year's odd semester (June 1).
   *
   * @param {number} academicYear - e.g., 2026
   * @returns {Date} June 1 of the academic year
   */
  static getOddSemesterStart(academicYear) {
    // Odd semester starts June 1 of the academic year
    return new Date(academicYear, 5, 1); // month is 0-indexed: 5 = June
  }

  /**
   * Get the end date of an academic year's odd semester (November 30).
   *
   * @param {number} academicYear - e.g., 2026
   * @returns {Date} November 30 of the academic year
   */
  static getOddSemesterEnd(academicYear) {
    // Odd semester ends November 30 of the academic year
    return new Date(academicYear, 10, 30); // month 10 = November
  }

  /**
   * Get the start date of an academic year's even semester (December 1).
   *
   * @param {number} academicYear - e.g., 2026
   * @returns {Date} December 1 of the academic year
   */
  static getEvenSemesterStart(academicYear) {
    // Even semester starts December 1 of the academic year
    return new Date(academicYear, 11, 1); // month 11 = December
  }

  /**
   * Get the end date of an academic year's even semester (May 31 of next year).
   *
   * @param {number} academicYear - e.g., 2026
   * @returns {Date} May 31 of the NEXT calendar year
   */
  static getEvenSemesterEnd(academicYear) {
    // Even semester ends May 31 of the NEXT calendar year
    // Academic year 2026's even semester ends May 31, 2027
    return new Date(academicYear + 1, 4, 31); // month 4 = May
  }

  /**
   * Check if a given date falls within a specific academic month period.
   *
   * @param {Date} date - The date to check
   * @param {{ start_date: Date|string, end_date: Date|string }} period - Period boundaries
   * @returns {boolean} True if the date is within the period (inclusive)
   */
  static isDateInPeriod(date, period) {
    // Convert string dates to Date objects if needed
    const start = new Date(period.start_date);
    const end = new Date(period.end_date);

    // Inclusive range check: start <= date <= end
    return date >= start && date <= end;
  }

  /**
   * Check if a date is in the future relative to now.
   * Used to prevent submitting work logs for future months.
   *
   * @param {Date} date - The date to check
   * @returns {boolean} True if the date is after the current moment
   */
  static isFutureDate(date) {
    return date > new Date();
  }

  /**
   * Generate all 6 academic month periods for a given semester.
   * Returns an array of period descriptors with start/end dates.
   *
   * @param {number} academicYear - e.g., 2026
   * @param {number} semester - 1 (Odd) or 2 (Even)
   * @returns {Array<{ monthIndex: number, monthName: string, startDate: Date, endDate: Date }>}
   */
  static generateSemesterPeriods(academicYear, semester) {
    // Array to hold the 6 month periods
    const periods = [];

    // Determine the starting calendar month for this semester
    // Odd semester starts at calendar month 6 (June)
    // Even semester starts at calendar month 12 (December)
    const startCalendarMonth = semester === 1 ? 6 : 12;

    // Generate 6 monthly periods
    for (let i = 0; i < 6; i++) {
      // Calculate the calendar month number (wraps around after December)
      const calMonth = ((startCalendarMonth - 1 + i) % 12) + 1;

      // Look up the academic period info for this calendar month
      const info = MONTH_TO_ACADEMIC[calMonth];

      // Calculate the calendar year for this month
      // For even semester: Dec is in academicYear, Jan-May is in academicYear+1
      let calYear = academicYear;
      if (semester === 2 && calMonth >= 1 && calMonth <= 5) {
        calYear = academicYear + 1;
      }

      // Calculate start date (1st of the month)
      const startDate = new Date(calYear, calMonth - 1, 1);

      // Calculate end date (last day of the month)
      // Using day=0 of the NEXT month gives the last day of THIS month
      const endDate = new Date(calYear, calMonth, 0);

      // Add the period to the array
      periods.push({
        monthIndex: info.monthIndex,
        monthName: info.monthName,
        startDate,
        endDate,
        calendarYear: calYear,
        calendarMonth: calMonth,
      });
    }

    // Return the 6 periods in order
    return periods;
  }
}

// ============================================================
// Export AcademicCalendar class and the month mapping constant
// ============================================================
module.exports = { AcademicCalendar, MONTH_TO_ACADEMIC };
