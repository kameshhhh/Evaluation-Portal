// ============================================================
// HISTORICAL SCORE SERVICE — Previous Month Scores for Growth-Aware Evaluation
// ============================================================
// SRS §4.1.2: Monthly Review History
//
// Purpose: Retrieve previous month scores for projects and members
// to enable growth-aware evaluation. Judges see improvement trajectories
// rather than scoring in isolation.
//
// Business Logic:
// 1. For a given session, find the previous completed session
// 2. Previous session = same session_type, completed/locked status, earlier period
// 3. Get all allocations from that session for the same targets
// 4. Calculate credibility-weighted average if multiple evaluators
// 5. Return score with delta context and improvement indicators
//
// SRS References:
//   §4.1.2 — "Judges shall see: Last month's score (per member)"
//   §4.2.2 — "Final score per person = credibility-weighted average"
//   §6.1   — "Trajectory Analysis - month-to-month improvement"
//   §1.3   — "Temporal awareness – growth and consistency matter"
//
// Edge Cases Handled:
// - No previous session → return null (first-time evaluation)
// - Previous session but no allocation for this member → return null
// - Multiple evaluators → weighted average based on credibility
// - Zero scores → included in average (scarcity choice is meaningful)
// ============================================================

"use strict";

// Import database pool for raw SQL queries
// Using raw queries for complex temporal joins
const db = require("../../config/database");

// Import logger for debugging and error tracking
const logger = require("../../utils/logger");

// ============================================================
// HistoricalScoreService Class — Static Methods for History Retrieval
// ============================================================
class HistoricalScoreService {
  // ============================================================
  // PUBLIC: getPreviousScoresForSession
  // ============================================================
  /**
   * Get previous month scores for all targets in a session.
   * Main entry point for the evaluation page's historical context.
   *
   * SRS §4.1.2: "Judges shall see: Last month's score (per member)"
   *
   * @param {string} currentSessionId - UUID of current evaluation session
   * @param {string} currentEvaluatorId - UUID of evaluator (for authorization context)
   * @returns {Promise<Object>} Map of targetId -> previous score data
   *   {
   *     hasPrevious: boolean,
   *     previousSessionId: string | null,
   *     previousPeriod: { monthName, monthIndex, semester, academicYear } | null,
   *     scores: { [targetId]: { score, totalPool, percentage, evaluatorCount, ... } }
   *   }
   */
  static async getPreviousScoresForSession(
    currentSessionId,
    currentEvaluatorId,
  ) {
    try {
      // Step 1: Get current session details including period info
      // We need the period_id and session_type to find the comparable previous session
      const currentSession = await this._getSessionWithPeriod(currentSessionId);

      if (!currentSession) {
        logger.warn(
          `HistoricalScoreService: Session ${currentSessionId} not found`,
        );
        return { hasPrevious: false, scores: {} };
      }

      // Step 2: Find the previous completed session with same type
      // "Previous" means: earlier period, same session_type, status = locked/closed
      const previousSession = await this._findPreviousSession(currentSession);

      if (!previousSession) {
        // First evaluation session — no history available
        // SRS §4.1.2: This is valid — just show no historical context
        logger.info(
          `HistoricalScoreService: No previous session found for ${currentSessionId}`,
        );
        return { hasPrevious: false, scores: {} };
      }

      // Step 3: Get all targets from the current session
      // Targets can be persons (individual scoring) or entities in frozen_entities
      const currentTargets = await this._getSessionTargets(currentSessionId);

      // Step 4: For each target, get previous scores with credibility weighting
      // SRS §4.2.2: Final score = credibility-weighted average
      const scoresMap = {};

      for (const target of currentTargets) {
        const previousScore = await this.getPreviousScoreForTarget(
          target.target_id,
          previousSession.session_id,
          currentSession.scarcity_pool_size || 15, // Default pool size for reference
        );

        if (previousScore) {
          scoresMap[target.target_id] = previousScore;
        }
      }

      // Return enriched historical data
      return {
        hasPrevious: true,
        previousSessionId: previousSession.session_id,
        previousSessionName: previousSession.session_name || "Previous Session",
        previousPeriod: {
          monthName: previousSession.month_name,
          monthIndex: previousSession.month_index,
          semester: previousSession.semester,
          academicYear: previousSession.academic_year,
        },
        scores: scoresMap,
      };
    } catch (error) {
      // Log error but don't crash — graceful degradation
      // Show evaluation page without history rather than blocking
      logger.error("HistoricalScoreService: Error fetching previous scores", {
        sessionId: currentSessionId,
        evaluatorId: currentEvaluatorId,
        error: error.message,
        stack: error.stack,
      });

      return { hasPrevious: false, scores: {}, error: error.message };
    }
  }

