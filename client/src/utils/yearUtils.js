/**
 * Shared academic-year utilities (batch-year aware).
 *
 * Academic year runs June → May.
 *   - Month >= 6 (June)  → academicYear = currentCalendarYear
 *   - Month <  6 (Jan-May) → academicYear = currentCalendarYear - 1
 *
 * BATCH YEAR (= graduation year) is the PERMANENT student identifier.
 *   batch_year = admission_year + 4   (4-year degree)
 *   Email .mz23@ → admitted 2023 → batch_year 2027  NEVER changes.
 *
 * Year label is computed dynamically:
 *   remaining = batch_year − current_academic_year
 *   1 → "Final Year", 2 → "3rd Year", 3 → "2nd Year", 4 → "1st Year"
 */

import { getCurrentAcademicYear, admissionToBatch, getBatchYearLabel } from "./batchHelper";

// Re-export batch helpers so existing imports keep working
export {
  getCurrentAcademicYear,
  admissionToBatch,
  getBatchYearLabel,
  getActiveBatches,
  formatBatch,
  yearLabelToBatch,
} from "./batchHelper";

/**
 * Convert an admission year (e.g. 2023) into the current year-of-study label.
 * Now delegates to batch logic: admission → batch → label.
 * Returns null when admissionYear is falsy.
 */
export const getYearLabel = (admissionYear) => {
  if (!admissionYear) return null;
  return getBatchYearLabel(admissionToBatch(admissionYear));
};

/** Numeric year-of-study (1-4+). Returns null on invalid input. */
export const getYearOfStudy = (admissionYear) => {
  if (!admissionYear) return null;

  const academicYear = getCurrentAcademicYear();
  const y = academicYear - Number(admissionYear) + 1;
  return y >= 1 ? y : null;
};

/**
 * Filter chips for year dropdowns / filter bars.
 * matchYear works with yearOfStudy (numeric) AND matchBatch works with batch_year.
 */
export const YEAR_CHIPS = [
  { id: "all",   label: "All Years",  color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
  { id: "final", label: "Final Year", color: "#DC2626", bg: "rgba(220,38,38,0.08)",  matchYear: (y) => y >= 4, matchBatch: (b) => { const r = b - getCurrentAcademicYear(); return r === 1; } },
  { id: "3rd",   label: "3rd Year",   color: "#7C3AED", bg: "rgba(124,58,237,0.08)", matchYear: (y) => y === 3, matchBatch: (b) => { const r = b - getCurrentAcademicYear(); return r === 2; } },
  { id: "2nd",   label: "2nd Year",   color: "#2563EB", bg: "rgba(37,99,235,0.08)",  matchYear: (y) => y === 2, matchBatch: (b) => { const r = b - getCurrentAcademicYear(); return r === 3; } },
  { id: "1st",   label: "1st Year",   color: "#059669", bg: "rgba(5,150,105,0.08)",  matchYear: (y) => y === 1, matchBatch: (b) => { const r = b - getCurrentAcademicYear(); return r === 4; } },
];

/** Badge colours keyed by year label */
export const YEAR_BADGE_COLORS = {
  "Final Year":  { color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
  "3rd Year":    { color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
  "2nd Year":    { color: "#2563EB", bg: "rgba(37,99,235,0.08)" },
  "1st Year":    { color: "#059669", bg: "rgba(5,150,105,0.08)" },
  "Passed Out":  { color: "#9CA3AF", bg: "rgba(156,163,175,0.08)" },
};
