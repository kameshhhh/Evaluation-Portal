// ============================================================
// BATCH HELPER — Permanent Batch Year Utilities (Client)
// ============================================================
// Mirror of server/src/utils/batchHelper.js for frontend use.
//
// Batch year = graduation year = admission_year + 4
// Email: .mz23@ → admitted 2023 → graduates 2027 → batch_year = 2027
// NEVER changes across academic years.
// ============================================================

/**
 * Get the current academic year.
 * Academic year: June → May  (JS month 5+ = June+)
 */
export const getCurrentAcademicYear = () => {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
};

/**
 * Convert admission year → batch (graduation) year.
 * @param {number} admissionYear e.g. 2023
 * @returns {number|null} e.g. 2027
 */
export const admissionToBatch = (admissionYear) => {
  if (!admissionYear) return null;
  return Number(admissionYear) + 4;
};

/**
 * Convert batch year to current year-of-study label.
 * @param {number} batchYear e.g. 2027
 * @returns {string|null} "Final Year", "3rd Year", etc.
 */
export const getBatchYearLabel = (batchYear) => {
  if (!batchYear) return null;
  const ay = getCurrentAcademicYear();
  const remaining = Number(batchYear) - ay;
  if (remaining <= 0) return "Passed Out";
  if (remaining === 1) return "Final Year";
  if (remaining === 2) return "3rd Year";
  if (remaining === 3) return "2nd Year";
  if (remaining === 4) return "1st Year";
  return null;
};

/**
 * Get all currently active batches with labels + chip IDs.
 */
export const getActiveBatches = () => {
  const ay = getCurrentAcademicYear();
  return [
    { batchYear: ay + 1, label: "Final Year", chipId: "final" },
    { batchYear: ay + 2, label: "3rd Year", chipId: "3rd" },
    { batchYear: ay + 3, label: "2nd Year", chipId: "2nd" },
    { batchYear: ay + 4, label: "1st Year", chipId: "1st" },
  ];
};

/**
 * Format batch year for display: "Batch 2027 (Final Year)"
 */
export const formatBatch = (batchYear) => {
  if (!batchYear) return "Unknown";
  const label = getBatchYearLabel(batchYear);
  return label ? `Batch ${batchYear} (${label})` : `Batch ${batchYear}`;
};

/**
 * Convert year label → batch year (relative to current academic year).
 * Backward compat with old "Final Year" style labels.
 */
export const yearLabelToBatch = (yearLabel, academicYear) => {
  const ay = academicYear || getCurrentAcademicYear();
  const map = {
    "Final Year": ay + 1,
    "3rd Year": ay + 2,
    "2nd Year": ay + 3,
    "1st Year": ay + 4,
  };
  return map[yearLabel] || null;
};
