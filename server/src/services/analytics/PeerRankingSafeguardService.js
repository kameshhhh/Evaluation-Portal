// ============================================================
// PEER RANKING SAFEGUARD SERVICE — Ethical Survey Enforcement
// ============================================================
// Implements SRS Section 4.5.3: Ethical Safeguards for Peer Ranking
//
// CORE PRINCIPLES (SRS 4.5.3):
//   1. Limited top positions (max 3 per survey question)
//   2. No equal ranking allowed (forced distribution)
//   3. Individual rankings are NEVER revealed to subjects
//   4. Negative questions are anonymized in all outputs
//   5. Gaming detection: collusion, reciprocity, outlier patterns
//
// TABLES USED (created in migration 013):
//   peer_ranking_surveys      — survey configuration
//   peer_ranking_responses     — individual responses (encrypted/anonymized)
//   peer_ranking_aggregates    — computed aggregates per person
//   peer_safeguard_flags       — detected gaming/integrity issues
//
// ENTRY POINTS:
//   • createSurvey(sessionId, config) — Configure a new peer survey
//   • submitRanking(surveyId, evaluatorId, rankings) — Submit ranking
//   • aggregateResults(surveyId) — Compute aggregates (anonymized)
//   • detectGaming(surveyId) — Run gaming detection algorithms
//   • getSurveyResults(surveyId) — Get anonymized aggregated results
//
// DOES NOT modify any existing services or tables.
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// SRS 4.5.3 constraints — enforce ethical boundaries
// ============================================================
const SAFEGUARD_RULES = Object.freeze({
  MAX_TOP_POSITIONS: 3, // Max people that can be ranked in top positions
  MIN_EVALUATORS: 3, // Minimum evaluators for valid survey
  MAX_RANK_VALUE: 10, // Maximum ranking value
  COLLUSION_THRESHOLD: 0.85, // Similarity score above which collusion is flagged
  RECIPROCITY_THRESHOLD: 0.7, // Mutual high-ranking correlation threshold
  OUTLIER_Z_THRESHOLD: 2.5, // Z-score threshold for outlier detection
});

// ============================================================
// Negative question indicators — must always be anonymized (SRS 4.5.3)
// ============================================================
const NEGATIVE_QUESTION_KEYWORDS = [
  "weakness",
  "difficult",
  "challenge",
  "improve",
  "concern",
  "struggle",
  "conflict",
  "least",
  "lowest",
  "avoid",
];

// ============================================================
// PeerRankingSafeguardService — manages peer ranking with safeguards
// ============================================================
class PeerRankingSafeguardService {
  // ============================================================
  // createSurvey — Configure a new peer ranking survey
  // SRS 4.5.3: "Limited top positions, forced distribution"
  //
  // @param {string} sessionId — The evaluation session this survey belongs to
  // @param {Object} config — Survey configuration
  // @param {string} config.title — Survey title
  // @param {Array} config.questions — Array of question objects
  // @param {string[]} config.participantIds — Person IDs eligible to rank
  // @param {string} config.createdBy — Admin/faculty who created survey
  // @returns {Object} — Created survey record
  // ============================================================
  static async createSurvey(sessionId, config) {
    // Validate minimum participant count
    if (
      !config.participantIds ||
      config.participantIds.length < SAFEGUARD_RULES.MIN_EVALUATORS
    ) {
      throw new Error(
        `SRS 4.5.3 violation: Peer survey requires at least ${SAFEGUARD_RULES.MIN_EVALUATORS} participants`,
      );
    }

    // Tag negative questions for anonymization enforcement
    const questions = (config.questions || []).map((q, idx) => ({
      ...q,
      questionIndex: idx,
      isNegative: PeerRankingSafeguardService._isNegativeQuestion(q.text),
      maxTopPositions: q.maxTopPositions || SAFEGUARD_RULES.MAX_TOP_POSITIONS,
    }));

    const result = await query(
      `INSERT INTO peer_ranking_surveys (
        session_id, title, questions, participant_ids, created_by,
        max_top_positions, is_active, closes_at
      ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)
      RETURNING *`,
      [
        sessionId,
        config.title,
        JSON.stringify(questions),
        JSON.stringify(config.participantIds),
        config.createdBy,
        SAFEGUARD_RULES.MAX_TOP_POSITIONS,
        config.closesAt || null,
      ],
    );

    logger.info("Peer ranking survey created", {
      surveyId: result.rows[0].survey_id,
      sessionId,
      participantCount: config.participantIds.length,
      questionCount: questions.length,
    });

    return result.rows[0];
  }

