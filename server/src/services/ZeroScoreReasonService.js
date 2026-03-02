// ============================================================
// ZERO SCORE REASON SERVICE — Evaluator-Provided Zero Classifications
// ============================================================
// Manages the capture and analytics of EXPLICIT zero-score reasons
// provided by evaluators during the submit flow.
//
// SRS §4.1.5: Three classifications:
//   1. scarcity_driven      — "Limited points available"
//   2. below_expectation    — "Didn't meet requirements"
//   3. insufficient_observation — "Haven't seen enough work"
//
// This is separate from ZeroScoreInterpreter.js which INFERS
// reasons server-side. This service stores the evaluator's OWN
// stated reason — ground truth for analytics.
//
// Privacy (SRS §8.2b):
//   - Reasons are for aggregate analytics ONLY
//   - Never shown to the evaluated person
//   - Free-text context anonymized before reporting
//   - Individual reasons never exported
// ============================================================

const { query } = require("../config/database");

// ============================================================
// CONSTANTS — The three SRS §4.1.5 classifications
// ============================================================

/**
 * @zeroSemantics All three SRS-defined zero-score classifications
 * @analyticsUse Maps evaluator intent to analytics categories
 * @see SRS §4.1.5
 */
const CLASSIFICATIONS = Object.freeze({
  SCARCITY_DRIVEN: "scarcity_driven",
  BELOW_EXPECTATION: "below_expectation",
  INSUFFICIENT_OBSERVATION: "insufficient_observation",
});

/**
 * Human-readable labels for each classification.
 * Used in the frontend dialog and admin analytics.
 *
 * @userExperience Non-punitive, analytical tone per SRS requirements
 */
const CLASSIFICATION_LABELS = Object.freeze({
  scarcity_driven: {
    label: "Limited points available",
    description: "Would have given points if the budget were larger",
    analyticsCategory: "scarcity_constraint",
  },
  below_expectation: {
    label: "Didn't meet requirements",
    description: "Performance did not reach the minimum threshold",
    analyticsCategory: "performance_gap",
  },
  insufficient_observation: {
    label: "Haven't seen enough work",
    description: "Not enough visibility to make a fair judgment",
    analyticsCategory: "visibility_gap",
  },
});

const VALID_CLASSIFICATIONS = Object.values(CLASSIFICATIONS);
const VALID_EVAL_TYPES = ["scarcity", "comparative"];

// ============================================================
// ZeroScoreReasonService — Static class (follows ScarcityEngine pattern)
// ============================================================
class ZeroScoreReasonService {
  // ----------------------------------------------------------
  // recordReasons — Batch save zero-score reasons from submit dialog
  // ----------------------------------------------------------
  /**
   * Record evaluator-provided zero-score reasons for a session.
   * Called at submit time after the batch reason dialog.
   *
   * @zeroSemantics Stores all three classification types
   * @analyticsUse Feeds credibility engine consistency trait
   * @userExperience Called once at submit, not per-allocation
   * @see SRS §4.1.5
   *
   * @param {Object} params
   * @param {string} params.evaluationType - 'scarcity' or 'comparative'
   * @param {string} params.sessionId - Evaluation session UUID
   * @param {string} params.evaluatorId - Evaluator person UUID
   * @param {Array<Object>} params.reasons - Array of reason objects:
   *   { targetId, classification, criterionKey?, contextNote?, decisionTimeMs?, wasDefault? }
   * @returns {Object} { recorded: number, skipped: number }
   */
  static async recordReasons({
    evaluationType,
    sessionId,
    evaluatorId,
    reasons,
  }) {
    // Validate evaluation type
    if (!VALID_EVAL_TYPES.includes(evaluationType)) {
      throw new Error(`Invalid evaluation type: ${evaluationType}`);
    }

    if (!reasons || reasons.length === 0) {
      return { recorded: 0, skipped: 0 };
    }

    let recorded = 0;
    let skipped = 0;

    for (const reason of reasons) {
      // Validate classification
      if (!VALID_CLASSIFICATIONS.includes(reason.classification)) {
        skipped++;
        continue;
      }

      try {
        await query(
          `INSERT INTO zero_score_reasons (
            evaluation_type, session_id, evaluator_id, target_id,
            criterion_key, classification, context_note,
            decision_time_ms, was_default
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (session_id, evaluator_id, target_id, criterion_key)
          DO UPDATE SET
            classification = EXCLUDED.classification,
            context_note = EXCLUDED.context_note,
            decision_time_ms = EXCLUDED.decision_time_ms,
            was_default = EXCLUDED.was_default`,
          [
            evaluationType,
            sessionId,
            evaluatorId,
            reason.targetId,
            reason.criterionKey || null,
            reason.classification,
            reason.contextNote || null,
            reason.decisionTimeMs || null,
            reason.wasDefault || false,
          ],
        );
        recorded++;
      } catch (err) {
        // Non-blocking: log and continue with remaining reasons
        skipped++;
      }
    }

    return { recorded, skipped };
  }

