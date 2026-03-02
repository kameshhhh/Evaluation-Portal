// ============================================================
// INTENT-AWARE EVALUATION SERVICE
// ============================================================
// Implements SRS Section 6.2: Evaluation Intent Modes
//
// Every evaluation session has an INTENT — the purpose for which
// the evaluation is being conducted. The intent affects how scores
// are interpreted, weighted, and aggregated.
//
// FOUR INTENT MODES (SRS 6.2):
//   1. GROWTH       — Focus on improvement trajectory
//                      Weights temporal signals higher
//                      Emphasizes growth_potential trait
//   2. EXCELLENCE   — Focus on absolute capability
//                      Weights raw scores and consistency higher
//                      Emphasizes leadership + consistency traits
//   3. LEADERSHIP   — Focus on influence and impact
//                      Weights peer rankings higher
//                      Emphasizes leadership + communication traits
//   4. COMPARATIVE  — Focus on relative standing in cohort
//                      Uses percentile-based normalization
//                      All traits weighted equally
//
// TABLE USED (seeded in migration 013):
//   evaluation_intent_config — stores weight multiplicands per intent
//
// ENTRY POINTS:
//   • getIntentConfig(intentCode)        — Get weights for an intent
//   • applyIntentWeights(scores, intentCode)  — Reweight scores by intent
//   • classifySessionIntent(sessionId)   — Determine session's intent
//   • getIntentReport(targetId, intentCode) — Intent-specific evaluation
//
// DOES NOT modify any existing services or tables.
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// Default intent weight profiles — used if DB config is missing
// These map to how much each data source/dimension is emphasized
// ============================================================
const DEFAULT_INTENT_WEIGHTS = Object.freeze({
  growth: {
    raw_score: 0.15,
    temporal_delta: 0.35,
    credibility: 0.15,
    peer_ranking: 0.1,
    faculty_normalized: 0.1,
    consistency: 0.15,
  },
  excellence: {
    raw_score: 0.3,
    temporal_delta: 0.1,
    credibility: 0.2,
    peer_ranking: 0.1,
    faculty_normalized: 0.15,
    consistency: 0.15,
  },
  leadership: {
    raw_score: 0.15,
    temporal_delta: 0.1,
    credibility: 0.15,
    peer_ranking: 0.3,
    faculty_normalized: 0.15,
    consistency: 0.15,
  },
  comparative: {
    raw_score: 0.2,
    temporal_delta: 0.15,
    credibility: 0.15,
    peer_ranking: 0.15,
    faculty_normalized: 0.15,
    consistency: 0.2,
  },
});

// Trait emphasis per intent — how person vector traits are prioritized
const INTENT_TRAIT_EMPHASIS = Object.freeze({
  growth: {
    communication: 1.0,
    leadership: 0.8,
    consistency: 1.2,
    trustworthiness: 0.9,
    growth_potential: 1.5, // Highest emphasis in growth mode
  },
  excellence: {
    communication: 1.1,
    leadership: 1.3,
    consistency: 1.4, // Consistency matters most for excellence
    trustworthiness: 1.1,
    growth_potential: 0.7,
  },
  leadership: {
    communication: 1.3,
    leadership: 1.5, // Highest emphasis in leadership mode
    consistency: 0.9,
    trustworthiness: 1.2,
    growth_potential: 0.8,
  },
  comparative: {
    communication: 1.0,
    leadership: 1.0,
    consistency: 1.0, // All traits equal in comparative mode
    trustworthiness: 1.0,
    growth_potential: 1.0,
  },
});

// ============================================================
// IntentAwareEvaluationService
// ============================================================
class IntentAwareEvaluationService {
  // ============================================================
  // getIntentConfig — Retrieve weight configuration for an intent
  // SRS 6.2: "Intent modes affect interpretation weights"
  //
  // @param {string} intentCode — growth|excellence|leadership|comparative
  // @returns {Object} — Weight configuration from DB or defaults
  // ============================================================
  static async getIntentConfig(intentCode) {
    const code = (intentCode || "comparative").toLowerCase();

    // Try DB first (seeded in migration 013)
    const result = await query(
      `SELECT * FROM evaluation_intent_config WHERE intent_code = $1`,
      [code],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        intentCode: row.intent_code,
        label: row.label,
        description: row.description,
        weights:
          typeof row.weight_profile === "string"
            ? JSON.parse(row.weight_profile)
            : row.weight_profile,
        traitEmphasis:
          INTENT_TRAIT_EMPHASIS[code] || INTENT_TRAIT_EMPHASIS.comparative,
        isActive: row.is_active,
      };
    }