  // ============================================================
  // submitRanking — Submit a peer ranking response
  //
  // ENFORCED RULES (SRS 4.5.3):
  //   ① No self-ranking (evaluator cannot rank themselves)
  //   ② No equal ranking (forced distribution)
  //   ③ Limited top positions per question
  //   ④ Cannot rank more or fewer than allowed
  // ============================================================
  static async submitRanking(surveyId, evaluatorId, rankings) {
    // Get survey configuration
    const surveyResult = await query(
      `SELECT * FROM peer_ranking_surveys WHERE survey_id = $1 AND is_active = true`,
      [surveyId],
    );

    if (surveyResult.rows.length === 0) {
      throw new Error("Survey not found or has been closed");
    }

    const survey = surveyResult.rows[0];
    const participantIds =
      typeof survey.participant_ids === "string"
        ? JSON.parse(survey.participant_ids)
        : survey.participant_ids;

    // SRS 4.5.3 ①: No self-ranking
    if (participantIds.includes(evaluatorId)) {
      for (const qRanking of rankings) {
        for (const entry of qRanking.rankings || []) {
          if (entry.personId === evaluatorId) {
            throw new Error(
              "SRS 4.5.3 violation: Self-ranking is not permitted",
            );
          }
        }
      }
    }

    // Validate each question's ranking
    const questions =
      typeof survey.questions === "string"
        ? JSON.parse(survey.questions)
        : survey.questions;

    for (const qRanking of rankings) {
      const questionConfig = questions[qRanking.questionIndex];
      if (!questionConfig) {
        throw new Error(`Invalid question index: ${qRanking.questionIndex}`);
      }

      const entries = qRanking.rankings || [];

      // SRS 4.5.3 ②: No equal ranking — all rank values must be unique
      const rankValues = entries.map((e) => e.rank);
      const uniqueRanks = new Set(rankValues);
      if (uniqueRanks.size !== rankValues.length) {
        throw new Error(
          "SRS 4.5.3 violation: Equal rankings are not allowed. Each person must have a unique rank.",
        );
      }

      // SRS 4.5.3 ③: Limited top positions
      const maxTop =
        questionConfig.maxTopPositions || SAFEGUARD_RULES.MAX_TOP_POSITIONS;
      const topRanked = entries.filter((e) => e.rank <= maxTop);
      if (topRanked.length > maxTop) {
        throw new Error(
          `SRS 4.5.3 violation: Maximum ${maxTop} people can be ranked in top positions`,
        );
      }
    }

    // Check for duplicate submission
    const existing = await query(
      `SELECT response_id FROM peer_ranking_responses
       WHERE survey_id = $1 AND evaluator_id = $2`,
      [surveyId, evaluatorId],
    );

    if (existing.rows.length > 0) {
      throw new Error(
        "Duplicate submission: You have already submitted a ranking for this survey",
      );
    }

    // Store ranking — individual rankings are anonymized (never tied back publicly)
    // Extract ranked person IDs for the ranked_person_ids array column
    const rankedPersonIds = rankings.flatMap
      ? rankings.flatMap((q) => (q.rankings || []).map((r) => r.personId))
      : [];
    const rankedPersonIdsArray = `{${[...new Set(rankedPersonIds)].join(",")}}`;

    const result = await query(
      `INSERT INTO peer_ranking_responses (
        survey_id, respondent_id, evaluator_id, ranked_person_ids, rankings, submitted_at
      ) VALUES ($1, $2, $2, $3, $4, NOW())
      RETURNING response_id, survey_id, submitted_at`,
      [surveyId, evaluatorId, rankedPersonIdsArray, JSON.stringify(rankings)],
    );

    logger.info("Peer ranking submitted", {
      surveyId,
      responseId: result.rows[0].response_id,
    });

    // Auto-aggregate if enough responses (>= MIN_EVALUATORS)
    try {
      const countRes = await query(
        `SELECT COUNT(*)::int AS cnt FROM peer_ranking_responses
         WHERE survey_id = $1 AND is_draft IS NOT TRUE`,
        [surveyId],
      );
      const responseCount = countRes.rows[0]?.cnt || 0;
      if (responseCount >= SAFEGUARD_RULES.MIN_EVALUATORS) {
        await PeerRankingSafeguardService.aggregateResults(surveyId);
        logger.info("Auto-aggregation triggered after submit", { surveyId, responseCount });
      }
    } catch (aggErr) {
      // Non-fatal — aggregation can be retried later
      logger.warn("Auto-aggregation after submit failed (non-fatal)", {
        surveyId,
        error: aggErr.message,
      });
    }

    return result.rows[0];
  }

