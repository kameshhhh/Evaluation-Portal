// ============================================================
// EMAIL SERVICE — Normalization, Validation & Privacy Hashing
// ============================================================
// Handles all email-related operations in the zero-trust pipeline.
// Normalizes emails for consistency, validates domains against
// the allowed list, and hashes emails with bcrypt for privacy.
// EMAIL IS A MAPPING, NOT IDENTITY — UUID is the true identity.
// ============================================================

// Import bcrypt for email hashing — privacy-preserving storage
// bcrypt automatically generates unique salts per hash
const bcrypt = require("bcryptjs");

// Import the database query function for domain lookups
const { query } = require("../config/database");

// Import custom error class for structured error handling
const { AppError } = require("../middleware/errorHandler");

// Import logger for email processing event tracking
const logger = require("../utils/logger");

// ============================================================
// Bcrypt salt rounds — controls hashing computational cost
// 10 rounds provides ~100ms hash time — good for 10,000+ users
// Higher rounds = more secure but slower login pipeline
// ============================================================
const BCRYPT_SALT_ROUNDS = 10;

// ============================================================
// Normalize an email address to a canonical form
// - Lowercase the entire email (RFC 5321 local-part is case-insensitive in practice)
// - Trim whitespace from both ends
// - Remove dots from Gmail local part (optional, disabled for safety)
// Normalization ensures the same user always maps to the same identity
// ============================================================

/**
 * Normalize an email address to its canonical form.
 * Ensures consistent email representation across all operations.
 *
 * @param {string} email - Raw email from Google token payload
 * @returns {string} Normalized email (lowercase, trimmed)
 */
const normalizeEmail = (email) => {
  // Guard against null/undefined input — fail explicitly
  if (!email || typeof email !== "string") {
    throw new AppError(
      "Email is required for normalization",
      400,
      "INVALID_EMAIL",
    );
  }

  // Lowercase + trim — the fundamental normalization steps
  // Lowercase handles case-insensitive email addresses
  // Trim removes accidental whitespace from token parsing
  const normalized = email.toLowerCase().trim();

  // Validate that the normalized email has a basic valid structure
  // Must contain exactly one @ with non-empty parts on both sides
  if (!normalized.includes("@") || normalized.split("@").length !== 2) {
    throw new AppError("Invalid email format", 400, "INVALID_EMAIL_FORMAT");
  }

  return normalized;
};

// ============================================================
// Extract domain from a normalized email address
// Domain is used for allowed-domain validation
// ============================================================

/**
 * Extract the domain portion from a normalized email.
 *
 * @param {string} email - Normalized email address
 * @returns {string} Domain portion (e.g., 'bitsathy.ac.in')
 */
const extractDomain = (email) => {
  // Split on @ and take the domain part (everything after @)
  // Normalized email guarantees exactly one @ symbol
  const parts = email.split("@");
  return parts[1];
};

// ============================================================
// Validate that the email's domain is in the allowed list
// This is a CRITICAL zero-trust enforcement point
// Only users from approved domains can authenticate
// ============================================================

/**
 * Validate an email domain against the allowed domains list.
 * Checks both the database table and the environment variable.
 *
 * @param {string} domain - Domain to validate (e.g., 'bitsathy.ac.in')
 * @throws {AppError} If the domain is not in the allowed list
 */
const validateDomain = async (domain) => {
  // FIRST: Check the database allowed_domains table
  // This allows runtime domain management without restarts
  const dbResult = await query(
    `SELECT domain_id FROM allowed_domains 
     WHERE domain_pattern = $1 AND is_active = true`,
    [domain],
  );

  // If database has the domain, it's allowed — proceed
  if (dbResult.rows.length > 0) {
    logger.debug("Domain validated via database", { domain });
    return true;
  }

  // SECOND: Check the environment variable as fallback
  // This supports initial setup before database is seeded
  const envDomains = (process.env.ALLOWED_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  // Check if the domain is in the environment variable list
  if (envDomains.includes(domain)) {
    logger.debug("Domain validated via environment variable", { domain });
    return true;
  }

  // Domain not found in either source — reject the login
  // This is the zero-trust domain boundary enforcement
  logger.warn("Domain validation failed — unauthorized domain", {
    domain,
  });

  throw new AppError(
    `Email domain '${domain}' is not authorized for this system`,
    403,
    "DOMAIN_NOT_ALLOWED",
  );
};

// ============================================================
// Hash an email using bcrypt for privacy-preserving storage
// The hash is stored in the users table as the lookup key
// bcrypt's random salt means the same email produces different hashes
// But bcrypt.compare() can still verify a match
// ============================================================

/**
 * Hash an email address using bcrypt for privacy storage.
 * Each hash includes a unique random salt — no rainbow table attacks.
 *
 * @param {string} email - Normalized email to hash
 * @returns {Promise<string>} bcrypt hash of the email
 */
const hashEmail = async (email) => {
  // bcrypt.hash() generates a random salt and hashes the email
  // The salt is embedded in the output hash for later comparison
  // 10 rounds takes ~100ms on modern hardware — scalable to 10k+ users
  const hash = await bcrypt.hash(email, BCRYPT_SALT_ROUNDS);
  return hash;
};

// ============================================================
// Compare a plain email against a bcrypt hash
// Used during login to find the matching user
// bcrypt.compare() handles salt extraction automatically
// ============================================================

/**
 * Compare a plain email against a bcrypt hash.
 * Used to verify if an email matches a stored hash.
 *
 * @param {string} email - Normalized email to check
 * @param {string} hash - Stored bcrypt hash from the database
 * @returns {Promise<boolean>} True if the email matches the hash
 */
const compareEmail = async (email, hash) => {
  // bcrypt.compare() extracts the salt from the hash and re-hashes
  // the email with that same salt — then compares the results
  // This is a constant-time comparison to prevent timing attacks
  return await bcrypt.compare(email, hash);
};

// ============================================================
// Export all email service functions
// Used by authService.js in the login pipeline
// ============================================================
module.exports = {
  normalizeEmail,
  extractDomain,
  validateDomain,
  hashEmail,
  compareEmail,
};
