// ============================================================
// PERSON SERVICE — Business Logic for Person Operations
// ============================================================
// Orchestrates person-related operations by combining:
//   - PersonValidator (input validation)
//   - PersonRepository (database access)
//   - Domain events (audit trail)
//
// This service is the ONLY entry point for person operations.
// Controllers call this service; this service calls repositories.
//
// DEPENDENCY CHAIN:
//   Controller → Service → Repository → Database
//   Controller → Service → Validator
//   Controller → Service → Domain Events
// ============================================================

// Import the person repository for database operations
const PersonRepository = require("../repositories/PersonRepository");

// Import the person validator for input validation
const { PersonValidator } = require("../validators/PersonValidator");

// Import domain events for audit trail
const { createEvent, EventTypes } = require("../events/EntityEvents");

// Import custom errors
const { PersonNotFoundError } = require("../entities/EntityErrors");

// Import the database client for transactions
const { getClient } = require("../config/database");

// Import logger for operation tracking
const logger = require("../utils/logger");

// ============================================================
// PersonService class — orchestrates person operations
// ============================================================
class PersonService {
  /**
   * Create a new person.
   * Validates input, creates the record, emits domain event.
   *
   * @param {Object} data - Raw input data from the request
   * @param {string} actorId - UUID of the user performing the action
   * @returns {Promise<Object>} Created Person entity
   */
  static async createPerson(data, actorId) {
    // Step 1: Validate the input data
    const validated = PersonValidator.validateCreate(data);

    // Step 2: Create the person in the database
    const person = await PersonRepository.create(validated, actorId);

    // Step 3: Create a domain event for audit trail
    const event = createEvent(
      EventTypes.PERSON_CREATED,
      {
        personId: person.personId,
        personType: person.personType,
        displayName: person.displayName,
      },
      actorId,
    );

    // Step 4: Log the event (in production, this would go to an event bus)
    logger.info("Domain event emitted", {
      eventType: event.type,
      personId: person.personId,
    });

    // Return the created person
    return person;
  }

  /**
   * Get a person by their UUID.
   * Throws PersonNotFoundError if not found.
   *
   * @param {string} personId - UUID of the person
   * @returns {Promise<Object>} Person entity
   * @throws {PersonNotFoundError}
   */
  static async getPersonById(personId) {
    // Look up the person in the database
    const person = await PersonRepository.findById(personId);

    // Throw if not found — controllers expect this
    if (!person) {
      throw new PersonNotFoundError(`Person ${personId} not found`);
    }

    return person;
  }

  /**
   * Get a person by their identity_id (auth system user ID).
   * Returns null if not found (doesn't throw).
   *
   * @param {string} identityId - internal_user_id from users table
   * @returns {Promise<Object|null>} Person entity or null
   */
  static async getPersonByIdentityId(identityId) {
    return PersonRepository.findByIdentityId(identityId);
  }

  /**
   * Update a person's information.
   * Validates input, performs update with optimistic concurrency.
   *
   * @param {string} personId - UUID of the person to update
   * @param {Object} data - Fields to update (must include version)
   * @param {string} actorId - Who is making the change
   * @param {string} reason - Why the change is being made
   * @returns {Promise<Object>} Updated Person entity
   */
  static async updatePerson(personId, data, actorId, reason = "Update") {
    // Step 1: Validate the update data
    const validated = PersonValidator.validateUpdate(data);

    // Step 2: Perform the update (includes version check)
    const updated = await PersonRepository.update(
      personId,
      validated,
      actorId,
      reason,
    );

    // Step 3: Emit domain event
    const event = createEvent(
      EventTypes.PERSON_UPDATED,
      {
        personId: updated.personId,
        changes: Object.keys(validated).filter((k) => k !== "version"),
      },
      actorId,
    );

    logger.info("Domain event emitted", {
      eventType: event.type,
      personId: updated.personId,
    });

    return updated;
  }

  /**
   * Deactivate (soft-delete) a person.
   *
   * @param {string} personId - UUID of the person
   * @param {string} actorId - Who is performing the deactivation
   * @param {string} reason - Why the person is being deactivated
   * @returns {Promise<boolean>} True if deactivated
   */
  static async deactivatePerson(personId, actorId, reason = "Deactivated") {
    // Verify person exists
    const person = await PersonRepository.findById(personId);
    if (!person) {
      throw new PersonNotFoundError(`Person ${personId} not found`);
    }

    // Soft-delete
    const result = await PersonRepository.softDelete(personId, actorId, reason);

    // Emit domain event
    if (result) {
      const event = createEvent(
        EventTypes.PERSON_DEACTIVATED,
        {
          personId,
          reason,
        },
        actorId,
      );

      logger.info("Domain event emitted", {
        eventType: event.type,
        personId,
      });
    }

    return result;
  }

  /**
   * List persons with optional filters.
   *
   * @param {Object} filters - { personType, status, departmentCode }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<{ persons: Array, total: number }>}
   */
  static async listPersons(filters = {}, pagination = {}) {
    return PersonRepository.list(filters, pagination);
  }

  /**
   * Get the change history for a person.
   * Returns all hash chain entries in chronological order.
   *
   * @param {string} personId - UUID of the person
   * @returns {Promise<Array>} History entries
   */
  static async getPersonHistory(personId) {
    // Verify person exists
    const person = await PersonRepository.findById(personId);
    if (!person) {
      throw new PersonNotFoundError(`Person ${personId} not found`);
    }

    return PersonRepository.getHistory(personId);
  }
}

// ============================================================
// Export PersonService class
// ============================================================
module.exports = PersonService;
