// ============================================================
// TEMPORAL GROWTH SERVICE — Month-to-Month Δ Tracking
// ============================================================
// Implements SRS Section 6: Temporal & Growth Tracking
//
// Computes score deltas between consecutive evaluation periods
// for each person/project. Enables "growth trajectory"
// visualization showing improvement or regression over time.
//
// KEY FORMULAS:
//   raw_delta     = score_to − score_from
//   growth_pct    = (raw_delta / score_from) × 100
//   category      = classify(growth_pct) → significant_growth | moderate | stable | decline
//
// SRS 6.1: "Score inflation impossible, growth must be earned"
// SRS 6.2: "Evaluation intent modes change interpretation, not scoring"
//
// ENTRY POINTS:
//   • computeGrowth(personId, fromPeriod, toPeriod) — single person delta
//   • computeProjectGrowth(projectId)                — all members in project
//   • getGrowthHistory(personId)                      — full trajectory
//   • computeBatchGrowth(sessionId)                   — all targets in session
//
// DOES NOT modify any existing services or tables.
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// Growth thresholds — SRS 6.1 classification boundaries
// ============================================================
const GROWTH_THRESHOLDS = Object.freeze({
  SIGNIFICANT_GROWTH: 15, // delta > +15%
  MODERATE_GROWTH: 5, // delta > +5%
  STABLE_UPPER: 5, // delta ≤ +5%
  STABLE_LOWER: -5, // delta ≥ -5%
  MODERATE_DECLINE: -5, // delta < -5%
  SIGNIFICANT_DECLINE: -15, // delta < -15%
});

// ============================================================
// TemporalGrowthService — computes and stores growth records
// ============================================================
class TemporalGrowthService {
  // ============================================================
  // classifyGrowth — Pure function: percentage → category
  // SRS 6.1: Growth categories based on delta thresholds
  // ============================================================
  static classifyGrowth(growthPercentage) {
    if (growthPercentage == null || isNaN(growthPercentage)) return "stable";
    if (growthPercentage > GROWTH_THRESHOLDS.SIGNIFICANT_GROWTH)
      return "significant_growth";
    if (growthPercentage > GROWTH_THRESHOLDS.MODERATE_GROWTH)
      return "moderate_growth";
    if (growthPercentage < GROWTH_THRESHOLDS.SIGNIFICANT_DECLINE)
      return "significant_decline";
    if (growthPercentage < GROWTH_THRESHOLDS.MODERATE_DECLINE)
      return "moderate_decline";
    return "stable";
  }

