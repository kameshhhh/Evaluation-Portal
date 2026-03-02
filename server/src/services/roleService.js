// ============================================================
// ROLE SERVICE — Role Resolution & Assignment
// ============================================================
// Determines the user's role based on a multi-source resolution chain:
// 1. Existing database role (if user has been manually assigned)
// 2. Email pattern matching against role_patterns table
// 3. Default role ('pending') if no patterns match
// Role resolution is performed on EVERY login to detect changes.
// ============================================================

// Import the database query function for pattern lookups
const { query } = require("../config/database");

// Import logger for role resolution tracking
const logger = require("../utils/logger");

// ============================================================
// Default role for users that don't match any pattern
// 'pending' means the user is authenticated but not yet assigned
// An admin must manually assign a role or add a matching pattern
// ============================================================
const DEFAULT_ROLE = "pending";

// ============================================================
// SYSTEM ADMIN EMAILS — Priority 0 in role resolution
// These emails are granted 'admin' role unconditionally.
// Admin emails also bypass domain validation during login.
// SECURITY: This list is frozen and immutable at runtime.
// ONLY exact canonical matches are accepted — no aliases,
// no dot-tricks, no plus-addressing, no Unicode homoglyphs.
// ============================================================
const ADMIN_EMAILS = Object.freeze(["kameshdurai205@gmail.com"]);

// ============================================================
// FACULTY EMAILS — Priority 0.5 in role resolution
// These emails are granted 'faculty' role unconditionally
// and bypass the bitsathy domain restriction.
// To revert: remove the email from this list.
// ============================================================
const FACULTY_EMAILS = Object.freeze(["kameshstu@gmail.com"]);

// ============================================================
// STRICT GMAIL CANONICALIZATION
// Gmail ignores dots in local part and everything after +
// e.g., k.amesh.durai205+admin@gmail.com → kameshdurai205@gmail.com
// We canonicalize BEFORE comparing to block all alias tricks.
// ============================================================

/**
 * Canonicalize a Gmail address to its true form.
 * Strips dots from local part and removes +alias suffix.
 * For non-Gmail addresses, returns lowercase trimmed email.
 *
 * @param {string} email - Email to canonicalize
 * @returns {string} Canonical email form
 */
const canonicalizeEmail = (email) => {
  if (!email || typeof email !== "string") return "";

  // Strict: only allow ASCII printable characters (block Unicode homoglyphs)
  // This prevents lookalike characters (Cyrillic а vs Latin a, etc.)
  if (!/^[\x20-\x7E]+$/.test(email)) return "";

  const normalized = email.toLowerCase().trim();
  const atIndex = normalized.indexOf("@");
  if (atIndex === -1) return "";

  let localPart = normalized.substring(0, atIndex);
  const domain = normalized.substring(atIndex + 1);

  // Gmail-specific canonicalization (gmail.com and googlemail.com)
  if (domain === "gmail.com" || domain === "googlemail.com") {
    // Remove everything after + (plus-addressing alias)
    const plusIndex = localPart.indexOf("+");
    if (plusIndex !== -1) {
      localPart = localPart.substring(0, plusIndex);
    }
    // Remove all dots from local part (Gmail ignores dots)
    localPart = localPart.replace(/\./g, "");
    // Normalize googlemail.com → gmail.com
    return `${localPart}@gmail.com`;
  }

  return `${localPart}@${domain}`;
};

/**
 * Check if an email is in the system admin list.
 * Uses strict canonical comparison to block ALL alias tricks.
 * Used by authService to bypass domain validation for admins.
 *
 * SECURITY GUARANTEES:
 * - Gmail dot-trick blocked (k.ameshdurai205@gmail.com → no match)
 * - Gmail plus-alias blocked (kameshdurai205+admin@gmail.com → no match)
 * - Unicode homoglyphs blocked (non-ASCII → rejected)
 * - googlemail.com normalized to gmail.com
 * - Case-insensitive (already lowercased)
 * - Empty/null input returns false
 *
 * @param {string} email - Normalized email to check
 * @returns {boolean} True if the email belongs to a system admin
 */
const isAdminEmail = (email) => {
  if (!email || typeof email !== "string") return false;

  // Canonicalize the input email (strips dots, +aliases, Unicode)
  const canonicalInput = canonicalizeEmail(email);
  if (!canonicalInput) return false;

  // Compare against each admin email's canonical form
  // Both sides are canonicalized for a guaranteed exact match
  return ADMIN_EMAILS.some(
    (adminEmail) => canonicalizeEmail(adminEmail) === canonicalInput,
  );
};