  // ----------------------------------------------------------
  // getReasonsForSession — Load reasons for a session
  // ----------------------------------------------------------
  /**
   * Get all zero-score reasons recorded for a specific session.
   *
   * @param {string} sessionId - Session UUID
   * @returns {Array<Object>} Reason objects with classification details
   */
  static async getReasonsForSession(sessionId) {
    const result = await query(
      `SELECT reason_id, evaluation_type, evaluator_id, target_id,
              criterion_key, classification, context_note,
              decision_time_ms, was_default, created_at
       FROM zero_score_reasons
       WHERE session_id = $1
       ORDER BY created_at`,
      [sessionId],
    );

    return result.rows;
  }

  // ----------------------------------------------------------
  // getEvaluatorPatterns — Aggregated patterns for one evaluator
  // ----------------------------------------------------------
  /**
   * Get zero-score classification patterns for an evaluator.
   * Used by credibility engine for consistency trait (SRS §7.1c).
   *
   * @zeroSemantics Aggregates across all classifications
   * @analyticsUse Feeds PersonVectorService consistency scoring
   * @see SRS §7.1c
   *
   * @param {string} evaluatorId - Evaluator person UUID
   * @returns {Object} Pattern summary
   */
  static async getEvaluatorPatterns(evaluatorId) {
    const result = await query(
      `SELECT * FROM zero_score_reason_summary
       WHERE evaluator_id = $1
       ORDER BY reason_count DESC`,
      [evaluatorId],
    );

    // Compute summary metrics
    const rows = result.rows;
    const totalReasons = rows.reduce(
      (sum, r) => sum + parseInt(r.reason_count, 10),
      0,
    );

    // Distribution: what percentage of each classification
    const distribution = {};
    for (const r of rows) {
      const key = `${r.evaluation_type}_${r.classification}`;
      distribution[key] = {
        count: parseInt(r.reason_count, 10),
        pct:
          totalReasons > 0
            ? Math.round(
                (parseInt(r.reason_count, 10) / totalReasons) * 100 * 10,
              ) / 10
            : 0,
        avgDecisionMs: parseInt(r.avg_decision_ms, 10) || null,
        defaultPct: parseFloat(r.default_pct) || 0,
      };
    }

    // Variety score: how many distinct classifications used (max 3 per type)
    const classificationVariety = new Set(rows.map((r) => r.classification))
      .size;

    return {
      evaluatorId,
      totalReasons,
      classificationVariety,
      distribution,
      details: rows,
    };
  }

  // ----------------------------------------------------------
  // getTargetPatterns — Aggregated patterns for one target
  // ----------------------------------------------------------
  /**
   * Get zero-score patterns for a specific target (person or project).
   * Used for improvement suggestions.
   *
   * @analyticsUse Identifies whether zeros come from scarcity, performance, or visibility
   * @see SRS §4.1.5
   *
   * @param {string} targetId - Target UUID
   * @returns {Object} Pattern summary with improvement suggestions
   */
  static async getTargetPatterns(targetId) {
    const result = await query(
      `SELECT * FROM zero_score_target_summary
       WHERE target_id = $1
       ORDER BY times_received DESC`,
      [targetId],
    );

    const rows = result.rows;
    const total = rows.reduce(
      (sum, r) => sum + parseInt(r.times_received, 10),
      0,
    );

    // Generate improvement suggestions based on dominant pattern
    const suggestions = [];
    for (const r of rows) {
      const count = parseInt(r.times_received, 10);
      const pct = total > 0 ? (count / total) * 100 : 0;

      if (pct >= 40) {
        // Dominant reason — worth surfacing
        switch (r.classification) {
          case CLASSIFICATIONS.SCARCITY_DRIVEN:
            suggestions.push({
              type: "info",
              message: `${Math.round(pct)}% of zero scores are due to scarcity constraints — not a reflection of performance.`,
            });
            break;
          case CLASSIFICATIONS.BELOW_EXPECTATION:
            suggestions.push({
              type: "improvement",
              message: `${Math.round(pct)}% of zero scores indicate performance gaps — review work quality.`,
            });
            break;
          case CLASSIFICATIONS.INSUFFICIENT_OBSERVATION:
            suggestions.push({
              type: "visibility",
              message: `${Math.round(pct)}% of zero scores are due to insufficient visibility — consider increasing exposure.`,
            });
            break;
        }
      }
    }

    return {
      targetId,
      totalZeros: total,
      patterns: rows,
      suggestions,
    };
  }

