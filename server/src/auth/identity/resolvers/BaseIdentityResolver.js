// ============================================================
// BASE IDENTITY RESOLVER — Strategy Pattern Abstract Base Class
// ============================================================
// Defines the contract that ALL identity resolvers must fulfill.
// Uses the Template Method pattern: the base class handles
// cross-cutting concerns (timing, logging, metrics, error mapping)
// while subclasses implement the actual resolution logic.
//
// Subclass contract:
//   _doResolve(googlePayload) → must be implemented
//   _getResolverType()        → must return a string identifier
//
// This class provides:
//   resolve(googlePayload) — public entry point with instrumentation
//   _doResolve()           — abstract method (throws if not overridden)
//   Error classification and metric recording
//   Active resolution tracking (in-flight gauge)
// ============================================================

const metrics = require("../metrics");
const { IdentityResolutionError } = require("../errors/IdentityErrors");
const {
  isTransientError,
  isSecurityConcern,
} = require("../errors/errorMapper");

// ============================================================
// BaseIdentityResolver — abstract base with Template Method
// ============================================================
class BaseIdentityResolver {
  /**
   * @param {{ logger: Object, auditRepository: Object }} deps
   */
  constructor({ logger, auditRepository }) {
    this.logger = logger.child
      ? logger.child({ module: this._getResolverType() })
      : logger;
    this.auditRepository = auditRepository;
  }

  // ============================================================
  // Public entry point — Template Method with instrumentation
  // Subclasses MUST NOT override this — override _doResolve instead
  // ============================================================

  /**
   * Resolve an identity from a Google token payload.
   * This is the public entry point — instrumented with metrics,
   * logging, and error handling. Delegates to _doResolve().
   *
   * @param {Object} googlePayload - Verified Google token payload
   * @returns {Promise<Object>} Resolution result
   * @throws {IdentityResolutionError} On resolution failure
   */
  async resolve(googlePayload) {
    const resolverType = this._getResolverType();
    const startTime = Date.now();

    // Track in-flight resolutions
    metrics.activeResolutions.labels(resolverType).inc();

    try {
      // Delegate to subclass implementation
      const result = await this._doResolve(googlePayload);

      // Record success metrics
      const durationMs = Date.now() - startTime;
      metrics.resolutionTotal
        .labels("success", resolverType, result.domain || "unknown")
        .inc();
      metrics.resolutionDuration
        .labels(resolverType, "success")
        .observe(durationMs);

      this.logger.info("Identity resolved successfully", {
        resolverType,
        durationMs,
        domain: result.domain || "unknown",
      });

      // Fire-and-forget audit
      this.auditRepository
        .recordResolution({
          userId: result.userId,
          email: result.email,
          domain: result.domain,
          resolverType,
          durationMs,
        })
        .catch(() => {}); // Never let audit fail the resolve

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Classify the error for metrics
      const status = isTransientError(error) ? "transient_error" : "error";
      metrics.resolutionTotal.labels(status, resolverType, "unknown").inc();
      metrics.resolutionDuration
        .labels(resolverType, status)
        .observe(durationMs);

      this.logger.error("Identity resolution failed", {
        resolverType,
        durationMs,
        errorCode: error.code || "UNKNOWN",
        errorMessage: error.message,
        isTransient: isTransientError(error),
        isSecurityConcern: isSecurityConcern(error),
      });

      // Fire-and-forget audit for failures
      this.auditRepository
        .recordFailure({
          email: googlePayload?.email || "unknown",
          domain: googlePayload?.email?.split("@")[1] || "unknown",
          reason: error.message,
          errorCode: error.code || "UNKNOWN",
          resolverType,
        })
        .catch(() => {});

      // Re-throw domain errors as-is; wrap unknown errors
      if (error instanceof IdentityResolutionError) {
        throw error;
      }

      throw new IdentityResolutionError(
        `Identity resolution failed: ${error.message}`,
        "IDENTITY_RESOLUTION_FAILED",
        { originalError: error.message, resolverType },
      );
    } finally {
      // Always decrement the in-flight gauge
      metrics.activeResolutions.labels(resolverType).dec();
    }
  }

  // ============================================================
  // Abstract method — subclasses MUST implement
  // ============================================================

  /**
   * Perform the actual identity resolution.
   * Subclasses implement their specific resolution strategy here.
   *
   * @param {Object} googlePayload - Verified Google token payload
   * @returns {Promise<Object>} Resolution result
   * @abstract
   */
  async _doResolve(/* googlePayload */) {
    throw new Error(`${this._getResolverType()} must implement _doResolve()`);
  }

  // ============================================================
  // Abstract method — subclasses MUST implement
  // ============================================================

  /**
   * Return a string identifier for this resolver type.
   * Used in metrics labels and log context.
   *
   * @returns {string} Resolver type identifier
   * @abstract
   */
  _getResolverType() {
    return "BaseIdentityResolver";
  }
}

// ============================================================
// Export BaseIdentityResolver class
// ============================================================
module.exports = BaseIdentityResolver;
