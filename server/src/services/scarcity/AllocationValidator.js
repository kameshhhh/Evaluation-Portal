// ============================================================
// ALLOCATION VALIDATOR — Scarcity Constraint Enforcement
// ============================================================
// Pure validation functions for point allocations.
// No database access, no side effects — just math and rules.
//
// SRS REFERENCE:
//   4.1.3 — "System shall prevent exceeding total"
//   4.1.3 — "No per-member upper cap"
//   4.1.3 — "Judge must distribute all or part of the pool"
//
// SCARCITY RULE (CORE INVARIANT):
//   For any evaluator in any session:
//     Σ allocations[evaluator] ≤ session.poolSize
//
// This validator checks allocations BEFORE they reach the database.
// The database trigger provides a second layer of enforcement.
// ============================================================

// ============================================================
// VALIDATION RESULT CODES — Frozen enum
// ============================================================
const VALIDATION_CODES = Object.freeze({
  VALID: "VALID", // All checks passed
  POOL_EXCEEDED: "POOL_EXCEEDED", // Σ points > poolSize
  NEGATIVE_POINTS: "NEGATIVE_POINTS", // points < 0 on any allocation
  DUPLICATE_TARGETS: "DUPLICATE_TARGETS", // Same targetId appears twice
  EMPTY_ALLOCATIONS: "EMPTY_ALLOCATIONS", // Empty allocations array
  INVALID_FORMAT: "INVALID_FORMAT", // Missing fields or wrong types
  SELF_ALLOCATION: "SELF_ALLOCATION", // Evaluator allocating to themselves
});

// ============================================================
// validateAllocations — Main validation function
// ============================================================
/**
 * Validate a set of allocations against the scarcity pool constraint.
 *
 * Checks (in order):
 *   1. Allocations array is non-empty and well-formed
 *   2. No negative points (zero is valid — SRS 4.1.5)
 *   3. No duplicate target IDs
 *   4. Evaluator is not allocating to themselves
 *   5. Total does not exceed pool size (THE scarcity rule)
 *
 * @param {Array<Object>} allocations - Array of { targetId, points } objects
 * @param {number} poolSize - Maximum total points allowed
 * @param {number} [existingTotal=0] - Points already allocated by this evaluator
 * @param {string} [evaluatorId=null] - Evaluator ID (for self-allocation check)
 * @returns {Object} Validation result with { valid, code, message, details }
 *
 * @example
 * validateAllocations(
 *   [{ targetId: 'a', points: 8 }, { targetId: 'b', points: 5 }],
 *   15,
 *   0
 * )
 * // → { valid: true, totalAllocated: 13, remainingPool: 2, ... }
 */
