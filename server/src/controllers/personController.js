// ============================================================
// PERSON CONTROLLER — HTTP Endpoints for Person Operations
// ============================================================
// Handles all HTTP requests for the /api/persons resource.
// Maps HTTP verbs to PersonService methods.
//
// Routes handled by this controller:
//   POST   /api/persons          — Create a new person
//   GET    /api/persons          — List persons (with filters)
//   GET    /api/persons/:id      — Get a single person
//   PATCH  /api/persons/:id      — Update a person
//   DELETE /api/persons/:id      — Deactivate (soft-delete) a person
//   GET    /api/persons/:id/history — Get person's change history
//
// All routes require authentication (handled by auth middleware).
// Error handling is delegated to the global error handler.
// ============================================================

// Import Express Router
const { Router } = require("express");

// Import the person service for business logic
const PersonService = require("../services/PersonService");

// Import the entity audit logger
const { EntityAuditLogger } = require("../services/EntityAuditLogger");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// Create the router instance
// ============================================================
const router = Router();

// ============================================================
// POST /api/persons — Create a new person
// ============================================================
router.post("/", async (req, res, next) => {
  try {
    // Extract the actor ID from the authenticated user
    // req.user is set by the auth middleware (existing system)
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;

    // Create the person via the service layer
    const person = await PersonService.createPerson(req.body, actorId);

    // Log the creation to the audit trail
    await EntityAuditLogger.logCreation(
      "person",
      person.personId,
      person.toJSON(),
      actorId,
      req,
    );

    // Respond with 201 Created and the person data
    res.status(201).json({
      success: true,
      data: person.toJSON(),
    });
  } catch (error) {
    // Pass to global error handler
    next(error);
  }
});

// ============================================================
// GET /api/persons — List persons with optional filters
// ============================================================
router.get("/", async (req, res, next) => {
  try {
    // Extract filter parameters from query string
    const filters = {
      personType: req.query.personType || undefined,
      status: req.query.status || undefined,
      departmentCode: req.query.departmentCode || undefined,
    };

    // Extract pagination parameters
    const pagination = {
      limit: parseInt(req.query.limit, 10) || 50,
      offset: parseInt(req.query.offset, 10) || 0,
    };

    // Fetch the list from the service
    const { persons, total } = await PersonService.listPersons(
      filters,
      pagination,
    );

    // Respond with the list and pagination metadata
    res.json({
      success: true,
      data: persons.map((p) => p.toJSON()),
      pagination: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/persons/:id — Get a single person by UUID
// ============================================================
router.get("/:id", async (req, res, next) => {
  try {
    // Fetch the person — throws PersonNotFoundError if missing
    const person = await PersonService.getPersonById(req.params.id);

    res.json({
      success: true,
      data: person.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// PATCH /api/persons/:id — Update a person
// ============================================================
router.patch("/:id", async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const personId = req.params.id;

    // Get the person before update (for audit trail)
    const before = await PersonService.getPersonById(personId);

    // Perform the update
    const updated = await PersonService.updatePerson(
      personId,
      req.body,
      actorId,
      req.body.reason || "Update via API",
    );

    // Log to audit trail
    await EntityAuditLogger.logUpdate(
      "person",
      personId,
      before.toJSON(),
      updated.toJSON(),
      actorId,
      req,
    );

    res.json({
      success: true,
      data: updated.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// DELETE /api/persons/:id — Deactivate (soft-delete) a person
// ============================================================
router.delete("/:id", async (req, res, next) => {
  try {
    // Falls back to req.body.actorId for API testing without auth middleware
    const actorId = req.user?.userId || req.user?.id || req.body.actorId;
    const personId = req.params.id;

    // Get the person before deletion (for audit trail)
    const before = await PersonService.getPersonById(personId);

    // Perform the soft-delete
    const result = await PersonService.deactivatePerson(
      personId,
      actorId,
      req.body.reason || "Deactivated via API",
    );

    // Log to audit trail
    await EntityAuditLogger.logDeletion(
      "person",
      personId,
      before.toJSON(),
      actorId,
      req,
    );

    res.json({
      success: true,
      message: "Person deactivated successfully",
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// GET /api/persons/:id/history — Get person's change history
// ============================================================
router.get("/:id/history", async (req, res, next) => {
  try {
    const history = await PersonService.getPersonHistory(req.params.id);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Export the router
// ============================================================
module.exports = router;
