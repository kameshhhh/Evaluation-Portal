// ============================================================
// PERSON REPOSITORY — Database Operations for Person Entity
// ============================================================
// Handles all database interactions for the persons table.
// Implements the REPOSITORY PATTERN — domain layer talks to
// repositories, never directly to the database.
//
// Key features:
//   - Optimistic concurrency control (version column)
//   - Soft-delete only (is_deleted flag, never hard delete)
//   - Hash chain maintenance (person_history table)
//   - Full audit trail on every change
//
// All methods accept a `client` parameter for transaction support.
// If no client is provided, uses the default pool query.
// ============================================================

// Import database query function and client checkout
const { query, getClient } = require("../config/database");

// Import the Person domain entity
const { Person } = require("../entities/Person");

// Import crypto for UUID generation
const crypto = require("crypto");

// Import hash chain service for history entries
const HashChainService = require("../lib/immutable/HashChainService");

// Import custom errors
const {
  PersonNotFoundError,
  BusinessRuleViolationError,
} = require("../entities/EntityErrors");

// Import logger for operation tracking
const logger = require("../utils/logger");

// Import socket broadcast for real-time updates
const { broadcastChange } = require("../socket");

// ============================================================
// PersonRepository class — CRUD + history for persons
// ============================================================
class PersonRepository {
  /**
   * Create a new person record in the database.
   * Generates a UUID, inserts the row, and creates an initial
   * hash chain entry in person_history.
   *
   * @param {Object} data - Validated person data
   * @param {string} actorId - UUID of the user creating this person
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Person>} The created Person domain object
   */
  static async create(data, actorId, client = null) {
    // ---------------------------------------------------------
    // TRANSACTION HANDLING: If no external client was provided,
    // we must create our own transaction to ensure BOTH inserts
    // (persons + person_history) succeed or fail ATOMICALLY.
    // Without a transaction, a failure in person_history would
    // leave an orphaned row in persons with no audit trail.
    // ---------------------------------------------------------
    const ownTransaction = !client; // true if we manage the txn
    const txnClient = client || (await getClient()); // checkout from pool if needed

    try {
      // Begin transaction if we own it (external client already has one)
      if (ownTransaction) {
        await txnClient.query("BEGIN"); // start atomic block
      }

      // Bind the query function to the transaction client
      const queryFn = txnClient.query.bind(txnClient);

      // Generate a new UUID for the person
      const personId = crypto.randomUUID();

      // ---------------------------------------------------------
      // BOOTSTRAP HANDLING: created_by and updated_by reference
      // persons(person_id) — NOT users(internal_user_id).
      // For person creation, the actor is either:
      //   - NULL (bootstrap / first person / no auth context)
      //   - A valid person_id (admin creating another person)
      // If actorId comes from auth system (users.internal_user_id),
      // we must resolve it to the corresponding person_id first.
      // ---------------------------------------------------------
      let resolvedActorId = null; // default to NULL (bootstrap)
      if (actorId) {
        // Try to find a person record for this actorId
        // actorId might be a person_id directly or an identity_id
        const actorLookup = await queryFn(
          `SELECT person_id FROM persons WHERE person_id = $1 OR identity_id = $1 LIMIT 1`,
          [actorId],
        );
        // Only use it if we found a matching person record
        resolvedActorId = actorLookup.rows[0]?.person_id || null;
      }

      // Insert the person record
      const sql = `
        INSERT INTO persons (
          person_id,
          identity_id,
          person_type,
          status,
          admission_year,
          department_code,
          graduation_year,
          display_name,
          created_by,
          updated_by,
          version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 1)
        RETURNING *
      `;

      // Execute the insert with resolved actor (NULL for bootstrap)
      const result = await queryFn(sql, [
        personId, // $1: person_id (UUID)
        data.identityId, // $2: identity_id (FK to users)
        data.personType, // $3: person_type enum
        "active", // $4: status (always starts active)
        data.admissionYear || null, // $5: admission_year
        data.departmentCode || null, // $6: department_code
        data.graduationYear || null, // $7: graduation_year
        data.displayName, // $8: display_name
        resolvedActorId, // $9: created_by AND updated_by (NULL for bootstrap)
      ]);

      // Get the inserted row
      const row = result.rows[0];

      // Create the initial hash chain entry in person_history
      const snapshot = {
        person_id: personId,
        person_type: data.personType,
        status: "active",
        admission_year: data.admissionYear,
        department_code: data.departmentCode,
        display_name: data.displayName,
      };

      // Calculate the genesis hash (no previous hash)
      const currentHash = HashChainService.createChainHash(snapshot, null);

      // Insert the history record
      // change_type must be lowercase to match DB CHECK constraint
      // changed_by is NULL for bootstrap — self-referencing FK
      // means the person doesn't exist yet in persons table
      await queryFn(
        `
        INSERT INTO person_history (
          person_id, snapshot, changed_by, change_type,
          change_reason, previous_hash, current_hash
        ) VALUES ($1, $2, $3, 'create', 'Initial creation', NULL, $4)
      `,
        [personId, JSON.stringify(snapshot), resolvedActorId, currentHash],
      );

      // Commit the transaction if we own it
      if (ownTransaction) {
        await txnClient.query("COMMIT"); // both inserts succeed together
      }

      // Log the creation
      logger.info("Person created", { personId, personType: data.personType });

      // Broadcast real-time update so peer lists refresh
      broadcastChange("persons", "created", {
        personId,
        personType: data.personType,
        departmentCode: data.departmentCode,
      });

      // Return a frozen Person domain object
      return new Person(row);
    } catch (error) {
      // Rollback the transaction if we own it — ensures atomicity
      // Both persons INSERT and person_history INSERT are undone
      if (ownTransaction) {
        await txnClient.query("ROLLBACK"); // undo everything
      }
      // Re-throw so the controller/service can handle the error
      throw error;
    } finally {
      // Release the client back to the pool if we checked it out
      if (ownTransaction) {
        txnClient.release(); // return to pool
      }
    }
  }

