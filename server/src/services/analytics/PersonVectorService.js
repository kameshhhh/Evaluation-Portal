// ============================================================
// PERSON VECTOR SERVICE — Latent Trait Inference Engine
// ============================================================
// Implements SRS Section 7: Person Vector Construction
//
// Builds a multi-dimensional trait vector for each person by
// synthesizing data from multiple evaluation sources:
//   1. Project evaluations (scarcity-based scores)
//   2. Faculty feedback (normalized)
//   3. Peer survey rankings (aggregated)
//   4. Historical credibility signals
//
// TRAITS (SRS 7.1):
//   communication    — ability to articulate ideas
//   leadership       — influence on team outcomes
//   consistency      — reliability across evaluation periods
//   trustworthiness  — alignment with peer perception
//   growth_potential — improvement trajectory over time
//
// IMPORTANT (SRS 7.2):
//   Person vectors are used for MENTORING only, not labeling.
//   No raw rankings exposed. Only trends, percentiles, bands.
//
// ENTRY POINTS:
//   • buildVector(personId)     — Compute or update person vector
//   • batchBuild(personIds)     — Compute vectors for multiple people
//   • getVector(personId)       — Retrieve stored vector
//   • getVectorHistory(personId) — Trait trajectory over time
//   • snapshot(personId, periodId, sessionId) — Take immutable snapshot
//
// DOES NOT modify any existing services or tables.
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// Trait weight configuration — how each data source maps to traits
// ============================================================
const TRAIT_SOURCE_WEIGHTS = Object.freeze({
  // project_evals: scores from scarcity-based evaluations
  project_evals: {
    communication: 0.15,
    leadership: 0.25,
    consistency: 0.3,
    trustworthiness: 0.2,
    growth_potential: 0.1,
  },
  // faculty_feedback: normalized faculty scores
  faculty_feedback: {
    communication: 0.3,
    leadership: 0.2,
    consistency: 0.15,
    trustworthiness: 0.25,
    growth_potential: 0.1,
  },
  // peer_surveys: aggregated peer ranking data
  peer_surveys: {
    communication: 0.2,
    leadership: 0.3,
    consistency: 0.1,
    trustworthiness: 0.3,
    growth_potential: 0.1,
  },
  // temporal: growth trajectory from TemporalGrowthService
  temporal: {
    communication: 0.05,
    leadership: 0.1,
    consistency: 0.2,
    trustworthiness: 0.1,
    growth_potential: 0.55,
  },
});

// Source reliability weights — how much we trust each data source
const SOURCE_RELIABILITY = Object.freeze({
  project_evals: 0.35,
  faculty_feedback: 0.3,
  peer_surveys: 0.2,
  temporal: 0.15,
});