function validateAllocations(
  allocations,
  poolSize,
  existingTotal = 0,
  evaluatorId = null,
) {
  // ---------------------------------------------------------
  // CHECK 1: Allocations array must be non-empty and an array
  // ---------------------------------------------------------
  if (!Array.isArray(allocations)) {
    return _buildFailure(
      VALIDATION_CODES.INVALID_FORMAT,
      "Allocations must be an array",
    );
  }

  if (allocations.length === 0) {
    return _buildFailure(
      VALIDATION_CODES.EMPTY_ALLOCATIONS,
      "At least one allocation is required",
    );
  }

  // ---------------------------------------------------------
  // CHECK 2: Every allocation must have valid structure
  // Each allocation needs targetId (string) and points (number >= 0)
  // ---------------------------------------------------------
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];

    // Must have targetId
    if (!alloc.targetId) {
      return _buildFailure(
        VALIDATION_CODES.INVALID_FORMAT,
        `Allocation at index ${i} is missing targetId`,
      );
    }

    // Points must be a number
    if (typeof alloc.points !== "number" || isNaN(alloc.points)) {
      return _buildFailure(
        VALIDATION_CODES.INVALID_FORMAT,
        `Allocation at index ${i} has invalid points: ${alloc.points}`,
      );
    }

    // No negative points (zero is valid — SRS 4.1.5)
    if (alloc.points < 0) {
      return _buildFailure(
        VALIDATION_CODES.NEGATIVE_POINTS,
        `Negative points not allowed: ${alloc.points} for target ${alloc.targetId}`,
        { targetId: alloc.targetId, points: alloc.points },
      );
    }
  }

  // ---------------------------------------------------------
  // CHECK 3: No duplicate target IDs
  // Each target can only receive one allocation per submission
  // ---------------------------------------------------------
  const targetIds = allocations.map((a) => a.targetId);
  const uniqueTargets = new Set(targetIds);

  if (targetIds.length !== uniqueTargets.size) {
    // Find the duplicate(s) for the error message
    const seen = new Set();
    const duplicates = [];
    for (const id of targetIds) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }

    return _buildFailure(
      VALIDATION_CODES.DUPLICATE_TARGETS,
      `Duplicate target IDs found: ${duplicates.join(", ")}`,
      { duplicateTargetIds: duplicates },
    );
  }

  // ---------------------------------------------------------
  // CHECK 4: Evaluator cannot allocate to themselves
  // Self-allocation would break the fairness model
  // ---------------------------------------------------------
  if (evaluatorId) {
    const selfAllocation = allocations.find((a) => a.targetId === evaluatorId);
    if (selfAllocation) {
      return _buildFailure(
        VALIDATION_CODES.SELF_ALLOCATION,
        "Evaluators cannot allocate points to themselves",
        { evaluatorId, selfPoints: selfAllocation.points },
      );
    }
  }

  // ---------------------------------------------------------
  // CHECK 5: SCARCITY CONSTRAINT — Σ ≤ poolSize
  // This is THE core rule of the entire system.
  // existingTotal represents points already in the database.
  // newTotal is what this submission adds.
  // finalTotal = existingTotal + newTotal must be ≤ poolSize.
  // ---------------------------------------------------------
  const newTotal = allocations.reduce((sum, alloc) => sum + alloc.points, 0);
  const finalTotal = existingTotal + newTotal;

  if (finalTotal > poolSize) {
    return _buildFailure(
      VALIDATION_CODES.POOL_EXCEEDED,
      `Pool exceeded: allocated ${finalTotal.toFixed(2)} of ${poolSize} points ` +
        `(excess: ${(finalTotal - poolSize).toFixed(2)})`,
      {
        existingTotal,
        newTotal,
        finalTotal,
        poolSize,
        excess: finalTotal - poolSize,
      },
    );
  }

  // ---------------------------------------------------------
  // ALL CHECKS PASSED — Return success with pool metrics
  // ---------------------------------------------------------
  return {
    valid: true,
    code: VALIDATION_CODES.VALID,
    totalAllocated: finalTotal,
    newTotal,
    existingTotal,
    remainingPool: poolSize - finalTotal,
    utilizationPercentage: poolSize > 0 ? (finalTotal / poolSize) * 100 : 0,
    allocationCount: allocations.length,
    zeroCount: allocations.filter((a) => a.points === 0).length,
  };
}

// ============================================================
// SINGLE ALLOCATION VALIDATOR
// ============================================================
/**
 * Validate a single allocation update without the full batch context.
 * Used for real-time UI validation as the evaluator adjusts points.
 *
 * @param {number} points - The points to allocate
 * @param {number} poolSize - Total pool size
 * @param {number} currentUsed - Currently used points (excluding this target)
 * @returns {Object} { valid, remainingAfter, message }
 */
function validateSingleAllocation(points, poolSize, currentUsed) {
  // Points must be non-negative
  if (points < 0) {
    return {
      valid: false,
      remainingAfter: poolSize - currentUsed,
      message: "Points cannot be negative",
    };
  }

  // Check if this allocation would exceed the pool
  const totalAfter = currentUsed + points;
  if (totalAfter > poolSize) {
    return {
      valid: false,
      remainingAfter: poolSize - currentUsed,
      message: `Exceeds pool by ${(totalAfter - poolSize).toFixed(1)} points`,
    };
  }

  // Valid allocation
  return {
    valid: true,
    remainingAfter: poolSize - totalAfter,
    message: points === 0 ? "Zero allocation (valid)" : null,
  };
}

// ============================================================
// PRIVATE HELPER — Build failure result
// ============================================================
/**
 * Build a standardized validation failure result.
 *
 * @param {string} code - Validation error code
 * @param {string} message - Human-readable error message
 * @param {Object} [details={}] - Additional error context
 * @returns {Object} Failure result
 */
function _buildFailure(code, message, details = {}) {
  return {
    valid: false,
    code,
    message,
    details,
  };
}

// ============================================================
// RUBRIC VALIDATION CODES (additional)
// ============================================================
const RUBRIC_CODES = Object.freeze({
  RUBRIC_POOL_EXCEEDED: "RUBRIC_POOL_EXCEEDED",   // Points exceed per-rubric pool
  MISSING_HEAD_ID: "MISSING_HEAD_ID",             // Rubric allocation missing headId
  RUBRIC_COUNT_MISMATCH: "RUBRIC_COUNT_MISMATCH", // Wrong number of rubrics submitted
});

