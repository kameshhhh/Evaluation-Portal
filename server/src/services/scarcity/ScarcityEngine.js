// ============================================================
// SCARCITY ENGINE — Core Orchestrator for Scarcity Evaluations
// ============================================================
// Coordinates all scarcity evaluation operations:
//   1. Session creation with pool calculation
//   2. Allocation submission with validation
//   3. Zero-score interpretation
//   4. Pool status queries with isolation
//
// This is the SERVICE LAYER — controllers call this,
// and this calls repositories + pure function modules.
//
// SRS REFERENCE:
//   4.1.3 — Scarcity-Based Individual Scoring
//   4.1.5 — Zero-Score Semantics
//   4.2.1 — Independent Scoring (judge isolation)
//   4.2.2 — Aggregation Logic (credibility-weighted)
//
// DEPENDENCY GRAPH:
//   ScarcityEngine
//     → PoolComputationService (pool size calculation)
//     → AllocationValidator (allocation constraint checking)
//     → ZeroScoreInterpreter (zero-score semantics)
//     → SessionIsolationService (evaluator isolation)
//     → ScarcityRepository (database operations)
// ============================================================

// Import pool computation — calculates pool sizes per mode
const {
  calculatePoolSize,
  isValidEvaluationMode,
} = require("./PoolComputationService");

// Import allocation validator — enforces scarcity constraints
const { validateAllocations, validateRubricAllocations } = require("./AllocationValidator");

// Import RubricService for rubric-based pool distribution (SRS §4.1.4)
const RubricService = require("./RubricService");

// Import zero-score interpreter — classifies zero allocations
const { interpretZeroAllocations } = require("./ZeroScoreInterpreter");

// Import session isolation — enforces evaluator independence
const {
  checkEvaluatorAccess,
  canSubmitAllocations,
} = require("./SessionIsolationService");

// Import scarcity repository — all database operations
const ScarcityRepository = require("../../repositories/ScarcityRepository");

// Import logger for operation tracking and audit trail
const logger = require("../../utils/logger");

// Import zero-score reason service — evaluator-provided classifications (SRS §4.1.5)
const { ZeroScoreReasonService } = require("../ZeroScoreReasonService");

// ============================================================
// ScarcityEngine — Main orchestrator class
// ============================================================
class ScarcityEngine {
  // ============================================================
  // CREATE SESSION — Initialize a new scarcity evaluation session
  // ============================================================
  /**
   * Create a new evaluation session with scarcity pool configuration.
   *
   * Steps:
   *   1. Validate the evaluation mode
   *   2. Calculate the pool size based on mode + config
   *   3. Create the session record in the database
   *   4. Assign evaluators to the session
   *
   * @param {Object} params - Session creation parameters
   * @param {string} params.sessionId - Existing evaluation session ID to configure
   * @param {string} params.mode - Evaluation mode (project_member/cross_project/faculty/peer)
   * @param {Object} params.poolConfig - Pool calculation configuration
   * @param {Array<string>} params.evaluatorIds - Person IDs of assigned evaluators
   * @param {string} params.createdBy - Person ID of the session creator
   * @returns {Promise<Object>} Created session with pool info
   */
  static async createSession(params) {
    const {
      sessionId,
      mode,
      poolConfig = {},
      evaluatorIds = [],
      createdBy,
    } = params;

    // ---------------------------------------------------------
    // STEP 1: Validate evaluation mode
    // ---------------------------------------------------------
    if (!isValidEvaluationMode(mode)) {
      throw new Error(`Invalid evaluation mode: '${mode}'`);
    }

    // ---------------------------------------------------------
    // STEP 2: Calculate pool size based on mode
    // Uses pure function — no side effects
    // ---------------------------------------------------------
    const poolSize = calculatePoolSize(mode, poolConfig);

    logger.info("ScarcityEngine: Pool size calculated", {
      sessionId,
      mode,
      poolSize,
      teamSize: poolConfig.teamSize || null,
    });

    // ---------------------------------------------------------
    // STEP 3: Update session with scarcity configuration
    // ---------------------------------------------------------
    const session = await ScarcityRepository.configureSessionScarcity(
      sessionId,
      mode,
      poolSize,
    );

    // ---------------------------------------------------------
    // STEP 4: Assign evaluators to the session
    // ---------------------------------------------------------
    if (evaluatorIds.length > 0) {
      await ScarcityRepository.assignEvaluators(sessionId, evaluatorIds);

      logger.info("ScarcityEngine: Evaluators assigned", {
        sessionId,
        evaluatorCount: evaluatorIds.length,
      });
    }

    // Return the configured session with pool information
    return {
      sessionId: session.session_id,
      evaluationMode: mode,
      poolSize,
      evaluatorCount: evaluatorIds.length,
      status: session.status,
      isRubricSession: false, // will be updated after attach step
    };
  }

