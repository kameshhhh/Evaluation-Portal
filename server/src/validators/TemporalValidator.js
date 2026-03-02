// ============================================================
// TEMPORAL VALIDATOR — Time-Based Business Rule Enforcement
// ============================================================
// Validates all time-related constraints in the PEMM module:
//
//   - Can't submit work logs for future months
//   - Can't modify frozen periods
//   - Plans must be for valid academic periods
//   - Work log hours must be reasonable (0-200 per month)
//   - Projects can't span more than 18 months
//
// Works in conjunction with:
//   - AcademicCalendar (date calculations)
//   - TimePeriodCalculator (DB-backed period resolution)
//   - FreezeGuard middleware (HTTP-level blocking)
//
// This validator is PURE LOGIC — no database calls.
// Database-dependent checks live in TimePeriodCalculator.
// ============================================================

// Import custom errors for temporal violations
const {
  TemporalValidationError,
  PeriodFrozenError,
} = require("../entities/EntityErrors");

// Import AcademicCalendar for date calculations
const { AcademicCalendar } = require("../lib/temporal/AcademicCalendar");

// ============================================================
// TemporalValidator class — pure temporal validation logic
// ============================================================
class TemporalValidator {
  /**
   * Validate that a date is not in the future.
   * Work logs and plans cannot be submitted for future months.
   *
   * @param {Date} date - The date to check
   * @param {string} context - What is being validated (for error message)
   * @throws {TemporalValidationError} If the date is in the future
   */
  static validateNotFuture(date, context = "date") {
    // Current moment
    const now = new Date();

    // If the date is after now, it's a future date — not allowed
    if (date > now) {
      throw new TemporalValidationError(
        `${context} cannot be in the future. Provided: ${date.toISOString()}, Current: ${now.toISOString()}`,
        { provided: date.toISOString(), current: now.toISOString() },
      );
    }

    return true;
  }

  /**
   * Validate that a work log is not for a frozen period.
   * Once a period is frozen (is_frozen = true on work_log row),
   * no modifications are allowed.
   *
   * @param {Object} workLog - The work log record with is_frozen flag
   * @throws {PeriodFrozenError} If the work log period is frozen
   */
  static validateNotFrozen(workLog) {
    // Check the frozen flag
    if (workLog && workLog.is_frozen) {
      throw new PeriodFrozenError(
        `Work log for project ${workLog.project_id || workLog.projectId} ` +
          `in period ${workLog.period_id || workLog.periodId} is frozen and cannot be modified`,
        { frozenAt: workLog.frozen_at || workLog.frozenAt },
      );
    }

    return true;
  }

  /**
   * Validate that a project's date range is reasonable.
   * Projects cannot span more than 18 months.
   *
   * @param {Date} startDate - Project start date
   * @param {Date} endDate - Project expected end date
   * @throws {TemporalValidationError} If dates are invalid
   */
  static validateProjectDates(startDate, endDate) {
    // Start date must exist
    if (!startDate) {
      throw new TemporalValidationError("Project start date is required", {
        field: "startDate",
      });
    }

    // End date must exist
    if (!endDate) {
      throw new TemporalValidationError(
        "Project expected end date is required",
        { field: "expectedEndDate" },
      );
    }

    // Convert to Date objects if they're strings
    const start = new Date(startDate);
    const end = new Date(endDate);

    // End must be after start
    if (end <= start) {
      throw new TemporalValidationError(
        "Expected end date must be after start date",
        { startDate: start.toISOString(), endDate: end.toISOString() },
      );
    }

    // Maximum duration: 18 months (548 days approximately)
    const maxDurationMs = 18 * 30 * 24 * 60 * 60 * 1000;
    const durationMs = end.getTime() - start.getTime();

    if (durationMs > maxDurationMs) {
      throw new TemporalValidationError(
        "Project duration cannot exceed 18 months",
        {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          durationDays: Math.round(durationMs / (24 * 60 * 60 * 1000)),
          maxDays: 548,
        },
      );
    }

    return true;
  }

  /**
   * Validate that work log hours are reasonable.
   * 0-200 hours per person per month (matches DB CHECK constraint).
   *
   * @param {number} hours - Hours spent
   * @throws {TemporalValidationError} If hours are out of range
   */
  static validateWorkHours(hours) {
    // Must be a number
    if (typeof hours !== "number" || isNaN(hours)) {
      throw new TemporalValidationError("Work hours must be a valid number", {
        provided: hours,
      });
    }

    // Must be non-negative
    if (hours < 0) {
      throw new TemporalValidationError("Work hours cannot be negative", {
        provided: hours,
        min: 0,
      });
    }

    // Must not exceed 200 (matches DB constraint)
    if (hours > 200) {
      throw new TemporalValidationError(
        "Work hours cannot exceed 200 per month",
        { provided: hours, max: 200 },
      );
    }

    return true;
  }

  /**
   * Validate that a submission is within an evaluation window.
   * Used when creating evaluation scores.
   *
   * @param {Date} now - Current timestamp
   * @param {{ evaluation_window_start: Date, evaluation_window_end: Date }} session
   * @throws {TemporalValidationError} If outside the evaluation window
   */
  static validateEvaluationWindow(now, session) {
    // Convert string dates if needed
    const windowStart = new Date(session.evaluation_window_start);
    const windowEnd = new Date(session.evaluation_window_end);
    const current = now || new Date();

    // Check if we're before the window
    if (current < windowStart) {
      throw new TemporalValidationError(
        "Evaluation window has not opened yet",
        {
          windowStart: windowStart.toISOString(),
          current: current.toISOString(),
        },
      );
    }

    // Check if we're after the window
    if (current > windowEnd) {
      throw new TemporalValidationError("Evaluation window has closed", {
        windowEnd: windowEnd.toISOString(),
        current: current.toISOString(),
      });
    }

    return true;
  }

  /**
   * Validate an academic year value is reasonable.
   * Must be between 2000 and 2100.
   *
   * @param {number} academicYear - The academic year to validate
   * @throws {TemporalValidationError} If year is out of range
   */
  static validateAcademicYear(academicYear) {
    // Must be an integer
    if (!Number.isInteger(academicYear)) {
      throw new TemporalValidationError("Academic year must be an integer", {
        provided: academicYear,
      });
    }

    // Must be in reasonable range
    if (academicYear < 2000 || academicYear > 2100) {
      throw new TemporalValidationError(
        "Academic year must be between 2000 and 2100",
        { provided: academicYear, min: 2000, max: 2100 },
      );
    }

    return true;
  }

  /**
   * Validate semester value (must be 1 or 2).
   *
   * @param {number} semester - 1 (Odd) or 2 (Even)
   * @throws {TemporalValidationError} If semester is invalid
   */
  static validateSemester(semester) {
    if (semester !== 1 && semester !== 2) {
      throw new TemporalValidationError(
        "Semester must be 1 (Odd) or 2 (Even)",
        { provided: semester },
      );
    }

    return true;
  }
}

// ============================================================
// Export TemporalValidator class
// ============================================================
module.exports = { TemporalValidator };