  // ----------------------------------------------------------
  // getAggregateAnalytics — Admin-level analytics overview
  // ----------------------------------------------------------
  /**
   * Get system-wide zero-score analytics for admin dashboard.
   *
   * @analyticsUse Admin dashboard zero-score analytics tab
   * @see SRS §8.2
   *
   * @param {Object} filters - Optional filters { evaluationType, dateFrom, dateTo }
   * @returns {Object} System-wide analytics
   */
  static async getAggregateAnalytics(filters = {}) {
    // Overall distribution
    let whereClause = "WHERE 1=1";
    const params = [];
    let paramIdx = 0;

    if (filters.evaluationType) {
      paramIdx++;
      whereClause += ` AND evaluation_type = $${paramIdx}`;
      params.push(filters.evaluationType);
    }

    if (filters.dateFrom) {
      paramIdx++;
      whereClause += ` AND created_at >= $${paramIdx}`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      paramIdx++;
      whereClause += ` AND created_at <= $${paramIdx}`;
      params.push(filters.dateTo);
    }

    // Classification distribution
    const distResult = await query(
      `SELECT classification, evaluation_type, COUNT(*) as count
       FROM zero_score_reasons ${whereClause}
       GROUP BY classification, evaluation_type
       ORDER BY count DESC`,
      params,
    );

    // Evaluator summary
    const evalResult = await query(
      `SELECT evaluator_id, COUNT(*) as total_reasons,
              COUNT(DISTINCT classification) as variety
       FROM zero_score_reasons ${whereClause}
       GROUP BY evaluator_id
       ORDER BY total_reasons DESC
       LIMIT 20`,
      params,
    );

    // Recent trends (last 30 days, grouped by day)
    const trendResult = await query(
      `SELECT DATE(created_at) as day, classification, COUNT(*) as count
       FROM zero_score_reasons
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at), classification
       ORDER BY day DESC`,
    );

    // Total counts
    const totalResult = await query(
      `SELECT COUNT(*) as total,
              COUNT(DISTINCT evaluator_id) as unique_evaluators,
              COUNT(DISTINCT session_id) as unique_sessions,
              COUNT(DISTINCT target_id) as unique_targets
       FROM zero_score_reasons ${whereClause}`,
      params,
    );

    const totals = totalResult.rows[0] || {};

    return {
      totals: {
        totalReasons: parseInt(totals.total, 10) || 0,
        uniqueEvaluators: parseInt(totals.unique_evaluators, 10) || 0,
        uniqueSessions: parseInt(totals.unique_sessions, 10) || 0,
        uniqueTargets: parseInt(totals.unique_targets, 10) || 0,
      },
      distribution: distResult.rows.map((r) => ({
        classification: r.classification,
        evaluationType: r.evaluation_type,
        count: parseInt(r.count, 10),
      })),
      topEvaluators: evalResult.rows.map((r) => ({
        evaluatorId: r.evaluator_id,
        totalReasons: parseInt(r.total_reasons, 10),
        classificationVariety: parseInt(r.variety, 10),
      })),
      dailyTrends: trendResult.rows.map((r) => ({
        day: r.day,
        classification: r.classification,
        count: parseInt(r.count, 10),
      })),
    };
  }

