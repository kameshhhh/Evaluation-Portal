// ============================================================
// DOMAIN VALIDATOR — College Email Domain Policy Enforcement
// ============================================================
// Enforces the college's domain whitelist policy with multiple
// validation layers: format, whitelist, subdomain rules.
//
// DELEGATES to the existing validateDomain() in emailService.js
// for the actual database and env-var domain lookups. This class
// adds structured error types and enterprise logging.
//
// Domain rules:
//   Primary:    bitsathy.ac.in
//   Subdomains: faculty.bitsathy.ac.in, admin.bitsathy.ac.in
//   Legacy:     bitsathy.edu.in (historical, still active in DB)
//
// The existing emailService.extractDomain() and validateDomain()
// continue to function independently — this is ADDITIVE.
// ============================================================

// Import EXISTING domain functions — we delegate to them
const {
  extractDomain,
  validateDomain,
} = require("../../../services/emailService");

// Import domain-specific error for precise error reporting
const { UnauthorizedDomainError } = require("../errors/IdentityErrors");

// Import logger for audit trail
const logger = require("../../../utils/logger");

// ============================================================
// DomainValidator class — enforces domain whitelist policies
// Wraps existing validateDomain() with enterprise error types.
// ============================================================
class DomainValidator {
  /**
   * @param {{ logger: Object, config?: Object }} deps - Dependencies
   */
  constructor({ logger: injectedLogger, config }) {
    this.logger = injectedLogger?.child
      ? injectedLogger.child({ module: "DomainValidator" })
      : injectedLogger || logger;
    this.config = config || {};
  }

  // ============================================================
  // Extract domain from a canonical email address
  // Delegates to existing extractDomain() in emailService.js
  // ============================================================

  /**
   * Extract the domain portion from a canonicalized email.
   *
   * @param {string} canonicalEmail - Already-canonicalized email
   * @returns {string} Domain portion (e.g., 'bitsathy.ac.in')
   */
  extractDomain(canonicalEmail) {
    return extractDomain(canonicalEmail);
  }

  // ============================================================
  // Validate the domain against allowed domain policies
  // Delegates to existing validateDomain() for DB + env lookups.
  // Re-maps the existing AppError to UnauthorizedDomainError.
  // ============================================================

  /**
   * Validate that an email's domain is authorized.
   * Checks both the database and the environment variable.
   *
   * @param {string} canonicalEmail - The canonical email to validate
   * @throws {UnauthorizedDomainError} If the domain is not allowed
   */
  async validate(canonicalEmail) {
    const domain = this.extractDomain(canonicalEmail);

    // Layer 1: Format validation — domain must exist and be reasonable
    if (!domain || domain.length > 253 || domain.length < 3) {
      throw new UnauthorizedDomainError(domain || "empty", {
        reason: "Invalid domain format",
        email: canonicalEmail,
      });
    }

    try {
      // Layer 2: Delegate to existing validateDomain() for DB + env lookup
      // The existing function queries allowed_domains table first,
      // then falls back to ALLOWED_DOMAINS env var.
      // It throws AppError if the domain is not found in either source.
      await validateDomain(domain);

      // Domain passed all checks — log success
      this.logger.debug("Domain validation passed", {
        domain,
        source: "existing_validateDomain",
      });
    } catch (error) {
      // Remap existing AppError to our domain-specific error type
      // This provides consistent error handling within the identity module
      if (error.code === "DOMAIN_NOT_ALLOWED" || error.statusCode === 403) {
        // Log the unauthorized attempt for security monitoring
        this.logger.warn("Unauthorized domain attempt", {
          attemptedDomain: domain,
          email: canonicalEmail,
          timestamp: new Date().toISOString(),
        });

        throw new UnauthorizedDomainError(domain, {
          email: canonicalEmail,
          originalError: error.message,
        });
      }

      // For any other error (DB failure, etc.), throw as-is
      // The caller (EmailIdentityResolver) will classify it appropriately
      throw error;
    }
  }

  // ============================================================
  // Validate subdomain hierarchy (informational)
  // Checks if a subdomain is a valid child of an allowed parent.
  // Currently informational — the DB whitelist is the authority.
  // ============================================================

  /**
   * Check if a subdomain is a valid child of an allowed parent domain.
   *
   * @param {string} subdomain - e.g., 'faculty.bitsathy.ac.in'
   * @param {string} parentDomain - e.g., 'bitsathy.ac.in'
   * @returns {boolean} True if the subdomain is valid
   */
  validateSubdomain(subdomain, parentDomain) {
    // Must end with the parent domain
    if (!subdomain.endsWith(`.${parentDomain}`)) {
      return false;
    }

    // Extract the subdomain prefix
    const prefix = subdomain.slice(0, -(parentDomain.length + 1));

    // Prefix must be a simple label (no nested subdomains beyond one level)
    const validPrefix = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    return validPrefix.test(prefix);
  }
}

// ============================================================
// Export DomainValidator class
// ============================================================
module.exports = DomainValidator;