  // ============================================================
  // computeGrowth — Compute delta for one person between two periods
  // SRS 6.1: Track month-to-month improvement (Δ score)
  //
  // @param {string} personId — UUID of the person
  // @param {string} fromPeriodId — UUID of the earlier academic period
  // @param {string} toPeriodId — UUID of the later academic period
  // @returns {Object|null} — Growth record or null if data insufficient
  // ============================================================
  static async computeGrowth(personId, fromPeriodId, toPeriodId) {
    // Fetch aggregated results for both periods
    // Uses aggregated_results (from migration 009) which stores per-target stats
    const fromResult = await query(
      `SELECT ar.mean_score, ar.session_id, es.intent
       FROM aggregated_results ar
       JOIN evaluation_sessions es ON ar.session_id = es.session_id
       WHERE ar.target_id = $1
         AND es.period_id = $2
       ORDER BY ar.computed_at DESC
       LIMIT 1`,
      [personId, fromPeriodId],
    );

    const toResult = await query(
      `SELECT ar.mean_score, ar.session_id, es.intent
       FROM aggregated_results ar
       JOIN evaluation_sessions es ON ar.session_id = es.session_id
       WHERE ar.target_id = $1
         AND es.period_id = $2
       ORDER BY ar.computed_at DESC
       LIMIT 1`,
      [personId, toPeriodId],
    );

    // Need data from both periods to compute delta
    if (fromResult.rows.length === 0 || toResult.rows.length === 0) {
      return null;
    }

    const fromRow = fromResult.rows[0];
    const toRow = toResult.rows[0];

    const rawFrom = parseFloat(fromRow.mean_score) || 0;
    const rawTo = parseFloat(toRow.mean_score) || 0;
    const rawDelta = rawTo - rawFrom;

    // Growth percentage (handle zero-from case)
    const growthPct = rawFrom > 0 ? (rawDelta / rawFrom) * 100 : 0;
    const category = TemporalGrowthService.classifyGrowth(growthPct);

    // Also try to get weighted scores if credibility data exists
    let weightedFrom = null;
    let weightedTo = null;
    let weightedDelta = null;

    try {
      // Check for credibility-weighted results
      const wFrom = await query(
        `SELECT weighted_mean FROM (
           SELECT (ar.mean_score * COALESCE(
             (SELECT credibility_score FROM evaluator_credibility_profiles
              WHERE evaluator_id = ANY(
                SELECT evaluator_id FROM scarcity_allocations
                WHERE session_id = $2 AND target_id = $1 LIMIT 1
              ) LIMIT 1), 1.0
           )) as weighted_mean
           FROM aggregated_results ar
           JOIN evaluation_sessions es ON ar.session_id = es.session_id
           WHERE ar.target_id = $1 AND es.period_id = $3
           ORDER BY ar.computed_at DESC LIMIT 1
         ) sub`,
        [personId, fromRow.session_id, fromPeriodId],
      );
      // For simplicity, we use the raw score as weighted if no specific weighted data
      weightedFrom =
        wFrom.rows.length > 0
          ? parseFloat(wFrom.rows[0].weighted_mean)
          : rawFrom;
      weightedTo = rawTo; // Placeholder — real weighted comes from WeightedAggregationService
      weightedDelta = weightedTo - weightedFrom;
    } catch {
      // Weighted data not critical — raw delta is the core metric
    }

    // Determine project context
    const projectResult = await query(
      `SELECT pm.project_id FROM project_members pm
       WHERE pm.person_id = $1 AND pm.left_at IS NULL
       LIMIT 1`,
      [personId],
    );
    const projectId =
      projectResult.rows.length > 0 ? projectResult.rows[0].project_id : null;

    // Upsert into temporal_growth_records
    const upsertResult = await query(
      `INSERT INTO temporal_growth_records (
         person_id, project_id, from_period_id, to_period_id,
         from_session_id, to_session_id,
         raw_score_from, raw_score_to, raw_delta,
         weighted_score_from, weighted_score_to, weighted_delta,
         growth_category, growth_percentage, intent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (person_id, from_period_id, to_period_id)
       DO UPDATE SET
         raw_score_from = EXCLUDED.raw_score_from,
         raw_score_to = EXCLUDED.raw_score_to,
         raw_delta = EXCLUDED.raw_delta,
         weighted_score_from = EXCLUDED.weighted_score_from,
         weighted_score_to = EXCLUDED.weighted_score_to,
         weighted_delta = EXCLUDED.weighted_delta,
         growth_category = EXCLUDED.growth_category,
         growth_percentage = EXCLUDED.growth_percentage,
         intent = EXCLUDED.intent,
         computed_at = NOW()
       RETURNING *`,
      [
        personId,
        projectId,
        fromPeriodId,
        toPeriodId,
        fromRow.session_id,
        toRow.session_id,
        rawFrom,
        rawTo,
        rawDelta,
        weightedFrom,
        weightedTo,
        weightedDelta,
        category,
        growthPct,
        toRow.intent,
      ],
    );

    logger.info("Temporal growth computed", {
      personId,
      fromPeriod: fromPeriodId,
      toPeriod: toPeriodId,
      rawDelta,
      category,
    });

    return upsertResult.rows[0];
  }