// ============================================================
// validateRubricAllocations — Rubric-Based Pool Validation
// ============================================================
/**
 * Validate a rubric-based allocation set.
 * Enforces TWO levels of pool constraint (SRS §4.1.4):
 *   1. Per-rubric pool: Σ(points for rubric X) ≤ rubricPools[X]
 *   2. Grand total:     Σ(all points) ≤ totalPool
 *
 * @param {Array<Object>} allocations - Array of { targetId, points, headId } objects
 * @param {number}        totalPool   - Grand total pool (team_size × 5)
 * @param {Object}        rubricPools - Map of { [headId]: poolSize } per rubric
 * @param {string}        [evaluatorId] - For self-allocation check
 * @returns {Object} Validation result
 *
 * @example
 * validateRubricAllocations(
 *   [
 *     { targetId: 'a', points: 3, headId: 'clarity-uuid' },
 *     { targetId: 'b', points: 1, headId: 'clarity-uuid' },
 *     { targetId: 'c', points: 1, headId: 'clarity-uuid' },
 *     { targetId: 'a', points: 2, headId: 'effort-uuid'  },
 *     ...
 *   ],
 *   15,
 *   { 'clarity-uuid': 5, 'effort-uuid': 5, 'confidence-uuid': 5 }
 * )
 */
function validateRubricAllocations(
  allocations,
  totalPool,
  rubricPools,
  evaluatorId = null,
) {
  // Basic array check
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return _buildFailure(VALIDATION_CODES.EMPTY_ALLOCATIONS, "At least one allocation is required");
  }

  // Every allocation must have headId when rubric mode
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    if (!alloc.headId) {
      return _buildFailure(
        RUBRIC_CODES.MISSING_HEAD_ID,
        `Allocation at index ${i} missing headId — required in rubric mode`,
      );
    }
    if (!alloc.targetId) {
      return _buildFailure(VALIDATION_CODES.INVALID_FORMAT, `Allocation at index ${i} missing targetId`);
    }
    if (typeof alloc.points !== "number" || isNaN(alloc.points) || alloc.points < 0) {
      return _buildFailure(VALIDATION_CODES.NEGATIVE_POINTS, `Invalid points at index ${i}: ${alloc.points}`);
    }
    // Self-allocation check
    if (evaluatorId && alloc.targetId === evaluatorId) {
      return _buildFailure(VALIDATION_CODES.SELF_ALLOCATION, "Evaluators cannot allocate points to themselves");
    }
  }

  // Per-rubric pool enforcement
  const headTotals = {};
  for (const alloc of allocations) {
    headTotals[alloc.headId] = (headTotals[alloc.headId] || 0) + alloc.points;
  }

  for (const [headId, usedPoints] of Object.entries(headTotals)) {
    const rubricPool = rubricPools[headId];
    if (rubricPool === undefined) continue; // unknown head — skip (DB trigger catches it)
    if (usedPoints > rubricPool) {
      return _buildFailure(
        RUBRIC_CODES.RUBRIC_POOL_EXCEEDED,
        `Rubric pool exceeded for head ${headId}: used ${usedPoints.toFixed(1)} of ${rubricPool}`,
        { headId, usedPoints, rubricPool, excess: usedPoints - rubricPool },
      );
    }
  }

  // Grand total enforcement
  const grandTotal = allocations.reduce((s, a) => s + a.points, 0);
  if (grandTotal > totalPool) {
    return _buildFailure(
      VALIDATION_CODES.POOL_EXCEEDED,
      `Grand total pool exceeded: ${grandTotal.toFixed(1)} > ${totalPool}`,
      { grandTotal, totalPool, excess: grandTotal - totalPool },
    );
  }

  return {
    valid: true,
    code: VALIDATION_CODES.VALID,
    grandTotal,
    remainingPool: totalPool - grandTotal,
    utilizationPercentage: totalPool > 0 ? (grandTotal / totalPool) * 100 : 0,
    rubricTotals: headTotals,
  };
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  // Main validation functions
  validateAllocations,
  validateSingleAllocation,
  validateRubricAllocations,

  // Constants (exported for tests and error handling)
  VALIDATION_CODES,
  RUBRIC_CODES,

  // Private helper exported with underscore prefix for testing
  _buildFailure,
};