  // ----------------------------------------------------------
  // suggestDefault — Suggest a default classification
  // ----------------------------------------------------------
  /**
   * Suggest a default classification for a zero allocation based
   * on the evaluator's past patterns and session context.
   *
   * @param {string} evaluatorId - Evaluator person UUID
   * @param {string} evaluationType - 'scarcity' or 'comparative'
   * @returns {string|null} Suggested classification or null
   */
  static async suggestDefault(evaluatorId, evaluationType) {
    // Find the most common classification for this evaluator + type
    const result = await query(
      `SELECT classification, COUNT(*) as cnt
       FROM zero_score_reasons
       WHERE evaluator_id = $1 AND evaluation_type = $2
       GROUP BY classification
       ORDER BY cnt DESC
       LIMIT 1`,
      [evaluatorId, evaluationType],
    );

    if (result.rows.length > 0 && parseInt(result.rows[0].cnt, 10) >= 3) {
      return result.rows[0].classification;
    }

    // Default for first-time: scarcity_driven (most common in scarcity systems)
    return CLASSIFICATIONS.SCARCITY_DRIVEN;
  }

  // ----------------------------------------------------------
  // detectCollusionPatterns — SRS §5.3 Anti-Collusion Behavior
  // ----------------------------------------------------------
  /**
   * Detect evaluator pairs that consistently give zeros to the same targets.
   * SRS §5.3: "Statistical dilution of unreliable inputs"
   *
   * @collusionDetection Identifies evaluator pairs with high overlap
   * @analyticsUse Flags for manual review by admin
   * @see SRS §5.3
   *
   * @param {Object} filters - Optional { dateFrom, dateTo }
   * @returns {Array<Object>} Detected collusion patterns
   */
  static async detectCollusionPatterns(filters = {}) {
    try {
      let whereClause = "";
      const params = [];
      let paramIdx = 0;

      if (filters.dateFrom) {
        paramIdx++;
        whereClause += ` AND z1.created_at >= $${paramIdx}`;
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        paramIdx++;
        whereClause += ` AND z1.created_at <= $${paramIdx}`;
        params.push(filters.dateTo);
      }

      // Find evaluator pairs that zero the same targets in same sessions
      // SRS §5.3: Detects coordinated behavior through statistical analysis
      const result = await query(
        `SELECT 
          z1.evaluator_id as evaluator1_id,
          p1.display_name as evaluator1_name,
          z2.evaluator_id as evaluator2_id,
          p2.display_name as evaluator2_name,
          COUNT(DISTINCT z1.target_id) as common_targets,
          COUNT(DISTINCT z1.session_id) as common_sessions,
          COUNT(*) as overlap_count
        FROM zero_score_reasons z1
        JOIN zero_score_reasons z2 
          ON z1.target_id = z2.target_id 
          AND z1.session_id = z2.session_id
          AND z1.evaluator_id < z2.evaluator_id
        JOIN persons p1 ON z1.evaluator_id = p1.person_id
        JOIN persons p2 ON z2.evaluator_id = p2.person_id
        WHERE 1=1 ${whereClause}
        GROUP BY z1.evaluator_id, p1.display_name, z2.evaluator_id, p2.display_name
        HAVING COUNT(DISTINCT z1.target_id) >= 3
        ORDER BY common_targets DESC
        LIMIT 20`,
        params,
      );

      return result.rows.map((r) => ({
        evaluator1Id: r.evaluator1_id,
        evaluator1Name: r.evaluator1_name,
        evaluator2Id: r.evaluator2_id,
        evaluator2Name: r.evaluator2_name,
        commonTargets: parseInt(r.common_targets, 10),
        commonSessions: parseInt(r.common_sessions, 10),
        overlapCount: parseInt(r.overlap_count, 10),
        alert: "High zero-score overlap detected - possible coordination",
      }));
    } catch (error) {
      console.error("Error detecting collusion patterns:", error);
      return [];
    }
  }