  // ============================================================
  // aggregateResults — Compute anonymized aggregates per person
  //
  // SRS 4.5.3: "Individual rankings NEVER revealed"
  //   Aggregation = mean of all rank positions received
  //   Normalized to 0-1 scale
  //   Negative questions: results stored but NEVER exposed individually
  // ============================================================
  static async aggregateResults(surveyId) {
    // Get all responses for this survey
    const responses = await query(
      `SELECT rankings FROM peer_ranking_responses WHERE survey_id = $1`,
      [surveyId],
    );

    if (responses.rows.length < SAFEGUARD_RULES.MIN_EVALUATORS) {
      throw new Error(
        `SRS 4.5.3: Need at least ${SAFEGUARD_RULES.MIN_EVALUATORS} responses to aggregate`,
      );
    }

    // Get survey config for negative question masking
    const surveyResult = await query(
      `SELECT questions, participant_ids FROM peer_ranking_surveys WHERE survey_id = $1`,
      [surveyId],
    );
    const questions =
      typeof surveyResult.rows[0].questions === "string"
        ? JSON.parse(surveyResult.rows[0].questions)
        : surveyResult.rows[0].questions;

    // Build per-person score accumulators
    // Structure: { personId: { totalRank, count, questionBreakdown } }
    const personScores = {};
    const respondentCount = responses.rows.length;

    for (const row of responses.rows) {
      const rankings =
        typeof row.rankings === "string"
          ? JSON.parse(row.rankings)
          : row.rankings;

      for (const qRanking of rankings) {
        const questionConfig = questions[qRanking.questionIndex] || {};
        const isNegative = questionConfig.isNegative || false;

        for (const entry of qRanking.rankings || []) {
          const pid = entry.personId;
          if (!personScores[pid]) {
            personScores[pid] = { totalInvRank: 0, count: 0, mentions: 0 };
          }

          // Invert rank for scoring: lower rank number = higher score
          // If max 10 positions, rank 1 → score 10, rank 10 → score 1
          const invertedRank = SAFEGUARD_RULES.MAX_RANK_VALUE + 1 - entry.rank;

          // SRS 4.5.3: Negative question scores are inverted (lower = better)
          const adjustedScore = isNegative
            ? entry.rank // For negative questions, higher rank = better
            : invertedRank;

          personScores[pid].totalInvRank += adjustedScore;
          personScores[pid].count += 1;
          personScores[pid].mentions += 1;
        }
      }
    }

    // Compute normalized scores and upsert aggregates
    const aggregates = [];

    for (const [personId, scores] of Object.entries(personScores)) {
      const avgScore =
        scores.count > 0 ? scores.totalInvRank / scores.count : 0;
      // Normalize to 0-1 range
      const normalizedScore = parseFloat(
        (avgScore / SAFEGUARD_RULES.MAX_RANK_VALUE).toFixed(4),
      );

      const row = await query(
        `INSERT INTO peer_ranking_aggregates (
          survey_id, person_id, normalized_score, total_mentions,
          respondent_count
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (survey_id, person_id)
        DO UPDATE SET
          normalized_score = EXCLUDED.normalized_score,
          total_mentions = EXCLUDED.total_mentions,
          respondent_count = EXCLUDED.respondent_count,
          computed_at = NOW()
        RETURNING *`,
        [surveyId, personId, normalizedScore, scores.mentions, respondentCount],
      );

      aggregates.push(row.rows[0]);
    }

    logger.info("Peer ranking aggregation complete", {
      surveyId,
      respondentCount,
      aggregatedPersons: aggregates.length,
    });

    return {
      surveyId,
      respondentCount,
      aggregates,
    };
  }

