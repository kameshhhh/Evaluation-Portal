// ============================================================
// TIME PERIOD CALCULATOR — Academic Period Resolution
// ============================================================
// Resolves dates into academic period IDs by querying the
// academic_months table. This bridges the gap between
// calendar dates and the temporal database structure.
//
// Unlike AcademicCalendar (pure date math), this module
// queries the database to find the actual period_id for
// a given date — because the academic_months table may
// have custom periods or adjusted dates.
//
// Dependencies:
//   - database.js (query function)
//   - AcademicCalendar (for fallback calculations)
// ============================================================

// Import the existing database query function
const { query } = require("../../config/database");

// Import the AcademicCalendar for pure-math period resolution
const { AcademicCalendar } = require("./AcademicCalendar");

// Import the logger for error tracking
const logger = require("../../utils/logger");

// ============================================================
// TimePeriodCalculator class — finds periods from dates
// ============================================================
class TimePeriodCalculator {
  /**
   * Find the academic period (period_id) for a given date.
   * Queries the academic_months table to find which period
   * contains the given date.
   *
   * @param {Date} date - The calendar date to resolve
   * @returns {Promise<Object|null>} The period row or null if not found
   */
  static async findPeriodForDate(date) {
    // SQL: find the period where the date falls between start and end
    const sql = `
      SELECT
        period_id,
        academic_year,
        semester,
        month_index,
        month_name,
        start_date,
        end_date,
        is_evaluation_month
      FROM academic_months
      WHERE start_date <= $1 AND end_date >= $1
      LIMIT 1
    `;

    // Execute the query with the date parameter
    const result = await query(sql, [date]);

    // Return the first matching period or null
    return result.rows[0] || null;
  }

  /**
   * Find the period by academic year, semester, and month index.
   * Used when you know the academic coordinates but need the period_id.
   *
   * @param {number} academicYear - e.g., 2026
   * @param {number} semester - 1 (Odd) or 2 (Even)
   * @param {number} monthIndex - 1 through 6
   * @returns {Promise<Object|null>} The period row or null
   */
  static async findPeriodByCoordinates(academicYear, semester, monthIndex) {
    // Query by the unique combination of year + semester + month_index
    const sql = `
      SELECT
        period_id,
        academic_year,
        semester,
        month_index,
        month_name,
        start_date,
        end_date,
        is_evaluation_month
      FROM academic_months
      WHERE academic_year = $1
        AND semester = $2
        AND month_index = $3
    `;

    // Execute with the three parameters
    const result = await query(sql, [academicYear, semester, monthIndex]);

    // Return the matching period or null
    return result.rows[0] || null;
  }

  /**
   * Get all periods for a complete semester.
   * Returns 6 rows (one per month) ordered by month_index.
   *
   * @param {number} academicYear - e.g., 2026
   * @param {number} semester - 1 (Odd) or 2 (Even)
   * @returns {Promise<Array>} Array of 6 period rows
   */
  static async getSemesterPeriods(academicYear, semester) {
    // Query all months for this semester, ordered by month_index
    const sql = `
      SELECT
        period_id,
        academic_year,
        semester,
        month_index,
        month_name,
        start_date,
        end_date,
        is_evaluation_month
      FROM academic_months
      WHERE academic_year = $1
        AND semester = $2
      ORDER BY month_index ASC
    `;

    // Execute and return all matching rows
    const result = await query(sql, [academicYear, semester]);

    // Return the array of period rows (should be 6)
    return result.rows;
  }

  /**
   * Resolve a date to its academic period, using AcademicCalendar
   * as a fallback if no database record exists yet.
   *
   * @param {Date} date - The date to resolve
   * @returns {Promise<Object>} Period info (from DB or calculated)
   */
  static async resolvePeriod(date) {
    // Try database lookup first
    const dbPeriod = await TimePeriodCalculator.findPeriodForDate(date);

    // If found in database, return it
    if (dbPeriod) {
      return dbPeriod;
    }

    // Fallback: calculate from AcademicCalendar pure math
    // This handles the case where academic_months hasn't been populated yet
    logger.warn("Period not found in database, using calculated fallback", {
      date: date.toISOString(),
    });

    // Calculate the academic period from the date
    const calculated = AcademicCalendar.getAcademicPeriod(date);

    // Return a structure compatible with the database row format
    return {
      period_id: null, // No database ID available
      academic_year: calculated.academicYear,
      semester: calculated.semester,
      month_index: calculated.monthIndex,
      month_name: calculated.monthName,
      start_date: null,
      end_date: null,
      is_evaluation_month: false,
      _calculated: true, // Flag to indicate this is a fallback
    };
  }

  /**
   * Seed the academic_months table for a given academic year.
   * Creates all 12 month records (6 per semester) if they don't exist.
   * Uses INSERT ... ON CONFLICT DO NOTHING for idempotent seeding.
   *
   * @param {number} academicYear - e.g., 2026
   * @returns {Promise<number>} Number of periods inserted (0-12)
   */
  static async seedAcademicYear(academicYear) {
    // Counter for newly inserted periods
    let insertedCount = 0;

    // Generate periods for both semesters
    for (const semester of [1, 2]) {
      // Use AcademicCalendar to generate the 6 month periods
      const periods = AcademicCalendar.generateSemesterPeriods(
        academicYear,
        semester,
      );

      // Insert each period into the database
      for (const period of periods) {
        // SQL with ON CONFLICT DO NOTHING for idempotent inserts
        const sql = `
          INSERT INTO academic_months (
            academic_year, semester, month_index, month_name,
            start_date, end_date, is_evaluation_month
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (academic_year, semester, month_index) DO NOTHING
          RETURNING period_id
        `;

        // Default: last month of each semester is evaluation month
        const isEvalMonth = period.monthIndex === 6;

        // Execute the insert
        const result = await query(sql, [
          academicYear, // $1: academic_year
          semester, // $2: semester
          period.monthIndex, // $3: month_index (1-6)
          period.monthName, // $4: month_name
          period.startDate, // $5: start_date
          period.endDate, // $6: end_date
          isEvalMonth, // $7: is_evaluation_month
        ]);

        // Count how many were actually inserted (vs skipped due to conflict)
        if (result.rows.length > 0) {
          insertedCount++;
        }
      }
    }

    // Log the result
    logger.info(
      `Seeded academic year ${academicYear}: ${insertedCount} periods created`,
    );

    // Return the count
    return insertedCount;
  }
}

// ============================================================
// Export TimePeriodCalculator class
// ============================================================
module.exports = TimePeriodCalculator;