  // ----------------------------------------------------------
  // getAnomalies — Detect lazy evaluation and harsh patterns
  // ----------------------------------------------------------
  /**
   * Identify evaluators with anomalous zero-scoring behavior.
   * SRS §4.1.5: Analytics for internal use only
   *
   * Anomalies detected:
   * 1. Lazy evaluation: >50% "insufficient_observation" classifications
   * 2. Harsh evaluation: >5 "below_expectation" classifications
   * 3. Low variety: Only uses 1 classification type
   *
   * @analyticsUse Admin alerting for evaluator quality review
   * @see SRS §4.1.5
   *
   * @returns {Object} { lazyEvaluators, harshEvaluators, lowVariety }
   */
  static async getAnomalies() {
    try {
      // Get evaluator classification distributions
      const result = await query(
        `SELECT 
          evaluator_id,
          p.display_name as evaluator_name,
          COUNT(*) as total_zeros,
          COUNT(CASE WHEN classification = 'insufficient_observation' THEN 1 END) as insufficient_count,
          COUNT(CASE WHEN classification = 'below_expectation' THEN 1 END) as below_exp_count,
          COUNT(CASE WHEN classification = 'scarcity_driven' THEN 1 END) as scarcity_count,
          COUNT(DISTINCT classification) as variety
        FROM zero_score_reasons z
        LEFT JOIN persons p ON z.evaluator_id = p.person_id
        GROUP BY evaluator_id, p.display_name
        HAVING COUNT(*) >= 3`,
      );

      const anomalies = {
        lazyEvaluators: [],
        harshEvaluators: [],
        lowVariety: [],
      };

      for (const row of result.rows) {
        const total = parseInt(row.total_zeros, 10);
        const insufficient = parseInt(row.insufficient_count, 10);
        const belowExp = parseInt(row.below_exp_count, 10);
        const variety = parseInt(row.variety, 10);

        // Lazy evaluation: >50% insufficient observation
        // SRS §4.1.5: "insufficient_observation" should be rare, not dominant
        if (insufficient / total > 0.5) {
          anomalies.lazyEvaluators.push({
            evaluatorId: row.evaluator_id,
            evaluatorName: row.evaluator_name,
            totalZeros: total,
            insufficientCount: insufficient,
            insufficientPercentage: Math.round((insufficient / total) * 100),
            alert:
              'High rate of "Insufficient Observation" - possible lazy evaluation',
          });
        }

        // Harsh evaluation: >5 below_expectation
        // SRS §4.1.5: Frequent "below_expectation" may indicate unclear rubric
        if (belowExp > 5) {
          anomalies.harshEvaluators.push({
            evaluatorId: row.evaluator_id,
            evaluatorName: row.evaluator_name,
            totalZeros: total,
            belowExpCount: belowExp,
            belowExpPercentage: Math.round((belowExp / total) * 100),
            alert:
              'Frequently marks "Below Expectation" - verify rubric clarity',
          });
        }

        // Low variety: Only 1 classification used
        // SRS §4.1.5: Healthy evaluation uses all three classifications
        if (variety === 1 && total >= 5) {
          anomalies.lowVariety.push({
            evaluatorId: row.evaluator_id,
            evaluatorName: row.evaluator_name,
            totalZeros: total,
            classificationVariety: variety,
            alert: "Uses only one classification type - possible bias",
          });
        }
      }

      return anomalies;
    } catch (error) {
      console.error("Error getting anomalies:", error);
      return { lazyEvaluators: [], harshEvaluators: [], lowVariety: [] };
    }
  }