  // ============================================================
  // SUBMIT ALLOCATIONS — Process and store point distributions
  // ============================================================
  /**
   * Submit point allocations for an evaluator in a session.
   *
   * Steps:
   *   1. Load session and verify it exists
   *   2. Check evaluator is assigned + session accepts submissions
   *   3. Validate allocations against scarcity pool constraint
   *   4. Store allocations atomically in the database
   *   5. Interpret any zero allocations (SRS 4.1.5)
   *   6. Return pool status and submission confirmation
   *
   * @param {string} sessionId - Evaluation session UUID
   * @param {string} evaluatorId - Person UUID of the evaluator
   * @param {Array<Object>} allocations - Array of { targetId, points, headId? }
   * @param {Array<Object>} [zeroScoreReasons] - Optional evaluator-provided reasons from dialog
   * @returns {Promise<Object>} Submission result with pool status
   * @throws {Error} If session not found, unauthorized, or pool exceeded
   */
  static async submitAllocations(
    sessionId,
    evaluatorId,
    allocations,
    zeroScoreReasons = [],
  ) {
    const startTime = Date.now();

    // ---------------------------------------------------------
    // STEP 1: Load session and verify existence
    // ---------------------------------------------------------
    const session = await ScarcityRepository.getSession(sessionId);

    if (!session) {
      throw new Error(`Evaluation session not found: ${sessionId}`);
    }

    // ---------------------------------------------------------
    // STEP 2: Check submission permissions
    // Session must be open/in_progress, evaluator must be assigned
    // ---------------------------------------------------------
    const submissionCheck = canSubmitAllocations(session);
    if (!submissionCheck.allowed) {
      throw new Error(submissionCheck.reason);
    }

    // Check evaluator is assigned to this session
    const assignedEvaluators =
      await ScarcityRepository.getSessionEvaluatorIds(sessionId);

    if (!assignedEvaluators.includes(evaluatorId)) {
      throw new Error("Evaluator is not assigned to this session");
    }

    // ---------------------------------------------------------
    // STEP 3: Validate allocations against scarcity pool
    // If session has rubrics attached → use rubric validation
    // Otherwise → use legacy global pool validation
    // ---------------------------------------------------------
    let validationResult;
    const sessionRubrics = await RubricService.getSessionRubrics(sessionId);
    const isRubricSession = sessionRubrics.length > 0;

    if (isRubricSession) {
      // Build rubricPools map: { headId → poolSize }
      const rubricPools = {};
      for (const r of sessionRubrics) {
        rubricPools[r.headId] = r.poolSize;
      }

      validationResult = validateRubricAllocations(
        allocations,
        session.scarcity_pool_size,
        rubricPools,
        evaluatorId,
      );
    } else {
      // Legacy: single global pool validation
      validationResult = validateAllocations(
        allocations,
        session.scarcity_pool_size,
        0, // existingTotal = 0 (full replacement strategy)
        evaluatorId,
      );
    }

    if (!validationResult.valid) {
      logger.warn("ScarcityEngine: Allocation validation failed", {
        sessionId,
        evaluatorId,
        isRubricSession,
        code: validationResult.code,
        message: validationResult.message,
      });

      return {
        success: false,
        error: validationResult.code,
        message: validationResult.message,
        details: validationResult.details,
      };
    }

    // ---------------------------------------------------------
    // STEP 4: Store allocations atomically
    // Replaces all existing allocations for this evaluator in session
    // ---------------------------------------------------------
    const storeResult = await ScarcityRepository.storeAllocations(
      sessionId,
      evaluatorId,
      allocations,
    );

    logger.info("ScarcityEngine: Allocations stored", {
      sessionId,
      evaluatorId,
      allocationCount: storeResult.allocationCount,
      totalPoints: storeResult.totalPoints,
      durationMs: Date.now() - startTime,
    });

    // ---------------------------------------------------------
    // STEP 5: Interpret zero allocations (SRS 4.1.5)
    // Non-blocking — failures here don't affect the submission
    // ---------------------------------------------------------
    try {
      const zeroInterpretations = interpretZeroAllocations(
        allocations,
        session.scarcity_pool_size,
      );

      if (zeroInterpretations.length > 0) {
        // Store interpretations in the database for analytics
        await ScarcityRepository.storeZeroInterpretations(
          sessionId,
          evaluatorId,
          zeroInterpretations,
        );

        logger.debug("ScarcityEngine: Zero scores interpreted", {
          sessionId,
          evaluatorId,
          zeroCount: zeroInterpretations.length,
        });
      }
    } catch (interpretError) {
      // Log but don't fail the submission — interpretations are analytics-only
      logger.warn("ScarcityEngine: Zero interpretation failed (non-critical)", {
        sessionId,
        evaluatorId,
        error: interpretError.message,
      });
    }

    // ---------------------------------------------------------
    // STEP 5.5: Store evaluator-provided zero-score reasons (SRS §4.1.5)
    // From the batch dialog shown before submit.
    // Non-blocking — failures don't affect submission.
    // ---------------------------------------------------------
    if (zeroScoreReasons && zeroScoreReasons.length > 0) {
      try {
        await ZeroScoreReasonService.recordReasons({
          evaluationType: "scarcity",
          sessionId,
          evaluatorId,
          reasons: zeroScoreReasons,
        });

        logger.debug("ScarcityEngine: Evaluator zero-score reasons recorded", {
          sessionId,
          evaluatorId,
          reasonCount: zeroScoreReasons.length,
        });
      } catch (reasonError) {
        logger.warn(
          "ScarcityEngine: Zero-score reason storage failed (non-critical)",
          {
            sessionId,
            evaluatorId,
            error: reasonError.message,
          },
        );
      }
    }

    // ---------------------------------------------------------
    // STEP 6: Return submission result with pool status
    // ---------------------------------------------------------
    return {
      success: true,
      data: storeResult,
      poolInfo: {
        poolSize: session.scarcity_pool_size,
        allocatedTotal: validationResult.totalAllocated,
        remainingPool: validationResult.remainingPool,
        utilizationPercentage: validationResult.utilizationPercentage,
      },
    };
  }