  // ============================================================
  // detectGaming — Run gaming detection algorithms
  //
  // SRS 4.5.3: Detect and flag integrity issues:
  //   ① Collusion — two evaluators with suspiciously similar rankings
  //   ② Reciprocity — mutual high-ranking between two people
  //   ③ Outlier inflation — single evaluator giving extreme scores
  // ============================================================
  static async detectGaming(surveyId) {
    const responses = await query(
      `SELECT response_id, evaluator_id, rankings
       FROM peer_ranking_responses WHERE survey_id = $1`,
      [surveyId],
    );

    if (responses.rows.length < 2) {
      return {
        flags: [],
        message: "Not enough responses for gaming detection",
      };
    }

    const flags = [];

    // Parse all rankings
    const parsedResponses = responses.rows.map((r) => ({
      responseId: r.response_id,
      evaluatorId: r.evaluator_id,
      rankings:
        typeof r.rankings === "string" ? JSON.parse(r.rankings) : r.rankings,
    }));

    // ① COLLUSION DETECTION — compare ranking similarity between evaluator pairs
    for (let i = 0; i < parsedResponses.length; i++) {
      for (let j = i + 1; j < parsedResponses.length; j++) {
        const similarity =
          PeerRankingSafeguardService._computeRankingSimilarity(
            parsedResponses[i].rankings,
            parsedResponses[j].rankings,
          );

        if (similarity >= SAFEGUARD_RULES.COLLUSION_THRESHOLD) {
          flags.push({
            surveyId,
            flagType: "collusion",
            severity: similarity >= 0.95 ? "high" : "medium",
            details: {
              evaluatorPair: [
                parsedResponses[i].evaluatorId,
                parsedResponses[j].evaluatorId,
              ],
              similarityScore: similarity,
            },
          });
        }
      }
    }

    // ② RECIPROCITY DETECTION — check if two people consistently rank each other highly
    const participantSurvey = await query(
      `SELECT participant_ids FROM peer_ranking_surveys WHERE survey_id = $1`,
      [surveyId],
    );
    const participantIds =
      typeof participantSurvey.rows[0].participant_ids === "string"
        ? JSON.parse(participantSurvey.rows[0].participant_ids)
        : participantSurvey.rows[0].participant_ids;

    // Build a map: evaluatorId → who they ranked in top positions
    const topRankMap = {};
    for (const resp of parsedResponses) {
      topRankMap[resp.evaluatorId] = new Set();
      for (const qRanking of resp.rankings) {
        for (const entry of qRanking.rankings || []) {
          if (entry.rank <= SAFEGUARD_RULES.MAX_TOP_POSITIONS) {
            topRankMap[resp.evaluatorId].add(entry.personId);
          }
        }
      }
    }

    // Check for mutual top-ranking
    const evaluatorIds = Object.keys(topRankMap);
    for (let i = 0; i < evaluatorIds.length; i++) {
      for (let j = i + 1; j < evaluatorIds.length; j++) {
        const a = evaluatorIds[i],
          b = evaluatorIds[j];
        if (topRankMap[a].has(b) && topRankMap[b] && topRankMap[b].has(a)) {
          flags.push({
            surveyId,
            flagType: "reciprocity",
            severity: "medium",
            details: {
              evaluatorPair: [a, b],
              mutualHighRanking: true,
            },
          });
        }
      }
    }

    // ③ OUTLIER DETECTION — evaluators whose scores deviate significantly from mean
    const evaluatorAvgRanks = {};
    for (const resp of parsedResponses) {
      let totalRank = 0,
        count = 0;
      for (const qRanking of resp.rankings) {
        for (const entry of qRanking.rankings || []) {
          totalRank += entry.rank;
          count += 1;
        }
      }
      evaluatorAvgRanks[resp.evaluatorId] = count > 0 ? totalRank / count : 0;
    }

    const avgValues = Object.values(evaluatorAvgRanks);
    const mean = avgValues.reduce((s, v) => s + v, 0) / avgValues.length;
    const stdDev = Math.sqrt(
      avgValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) /
        avgValues.length,
    );

    if (stdDev > 0) {
      for (const [evaluatorId, avgRank] of Object.entries(evaluatorAvgRanks)) {
        const zScore = Math.abs((avgRank - mean) / stdDev);
        if (zScore >= SAFEGUARD_RULES.OUTLIER_Z_THRESHOLD) {
          flags.push({
            surveyId,
            flagType: "outlier_inflation",
            severity: zScore >= 3.0 ? "high" : "medium",
            details: {
              evaluatorId,
              avgRank,
              zScore: parseFloat(zScore.toFixed(3)),
              populationMean: parseFloat(mean.toFixed(3)),
            },
          });
        }
      }
    }

