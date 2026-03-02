// ============================================================
// EMAIL IDENTITY RESOLVER — The Core 5-Step Identity Pipeline
// ============================================================
// This is the CENTRAL class of the enterprise identity module.
// It orchestrates the full identity resolution flow per the
// senior architect's specification:
//
//   Step 1: VALIDATE  → InputSanitizer checks payload structure
//   Step 2: NORMALIZE → EmailNormalizer canonicalizes the email
//   Step 3: DOMAIN    → DomainValidator enforces whitelist policy
//   Step 4: IDENTITY  → UserRepository finds the user by email hash
//   Step 5: BUILD     → Construct the resolution result object
//
// Extends BaseIdentityResolver (Strategy Pattern) so it can be
// swapped for alternative resolvers without changing callers.
//
// DELEGATES to existing services:
//   - emailService.normalizeEmail (via EmailNormalizer)
//   - emailService.validateDomain (via DomainValidator)
//   - emailService.hashEmail (for user lookup)
//   - User.findByEmailHash (via UserRepository)
//
// The existing authService.processLogin() 12-step pipeline
// is NOT replaced — this resolver runs ALONGSIDE it to provide
// enterprise observability, caching, and structured audit trail.
// ============================================================

const BaseIdentityResolver = require("./BaseIdentityResolver");
const { hashEmail } = require("../../../services/emailService");
const metrics = require("../metrics");

// ============================================================
// EmailIdentityResolver — concrete Strategy implementation
// ============================================================
class EmailIdentityResolver extends BaseIdentityResolver {
  /**
   * Dependency-injected constructor (no global imports needed).
   *
   * @param {Object} deps - All dependencies injected at construction
   * @param {Object} deps.logger             - Winston logger
   * @param {Object} deps.inputSanitizer     - InputSanitizer instance
   * @param {Object} deps.emailNormalizer    - EmailNormalizer instance
   * @param {Object} deps.domainValidator    - DomainValidator instance
   * @param {Object} deps.userRepository     - UserRepository instance
   * @param {Object} deps.cacheRepository    - CacheRepository instance
   * @param {Object} deps.auditRepository    - AuditRepository instance
   */
  constructor({
    logger,
    inputSanitizer,
    emailNormalizer,
    domainValidator,
    userRepository,
    cacheRepository,
    auditRepository,
  }) {
    // Pass logger and auditRepository to base class
    super({ logger, auditRepository });

    // Store all injected dependencies
    this.inputSanitizer = inputSanitizer;
    this.emailNormalizer = emailNormalizer;
    this.domainValidator = domainValidator;
    this.userRepository = userRepository;
    this.cacheRepository = cacheRepository;
  }

  // ============================================================
  // Strategy identifier for metrics and logging
  // ============================================================

  _getResolverType() {
    return "EmailIdentityResolver";
  }

  // ============================================================
  // The 5-Step Identity Resolution Pipeline
  //
  // Each step is a separate method for:
  //   - Fine-grained error attribution
  //   - Individual step timing in metrics
  //   - Easy unit testing of each step
  //   - Clear audit trail of where failures occur
  // ============================================================

  /**
   * Execute the 5-step identity resolution pipeline.
   * This overrides BaseIdentityResolver._doResolve().
   *
   * @param {Object} googlePayload - Verified Google token payload
   * @returns {Promise<Object>} Resolved identity
   */
  async _doResolve(googlePayload) {
    // ---- STEP 1: VALIDATE ----
    // Check payload structure before any business logic touches it
    this._stepValidate(googlePayload);

    // ---- STEP 2: NORMALIZE ----
    // Canonicalize email to lowercase standard form
    const canonicalEmail = this._stepNormalize(googlePayload.email);

    // ---- Check Cache ----
    // If we've resolved this email recently, return cached result
    const cached = this._checkCache(canonicalEmail);
    if (cached) {
      return cached;
    }

    // ---- STEP 3: DOMAIN VALIDATION ----
    // Enforce the college whitelist policy
    await this._stepDomainValidation(canonicalEmail);

    // ---- STEP 4: IDENTITY LOOKUP ----
    // Find the user by hashed email in the database
    const user = await this._stepIdentityLookup(canonicalEmail);

    // ---- STEP 5: BUILD RESULT ----
    // Construct the normalized resolution result object
    const result = this._stepBuildResult(googlePayload, canonicalEmail, user);

    // Cache the successful result for subsequent requests
    this._cacheResult(canonicalEmail, result);

    return result;
  }

  // ============================================================
  // STEP 1: VALIDATE — Payload Structure Check
  // ============================================================

