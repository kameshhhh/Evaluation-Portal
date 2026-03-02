// ============================================================
// SCARCITY VALIDATION MIDDLEWARE — Request Validation
// ============================================================
// Validates incoming requests for scarcity API endpoints.
// Checks required fields, data types, and business constraints
// BEFORE the request reaches the controller.
//
// NO external dependencies (Joi, express-validator, etc.).
// Uses the same manual validation pattern as the rest of the codebase.
//
// VALIDATION STRATEGY:
//   - Early return on first failure (fail fast)
//   - Consistent error response format: { success: false, error, code }
//   - Only validates structure, not business rules (that's ScarcityEngine)
// ============================================================

// Import evaluation mode validator for mode checking
const {
  isValidEvaluationMode,
} = require("../services/scarcity/PoolComputationService");

// ============================================================
// validateCreateSession — POST /api/scarcity/sessions/:id/configure
// ============================================================
/**
 * Validate the request body for configuring scarcity on a session.
 *
 * Required fields:
 *   - mode: string (valid evaluation mode)
 *   - evaluatorIds: array of UUID strings (at least one)
 *
 * Optional fields:
 *   - poolConfig: object (mode-specific configuration)
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const validateCreateSession = (req, res, next) => {
  const { mode, evaluatorIds, poolConfig } = req.body;

  // ---------------------------------------------------------
  // CHECK 1: mode is required and must be a valid evaluation mode
  // ---------------------------------------------------------
  if (!mode || typeof mode !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing required field: mode",
      code: "VALIDATION_ERROR",
    });
  }

  if (!isValidEvaluationMode(mode)) {
    return res.status(400).json({
      success: false,
      error: `Invalid evaluation mode: '${mode}'. Valid modes: project_member, cross_project, faculty, peer`,
      code: "VALIDATION_ERROR",
    });
  }

  // ---------------------------------------------------------
  // CHECK 2: evaluatorIds must be a non-empty array of strings
  // ---------------------------------------------------------
  if (!Array.isArray(evaluatorIds) || evaluatorIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: "evaluatorIds must be a non-empty array of person UUIDs",
      code: "VALIDATION_ERROR",
    });
  }

  // Verify each evaluator ID is a non-empty string
  for (let i = 0; i < evaluatorIds.length; i++) {
    if (!evaluatorIds[i] || typeof evaluatorIds[i] !== "string") {
      return res.status(400).json({
        success: false,
        error: `Invalid evaluator ID at index ${i}: must be a non-empty string`,
        code: "VALIDATION_ERROR",
      });
    }
  }

  // ---------------------------------------------------------
  // CHECK 3: poolConfig is optional but must be an object if provided
  // ---------------------------------------------------------
  if (
    poolConfig !== undefined &&
    (typeof poolConfig !== "object" || poolConfig === null)
  ) {
    return res.status(400).json({
      success: false,
      error: "poolConfig must be an object if provided",
      code: "VALIDATION_ERROR",
    });
  }

  // All checks passed — proceed to controller
  next();
};

// ============================================================
// validateSubmitAllocations — POST /api/scarcity/sessions/:id/allocate
// ============================================================
/**
 * Validate the request body for submitting allocations.
 *
 * Required fields:
 *   - evaluatorId: string (UUID of the evaluator)
 *   - allocations: array of { targetId, points } objects
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const validateSubmitAllocations = (req, res, next) => {
  const { evaluatorId, allocations } = req.body;

  // ---------------------------------------------------------
  // CHECK 1: evaluatorId is required
  // ---------------------------------------------------------
  if (!evaluatorId || typeof evaluatorId !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing required field: evaluatorId",
      code: "VALIDATION_ERROR",
    });
  }

  // ---------------------------------------------------------
  // CHECK 2: allocations must be a non-empty array
  // ---------------------------------------------------------
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({
      success: false,
      error: "allocations must be a non-empty array",
      code: "VALIDATION_ERROR",
    });
  }

  // ---------------------------------------------------------
  // CHECK 3: Each allocation must have targetId and valid points
  // ---------------------------------------------------------
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];

    // targetId is required
    if (!alloc.targetId || typeof alloc.targetId !== "string") {
      return res.status(400).json({
        success: false,
        error: `Allocation at index ${i}: missing or invalid targetId`,
        code: "VALIDATION_ERROR",
      });
    }

    // points must be a non-negative number
    if (
      typeof alloc.points !== "number" ||
      isNaN(alloc.points) ||
      alloc.points < 0
    ) {
      return res.status(400).json({
        success: false,
        error: `Allocation at index ${i}: points must be a non-negative number, got: ${alloc.points}`,
        code: "VALIDATION_ERROR",
      });
    }
  }

  // ---------------------------------------------------------
  // CHECK 4: No duplicate targetIds in the same submission
  // ---------------------------------------------------------
  const targetIds = allocations.map((a) => a.targetId);
  const uniqueTargets = new Set(targetIds);
  if (targetIds.length !== uniqueTargets.size) {
    return res.status(400).json({
      success: false,
      error: "Duplicate target IDs found in allocations",
      code: "DUPLICATE_TARGETS",
    });
  }

  // All checks passed — proceed to controller
  next();
};

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  validateCreateSession,
  validateSubmitAllocations,
};
