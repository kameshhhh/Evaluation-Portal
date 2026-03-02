// ============================================================
// AUDIT REPOSITORY — Compliance & Security Audit Trail
// ============================================================
// Records identity resolution events for:
//   - Security monitoring (unauthorized domain attempts)
//   - Compliance auditing (who logged in, when, from where)
//   - Incident response (forensic timeline reconstruction)
//
// Uses the existing identity_snapshots table via IdentitySnapshot
// model for persistence. Adds structured audit event formatting
// and batch-friendly logging through Winston.
//
// Design: Fire-and-forget — audit failures must NEVER block
// the authentication flow. Errors are logged, not thrown.
// ============================================================

const IdentitySnapshot = require("../../../models/IdentitySnapshot");

// ============================================================
// AuditRepository class — records audit events for compliance
// ============================================================
class AuditRepository {
  /**
   * @param {{ logger: Object }} deps - Dependencies
   */
  constructor({ logger }) {
    this.logger = logger.child
      ? logger.child({ module: "AuditRepository" })
      : logger;
  }

  // ============================================================
  // Record a successful identity resolution event
  // Fire-and-forget: Never blocks the auth flow on failure
  // ============================================================

  /**
   * Record a successful identity resolution.
   *
   * @param {{ userId: string, email: string, domain: string, resolverType: string, durationMs: number }} event
   */
  async recordResolution(event) {
    try {
      // Use existing IdentitySnapshot.create if available
      if (IdentitySnapshot && typeof IdentitySnapshot.create === "function") {
        await IdentitySnapshot.create({
          user_id: event.userId,
          snapshot_type: "identity_resolution",
          snapshot_data: {
            email: event.email,
            domain: event.domain,
            resolverType: event.resolverType,
            durationMs: event.durationMs,
            timestamp: new Date().toISOString(),
          },
        });
      }

      this.logger.info("Identity resolution recorded", {
        auditType: "RESOLUTION_SUCCESS",
        userId: event.userId,
        domain: event.domain,
        resolverType: event.resolverType,
        durationMs: event.durationMs,
      });
    } catch (error) {
      // Fire-and-forget: audit failures NEVER block authentication
      this.logger.error("Failed to record identity resolution audit", {
        auditType: "AUDIT_FAILURE",
        originalEvent: event,
        error: error.message,
      });
    }
  }

  // ============================================================
  // Record a failed identity resolution attempt
  // Critical for security monitoring — unauthorized access detection
  // ============================================================

  /**
   * Record a failed identity resolution attempt.
   *
   * @param {{ email: string, domain: string, reason: string, errorCode: string, resolverType: string }} event
   */
  async recordFailure(event) {
    try {
      this.logger.warn("Identity resolution failure recorded", {
        auditType: "RESOLUTION_FAILURE",
        email: event.email,
        domain: event.domain,
        reason: event.reason,
        errorCode: event.errorCode,
        resolverType: event.resolverType,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Fire-and-forget: never let audit logging crash the auth flow
      this.logger.error("Failed to record resolution failure audit", {
        error: error.message,
      });
    }
  }

  // ============================================================
  // Record a security-relevant event (e.g., rate limit hit)
  // Higher severity — triggers alerts in production monitoring
  // ============================================================

  /**
   * Record a security event that may require intervention.
   *
   * @param {{ type: string, details: Object }} event
   */
  async recordSecurityEvent(event) {
    try {
      this.logger.warn("Security event recorded", {
        auditType: "SECURITY_EVENT",
        eventType: event.type,
        details: event.details,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error("Failed to record security event audit", {
        error: error.message,
      });
    }
  }
}

// ============================================================
// Export AuditRepository class
// ============================================================
module.exports = AuditRepository;