  /**
   * Validate the Google payload structure.
   * Throws InputValidationError on failure.
   *
   * @param {Object} googlePayload
   * @private
   */
  _stepValidate(googlePayload) {
    this.logger.debug("Step 1: Validating payload structure");
    this.inputSanitizer.sanitize(googlePayload);
  }

  // ============================================================
  // STEP 2: NORMALIZE — Email Canonicalization
  // ============================================================

  /**
   * Canonicalize the email address.
   * Returns lowercase, trimmed canonical form.
   *
   * @param {string} rawEmail
   * @returns {string} Canonical email
   * @private
   */
  _stepNormalize(rawEmail) {
    this.logger.debug("Step 2: Normalizing email");
    return this.emailNormalizer.canonicalize(rawEmail);
  }

  // ============================================================
  // STEP 3: DOMAIN VALIDATION — Whitelist Enforcement
  // ============================================================

  /**
   * Validate the email domain against policies.
   * Throws UnauthorizedDomainError on failure.
   *
   * @param {string} canonicalEmail
   * @private
   */
  async _stepDomainValidation(canonicalEmail) {
    this.logger.debug("Step 3: Validating domain");
    const domain = this.domainValidator.extractDomain(canonicalEmail);

    try {
      await this.domainValidator.validate(canonicalEmail);

      // Record success metric
      metrics.domainValidation.labels("allowed", domain).inc();
    } catch (error) {
      // Record failure metric
      metrics.domainValidation.labels("denied", domain).inc();
      throw error;
    }
  }

  // ============================================================
  // STEP 4: IDENTITY LOOKUP — Database User Resolution
  // ============================================================

  /**
   * Find the user by hashed email.
   * Uses the EXISTING hashEmail + findByEmailHash flow.
   *
   * @param {string} canonicalEmail
   * @returns {Promise<Object|null>} User object or null
   * @private
   */
  async _stepIdentityLookup(canonicalEmail) {
    this.logger.debug("Step 4: Looking up identity");

    // Hash the email using the EXISTING hashEmail function
    // from emailService.js — no logic duplication
    const emailHash = await hashEmail(canonicalEmail);

    // Delegate to UserRepository for the actual DB query
    const user = await this.userRepository.findByEmailHash(emailHash);

    this.logger.debug("Identity lookup result", {
      found: !!user,
      isNewUser: !user,
    });

    return user;
  }

  // ============================================================
  // STEP 5: BUILD RESULT — Construct Resolution Object
  // ============================================================

  /**
   * Build the normalized identity resolution result.
   * Combines Google payload data with database user data.
   *
   * @param {Object} googlePayload - Original Google payload
   * @param {string} canonicalEmail - Canonical email
   * @param {Object|null} user - Database user or null for new users
   * @returns {Object} Resolution result
   * @private
   */
  _stepBuildResult(googlePayload, canonicalEmail, user) {
    this.logger.debug("Step 5: Building resolution result");

    const domain = canonicalEmail.split("@")[1];
    const formatInfo = this.emailNormalizer.analyzeFormat(canonicalEmail);

    return {
      // Identity fields
      email: canonicalEmail,
      domain,
      googleSubject: googlePayload.sub,

      // User state: existing user or new registration
      userId: user?.id || null,
      isNewUser: !user,
      existingRole: user?.user_role || null,

      // Google profile info (passed through for authService to use)
      displayName: googlePayload.name || null,
      firstName: googlePayload.given_name || null,
      lastName: googlePayload.family_name || null,
      picture: googlePayload.picture || null,

      // Resolution metadata
      resolvedAt: new Date().toISOString(),
      resolverType: this._getResolverType(),
      isCollegeFormat: formatInfo.isCollegeFormat,
    };
  }

  // ============================================================
  // Cache Operations — optional layer to reduce DB lookups
  // ============================================================

  /**
   * Check if we have a cached resolution for this email.
   * @param {string} canonicalEmail
   * @returns {Object|null} Cached result or null
   * @private
   */
  _checkCache(canonicalEmail) {
    if (!this.cacheRepository) return null;

    const cached = this.cacheRepository.get(canonicalEmail);

    if (cached) {
      metrics.cacheOperations.labels("hit").inc();
      this.logger.debug("Cache hit — returning cached resolution", {
        email: canonicalEmail,
      });
      return cached;
    }

    metrics.cacheOperations.labels("miss").inc();
    return null;
  }

  /**
   * Cache a successful resolution result.
   * @param {string} canonicalEmail
   * @param {Object} result
   * @private
   */
  _cacheResult(canonicalEmail, result) {
    if (!this.cacheRepository) return;

    this.cacheRepository.set(canonicalEmail, result);
    metrics.cacheOperations.labels("set").inc();
  }
}

// ============================================================
// Export EmailIdentityResolver class
// ============================================================
module.exports = EmailIdentityResolver;
