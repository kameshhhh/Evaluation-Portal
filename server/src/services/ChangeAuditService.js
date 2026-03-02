// ============================================================
// CHANGE AUDIT SERVICE — Records Every Entity Change
// ============================================================
// Writes to the entity_change_audit table for every CREATE,
// UPDATE, DELETE, and STATE_CHANGE operation on any entity.
//
// This is SEPARATE from the hash chain history (person_history,
// project_state_transitions). The entity_change_audit table
// provides a unified view of ALL changes across ALL entities.
//
// Each audit entry captures:
//   - WHAT changed (entity_type, entity_id, action)
//   - HOW it changed (old_values, new_values as JSON)
//   - WHO changed it (changed_by → users FK)
//   - WHEN it changed (changed_at timestamp)
//   - WHERE the request came from (request_id, ip, user_agent)
//
// CRITICAL: This service is APPEND-ONLY.
// Audit records are NEVER updated or deleted.
// ============================================================

// Import database query function
const { query } = require("../config/database");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// AUDIT ACTION ENUM — Types of changes we record
// ============================================================
const AuditAction = Object.freeze({
  CREATE: "CREATE", // New entity created
  UPDATE: "UPDATE", // Entity fields modified
  DELETE: "DELETE", // Entity soft-deleted
  STATE_CHANGE: "STATE_CHANGE", // Entity status changed
});

// ============================================================
// ChangeAuditService class — append-only audit writer
// ============================================================
class ChangeAuditService {
  /**
   * Record an audit entry for an entity change.
   *
   * @param {Object} params - Audit entry parameters
   * @param {string} params.entityType - 'project', 'person', etc.
   * @param {string} params.entityId - UUID of the entity
   * @param {string} params.action - One of AuditAction values
   * @param {Object|null} params.oldValues - State before the change
   * @param {Object|null} params.newValues - State after the change
   * @param {string} params.changedBy - UUID of the actor
   * @param {string} [params.requestId] - Request trace ID
   * @param {string} [params.userIp] - Client IP address
   * @param {string} [params.userAgent] - Client user agent string
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<string>} The audit_id of the created record
   */
  static async recordChange(params, client = null) {
    // Use provided client or default query
    const queryFn = client ? client.query.bind(client) : query;

    // Build the INSERT query
    const sql = `
      INSERT INTO entity_change_audit (
        entity_type,
        entity_id,
        action,
        old_values,
        new_values,
        changed_by,
        request_id,
        user_ip,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING audit_id
    `;

    // Execute the insert — this is APPEND-ONLY
    const result = await queryFn(sql, [
      params.entityType, // $1: entity type
      params.entityId, // $2: entity UUID
      params.action, // $3: action type
      params.oldValues ? JSON.stringify(params.oldValues) : null, // $4: old state
      params.newValues ? JSON.stringify(params.newValues) : null, // $5: new state
      params.changedBy, // $6: who did it
      params.requestId || null, // $7: request trace ID
      params.userIp || null, // $8: client IP
      params.userAgent || null, // $9: user agent
    ]);

    // Get the generated audit ID
    const auditId = result.rows[0].audit_id;

    // Log the audit entry (don't include full data — just metadata)
    logger.debug("Audit entry recorded", {
      auditId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actor: params.changedBy,
    });

    return auditId;
  }

  /**
   * Get audit history for a specific entity.
   * Returns all changes in chronological order.
   *
   * @param {string} entityType - 'project', 'person', etc.
   * @param {string} entityId - UUID of the entity
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array>} Audit entries
   */
  static async getEntityAuditTrail(
    entityType,
    entityId,
    pagination = { limit: 100, offset: 0 },
  ) {
    const sql = `
      SELECT * FROM entity_change_audit
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY changed_at ASC
      LIMIT $3 OFFSET $4
    `;

    const result = await query(sql, [
      entityType,
      entityId,
      Math.min(pagination.limit || 100, 500), // Cap at 500
      pagination.offset || 0,
    ]);

    return result.rows;
  }

  /**
   * Get all audit entries by a specific actor.
   * Useful for reviewing what a user has done.
   *
   * @param {string} actorId - UUID of the actor
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async getActorAuditTrail(
    actorId,
    pagination = { limit: 100, offset: 0 },
  ) {
    const sql = `
      SELECT * FROM entity_change_audit
      WHERE changed_by = $1
      ORDER BY changed_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [
      actorId,
      Math.min(pagination.limit || 100, 500),
      pagination.offset || 0,
    ]);

    return result.rows;
  }

  /**
   * Get recent audit entries across all entities.
   * Useful for dashboard / monitoring views.
   *
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>}
   */
  static async getRecentActivity(limit = 50) {
    const sql = `
      SELECT * FROM entity_change_audit
      ORDER BY changed_at DESC
      LIMIT $1
    `;

    const result = await query(sql, [Math.min(limit, 200)]);
    return result.rows;
  }
}

// ============================================================
// Export ChangeAuditService class and action enum
// ============================================================
module.exports = { ChangeAuditService, AuditAction };