    // Fallback to defaults
    return {
      intentCode: code,
      label: code.charAt(0).toUpperCase() + code.slice(1),
      description: "Default configuration",
      weights:
        DEFAULT_INTENT_WEIGHTS[code] || DEFAULT_INTENT_WEIGHTS.comparative,
      traitEmphasis:
        INTENT_TRAIT_EMPHASIS[code] || INTENT_TRAIT_EMPHASIS.comparative,
      isActive: true,
    };
  }

  // ============================================================
  // applyIntentWeights — Reweight a score breakdown by intent
  //
  // Takes a multi-dimensional score object and applies intent-
  // specific weighting to produce a single intent-adjusted score.
  //
  // @param {Object} scores — Breakdown of score components:
  //   { raw_score, temporal_delta, credibility, peer_ranking,
  //     faculty_normalized, consistency }
  // @param {string} intentCode — The evaluation intent
  // @returns {Object} — Intent-adjusted aggregate + breakdown
  // ============================================================
  static async applyIntentWeights(scores, intentCode) {
    const config =
      await IntentAwareEvaluationService.getIntentConfig(intentCode);
    const weights = config.weights;

    // Compute weighted score: Σ(score_dim × weight_dim)
    let weightedTotal = 0;
    let totalWeight = 0;
    const breakdown = {};

    for (const [dimension, weight] of Object.entries(weights)) {
      const scoreValue =
        scores[dimension] != null ? parseFloat(scores[dimension]) : 0;
      const contribution = scoreValue * weight;
      breakdown[dimension] = {
        raw: scoreValue,
        weight,
        contribution: parseFloat(contribution.toFixed(4)),
      };
      weightedTotal += contribution;
      totalWeight += weight;
    }

    // Normalize by total weight
    const adjustedScore =
      totalWeight > 0
        ? parseFloat((weightedTotal / totalWeight).toFixed(4))
        : 0;

    return {
      intentCode: config.intentCode,
      intentLabel: config.label,
      adjustedScore,
      breakdown,
      totalWeight: parseFloat(totalWeight.toFixed(4)),
    };
  }

  // ============================================================
  // classifySessionIntent — Determine or retrieve session's intent
  //
  // If the session already has an intent stored, return it.
  // Otherwise, infer from session metadata (class type, timing, etc.)
  //
  // @param {string} sessionId — The evaluation session
  // @returns {Object} — Intent classification with config
  // ============================================================
  static async classifySessionIntent(sessionId) {
    // Check if session has an explicit intent set
    const session = await query(
      `SELECT es.session_id, es.session_type, es.status, es.context,
              p.project_type
       FROM evaluation_sessions es
       LEFT JOIN projects p ON es.project_id = p.project_id
       WHERE es.session_id = $1`,
      [sessionId],
    );

    if (session.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sess = session.rows[0];
    const context =
      typeof sess.context === "string"
        ? JSON.parse(sess.context || "{}")
        : sess.context || {};

    // If explicit intent is stored in session context, use it
    if (context.evaluation_intent) {
      return IntentAwareEvaluationService.getIntentConfig(
        context.evaluation_intent,
      );
    }

    // SRS 6.2: Infer intent from session metadata
    let inferredIntent = "comparative"; // Default fallback

    // Project-based sessions → excellence or leadership
    if (sess.session_type === "project_evaluation") {
      inferredIntent = "excellence";
    }

    // If session context mentions "growth" or "improvement"
    if (
      context.purpose &&
      /growth|improvement|development/i.test(context.purpose)
    ) {
      inferredIntent = "growth";
    }

    // Leadership evaluation type
    if (
      context.purpose &&
      /leadership|influence|team lead/i.test(context.purpose)
    ) {
      inferredIntent = "leadership";
    }

    const config =
      await IntentAwareEvaluationService.getIntentConfig(inferredIntent);

    logger.info("Session intent classified", {
      sessionId,
      inferredIntent,
      source: context.evaluation_intent ? "explicit" : "inferred",
    });

    return {
      ...config,
      source: context.evaluation_intent ? "explicit" : "inferred",
    };
  }

  // ============================================================
  // getIntentReport — Generate an intent-specific evaluation report
  //
  // Gathers all score dimensions for a target person and applies
  // intent weighting to produce a comprehensive, intent-aware view.
  //
  // @param {string} targetId — Person being evaluated
  // @param {string} intentCode — The intent mode to apply
  // @param {string} sessionId — Optional: specific session context
  // @returns {Object} — Full intent-aware evaluation report
  // ============================================================
  static async getIntentReport(targetId, intentCode, sessionId = null) {
    // Gather all score dimensions in parallel
    const [
      aggregatedScores,
      temporalGrowth,
      personVector,
      peerAggregates,
      facultyNormalized,
    ] = await Promise.all([
      // Raw aggregated scores
      query(
        `SELECT mean_score, std_dev, consensus_score, evaluator_count
         FROM aggregated_results
         WHERE target_id = $1
         ${sessionId ? "AND session_id = $2" : ""}
         ORDER BY computed_at DESC LIMIT 1`,
        sessionId ? [targetId, sessionId] : [targetId],
      ),
      // Temporal growth delta
      query(
        `SELECT growth_percentage, growth_category
         FROM temporal_growth_records
         WHERE person_id = $1
         ORDER BY computed_at DESC LIMIT 1`,
        [targetId],
      ),
      // Person vector (current)
      query(`SELECT * FROM person_vectors WHERE person_id = $1`, [targetId]),
      // Peer ranking aggregate
      query(
        `SELECT normalized_score, respondent_count
         FROM peer_ranking_aggregates
         WHERE person_id = $1
         ORDER BY computed_at DESC LIMIT 1`,
        [targetId],
      ),
      // Faculty normalized scores
      query(
        `SELECT AVG(normalized_score) as avg_normalized,
                COUNT(*) as faculty_count
         FROM faculty_normalized_scores
         WHERE target_id = $1
         ${sessionId ? "AND session_id = $2" : ""}`,
        sessionId ? [targetId, sessionId] : [targetId],
      ),
    ]);

    // Build score dimensions object
    const agg = aggregatedScores.rows[0] || {};
    const temp = temporalGrowth.rows[0] || {};
    const vec = personVector.rows[0] || {};
    const peer = peerAggregates.rows[0] || {};
    const fac = facultyNormalized.rows[0] || {};

    // Normalize raw score to 0-1 range (assume max pool is 20 from SRS 4.1.3)
    const rawNormalized = agg.mean_score ? parseFloat(agg.mean_score) / 20 : 0;

    const scores = {
      raw_score: rawNormalized,
      temporal_delta: temp.growth_percentage
        ? Math.min(
            1,
            Math.max(0, (parseFloat(temp.growth_percentage) + 50) / 100),
          )
        : 0.5,
      credibility: agg.consensus_score ? parseFloat(agg.consensus_score) : 0.5,
      peer_ranking: peer.normalized_score
        ? parseFloat(peer.normalized_score)
        : 0,
      faculty_normalized: fac.avg_normalized
        ? parseFloat(fac.avg_normalized) / 20
        : 0,
      consistency: vec.consistency ? parseFloat(vec.consistency) : 0.5,
    };

    // Apply intent weights
    const intentResult = await IntentAwareEvaluationService.applyIntentWeights(
      scores,
      intentCode,
    );

    // Apply trait emphasis to person vector if available
    const intentConfig =
      await IntentAwareEvaluationService.getIntentConfig(intentCode);
    let traitProfile = null;

    if (vec.person_id) {
      const emphasis = intentConfig.traitEmphasis;
      traitProfile = {
        communication: parseFloat(
          (parseFloat(vec.communication || 0) * emphasis.communication).toFixed(
            4,
          ),
        ),
        leadership: parseFloat(
          (parseFloat(vec.leadership || 0) * emphasis.leadership).toFixed(4),
        ),
        consistency: parseFloat(
          (parseFloat(vec.consistency || 0) * emphasis.consistency).toFixed(4),
        ),
        trustworthiness: parseFloat(
          (
            parseFloat(vec.trustworthiness || 0) * emphasis.trustworthiness
          ).toFixed(4),
        ),
        growth_potential: parseFloat(
          (
            parseFloat(vec.growth_potential || 0) * emphasis.growth_potential
          ).toFixed(4),
        ),
      };
    }

    return {
      targetId,
      intentCode: intentResult.intentCode,
      intentLabel: intentResult.intentLabel,
      adjustedScore: intentResult.adjustedScore,
      scoreBreakdown: intentResult.breakdown,
      traitProfile,
      dataSources: {
        hasAggregatedScores: aggregatedScores.rows.length > 0,
        hasTemporalData: temporalGrowth.rows.length > 0,
        hasPersonVector: personVector.rows.length > 0,
        hasPeerRankings: peerAggregates.rows.length > 0,
        hasFacultyScores: parseInt(fac.faculty_count) > 0,
      },
    };
  }

  // ============================================================
  // listIntents — List all available evaluation intent modes
  // ============================================================
  static async listIntents() {
    const result = await query(
      `SELECT intent_code, label, description, is_active
       FROM evaluation_intent_config
       ORDER BY intent_code`,
    );
    return result.rows;
  }
}

module.exports = IntentAwareEvaluationService;
