// ============================================================
// DEPARTMENT CONFIGURATION — SINGLE SOURCE OF TRUTH
// ============================================================
// This file exports the canonical department registry for
// Bannari Amman Institute of Technology (Bitsathy).
//
// WHY A SEPARATE CONFIG FILE:
//   The academic/ modules are pure functions that should not own
//   configuration data. This config file is the authoritative
//   source that academic modules import read-only.
//
// USAGE:
//   const { DEPARTMENT_REGISTRY } = require("../config/departments");
//
// CHANGE POLICY:
//   Changes to this file require admin approval.
//   Any new department must be added here FIRST before the
//   email-based parser can auto-detect it.
//
// FORMAT PER ENTRY:
//   emailCode → { code, name, category }
//   - emailCode: The 2-letter lowercase code found in student emails
//   - code: Official uppercase department code for storage/display
//   - name: Official full department name for display
//   - category: Grouping for analytics (engineering/technology/science/interdisciplinary)
// ============================================================

// ============================================================
// CANONICAL DEPARTMENT MAPPING
// ============================================================
// Derived from Bitsathy college ERP system.
// Student emails follow: {name}.{deptCode}{yearDigits}@bitsathy.ac.in
// Example: kamesh.mz23@bitsathy.ac.in → emailCode='mz', year=23
// This registry maps emailCode → official department metadata.
// ============================================================
const DEPARTMENT_REGISTRY = Object.freeze({
  // ---------------------------------------------------------
  // Engineering Departments (Primary)
  // These are the core four-year B.E./B.Tech programs
  // ---------------------------------------------------------
  mz: Object.freeze({
    code: "MZ",
    name: "Mechatronics Engineering",
    category: "engineering",
  }),
  me: Object.freeze({
    code: "ME",
    name: "Mechanical Engineering",
    category: "engineering",
  }),
  cs: Object.freeze({
    code: "CS",
    name: "Computer Science Engineering",
    category: "engineering",
  }),
  ec: Object.freeze({
    code: "EC",
    name: "Electronics & Communication Engineering",
    category: "engineering",
  }),
  ee: Object.freeze({
    code: "EE",
    name: "Electrical & Electronics Engineering",
    category: "engineering",
  }),
  ce: Object.freeze({
    code: "CE",
    name: "Civil Engineering",
    category: "engineering",
  }),
  it: Object.freeze({
    code: "IT",
    name: "Information Technology",
    category: "engineering",
  }),
  ad: Object.freeze({
    code: "AD",
    name: "AI & Data Science",
    category: "engineering",
  }),

  // ---------------------------------------------------------
  // Technology Departments
  // Specialized technology programs with industry focus
  // ---------------------------------------------------------
  ct: Object.freeze({
    code: "CT",
    name: "Computer Technology",
    category: "technology",
  }),
  tx: Object.freeze({
    code: "TX",
    name: "Textile Technology",
    category: "technology",
  }),
  ft: Object.freeze({
    code: "FT",
    name: "Fashion Technology",
    category: "technology",
  }),
  fd: Object.freeze({
    code: "FD",
    name: "Food Technology",
    category: "technology",
  }),

  // ---------------------------------------------------------
  // Special Programs
  // Interdisciplinary and science-focused programs
  // ---------------------------------------------------------
  bt: Object.freeze({ code: "BT", name: "Biotechnology", category: "science" }),
  bm: Object.freeze({
    code: "BM",
    name: "Biomedical Engineering",
    category: "interdisciplinary",
  }),
  cb: Object.freeze({
    code: "CB",
    name: "CS & Business Systems",
    category: "interdisciplinary",
  }),
  cd: Object.freeze({
    code: "CD",
    name: "CS & Design",
    category: "interdisciplinary",
  }),

  // ---------------------------------------------------------
  // Legacy Codes (still active in the system)
  // These departments may have changed names but codes persist
  // ---------------------------------------------------------
  ag: Object.freeze({
    code: "AG",
    name: "Agricultural Engineering",
    category: "engineering",
  }),
  al: Object.freeze({
    code: "AL",
    name: "AI & Machine Learning",
    category: "engineering",
  }),
  ei: Object.freeze({
    code: "EI",
    name: "Electronics & Instrumentation Engineering",
    category: "engineering",
  }),
  se: Object.freeze({
    code: "SE",
    name: "Information Science & Engineering",
    category: "engineering",
  }),
});

// ============================================================
// EXPORT — Frozen registry object
// Consumers can read but never mutate this data
// ============================================================
module.exports = { DEPARTMENT_REGISTRY };
