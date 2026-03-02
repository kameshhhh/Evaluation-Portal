// ============================================================
// DEPARTMENT REGISTRY — PURE LOOKUP MODULE
// ============================================================
// Wraps the canonical department configuration with pure lookup
// functions. Every function here is:
//   - Stateless (no internal mutable state)
//   - Deterministic (same input → same output, always)
//   - Side-effect free (no DB, no I/O, no logging)
//   - Testable in isolation (zero mocks required)
//
// WHY THIS EXISTS SEPARATELY FROM departments.js CONFIG:
//   departments.js is raw data (the registry).
//   This module is behavior (validation, lookup, listing).
//   Separating data from behavior follows SRP.
//
// CONSUMERS:
//   - AcademicIdentityParser.js → validates parsed email codes
//   - AcademicProfileBuilder.js → enriches profiles with dept names
//   - PersonProfileLinker.js → validates before DB storage
//   - DashboardBuilder.js → maps codes to display names
//   - Admin APIs → populates department dropdowns
//
// SECURITY:
//   All returned objects are frozen to prevent downstream mutation.
//   The registry itself is frozen at the config level.
// ============================================================

// Import the canonical department data from config
// This is the single source of truth for all department mappings
const { DEPARTMENT_REGISTRY } = require("../../../config/departments");

// ============================================================
// VALIDATE DEPARTMENT CODE EXISTS IN REGISTRY
// ============================================================
/**
 * Check if a 2-letter email department code is recognized.
 *
 * Used before any academic inference is committed to the database.
 * Prevents typos, deprecated codes, or malicious input from
 * creating invalid department associations.
 *
 * @param {string} emailCode - 2-letter code extracted from email (e.g., 'mz', 'cs')
 * @returns {boolean} True if code exists in the canonical registry
 *
 * @example
 *   isValidDepartmentCode('mz') // true  → Mechatronics
 *   isValidDepartmentCode('cs') // true  → Computer Science
 *   isValidDepartmentCode('xx') // false → Unknown code
 *   isValidDepartmentCode('')   // false → Empty string
 *   isValidDepartmentCode(null) // false → Null input
 *
 * Performance: O(1) hash map lookup — safe for hot paths
 */
function isValidDepartmentCode(emailCode) {
  // Guard against null/undefined/non-string inputs
  // Defensive coding: callers may pass unexpected types
  if (!emailCode || typeof emailCode !== "string") {
    return false; // Invalid input type → not a valid code
  }

  // Normalize to lowercase for case-insensitive matching
  // Email codes are always lowercase but manual input may vary
  const normalizedCode = emailCode.toLowerCase().trim();

  // Check if the normalized code exists as a key in the registry
  // Object.prototype.hasOwnProperty prevents prototype chain issues
  return Object.prototype.hasOwnProperty.call(
    DEPARTMENT_REGISTRY,
    normalizedCode,
  );
}

// ============================================================
// GET CANONICAL DEPARTMENT INFORMATION
// ============================================================
/**
 * Look up the official department metadata for an email code.
 *
 * Returns the canonical representation that should be used in:
 *   - Database storage (code field)
 *   - Analytics queries (grouping, filtering)
 *   - UI display (name field)
 *   - Cross-department comparisons (category field)
 *
 * Returns null for unknown codes — forces explicit error handling.
 * NEVER falls back to defaults. Unknown = null = caller decides.
 *
 * @param {string} emailCode - 2-letter code from email (e.g., 'mz', 'cs')
 * @returns {{code: string, name: string, category: string} | null}
 *   Frozen object with official code, name, category or null
 *
 * @example
 *   getCanonicalDepartment('mz')
 *   // → { code: 'MZ', name: 'Mechatronics Engineering', category: 'engineering' }
 *
 *   getCanonicalDepartment('xx')
 *   // → null (unknown code, caller must handle)
 *
 * Security: Returned object is frozen — downstream cannot mutate it
 */
function getCanonicalDepartment(emailCode) {
  // Guard against null/undefined/non-string inputs
  if (!emailCode || typeof emailCode !== "string") {
    return null; // Cannot look up non-string input
  }

  // Normalize the input code to lowercase for registry lookup
  const normalizedCode = emailCode.toLowerCase().trim();

  // Validate the code exists before returning
  // This prevents returning undefined accidentally
  if (!isValidDepartmentCode(normalizedCode)) {
    return null; // Unknown code — return null, never guess
  }

  // Return a frozen shallow copy to prevent mutation
  // The original registry entry stays immutable regardless
  return Object.freeze({ ...DEPARTMENT_REGISTRY[normalizedCode] });
}