  // ----------------------------------------------------------
  // exportData — Export zero-score data for external analysis
  // ----------------------------------------------------------
  /**
   * Export zero-score reasons with all related metadata.
   * SRS §8.2: Export for aggregate analytics (anonymized)
   *
   * @param {Object} filters - { sessionId, evaluatorId, classification, dateFrom, dateTo }
   * @returns {Array<Object>} Flattened data for CSV/JSON export
   */
  static async exportData(filters = {}) {
    try {
      let whereClause = "WHERE 1=1";
      const params = [];
      let paramIdx = 0;

      if (filters.sessionId) {
        paramIdx++;
        whereClause += ` AND z.session_id = $${paramIdx}`;
        params.push(filters.sessionId);
      }

      if (filters.evaluatorId) {
        paramIdx++;
        whereClause += ` AND z.evaluator_id = $${paramIdx}`;
        params.push(filters.evaluatorId);
      }

      if (filters.classification) {
        paramIdx++;
        whereClause += ` AND z.classification = $${paramIdx}`;
        params.push(filters.classification);
      }

      if (filters.dateFrom) {
        paramIdx++;
        whereClause += ` AND z.created_at >= $${paramIdx}`;
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        paramIdx++;
        whereClause += ` AND z.created_at <= $${paramIdx}`;
        params.push(filters.dateTo);
      }

      const result = await query(
        `SELECT 
          z.reason_id,
          z.evaluation_type,
          z.session_id,
          es.intent as session_intent,
          am.month_name as session_month,
          am.academic_year as session_year,
          z.evaluator_id,
          e.display_name as evaluator_name,
          z.target_id,
          t.display_name as target_name,
          z.classification,
          z.decision_time_ms,
          z.was_default,
          z.created_at
        FROM zero_score_reasons z
        LEFT JOIN evaluation_sessions es ON z.session_id = es.session_id
        LEFT JOIN academic_months am ON es.period_id = am.period_id
        LEFT JOIN persons e ON z.evaluator_id = e.person_id
        LEFT JOIN persons t ON z.target_id = t.person_id
        ${whereClause}
        ORDER BY z.created_at DESC`,
        params,
      );

      // Flatten for export (omit context_note for privacy per SRS §8.2b)
      return result.rows.map((r) => ({
        reasonId: r.reason_id,
        evaluationType: r.evaluation_type,
        sessionId: r.session_id,
        sessionIntent: r.session_intent,
        sessionMonth: r.session_month,
        sessionYear: r.session_year,
        evaluatorId: r.evaluator_id,
        evaluatorName: r.evaluator_name,
        targetId: r.target_id,
        targetName: r.target_name,
        classification: r.classification,
        classificationLabel:
          CLASSIFICATION_LABELS[r.classification]?.label || r.classification,
        decisionTimeMs: r.decision_time_ms,
        wasDefault: r.was_default,
        createdAt: r.created_at,
      }));
    } catch (error) {
      console.error("Error exporting zero-score data:", error);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // getEnhancedAnalytics — Full dashboard data with anomalies
  // ----------------------------------------------------------
  /**
   * Get comprehensive analytics dashboard data including anomalies
   * and collusion detection.
   * SRS §4.1.5, §5.3: Complete analytics for admin oversight
   *
   * @param {Object} filters - Optional { evaluationType, dateFrom, dateTo }
   * @returns {Object} Complete dashboard data
   */
  static async getEnhancedAnalytics(filters = {}) {
    // Get base analytics
    const baseAnalytics = await this.getAggregateAnalytics(filters);

    // Get anomalies
    const anomalies = await this.getAnomalies();

    // Get collusion patterns
    const collusionPatterns = await this.detectCollusionPatterns(filters);

    // Monthly trend (additional to existing daily trends)
    const monthlyTrend = await query(
      `SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as total_zeros,
        COUNT(CASE WHEN classification = 'scarcity_driven' THEN 1 END) as scarcity_driven,
        COUNT(CASE WHEN classification = 'below_expectation' THEN 1 END) as below_expectation,
        COUNT(CASE WHEN classification = 'insufficient_observation' THEN 1 END) as insufficient_observation
      FROM zero_score_reasons
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 12`,
    );

    // Session breakdown
    const sessionBreakdown = await query(
      `SELECT 
        z.session_id,
        es.intent as session_name,
        am.month_name || ' ' || am.academic_year as month_year,
        COUNT(*) as zero_count,
        COUNT(DISTINCT z.evaluator_id) as evaluator_count,
        COUNT(DISTINCT z.target_id) as student_count
      FROM zero_score_reasons z
      LEFT JOIN evaluation_sessions es ON z.session_id = es.session_id
      LEFT JOIN academic_months am ON es.period_id = am.period_id
      GROUP BY z.session_id, es.intent, am.month_name, am.academic_year
      ORDER BY MAX(z.created_at) DESC
      LIMIT 10`,
    );

    return {
      ...baseAnalytics,
      anomalies,
      collusionPatterns,
      monthlyTrend: monthlyTrend.rows.map((r) => ({
        month: r.month,
        totalZeros: parseInt(r.total_zeros, 10),
        scarcityDriven: parseInt(r.scarcity_driven, 10),
        belowExpectation: parseInt(r.below_expectation, 10),
        insufficientObservation: parseInt(r.insufficient_observation, 10),
      })),
      sessionBreakdown: sessionBreakdown.rows.map((r) => ({
        sessionId: r.session_id,
        sessionName: r.session_name || "Evaluation Session",
        monthYear: r.month_year,
        zeroCount: parseInt(r.zero_count, 10),
        evaluatorCount: parseInt(r.evaluator_count, 10),
        studentCount: parseInt(r.student_count, 10),
      })),
    };
  }
}

// ============================================================
// MODULE EXPORTS
// ============================================================
module.exports = {
  ZeroScoreReasonService,
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  VALID_CLASSIFICATIONS,
};