// ============================================================
// PersonVectorService — builds and manages person vectors
// ============================================================
class PersonVectorService {
  // ============================================================
  // buildVector — Compute/update person vector from all sources
  // SRS 7.1: "Inferred across project evals, faculty feedback,
  //           peer surveys, interview data"
  //
  // @param {string} personId — UUID of the person
  // @returns {Object} — Computed vector with trait scores
  // ============================================================
  static async buildVector(personId) {
    // Collect signals from each source
    const [projectSignals, facultySignals, peerSignals, temporalSignals] =
      await Promise.all([
        PersonVectorService._extractProjectEvalSignals(personId),
        PersonVectorService._extractFacultySignals(personId),
        PersonVectorService._extractPeerSignals(personId),
        PersonVectorService._extractTemporalSignals(personId),
      ]);

    // SRS 7.1: Build trait vector by weighted fusion of all signals
    const traits = {
      communication: 0,
      leadership: 0,
      consistency: 0,
      trustworthiness: 0,
      growth_potential: 0,
    };

    // Source breakdown for transparency
    const sourceBreakdown = {
      project_evals: projectSignals.dataPoints,
      faculty_feedback: facultySignals.dataPoints,
      peer_surveys: peerSignals.dataPoints,
      temporal: temporalSignals.dataPoints,
    };

    const totalDataPoints = Object.values(sourceBreakdown).reduce(
      (s, n) => s + n,
      0,
    );

    // Weighted average: Σ(source_score × source_reliability × trait_weight)
    // Normalized by total reliability of available sources
    const sources = [
      { key: "project_evals", signals: projectSignals },
      { key: "faculty_feedback", signals: facultySignals },
      { key: "peer_surveys", signals: peerSignals },
      { key: "temporal", signals: temporalSignals },
    ];

    let totalReliability = 0;

    for (const { key, signals } of sources) {
      if (signals.dataPoints === 0) continue; // Skip sources with no data

      const reliability = SOURCE_RELIABILITY[key];
      const traitWeights = TRAIT_SOURCE_WEIGHTS[key];
      totalReliability += reliability;

      for (const trait of Object.keys(traits)) {
        // Each source contributes its signal score × its trait weight × reliability
        const signalValue = signals.scores[trait] || 0.5; // Default to midpoint
        traits[trait] += signalValue * traitWeights[trait] * reliability;
      }
    }

    // Normalize by total reliability of available sources
    if (totalReliability > 0) {
      for (const trait of Object.keys(traits)) {
        // Divide by reliability and normalize to 0-1 range
        traits[trait] = Math.max(
          0,
          Math.min(1, traits[trait] / totalReliability),
        );
        // Round to 4 decimal places
        traits[trait] = parseFloat(traits[trait].toFixed(4));
      }
    }

    // Confidence level based on data availability
    // More data sources = higher confidence
    const activeSources = sources.filter(
      (s) => s.signals.dataPoints > 0,
    ).length;
    const confidence = parseFloat(
      Math.min(
        1,
        (activeSources / 4) * 0.5 + (Math.min(totalDataPoints, 20) / 20) * 0.5,
      ).toFixed(4),
    );

    // Upsert into person_vectors table
    const result = await query(
      `INSERT INTO person_vectors (
        person_id, communication, leadership, consistency,
        trustworthiness, growth_potential, data_point_count,
        confidence_level, source_breakdown
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (person_id)
      DO UPDATE SET
        communication = EXCLUDED.communication,
        leadership = EXCLUDED.leadership,
        consistency = EXCLUDED.consistency,
        trustworthiness = EXCLUDED.trustworthiness,
        growth_potential = EXCLUDED.growth_potential,
        data_point_count = EXCLUDED.data_point_count,
        confidence_level = EXCLUDED.confidence_level,
        source_breakdown = EXCLUDED.source_breakdown,
        updated_at = NOW()
      RETURNING *`,
      [
        personId,
        traits.communication,
        traits.leadership,
        traits.consistency,
        traits.trustworthiness,
        traits.growth_potential,
        totalDataPoints,
        confidence,
        JSON.stringify(sourceBreakdown),
      ],
    );

    logger.info("Person vector computed", {
      personId,
      traits,
      confidence,
      dataPoints: totalDataPoints,
    });

    return result.rows[0];
  }

  // ============================================================
  // batchBuild — Compute vectors for multiple people
  // ============================================================
  static async batchBuild(personIds) {
    const results = [];
    for (const personId of personIds) {
      try {
        results.push(await PersonVectorService.buildVector(personId));
      } catch (err) {
        logger.warn("Vector build failed for person", {
          personId,
          error: err.message,
        });
      }
    }
    return results;
  }

  // ============================================================
  // getVector — Retrieve stored vector for a person
  // SRS 7.2: Returns vector data (for mentoring only, not labeling)
  // ============================================================
  static async getVector(personId) {
    const result = await query(
      `SELECT pv.*, p.display_name
       FROM person_vectors pv
       JOIN persons p ON pv.person_id = p.person_id
       WHERE pv.person_id = $1`,
      [personId],
    );
    return result.rows[0] || null;
  }