// ============================================================
// GET ALL DEPARTMENT CODES FOR VALIDATION LISTS
// ============================================================
/**
 * Return all official department codes as a sorted array.
 *
 * Used by:
 *   - Frontend dropdown menus (admin panel department selector)
 *   - API input validation (reject if input code not in list)
 *   - Import scripts (validate CSV/Excel department column)
 *   - DefaultDashboard profile completion form
 *
 * Returns official uppercase codes (MZ, CS, IT), not email codes (mz, cs, it).
 * Sorted alphabetically for consistent UI display.
 *
 * @returns {string[]} Array of official uppercase department codes
 *
 * @example
 *   getAllDepartmentCodes()
 *   // → ['AD', 'AG', 'AL', 'BM', 'BT', 'CB', 'CD', 'CE', 'CS', ...]
 */
function getAllDepartmentCodes() {
  // Extract the official 'code' field from every registry entry
  // Object.values gives us all department objects
  // .map extracts just the 'code' field from each
  return Object.values(DEPARTMENT_REGISTRY)
    .map((dept) => dept.code) // Extract official codes
    .sort(); // Sort alphabetically for deterministic output
}

// ============================================================
// GET ALL DEPARTMENTS WITH FULL METADATA
// ============================================================
/**
 * Return all departments as an array of frozen metadata objects.
 *
 * Used by admin dashboards and analytics systems that need
 * both the code and the full name/category for display.
 *
 * @returns {Array<{code: string, name: string, category: string}>}
 *   Frozen array of department objects sorted by code
 *
 * @example
 *   getAllDepartments()
 *   // → [
 *   //   { code: 'AD', name: 'AI & Data Science', category: 'engineering' },
 *   //   { code: 'AG', name: 'Agricultural Engineering', category: 'engineering' },
 *   //   ...
 *   // ]
 */
function getAllDepartments() {
  // Map each registry entry to a frozen copy, sorted by code
  return Object.values(DEPARTMENT_REGISTRY)
    .map((dept) => Object.freeze({ ...dept })) // Frozen copies
    .sort((a, b) => a.code.localeCompare(b.code)); // Alphabetical
}

// ============================================================
// GET DEPARTMENTS BY CATEGORY
// ============================================================
/**
 * Filter departments by their category grouping.
 *
 * Categories: 'engineering', 'technology', 'science', 'interdisciplinary'
 * Used by analytics systems for cross-category comparisons.
 *
 * @param {string} category - Department category to filter by
 * @returns {Array<{code: string, name: string, category: string}>}
 *   Filtered array of departments in the given category
 *
 * @example
 *   getDepartmentsByCategory('technology')
 *   // → [{ code: 'CT', ... }, { code: 'FD', ... }, { code: 'FT', ... }, { code: 'TX', ... }]
 */
function getDepartmentsByCategory(category) {
  // Guard against invalid input
  if (!category || typeof category !== "string") {
    return []; // No category → empty result
  }

  // Normalize category to lowercase for consistent matching
  const normalizedCategory = category.toLowerCase().trim();

  // Filter entries whose category matches, return frozen copies
  return Object.values(DEPARTMENT_REGISTRY)
    .filter((dept) => dept.category === normalizedCategory) // Filter by category
    .map((dept) => Object.freeze({ ...dept })) // Frozen copies
    .sort((a, b) => a.code.localeCompare(b.code)); // Alphabetical
}

// ============================================================
// REVERSE LOOKUP: Official Code → Email Code
// ============================================================
/**
 * Given an official code (e.g., 'MZ'), find the email code ('mz').
 *
 * Used when constructing expected email patterns from DB data.
 * Returns null if the official code isn't recognized.
 *
 * @param {string} officialCode - Uppercase official code (e.g., 'CS')
 * @returns {string | null} Lowercase email code or null
 *
 * @example
 *   getEmailCodeFromOfficial('CS') // → 'cs'
 *   getEmailCodeFromOfficial('XX') // → null
 */
function getEmailCodeFromOfficial(officialCode) {
  // Guard against invalid input
  if (!officialCode || typeof officialCode !== "string") {
    return null; // Invalid input
  }

  // Search through registry entries for matching official code
  // The registry is keyed by email code, so we need to search values
  const upperCode = officialCode.toUpperCase().trim();

  // Find the email code (key) whose value has a matching official code
  for (const [emailCode, dept] of Object.entries(DEPARTMENT_REGISTRY)) {
    if (dept.code === upperCode) {
      return emailCode; // Return the email code key
    }
  }

  return null; // Official code not found in registry
}

// ============================================================
// EXPORT — All pure functions for external consumption
// ============================================================
module.exports = {
  isValidDepartmentCode, // Validate a 2-letter email code
  getCanonicalDepartment, // Look up full dept info by email code
  getAllDepartmentCodes, // List all official codes (for dropdowns)
  getAllDepartments, // List all depts with full metadata
  getDepartmentsByCategory, // Filter depts by category
  getEmailCodeFromOfficial, // Reverse lookup: official → email code
  DEPARTMENT_REGISTRY, // Raw registry (for advanced use cases)
};