    // Persist flags to database
    for (const flag of flags) {
      await query(
        `INSERT INTO peer_safeguard_flags (
          survey_id, flag_type, severity, details, evidence
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          flag.surveyId,
          flag.flagType,
          flag.severity,
          JSON.stringify(flag.details),
          JSON.stringify(flag.details), // evidence mirrors details for compat
        ],
      );
    }

    logger.info("Gaming detection complete", {
      surveyId,
      flagsDetected: flags.length,
      flagTypes: [...new Set(flags.map((f) => f.flagType))],
    });

    return { surveyId, flags };
  }

  // ============================================================
  // getSurveyResults — Get anonymized aggregated results
  // SRS 4.5.3: "Individual rankings NEVER revealed"
  //
  // Returns ONLY aggregated normalized scores + safeguard flags.
  // No evaluator identities, no raw rankings.
  // ============================================================
  static async getSurveyResults(surveyId) {
    const [aggregates, flagsResult, surveyInfo] = await Promise.all([
      query(
        `SELECT pra.person_id, pra.normalized_score, pra.total_mentions,
                pra.respondent_count, p.display_name
         FROM peer_ranking_aggregates pra
         JOIN persons p ON pra.person_id = p.person_id
         WHERE pra.survey_id = $1
         ORDER BY pra.normalized_score DESC`,
        [surveyId],
      ),
      query(
        `SELECT flag_type, severity, COUNT(*) as count
         FROM peer_safeguard_flags
         WHERE survey_id = $1 OR session_id = $1
         GROUP BY flag_type, severity`,
        [surveyId],
      ),
      query(
        `SELECT title, created_at, closes_at, is_active
         FROM peer_ranking_surveys WHERE survey_id = $1`,
        [surveyId],
      ),
    ]);

    return {
      survey: surveyInfo.rows[0] || null,
      // SRS 4.5.3: Only aggregated scores, no individual rankings
      aggregatedScores: aggregates.rows.map((r) => ({
        personId: r.person_id,
        displayName: r.display_name,
        normalizedScore: parseFloat(r.normalized_score),
        mentions: parseInt(r.total_mentions),
        respondents: parseInt(r.respondent_count),
      })),
      safeguardSummary: flagsResult.rows.map((f) => ({
        type: f.flag_type,
        severity: f.severity,
        count: parseInt(f.count),
      })),
    };
  }

  // ============================================================
  // PRIVATE: Determine if a question is negative (SRS 4.5.3)
  // Negative questions must have results anonymized in all outputs
  // ============================================================
  static _isNegativeQuestion(questionText) {
    if (!questionText) return false;
    const lower = questionText.toLowerCase();
    return NEGATIVE_QUESTION_KEYWORDS.some((kw) => lower.includes(kw));
  }

  // ============================================================
  // PRIVATE: Compute ranking similarity between two evaluators
  // Uses Spearman rank correlation coefficient
  // Returns value between 0 and 1 (1 = identical rankings)
  // ============================================================
  static _computeRankingSimilarity(rankingsA, rankingsB) {
    // Build person→rank maps for each evaluator
    const mapA = {},
      mapB = {};

    for (const q of rankingsA) {
      for (const entry of q.rankings || []) {
        mapA[entry.personId] = (mapA[entry.personId] || 0) + entry.rank;
      }
    }
    for (const q of rankingsB) {
      for (const entry of q.rankings || []) {
        mapB[entry.personId] = (mapB[entry.personId] || 0) + entry.rank;
      }
    }

    // Find common ranked persons
    const commonIds = Object.keys(mapA).filter((id) => id in mapB);
    if (commonIds.length < 2) return 0;

    // Compute Spearman rank correlation
    const n = commonIds.length;
    const dSquaredSum = commonIds.reduce((sum, id) => {
      const d = mapA[id] - mapB[id];
      return sum + d * d;
    }, 0);

    // Spearman: r = 1 - (6 * Σd² / (n * (n² - 1)))
    const spearman = 1 - (6 * dSquaredSum) / (n * (n * n - 1));

    // Normalize to 0-1 range (Spearman is -1 to 1)
    return Math.max(0, (spearman + 1) / 2);
  }
}

module.exports = PeerRankingSafeguardService;