  // ============================================================
  // snapshot — Take immutable vector snapshot for historical tracking
  // ============================================================
  static async snapshot(personId, periodId = null, sessionId = null) {
    // Get current vector
    const current = await PersonVectorService.getVector(personId);
    if (!current) return null;

    // Get previous snapshot to compute deltas
    const prevSnap = await query(
      `SELECT * FROM person_vector_snapshots
       WHERE person_id = $1
       ORDER BY captured_at DESC LIMIT 1`,
      [personId],
    );

    const prev = prevSnap.rows[0];

    const result = await query(
      `INSERT INTO person_vector_snapshots (
        person_id, period_id, session_id,
        communication, leadership, consistency,
        trustworthiness, growth_potential,
        delta_communication, delta_leadership, delta_consistency,
        delta_trustworthiness, delta_growth_potential,
        data_point_count, confidence_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        personId,
        periodId,
        sessionId,
        current.communication,
        current.leadership,
        current.consistency,
        current.trustworthiness,
        current.growth_potential,
        prev ? current.communication - prev.communication : null,
        prev ? current.leadership - prev.leadership : null,
        prev ? current.consistency - prev.consistency : null,
        prev ? current.trustworthiness - prev.trustworthiness : null,
        prev ? current.growth_potential - prev.growth_potential : null,
        current.data_point_count,
        current.confidence_level,
      ],
    );

    return result.rows[0];
  }

  // ============================================================
  // getVectorHistory — Trait trajectory over time
  // SRS 7.2: "Only trends, percentiles, bands"
  // ============================================================
  static async getVectorHistory(personId, limit = 12) {
    const result = await query(
      `SELECT pvs.*,
              am.academic_year, am.semester, am.month_index
       FROM person_vector_snapshots pvs
       LEFT JOIN academic_months am ON pvs.period_id = am.period_id
       WHERE pvs.person_id = $1
       ORDER BY pvs.captured_at ASC
       LIMIT $2`,
      [personId, limit],
    );

    return {
      personId,
      snapshots: result.rows,
      traitTrajectories: PersonVectorService._buildTrajectories(result.rows),
    };
  }

  // ============================================================
  // PRIVATE: Extract signals from project evaluations
  // Maps aggregated eval scores → trait signal contributions
  // ============================================================
  static async _extractProjectEvalSignals(personId) {
    const result = await query(
      `SELECT ar.mean_score, ar.std_dev, ar.consensus_score,
              ar.evaluator_count, es.scarcity_pool_size
       FROM aggregated_results ar
       JOIN evaluation_sessions es ON ar.session_id = es.session_id
       WHERE ar.target_id = $1
       ORDER BY ar.computed_at DESC
       LIMIT 10`,
      [personId],
    );

    if (result.rows.length === 0) {
      return { dataPoints: 0, scores: {} };
    }

    // Normalize scores to 0-1 range based on pool sizes
    const records = result.rows;
    const avgNormalized =
      records.reduce((sum, r) => {
        const poolSize = parseFloat(r.scarcity_pool_size) || 10;
        return sum + parseFloat(r.mean_score) / poolSize;
      }, 0) / records.length;

    // Consistency = 1 - normalized standard deviation
    const avgConsistency =
      records.reduce((sum, r) => {
        const poolSize = parseFloat(r.scarcity_pool_size) || 10;
        const normStd = (parseFloat(r.std_dev) || 0) / poolSize;
        return sum + (1 - Math.min(normStd, 1));
      }, 0) / records.length;

    // Consensus as trustworthiness proxy
    const avgConsensus =
      records.reduce((s, r) => s + (parseFloat(r.consensus_score) || 0.5), 0) /
      records.length;

    return {
      dataPoints: records.length,
      scores: {
        communication: avgNormalized * 0.8 + 0.1, // Baseline shift
        leadership: avgNormalized,
        consistency: avgConsistency,
        trustworthiness: Math.min(avgConsensus, 1),
        growth_potential: 0.5, // Filled by temporal signals
      },
    };
  }

  // ============================================================
  // PRIVATE: Extract signals from faculty feedback
  // ============================================================
  static async _extractFacultySignals(personId) {
    const result = await query(
      `SELECT fns.normalized_score, fns.raw_score
       FROM faculty_normalized_scores fns
       WHERE fns.target_id = $1
       ORDER BY fns.computed_at DESC
       LIMIT 10`,
      [personId],
    );

    if (result.rows.length === 0) {
      return { dataPoints: 0, scores: {} };
    }

    const avgScore =
      result.rows.reduce(
        (s, r) => s + (parseFloat(r.normalized_score) || 0),
        0,
      ) / result.rows.length;

    // Normalize to 0-1 (assuming faculty scores are on varying scales)
    const normalized = Math.min(1, Math.max(0, avgScore / 10));

    return {
      dataPoints: result.rows.length,
      scores: {
        communication: normalized,
        leadership: normalized * 0.9,
        consistency: normalized * 0.85,
        trustworthiness: normalized,
        growth_potential: 0.5,
      },
    };
  }

  // ============================================================
  // PRIVATE: Extract signals from peer ranking surveys
  // SRS 4.5.3: Only aggregated results, never individual rankings
  // ============================================================
  static async _extractPeerSignals(personId) {
    const result = await query(
      `SELECT pra.normalized_score, pra.total_mentions, pra.respondent_count
       FROM peer_ranking_aggregates pra
       WHERE pra.person_id = $1
       ORDER BY pra.computed_at DESC
       LIMIT 10`,
      [personId],
    );

    if (result.rows.length === 0) {
      return { dataPoints: 0, scores: {} };
    }

    const avgScore =
      result.rows.reduce(
        (s, r) => s + (parseFloat(r.normalized_score) || 0),
        0,
      ) / result.rows.length;

    return {
      dataPoints: result.rows.length,
      scores: {
        communication: avgScore,
        leadership: avgScore * 1.1, // Peers often rank for leadership
        consistency: avgScore * 0.8,
        trustworthiness: avgScore,
        growth_potential: 0.5,
      },
    };
  }

  // ============================================================
  // PRIVATE: Extract signals from temporal growth data
  // ============================================================
  static async _extractTemporalSignals(personId) {
    const result = await query(
      `SELECT growth_percentage, growth_category
       FROM temporal_growth_records
       WHERE person_id = $1
       ORDER BY computed_at DESC
       LIMIT 6`,
      [personId],
    );

    if (result.rows.length === 0) {
      return { dataPoints: 0, scores: {} };
    }

    // Growth potential from recent growth records
    const avgGrowth =
      result.rows.reduce(
        (s, r) => s + (parseFloat(r.growth_percentage) || 0),
        0,
      ) / result.rows.length;

    // Normalize: -50% to +50% → 0 to 1
    const growthNormalized = Math.min(1, Math.max(0, (avgGrowth + 50) / 100));

    // Consistency: what fraction of periods showed growth?
    const growthPeriods = result.rows.filter((r) =>
      ["significant_growth", "moderate_growth"].includes(r.growth_category),
    ).length;
    const consistencyScore = growthPeriods / result.rows.length;

    return {
      dataPoints: result.rows.length,
      scores: {
        communication: 0.5,
        leadership: 0.5,
        consistency: consistencyScore,
        trustworthiness: 0.5,
        growth_potential: growthNormalized,
      },
    };
  }

  // ============================================================
  // PRIVATE: Build trait trajectories from snapshots
  // Used for time-series visualization (SRS 7.2: trends only)
  // ============================================================
  static _buildTrajectories(snapshots) {
    const traits = [
      "communication",
      "leadership",
      "consistency",
      "trustworthiness",
      "growth_potential",
    ];
    const trajectories = {};

    for (const trait of traits) {
      trajectories[trait] = snapshots.map((s) => ({
        value: parseFloat(s[trait]) || 0,
        period: s.academic_year
          ? `${s.academic_year} M${s.month_index}`
          : s.captured_at,
        delta:
          s[`delta_${trait}`] != null ? parseFloat(s[`delta_${trait}`]) : null,
      }));
    }

    return trajectories;
  }
}

module.exports = PersonVectorService;