  /**
   * Find a person by their UUID.
   * Returns null if not found (does not throw).
   *
   * @param {string} personId - UUID of the person
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Person|null>} Person or null
   */
  static async findById(personId, client = null) {
    // Use provided client or default query
    const queryFn = client ? client.query.bind(client) : query;

    // Select the person record
    const sql = `
      SELECT * FROM persons
      WHERE person_id = $1 AND is_deleted = false
    `;

    const result = await queryFn(sql, [personId]);

    // Return null if not found
    if (result.rows.length === 0) {
      return null;
    }

    // Wrap in Person domain object
    return new Person(result.rows[0]);
  }

  /**
   * Find a person by their identity_id (FK to users table).
   * Used when you have the auth user's ID but need the person record.
   *
   * @param {string} identityId - internal_user_id from users table
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<Person|null>} Person or null
   */
  static async findByIdentityId(identityId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT * FROM persons
      WHERE identity_id = $1 AND is_deleted = false
    `;

    const result = await queryFn(sql, [identityId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Person(result.rows[0]);
  }

  /**
   * Update a person record with optimistic concurrency control.
   * The version must match — if someone else updated first, this fails.
   *
   * @param {string} personId - UUID of the person to update
   * @param {Object} updates - Fields to update (validated already)
   * @param {string} actorId - UUID of the user making the change
   * @param {string} reason - Why the change is being made (for audit)
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Person>} Updated Person domain object
   * @throws {PersonNotFoundError} If person doesn't exist
   * @throws {BusinessRuleViolationError} If version conflict
   */
  static async update(
    personId,
    updates,
    actorId,
    reason = "Update",
    client = null,
  ) {
    const queryFn = client ? client.query.bind(client) : query;

    // First, get the current person to check version and build snapshot
    const current = await PersonRepository.findById(personId, client);

    if (!current) {
      throw new PersonNotFoundError(`Person ${personId} not found`);
    }

    // Check version matches (optimistic concurrency control)
    if (updates.version && updates.version !== current.version) {
      throw new BusinessRuleViolationError(
        `Version conflict: expected ${updates.version}, current is ${current.version}. ` +
          "Another user may have modified this person.",
        { expected: updates.version, current: current.version },
      );
    }

    // Build the SET clause dynamically based on provided fields
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    // Add each updatable field
    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${paramIndex++}`);
      values.push(updates.displayName);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.departmentCode !== undefined) {
      setClauses.push(`department_code = $${paramIndex++}`);
      values.push(updates.departmentCode);
    }
    if (updates.graduationYear !== undefined) {
      setClauses.push(`graduation_year = $${paramIndex++}`);
      values.push(updates.graduationYear);
    }

    // Always update the audit fields and increment version
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(actorId);
    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`version = version + 1`);

    // Add the WHERE clause parameters
    values.push(personId); // For WHERE person_id =
    values.push(current.version); // For AND version = (optimistic lock)

    // Build and execute the UPDATE query
    const sql = `
      UPDATE persons
      SET ${setClauses.join(", ")}
      WHERE person_id = $${paramIndex++}
        AND version = $${paramIndex++}
        AND is_deleted = false
      RETURNING *
    `;

    const result = await queryFn(sql, values);

    // If no rows returned, either not found or version conflict
    if (result.rows.length === 0) {
      throw new BusinessRuleViolationError(
        "Update failed: person may have been modified by another user",
        { personId, expectedVersion: current.version },
      );
    }

    // Get the updated row
    const updatedRow = result.rows[0];

    // Record the change in person_history with hash chain
    const snapshot = {
      person_id: personId,
      person_type: updatedRow.person_type,
      status: updatedRow.status,
      department_code: updatedRow.department_code,
      display_name: updatedRow.display_name,
      version: updatedRow.version,
    };

    // Get the previous hash from the last history entry
    const lastHistory = await queryFn(
      `
      SELECT current_hash FROM person_history
      WHERE person_id = $1
      ORDER BY changed_at DESC
      LIMIT 1
    `,
      [personId],
    );

    const previousHash = lastHistory.rows[0]?.current_hash || null;
    const currentHash = HashChainService.createChainHash(
      snapshot,
      previousHash,
    );

    // Insert history record
    // change_type must be lowercase to match DB CHECK constraint
    await queryFn(
      `
      INSERT INTO person_history (
        person_id, snapshot, changed_by, change_type,
        change_reason, previous_hash, current_hash
      ) VALUES ($1, $2, $3, 'update', $4, $5, $6)
    `,
      [
        personId,
        JSON.stringify(snapshot),
        actorId,
        reason,
        previousHash,
        currentHash,
      ],
    );

    // Log the update
    logger.info("Person updated", {
      personId,
      version: updatedRow.version,
      reason,
    });

    // Return updated Person domain object
    return new Person(updatedRow);
  }

  /**
   * Soft-delete a person (set is_deleted = true).
   * We NEVER hard-delete — data must be preserved for 7+ years.
   *
   * @param {string} personId - UUID of the person
   * @param {string} actorId - Who is deleting
   * @param {string} reason - Why the deletion is happening
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<boolean>} True if deleted
   */
  static async softDelete(
    personId,
    actorId,
    reason = "Soft delete",
    client = null,
  ) {
    const queryFn = client ? client.query.bind(client) : query;

    // Set is_deleted flag — don't actually remove the row
    const sql = `
      UPDATE persons
      SET is_deleted = true, updated_by = $2, updated_at = NOW(), version = version + 1
      WHERE person_id = $1 AND is_deleted = false
      RETURNING *
    `;

    const result = await queryFn(sql, [personId, actorId]);

    // Record in history
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const snapshot = {
        person_id: personId,
        is_deleted: true,
        version: row.version,
      };

      const lastHistory = await queryFn(
        `
        SELECT current_hash FROM person_history
        WHERE person_id = $1
        ORDER BY changed_at DESC LIMIT 1
      `,
        [personId],
      );

      const previousHash = lastHistory.rows[0]?.current_hash || null;
      const currentHash = HashChainService.createChainHash(
        snapshot,
        previousHash,
      );

      await queryFn(
        `
        INSERT INTO person_history (
          person_id, snapshot, changed_by, change_type,
          change_reason, previous_hash, current_hash
        ) VALUES ($1, $2, $3, 'status_change', $4, $5, $6)
      `,
        [
          personId,
          JSON.stringify(snapshot),
          actorId,
          reason,
          previousHash,
          currentHash,
        ],
      );

      logger.info("Person soft-deleted", { personId, reason });
    }

    return result.rows.length > 0;
  }

  /**
   * List persons with filtering and pagination.
   *
   * @param {Object} filters - { personType, status, departmentCode }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<{ persons: Array<Person>, total: number }>}
   */
  static async list(filters = {}, pagination = { limit: 50, offset: 0 }) {
    // Build WHERE clauses dynamically
    const conditions = ["is_deleted = false"];
    const values = [];
    let paramIndex = 1;

    if (filters.personType) {
      conditions.push(`person_type = $${paramIndex++}`);
      values.push(filters.personType);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.departmentCode) {
      conditions.push(`department_code = $${paramIndex++}`);
      values.push(filters.departmentCode);
    }

    // Count total matching records
    const countSql = `SELECT COUNT(*) as total FROM persons WHERE ${conditions.join(" AND ")}`;
    const countResult = await query(countSql, values);
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch the page of results
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = pagination.offset || 0;

    values.push(limit);
    values.push(offset);

    const sql = `
      SELECT * FROM persons
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await query(sql, values);

    // Map rows to Person domain objects
    const persons = result.rows.map((row) => new Person(row));

    return { persons, total };
  }

  /**
   * Get the hash chain history for a person.
   * Used for integrity verification.
   *
   * @param {string} personId - UUID of the person
   * @returns {Promise<Array>} History entries in chronological order
   */
  static async getHistory(personId) {
    const sql = `
      SELECT * FROM person_history
      WHERE person_id = $1
      ORDER BY changed_at ASC
    `;

    const result = await query(sql, [personId]);
    return result.rows;
  }
}

// ============================================================
// Export PersonRepository class
// ============================================================
module.exports = PersonRepository;
