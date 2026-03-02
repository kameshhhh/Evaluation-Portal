// ============================================================
// ZERO SCORE INTERPRETER — Semantic Analysis of Zero Allocations
// ============================================================
// Pure functions that infer WHY an evaluator gave zero points
// to a target. The interpretation is for analytics only —
// NEVER shown to evaluators or targets directly.
//
// SRS 4.1.5: "When a member receives zero, judge must implicitly
// classify it as:
//   - Not selected due to scarcity
//   - Below expectation
//   - Insufficient observation
// Classification is internal, used for analytics only."
//
// INTERPRETATION LOGIC:
//   1. SCARCITY_DRIVEN: Pool was nearly exhausted, zero was forced
//      (high pool utilization + multiple zeros = evidence of scarcity)
//   2. BELOW_EXPECTATION: Others got points, this one did not
//      (pool had room, evaluator chose to give zero)
//   3. INSUFFICIENT_OBSERVATION: Evaluator couldn't evaluate
//      (all or most targets got zero = uncertainty, not judgment)
//
// No database access, no side effects — just classification logic.
// ============================================================

// ============================================================
// CONSTANTS — Interpretation thresholds and reason codes
// ============================================================

// The three possible reasons for a zero allocation (SRS 4.1.5)
const ZERO_REASONS = Object.freeze({
  SCARCITY_DRIVEN: "scarcity_driven", // Pool too small, had to choose others
  BELOW_EXPECTATION: "below_expectation", // Deliberately gave zero despite room
  INSUFFICIENT_OBSERVATION: "insufficient_observation", // Didn't observe enough
});

// Pool utilization threshold for scarcity-driven interpretation
// If > 90% of pool is used, zeros are likely scarcity-driven
const SCARCITY_UTILIZATION_THRESHOLD = 0.9;

// Zero percentage threshold for scarcity-driven interpretation
// If > 30% of targets got zero AND pool is nearly exhausted
const SCARCITY_ZERO_RATIO_THRESHOLD = 0.3;

// Confidence scores for each interpretation type
// Higher = more certain the classification is correct
const CONFIDENCE_SCORES = Object.freeze({
  SCARCITY_DRIVEN: 0.85, // High confidence — pattern is clear
  BELOW_EXPECTATION: 0.75, // Medium-high — could be scarcity edge case
  INSUFFICIENT_OBSERVATION: 0.6, // Lower — ambiguous pattern
});

// ============================================================
// interpretZeroAllocations — Bulk interpretation
// ============================================================
/**
 * Interpret all zero-point allocations for an evaluator in a session.
 *
 * Analyzes the full allocation pattern to determine why each
 * target received zero points. Returns an array of interpretations
 * with confidence scores.
 *
 * @param {Array<Object>} allocations - All allocations for this evaluator
 *   Each: { targetId, points }
 * @param {number} poolSize - Total pool size for the session
 * @returns {Array<Object>} Interpretations for zero allocations only
 *   Each: { targetId, inferredReason, confidence, context }
 */
function interpretZeroAllocations(allocations, poolSize) {
  // Find all zero allocations — these are the ones we need to interpret
  const zeroAllocations = allocations.filter((a) => a.points === 0);

  // If no zeros, nothing to interpret
  if (zeroAllocations.length === 0) {
    return [];
  }

  // Calculate the allocation pattern metrics
  // These are used by all interpretations to infer intent
  const totalAllocated = allocations.reduce((sum, a) => sum + a.points, 0);
  const poolUtilization = poolSize > 0 ? totalAllocated / poolSize : 0;
  const zeroRatio =
    allocations.length > 0 ? zeroAllocations.length / allocations.length : 0;

  // Interpret each zero allocation using the pattern context
  return zeroAllocations.map((allocation) => {
    const reason = _inferSingleZero(
      allocation,
      allocations,
      poolSize,
      poolUtilization,
      zeroRatio,
    );

    return {
      targetId: allocation.targetId, // Who got zero
      inferredReason: reason.inferredReason, // Why (enum)
      confidence: reason.confidence, // How sure (0-1)
      context: reason.context, // Supporting data
    };
  });
}

// ============================================================
// interpretSingleZero — Single zero interpretation (public API)
// ============================================================
/**
 * Interpret a single zero allocation.
 * The public interface for when you already know which allocation
 * to interpret and have the full allocation context.
 *
 * @param {Object} zeroAllocation - The zero allocation { targetId, points: 0 }
 * @param {Array<Object>} allAllocations - All allocations in the session
 * @param {number} poolSize - Session pool size
 * @returns {Object} { inferredReason, confidence, context }
 */