  // ============================================================
  // computeBatchGrowth — Compute growth for all targets in a session
  // Automatically finds the previous period and computes deltas
  //
  // SRS 6.1: "All previous review records stored, Δ computed"
  //
  // @param {string} sessionId — UUID of the completed session
  // @returns {Object} — { computed: N, skipped: N, results: [...] }
  // ============================================================
  static async computeBatchGrowth(sessionId) {
    // Get session details including period
    const sessionResult = await query(
      `SELECT es.session_id, es.period_id, es.intent,
              am.academic_year, am.semester, am.month_index
       FROM evaluation_sessions es
       JOIN academic_months am ON es.period_id = am.period_id
       WHERE es.session_id = $1`,
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found or has no period`);
    }

    const session = sessionResult.rows[0];

    // Find previous period (same academic_year+semester, previous month_index)
    const prevPeriod = await query(
      `SELECT period_id FROM academic_months
       WHERE academic_year = $1
         AND semester = $2
         AND month_index = $3 - 1
       LIMIT 1`,
      [session.academic_year, session.semester, session.month_index],
    );

    if (prevPeriod.rows.length === 0) {
      logger.info("No previous period found for growth computation", {
        sessionId,
        period: session.period_id,
      });
      return {
        computed: 0,
        skipped: 0,
        results: [],
        message: "No previous period available",
      };
    }

    const fromPeriodId = prevPeriod.rows[0].period_id;
    const toPeriodId = session.period_id;

    // Get all targets evaluated in this session
    const targets = await query(
      `SELECT DISTINCT target_id FROM aggregated_results
       WHERE session_id = $1`,
      [sessionId],
    );

    const results = [];
    let computed = 0;
    let skipped = 0;

    for (const row of targets.rows) {
      try {
        const growth = await TemporalGrowthService.computeGrowth(
          row.target_id,
          fromPeriodId,
          toPeriodId,
        );
        if (growth) {
          results.push(growth);
          computed++;
        } else {
          skipped++;
        }
      } catch (err) {
        logger.warn("Growth computation failed for target", {
          targetId: row.target_id,
          error: err.message,
        });
        skipped++;
      }
    }

    logger.info("Batch growth computation complete", {
      sessionId,
      computed,
      skipped,
    });

    return { computed, skipped, results };
  }

  // ============================================================
  // getGrowthHistory — Full trajectory for a person
  // SRS 6.1: "Store all previous review records"
  //
  // @param {string} personId — UUID of the person
  // @param {Object} [options] — { limit, intent }
  // @returns {Object[]} — Ordered growth records (oldest→newest)
  // ============================================================
  static async getGrowthHistory(personId, options = {}) {
    const { limit = 20, intent } = options;

    let sql = `
      SELECT tgr.*,
             am_from.month_index AS from_month,
             am_from.academic_year AS from_year,
             am_to.month_index AS to_month,
             am_to.academic_year AS to_year
      FROM temporal_growth_records tgr
      JOIN academic_months am_from ON tgr.from_period_id = am_from.period_id
      JOIN academic_months am_to ON tgr.to_period_id = am_to.period_id
      WHERE tgr.person_id = $1
    `;
    const params = [personId];

    if (intent) {
      sql += ` AND tgr.intent = $${params.length + 1}`;
      params.push(intent);
    }

    sql += ` ORDER BY am_to.academic_year, am_to.semester, am_to.month_index ASC`;
    sql += ` LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);

    // Compute trajectory vector: sequence of growth categories
    const trajectory = result.rows.map((r) => ({
      period: `${r.to_year} M${r.to_month}`,
      category: r.growth_category,
      delta: parseFloat(r.raw_delta) || 0,
      percentage: parseFloat(r.growth_percentage) || 0,
    }));

    return {
      personId,
      records: result.rows,
      trajectory,
      recordCount: result.rows.length,
      // SRS 6.1: Overall trend assessment
      overallTrend: TemporalGrowthService._assessOverallTrend(trajectory),
    };
  }

  // ============================================================
  // _assessOverallTrend — Private: compute overall trend direction
  // Uses simple linear regression on the growth percentages
  // ============================================================
  static _assessOverallTrend(trajectory) {
    if (!trajectory || trajectory.length < 2) return "insufficient_data";

    const positiveCount = trajectory.filter((t) => t.percentage > 0).length;
    const negativeCount = trajectory.filter((t) => t.percentage < 0).length;
    const ratio = positiveCount / trajectory.length;

    if (ratio >= 0.7) return "consistently_improving";
    if (ratio >= 0.5) return "generally_improving";
    if (ratio <= 0.3) return "consistently_declining";
    if (ratio < 0.5) return "generally_declining";
    return "mixed";
  }
}

module.exports = TemporalGrowthService;