/**
 * Check if an email is in the faculty whitelist.
 * Uses strict canonical Gmail comparison (same security as isAdminEmail).
 * To revert: remove the email from FACULTY_EMAILS above.
 *
 * @param {string} email - Email to check
 * @returns {boolean} True if the email is a whitelisted faculty
 */
const isFacultyEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const canonicalInput = canonicalizeEmail(email);
  if (!canonicalInput) return false;
  return FACULTY_EMAILS.some(
    (facultyEmail) => canonicalizeEmail(facultyEmail) === canonicalInput,
  );
};

// ============================================================
// Resolve a user's role based on the priority chain:
// Priority 1: Admin-assigned role (not 'pending') — highest authority
// Priority 2: Email pattern match from role_patterns table
// Priority 3: Default role ('pending') — lowest priority
// ============================================================

/**
 * Resolve the appropriate role for a user based on their email.
 * Checks admin overrides, pattern matching, then falls back to default.
 *
 * @param {string} normalizedEmail - The user's normalized email address
 * @param {string} currentRole - The user's current role from the database
 * @returns {Promise<string>} The resolved role for this login session
 */
const resolveUserRole = async (normalizedEmail, currentRole) => {
  // ============================================================
  // PRIORITY 0: System admin email list (highest authority)
  // These emails always resolve to 'admin' regardless of any
  // database role or pattern match. This cannot be overridden.
  // ============================================================
  if (isAdminEmail(normalizedEmail)) {
    logger.info("Role resolved from system admin email list", {
      role: "admin",
    });
    return "admin";
  }

  // ============================================================
  // PRIORITY 0.5: Faculty whitelist
  // These gmail addresses are granted 'faculty' unconditionally.
  // To revert: remove the email from FACULTY_EMAILS.
  // ============================================================
  if (isFacultyEmail(normalizedEmail)) {
    logger.info("Role resolved from faculty whitelist", { role: "faculty" });
    return "faculty";
  }

  // ============================================================
  // PRIORITY 1: Check if an admin has explicitly assigned a role
  // If user_role is anything other than 'pending', it means an admin
  // or a previous pattern match has set a specific role
  // Admin-assigned roles take precedence over pattern matching
  // ============================================================
  if (currentRole && currentRole !== DEFAULT_ROLE) {
    logger.debug("Role resolved from existing assignment", {
      role: currentRole,
    });
    return currentRole;
  }

  // ============================================================
  // PRIORITY 2: Match email against role_patterns table
  // Patterns use SQL LIKE syntax — e.g., '%.student@bitsathy.ac.in'
  // Patterns are ordered by priority (lower number = higher priority)
  // Only active patterns are considered
  // ============================================================
  try {
    const result = await query(
      `SELECT assigned_role FROM role_patterns 
       WHERE is_active = true AND $1 LIKE email_pattern 
       ORDER BY priority ASC 
       LIMIT 1`,
      [normalizedEmail],
    );

    // If a matching pattern is found, use its assigned role
    if (result.rows.length > 0) {
      const matchedRole = result.rows[0].assigned_role;

      logger.info("Role resolved from pattern match", {
        role: matchedRole,
      });

      return matchedRole;
    }
  } catch (error) {
    // Pattern matching failure should not block login
    // Log the error and fall through to default role
    logger.error("Role pattern matching failed", {
      error: error.message,
    });
  }

  // ============================================================
  // PRIORITY 3: No admin assignment, no pattern match — use default
  // The user will see a 'pending' status until an admin assigns a role
  // or a matching pattern is added to the role_patterns table
  // ============================================================
  logger.debug("Role resolved to default", {
    role: DEFAULT_ROLE,
  });

  return DEFAULT_ROLE;
};

// ============================================================
// Get all active role patterns for admin management
// Returns the full pattern list ordered by priority
// Used in the admin dashboard for role configuration
// ============================================================

/**
 * Get all role patterns, ordered by priority.
 *
 * @returns {Promise<Object[]>} Array of role pattern records
 */
const getAllPatterns = async () => {
  const result = await query(
    `SELECT pattern_id, email_pattern, assigned_role, priority, is_active 
     FROM role_patterns 
     ORDER BY priority ASC, email_pattern ASC`,
  );

  return result.rows;
};

// ============================================================
// Export role service functions
// resolveUserRole: Used in authService.js during login pipeline
// getAllPatterns: Used in userController.js for admin management
// ============================================================
module.exports = {
  resolveUserRole,
  getAllPatterns,
  isAdminEmail,
  isFacultyEmail,
  DEFAULT_ROLE,
};