function interpretSingleZero(zeroAllocation, allAllocations, poolSize) {
  // Calculate pattern metrics from the full allocation set
  const totalAllocated = allAllocations.reduce((sum, a) => sum + a.points, 0);
  const poolUtilization = poolSize > 0 ? totalAllocated / poolSize : 0;
  const zeroRatio =
    allAllocations.length > 0
      ? allAllocations.filter((a) => a.points === 0).length /
        allAllocations.length
      : 0;

  // Delegate to the core inference function
  return _inferSingleZero(
    zeroAllocation,
    allAllocations,
    poolSize,
    poolUtilization,
    zeroRatio,
  );
}

// ============================================================
// PRIVATE — Core inference logic
// ============================================================
/**
 * Infer the reason for a single zero allocation based on pattern analysis.
 *
 * Decision tree:
 *   1. High utilization + many zeros → SCARCITY_DRIVEN
 *   2. Others got points → BELOW_EXPECTATION
 *   3. Fallback → INSUFFICIENT_OBSERVATION
 *
 * @param {Object} allocation - The zero allocation
 * @param {Array<Object>} allAllocations - Complete allocation set
 * @param {number} poolSize - Session pool size
 * @param {number} poolUtilization - Fraction of pool used (0-1)
 * @param {number} zeroRatio - Fraction of targets that got zero (0-1)
 * @returns {Object} { inferredReason, confidence, context }
 */
function _inferSingleZero(
  allocation,
  allAllocations,
  poolSize,
  poolUtilization,
  zeroRatio,
) {
  // Count zeros for context metrics
  const zeroCount = allAllocations.filter((a) => a.points === 0).length;
  const totalAllocated = allAllocations.reduce((sum, a) => sum + a.points, 0);

  // ---------------------------------------------------------
  // REASON 1: SCARCITY_DRIVEN
  // Pool was nearly exhausted AND multiple targets got zero.
  // The evaluator likely WANTED to give points but couldn't.
  // Evidence: high utilization (>90%) + many zeros (>30%)
  // ---------------------------------------------------------
  if (
    poolUtilization > SCARCITY_UTILIZATION_THRESHOLD &&
    zeroRatio > SCARCITY_ZERO_RATIO_THRESHOLD
  ) {
    return {
      inferredReason: ZERO_REASONS.SCARCITY_DRIVEN,
      confidence: CONFIDENCE_SCORES.SCARCITY_DRIVEN,
      context: {
        poolUtilization: parseFloat(poolUtilization.toFixed(3)),
        zeroPercentage: parseFloat((zeroRatio * 100).toFixed(1)),
        poolSize,
        totalAllocated: parseFloat(totalAllocated.toFixed(2)),
      },
    };
  }

  // ---------------------------------------------------------
  // REASON 2: BELOW_EXPECTATION
  // Other targets received points, so the evaluator had room
  // but deliberately chose not to give this target any.
  // Evidence: at least one other target has points > 0
  // ---------------------------------------------------------
  const othersHavePoints = allAllocations
    .filter((a) => a.targetId !== allocation.targetId)
    .some((a) => a.points > 0);

  if (othersHavePoints) {
    // Calculate how much others received for context
    const nonZeroAllocations = allAllocations.filter((a) => a.points > 0);
    const maxAllocation = Math.max(...allAllocations.map((a) => a.points));
    const avgNonZero =
      nonZeroAllocations.length > 0
        ? nonZeroAllocations.reduce((sum, a) => sum + a.points, 0) /
          nonZeroAllocations.length
        : 0;

    return {
      inferredReason: ZERO_REASONS.BELOW_EXPECTATION,
      confidence: CONFIDENCE_SCORES.BELOW_EXPECTATION,
      context: {
        maxAllocation: parseFloat(maxAllocation.toFixed(2)),
        averageNonZero: parseFloat(avgNonZero.toFixed(2)),
        zeroCount,
        totalTargets: allAllocations.length,
      },
    };
  }

  // ---------------------------------------------------------
  // REASON 3: INSUFFICIENT_OBSERVATION (fallback)
  // No one got points — evaluator likely didn't observe enough.
  // This could also mean the evaluator hasn't started yet.
  // ---------------------------------------------------------
  return {
    inferredReason: ZERO_REASONS.INSUFFICIENT_OBSERVATION,
    confidence: CONFIDENCE_SCORES.INSUFFICIENT_OBSERVATION,
    context: {
      allZero: zeroCount === allAllocations.length,
      poolUtilization: parseFloat(poolUtilization.toFixed(3)),
      totalTargets: allAllocations.length,
    },
  };
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  // Main interpretation functions
  interpretZeroAllocations,
  interpretSingleZero,

  // Constants (exported for tests and analytics)
  ZERO_REASONS,
  SCARCITY_UTILIZATION_THRESHOLD,
  SCARCITY_ZERO_RATIO_THRESHOLD,
  CONFIDENCE_SCORES,

  // Private helper exported with underscore prefix for testing
  _inferSingleZero,
};