  // ============================================================
  // PUBLIC: getPreviousScoreForTarget
  // ============================================================
  /**
   * Get previous month score for a specific target (person/entity).
   * Uses credibility-weighted averaging across all evaluators.
   *
   * SRS §4.2.2: "Final score per person = credibility-weighted average"
   *
   * Algorithm:
   * 1. Get all allocations for this target in the previous session
   * 2. For each allocation, get evaluator's credibility score
   * 3. Compute weighted average: Σ(points × credibility) / Σ(credibility)
   * 4. Return score with metadata
   *
   * @param {string} targetId - UUID of the target being evaluated
   * @param {string} previousSessionId - UUID of previous session
   * @param {number} currentPoolSize - Current session's pool size for percentage calculation
   * @returns {Promise<Object|null>} Previous score data or null if no history
   */
  static async getPreviousScoreForTarget(
    targetId,
    previousSessionId,
    currentPoolSize = 15,
  ) {
    try {
      // Query: Get all allocations for this target in the previous session
      // Join with evaluator_credibility_profiles for weighting
      // SRS §4.2.2: credibility_score determines weight in aggregation
      const allocationsQuery = `
        SELECT 
          sa.points,
          sa.evaluator_id,
          sa.head_id,
          sa.created_at,
          -- Get evaluator's credibility score (fallback to 70 if not yet calculated)
          -- SRS §5.2.1: Default credibility = 70 (median)
          COALESCE(ecp.credibility_score, 70) as credibility_score,
          COALESCE(ecp.band, 'MEDIUM') as credibility_band
        FROM scarcity_allocations sa
        LEFT JOIN evaluator_credibility_profiles ecp
          ON sa.evaluator_id = ecp.evaluator_id
        WHERE sa.session_id = $1
          AND sa.target_id = $2
          AND sa.points IS NOT NULL
      `;

      const result = await db.query(allocationsQuery, [
        previousSessionId,
        targetId,
      ]);

      // No previous allocations for this target
      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const allocations = result.rows;

      // Step 2: Calculate credibility-weighted average
      // Formula: Σ(points × weight) / Σ(weight) where weight = credibility/100
      // SRS §4.2.2: "credibility-weighted average"
      let weightedSum = 0;
      let totalWeight = 0;

      for (const allocation of allocations) {
        // Convert credibility score (0-100) to weight (0-1)
        // Higher credibility = more influence on the average
        const weight = allocation.credibility_score / 100;

        // Accumulate weighted sum and total weight
        weightedSum += parseFloat(allocation.points) * weight;
        totalWeight += weight;
      }

      // Avoid division by zero (shouldn't happen but defensive)
      if (totalWeight === 0) {
        logger.warn(
          `HistoricalScoreService: Zero total weight for target ${targetId}`,
        );
        return null;
      }

      // Calculate the weighted average score
      const weightedAverage = weightedSum / totalWeight;

      // Step 3: Get the previous session's pool size for context
      // This helps show "X out of Y" rather than just raw score
      const poolQuery = `
        SELECT scarcity_pool_size 
        FROM evaluation_sessions 
        WHERE session_id = $1
      `;
      const poolResult = await db.query(poolQuery, [previousSessionId]);
      const previousPoolSize = poolResult.rows[0]?.scarcity_pool_size || 15;

      // Step 4: Build and return the historical score object
      // All the data needed for UI display and delta calculation
      return {
        // The credibility-weighted average score (rounded to 1 decimal)
        score: Math.round(weightedAverage * 10) / 10,

        // Raw weighted average for precise calculations
        rawScore: weightedAverage,

        // Previous session's pool size (for "X out of Y" display)
        totalPool: parseFloat(previousPoolSize),

        // Percentage of pool used (for color coding)
        percentage: Math.round((weightedAverage / previousPoolSize) * 100),

        // Number of evaluators who scored this target
        // Useful for confidence indication
        evaluatorCount: allocations.length,

        // Session context for display
        sessionId: previousSessionId,

        // Detailed breakdown for tooltip/analytics
        // Shows each evaluator's raw allocation (anonymized in UI)
        evaluatorBreakdown: allocations.map((a) => ({
          points: parseFloat(a.points),
          credibility: a.credibility_score,
          band: a.credibility_band,
        })),
      };
    } catch (error) {
      // Log but don't throw — graceful degradation
      logger.error(
        `HistoricalScoreService: Error getting score for target ${targetId}`,
        {
          previousSessionId,
          error: error.message,
        },
      );
      return null;
    }
  }