  // ============================================================
  // GET SESSION — Retrieve session with evaluator-scoped data
  // ============================================================
  /**
   * Get an evaluation session with data scoped to the requesting evaluator.
   *
   * Enforces SRS 4.2.1 isolation — evaluators only see their own
   * allocations while the session is active.
   *
   * @param {string} sessionId - Evaluation session UUID
   * @param {string} evaluatorId - Person UUID of the requesting evaluator
   * @returns {Promise<Object|null>} Session data with scoped allocations
   */
  static async getSessionForEvaluator(sessionId, evaluatorId) {
    // Load the session
    const session = await ScarcityRepository.getSession(sessionId);
    if (!session) {
      return null;
    }

    // Get assigned evaluators for access check
    const assignedEvaluatorIds =
      await ScarcityRepository.getSessionEvaluatorIds(sessionId);

    // Check access permissions (SRS 4.2.1 isolation)
    const access = checkEvaluatorAccess(
      session,
      evaluatorId,
      assignedEvaluatorIds,
    );

    if (!access.allowed) {
      return null; // Not authorized — return null like findById pattern
    }

    // Get the evaluator's own allocations
    const myAllocations = await ScarcityRepository.getAllocationsByEvaluator(
      sessionId,
      evaluatorId,
    );

    // Get the evaluation targets (project members or comparison subjects)
    const targets = await ScarcityRepository.getSessionTargets(sessionId);

    // Calculate pool usage
    const allocatedTotal = myAllocations.reduce((sum, a) => sum + a.points, 0);

    // Fetch rubric config if session has rubrics
    const rubrics = await RubricService.getSessionRubrics(sessionId);
    const isRubricSession = rubrics.length > 0;

    // Build the response with appropriate scope
    return {
      sessionId: session.session_id,
      sessionType: session.session_type,
      evaluationMode: session.evaluation_mode,
      intent: session.intent,
      status: session.status,
      poolSize: session.scarcity_pool_size,
      isRubricSession,
      rubrics: isRubricSession ? rubrics : [],
      targets,
      myAllocations: myAllocations.map((a) => ({
        targetId: a.target_id,
        points: parseFloat(a.points),
        headId: a.head_id || null,
      })),
      poolInfo: {
        poolSize: session.scarcity_pool_size,
        allocatedTotal,
        remainingPool: session.scarcity_pool_size - allocatedTotal,
      },
      accessScope: access.scope,
    };
  }

  // ============================================================
  // GET POOL STATUS — Current pool usage for an evaluator
  // ============================================================
  /**
   * Get the pool usage status for an evaluator in a session.
   *
   * @param {string} sessionId - Evaluation session UUID
   * @param {string} evaluatorId - Person UUID of the evaluator
   * @returns {Promise<Object>} Pool status { poolSize, allocatedTotal, remainingPool }
   */
  static async getPoolStatus(sessionId, evaluatorId) {
    // Get pool usage from repository
    const poolUsage = await ScarcityRepository.getPoolUsage(
      sessionId,
      evaluatorId,
    );

    if (!poolUsage) {
      return null;
    }

    return {
      poolSize: parseFloat(poolUsage.scarcity_pool_size),
      allocatedTotal: parseFloat(poolUsage.allocated_total),
      remainingPool: parseFloat(poolUsage.remaining_pool),
      utilizationPercentage:
        poolUsage.scarcity_pool_size > 0
          ? (poolUsage.allocated_total / poolUsage.scarcity_pool_size) * 100
          : 0,
    };
  }

  // ============================================================
  // GET MY SESSIONS — List sessions for an evaluator
  // ============================================================
  /**
   * Get all evaluation sessions assigned to an evaluator.
   *
   * @param {string} evaluatorId - Person UUID of the evaluator
   * @returns {Promise<Array>} List of sessions with pool info
   */
  static async getEvaluatorSessions(evaluatorId) {
    return ScarcityRepository.getSessionsByEvaluator(evaluatorId);
  }
}

// ============================================================
// Export the ScarcityEngine class
// All methods are static — no instance needed
// ============================================================
module.exports = ScarcityEngine;
