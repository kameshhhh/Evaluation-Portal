// ============================================================
// BATCH HELPER — Permanent Batch Year Utilities (Server)
// ============================================================
// Batch year = graduation year = admission_year + 4
// Email suffix: .mz23@ → admitted 2023 → graduates 2027 → batch_year = 2027
//
// NEVER changes. Unlike "Final Year" / "3rd Year" labels which shift
// every academic year, batch_year is permanent and unambiguous.
//
// Academic year boundary: June (month index 5+) → current calendar year
//                         Jan–May              → previous calendar year
// ============================================================

"use strict";

/**
 * Get the current academic year.
 * Academic year runs June → May.
 *   June 2026 → academic year 2026
 *   March 2026 → academic year 2025
 */
function getCurrentAcademicYear() {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Convert admission year to batch (graduation) year.
 * 4-year degree: batch = admission + 4
 * @param {number} admissionYear e.g. 2023
 * @returns {number|null} e.g. 2027
 */
function admissionToBatch(admissionYear) {
  if (!admissionYear) return null;
  return Number(admissionYear) + 4;
}

/**
 * Convert batch year to the current year-of-study label.
 * Dynamically computed from the current academic year.
 *
 * @param {number} batchYear e.g. 2027
 * @returns {string|null} e.g. "3rd Year", "Final Year", "Passed Out"
 */
function batchToYearLabel(batchYear) {
  if (!batchYear) return null;
  const academicYear = getCurrentAcademicYear();
  const remaining = Number(batchYear) - academicYear;
  if (remaining <= 0) return "Passed Out";
  if (remaining === 1) return "Final Year";
  if (remaining === 2) return "3rd Year";
  if (remaining === 3) return "2nd Year";
  if (remaining === 4) return "1st Year";
  return `Pre-admit (${remaining}yr)`;
}

/**
 * Get all currently active batches with labels.
 * Returns 4 entries: Final Year → 1st Year
 */
function getActiveBatches() {
  const ay = getCurrentAcademicYear();
  return [
    { batchYear: ay + 1, label: "Final Year" },
    { batchYear: ay + 2, label: "3rd Year" },
    { batchYear: ay + 3, label: "2nd Year" },
    { batchYear: ay + 4, label: "1st Year" },
  ];
}

/**
 * Extract batch year from a BITSathy email address.
 * Pattern: name.dept_code+2digit_year@bitsathy.ac.in
 * e.g. "kavin.mz23@bitsathy.ac.in" → 2027
 *
 * @param {string} email
 * @returns {number|null} batch year
 */
function extractBatchFromEmail(email) {
  if (!email) return null;
  const match = email.match(/\.([a-z]{2})(\d{2})@/i);
  if (!match) return null;
  const admissionYear = 2000 + parseInt(match[2], 10);
  return admissionYear + 4;
}

/**
 * Convert a year label string back to a batch year
 * (relative to current academic year).
 * Used for backward compat with old "Final Year" style data.
 *
 * @param {string} yearLabel e.g. "Final Year"
 * @param {number} [academicYear] defaults to current
 * @returns {number|null}
 */
function yearLabelToBatch(yearLabel, academicYear) {
  const ay = academicYear || getCurrentAcademicYear();
  const map = {
    "Final Year": ay + 1,
    "3rd Year": ay + 2,
    "2nd Year": ay + 3,
    "1st Year": ay + 4,
  };
  return map[yearLabel] || null;
}

/**
 * Format a batch year for display.
 * e.g. 2027 → "Batch 2027 (Final Year)"
 */
function formatBatch(batchYear) {
  if (!batchYear) return "Unknown";
  const label = batchToYearLabel(batchYear);
  return label ? `Batch ${batchYear} (${label})` : `Batch ${batchYear}`;
}

module.exports = {
  getCurrentAcademicYear,
  admissionToBatch,
  batchToYearLabel,
  getActiveBatches,
  extractBatchFromEmail,
  yearLabelToBatch,
  formatBatch,
};