  // ============================================================
  // PUBLIC: getMemberHistoricalTrend
  // ============================================================
  /**
   * Get complete historical trend for a target across ALL sessions.
   * Used for detailed analytics and growth trajectory visualization.
   *
   * SRS §6.1: "Trajectory Analysis - System tracks absolute score and
   * month-to-month improvement"
   *
   * @param {string} targetId - UUID of the target (person being evaluated)
   * @param {string} sessionType - Type of session to filter (e.g., 'project_review')
   * @param {number} limit - Maximum number of historical records (default 12 = 1 year)
   * @returns {Promise<Array>} Chronological history with scores and deltas
   */
  static async getMemberHistoricalTrend(
    targetId,
    sessionType = "project_review",
    limit = 12,
  ) {
    try {
      // Query: Get all completed sessions with allocations for this target
      // Ordered chronologically with period information
      const trendQuery = `
        SELECT 
          es.session_id,
          es.session_type,
          es.status,
          es.scarcity_pool_size,
          es.locked_at,
          -- Period information for timeline display
          am.month_name,
          am.month_index,
          am.semester,
          am.academic_year,
          am.start_date as period_start,
          -- Aggregated score (we'll weight this in application layer)
          AVG(sa.points) as avg_score,
          COUNT(DISTINCT sa.evaluator_id) as evaluator_count,
          -- Get weighted average via subquery
          (
            SELECT SUM(inner_sa.points * COALESCE(ecp.credibility_score, 70) / 100) 
                   / NULLIF(SUM(COALESCE(ecp.credibility_score, 70) / 100), 0)
            FROM scarcity_allocations inner_sa
            LEFT JOIN evaluator_credibility_profiles ecp 
              ON inner_sa.evaluator_id = ecp.evaluator_id
            WHERE inner_sa.session_id = es.session_id
              AND inner_sa.target_id = $1
              AND inner_sa.points IS NOT NULL
          ) as weighted_score
        FROM evaluation_sessions es
        JOIN academic_months am ON es.period_id = am.period_id
        JOIN scarcity_allocations sa ON es.session_id = sa.session_id
        WHERE sa.target_id = $1
          AND es.session_type = $2
          AND es.status IN ('locked', 'closed', 'aggregated')
          AND sa.points IS NOT NULL
        GROUP BY es.session_id, am.period_id
        ORDER BY am.academic_year DESC, am.semester DESC, am.month_index DESC
        LIMIT $3
      `;

      const result = await db.query(trendQuery, [targetId, sessionType, limit]);

      if (!result.rows || result.rows.length === 0) {
        return [];
      }

      // Build the history array with deltas
      const history = [];

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const score =
          parseFloat(row.weighted_score) || parseFloat(row.avg_score) || 0;

        // Build history entry
        const entry = {
          sessionId: row.session_id,
          monthName: row.month_name,
          monthIndex: row.month_index,
          semester: row.semester,
          academicYear: row.academic_year,
          date: row.locked_at || row.period_start,
          score: Math.round(score * 10) / 10,
          poolSize: parseFloat(row.scarcity_pool_size) || 15,
          percentage: Math.round(
            (score / (row.scarcity_pool_size || 15)) * 100,
          ),
          evaluatorCount: parseInt(row.evaluator_count),
        };

        // Calculate delta from previous entry (next row is actually previous in time)
        if (i < result.rows.length - 1) {
          const previousScore =
            parseFloat(result.rows[i + 1].weighted_score) ||
            parseFloat(result.rows[i + 1].avg_score) ||
            0;
          entry.delta = Math.round((score - previousScore) * 10) / 10;
          entry.improvementPercentage =
            previousScore > 0
              ? Math.round((entry.delta / previousScore) * 100)
              : 0;
        } else {
          // First/oldest entry — no delta available
          entry.delta = null;
          entry.improvementPercentage = null;
        }

        history.push(entry);
      }

      return history;
    } catch (error) {
      logger.error(
        `HistoricalScoreService: Error getting trend for target ${targetId}`,
        {
          sessionType,
          error: error.message,
        },
      );
      return [];
    }
  }

  // ============================================================
  // PUBLIC: getSessionHistorySummary
  // ============================================================
  /**
   * Get summary statistics for historical data in a session.
   * Used for the history summary banner at top of evaluation page.
   *
   * Returns: coverage stats, previous session info, aggregate metrics
   *
   * @param {string} sessionId - UUID of current session
   * @returns {Promise<Object>} Summary of historical data availability
   */
  static async getSessionHistorySummary(sessionId) {
    try {
      // Get current session details
      const currentSession = await this._getSessionWithPeriod(sessionId);

      if (!currentSession) {
        return { hasPrevious: false, message: "Session not found" };
      }

      // Find previous session
      const previousSession = await this._findPreviousSession(currentSession);

      if (!previousSession) {
        return {
          hasPrevious: false,
          message: "This is the first evaluation session",
        };
      }

      // Get counts of targets with/without history
      const coverageQuery = `
        SELECT 
          -- Count targets in current session
          (
            SELECT COUNT(DISTINCT target_id) 
            FROM scarcity_allocations 
            WHERE session_id = $1
          ) as current_targets,
          -- Count targets with previous history
          (
            SELECT COUNT(DISTINCT sa_prev.target_id)
            FROM scarcity_allocations sa_prev
            WHERE sa_prev.session_id = $2
              AND sa_prev.target_id IN (
                SELECT DISTINCT target_id 
                FROM scarcity_allocations 
                WHERE session_id = $1
              )
          ) as targets_with_history
      `;

      const coverageResult = await db.query(coverageQuery, [
        sessionId,
        previousSession.session_id,
      ]);

      const coverage = coverageResult.rows[0] || {
        current_targets: 0,
        targets_with_history: 0,
      };

      return {
        hasPrevious: true,
        previousSessionId: previousSession.session_id,
        previousSessionName: previousSession.session_name,
        previousPeriodMonth: previousSession.month_name,
        previousPeriodSemester: previousSession.semester,
        previousPeriodYear: previousSession.academic_year,
        totalTargets: parseInt(coverage.current_targets) || 0,
        targetsWithHistory: parseInt(coverage.targets_with_history) || 0,
        coveragePercentage:
          coverage.current_targets > 0
            ? Math.round(
                (coverage.targets_with_history / coverage.current_targets) *
                  100,
              )
            : 0,
      };
    } catch (error) {
      logger.error("HistoricalScoreService: Error getting session summary", {
        sessionId,
        error: error.message,
      });
      return { hasPrevious: false, error: error.message };
    }
  }

  // ============================================================
  // PRIVATE: _getSessionWithPeriod
  // ============================================================
  /**
   * Get session details including academic period information.
   * Internal helper for finding comparable sessions.
   *
   * @param {string} sessionId - UUID of session
   * @returns {Promise<Object|null>} Session with period info
   */
  static async _getSessionWithPeriod(sessionId) {
    const query = `
      SELECT 
        es.session_id,
        es.session_type,
        es.intent,
        es.status,
        es.scarcity_pool_size,
        es.period_id,
        -- Period details for comparison
        am.month_name,
        am.month_index,
        am.semester,
        am.academic_year,
        am.start_date,
        am.end_date
      FROM evaluation_sessions es
      JOIN academic_months am ON es.period_id = am.period_id
      WHERE es.session_id = $1
    `;

    const result = await db.query(query, [sessionId]);
    return result.rows[0] || null;
  }

  // ============================================================
  // PRIVATE: _findPreviousSession
  // ============================================================
  /**
   * Find the most recent completed session before the current one.
   * "Previous" is defined by academic period ordering, not creation date.
   *
   * Must match:
   * - Same session_type (project_review matches project_review)
   * - Status = locked or closed (completed sessions only)
   * - Earlier academic period (by year, semester, month_index)
   *
   * @param {Object} currentSession - Current session with period info
   * @returns {Promise<Object|null>} Previous session or null
   */
  static async _findPreviousSession(currentSession) {
    // Find previous by comparing academic period ordering
    // Order: academic_year DESC, semester DESC, month_index DESC
    // "Previous" = max of all periods less than current
    const query = `
      SELECT 
        es.session_id,
        es.session_type,
        es.status,
        es.scarcity_pool_size,
        es.period_id,
        am.month_name,
        am.month_index,
        am.semester,
        am.academic_year
      FROM evaluation_sessions es
      JOIN academic_months am ON es.period_id = am.period_id
      WHERE es.session_type = $1
        AND es.status IN ('locked', 'closed', 'aggregated')
        AND (
          -- Earlier year
          am.academic_year < $2
          OR (
            -- Same year, earlier semester
            am.academic_year = $2 AND am.semester < $3
          )
          OR (
            -- Same year and semester, earlier month
            am.academic_year = $2 AND am.semester = $3 AND am.month_index < $4
          )
        )
      ORDER BY 
        am.academic_year DESC, 
        am.semester DESC, 
        am.month_index DESC
      LIMIT 1
    `;

    const result = await db.query(query, [
      currentSession.session_type,
      currentSession.academic_year,
      currentSession.semester,
      currentSession.month_index,
    ]);

    return result.rows[0] || null;
  }

  // ============================================================
  // PRIVATE: _getSessionTargets
  // ============================================================
  /**
   * Get all targets being evaluated in a session.
   * Targets are persons who have received allocations.
   *
   * @param {string} sessionId - UUID of session
   * @returns {Promise<Array>} List of target objects with IDs
   */
  static async _getSessionTargets(sessionId) {
    // Get distinct targets from allocations in this session
    // Also try to get targets from frozen_entities if no allocations yet
    const query = `
      SELECT DISTINCT target_id
      FROM scarcity_allocations
      WHERE session_id = $1
      
      UNION
      
      -- Also include targets from session evaluators (assigned targets)
      SELECT DISTINCT p.person_id as target_id
      FROM evaluation_sessions es
      CROSS JOIN LATERAL jsonb_array_elements_text(es.frozen_entities) AS fe(entity_id)
      JOIN projects pr ON pr.project_id = fe.entity_id::uuid
      JOIN project_members pm ON pm.project_id = pr.project_id
      JOIN persons p ON p.person_id = pm.person_id
      WHERE es.session_id = $1
    `;

    const result = await db.query(query, [sessionId]);
    return result.rows || [];
  }
}

// Export the service class
module.exports = HistoricalScoreService;
