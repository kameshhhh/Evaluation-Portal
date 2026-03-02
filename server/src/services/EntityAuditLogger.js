// ============================================================
// ENTITY AUDIT LOGGER — Structured Logging for Entity Changes
// ============================================================
// Wraps the ChangeAuditService with a simpler API that
// integrates with Express request context.
//
// Instead of services having to extract requestId, IP,
// and user-agent from the request, they just pass the request
// object and this logger handles the rest.
//
// This is a FACADE pattern — simplifies the ChangeAuditService
// interface for common use cases.
// ============================================================

// Import the underlying audit service
const { ChangeAuditService, AuditAction } = require("./ChangeAuditService");

// Import logger for fallback logging
const logger = require("../utils/logger");

// ============================================================
// EntityAuditLogger class — simplified audit API
// ============================================================
class EntityAuditLogger {
  /**
   * Log an entity creation to the audit trail.
   *
   * @param {string} entityType - 'project', 'person', etc.
   * @param {string} entityId - UUID of the created entity
   * @param {Object} newValues - The created entity's state
   * @param {string} actorId - Who created it
   * @param {Object} [req] - Express request object (for IP, agent, requestId)
   */
  static async logCreation(
    entityType,
    entityId,
    newValues,
    actorId,
    req = null,
  ) {
    try {
      await ChangeAuditService.recordChange({
        entityType,
        entityId,
        action: AuditAction.CREATE,
        oldValues: null, // No previous state for creation
        newValues,
        changedBy: actorId,
        requestId: req?.id || null,
        userIp: req?.ip || null,
        userAgent: req?.get?.("user-agent") || null,
      });
    } catch (error) {
      // Audit logging should never crash the main operation
      // Log the failure and continue
      logger.error("Failed to write audit log for creation", {
        entityType,
        entityId,
        error: error.message,
      });
    }
  }

  /**
   * Log an entity update to the audit trail.
   *
   * @param {string} entityType - 'project', 'person', etc.
   * @param {string} entityId - UUID of the updated entity
   * @param {Object} oldValues - State before the update
   * @param {Object} newValues - State after the update
   * @param {string} actorId - Who updated it
   * @param {Object} [req] - Express request object
   */
  static async logUpdate(
    entityType,
    entityId,
    oldValues,
    newValues,
    actorId,
    req = null,
  ) {
    try {
      await ChangeAuditService.recordChange({
        entityType,
        entityId,
        action: AuditAction.UPDATE,
        oldValues,
        newValues,
        changedBy: actorId,
        requestId: req?.id || null,
        userIp: req?.ip || null,
        userAgent: req?.get?.("user-agent") || null,
      });
    } catch (error) {
      logger.error("Failed to write audit log for update", {
        entityType,
        entityId,
        error: error.message,
      });
    }
  }

  /**
   * Log an entity deletion to the audit trail.
   *
   * @param {string} entityType - 'project', 'person', etc.
   * @param {string} entityId - UUID of the deleted entity
   * @param {Object} oldValues - State before deletion
   * @param {string} actorId - Who deleted it
   * @param {Object} [req] - Express request object
   */
  static async logDeletion(
    entityType,
    entityId,
    oldValues,
    actorId,
    req = null,
  ) {
    try {
      await ChangeAuditService.recordChange({
        entityType,
        entityId,
        action: AuditAction.DELETE,
        oldValues,
        newValues: null, // No new state for deletion
        changedBy: actorId,
        requestId: req?.id || null,
        userIp: req?.ip || null,
        userAgent: req?.get?.("user-agent") || null,
      });
    } catch (error) {
      logger.error("Failed to write audit log for deletion", {
        entityType,
        entityId,
        error: error.message,
      });
    }
  }

  /**
   * Log a state transition to the audit trail.
   *
   * @param {string} entityType - 'project', 'session', etc.
   * @param {string} entityId - UUID of the entity
   * @param {string} fromState - Previous state
   * @param {string} toState - New state
   * @param {string} actorId - Who triggered the transition
   * @param {Object} [req] - Express request object
   */
  static async logStateChange(
    entityType,
    entityId,
    fromState,
    toState,
    actorId,
    req = null,
  ) {
    try {
      await ChangeAuditService.recordChange({
        entityType,
        entityId,
        action: AuditAction.STATE_CHANGE,
        oldValues: { status: fromState },
        newValues: { status: toState },
        changedBy: actorId,
        requestId: req?.id || null,
        userIp: req?.ip || null,
        userAgent: req?.get?.("user-agent") || null,
      });
    } catch (error) {
      logger.error("Failed to write audit log for state change", {
        entityType,
        entityId,
        error: error.message,
      });
    }
  }
}

// ============================================================
// Export EntityAuditLogger and AuditAction enum
// ============================================================
module.exports = { EntityAuditLogger, AuditAction };
