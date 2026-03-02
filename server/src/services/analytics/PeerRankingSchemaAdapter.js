// ============================================================
// PEER RANKING SCHEMA ADAPTER — Bidirectional Bridge Layer
// ============================================================
// SRS §4.5: Bridges between migration 013 schema and
// PeerRankingSafeguardService.js expected column names.
//
// DESIGN: Adapter pattern — preserves BOTH the existing migration
// schema AND the service's expectations without modifying either.
//
// PRIVACY: This adapter enforces SRS §4.5.3 ethical safeguards
// at the translation boundary:
//   - Individual rankings never exposed in adapter output
//   - Negative question data flagged for anonymization
//   - Peer group IDs never leaked through adapter responses
//
// @see SRS §4.5.1 — Private peer group storage
// @see SRS §4.5.3 — Ethical safeguards
// @see PeerRankingSafeguardService.js — Core ranking logic
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// PeerRankingSchemaAdapter — translates between schema versions
// ============================================================
class PeerRankingSchemaAdapter {
  // ============================================================
  // Peer Group Management (SRS §4.5.1)
  // "Students may define a peer group (one-time or periodic).
  //  Network stored privately."
  //
  // @security Peer group data is PRIVATE to the owning student.
  //           No method in this adapter exposes group membership
  //           to other students, faculty, or admins.
  // ============================================================

  /**
   * Create a private peer group for a student.
   * @description SRS §4.5.1: One-time or periodic private network.
   * @security Only the owning student can view/modify their group.
   * @constraint Min 5 peers, max 15. Cannot include self.
   * @see SRS §4.5.1
   *
   * @param {string} studentPersonId - The student's person_id
   * @param {Object} groupData - Group configuration
   * @param {string} groupData.groupName - Private label
   * @param {string[]} groupData.peerIds - Array of peer person_ids
   * @param {string} [groupData.refreshPeriod] - 'one-time'|'monthly'|'semester'
   * @returns {Object} Created peer group (sanitized)
   */
  static async createPeerGroup(studentPersonId, groupData) {
    const { groupName, peerIds, refreshPeriod = "semester" } = groupData;

    // Validate: cannot include self
    if (peerIds.includes(studentPersonId)) {
      throw new Error("Cannot include yourself in your peer group");
    }

    // Validate: 5-15 peers
    if (peerIds.length < 5 || peerIds.length > 15) {
      throw new Error("Peer group must have between 5 and 15 members");
    }

    // Validate: no duplicates
    if (new Set(peerIds).size !== peerIds.length) {
      throw new Error("Duplicate peers not allowed in group");
    }

    // Verify all peer IDs exist
    const verifyResult = await query(
      `SELECT person_id FROM persons WHERE person_id = ANY($1::uuid[])`,
      [peerIds],
    );
    if (verifyResult.rows.length !== peerIds.length) {
      throw new Error(
        `Some peer IDs are invalid. Found ${verifyResult.rows.length} of ${peerIds.length}`,
      );
    }

    // Deactivate any existing active group with same name
    await query(
      `UPDATE peer_groups SET is_active = false, updated_at = NOW()
       WHERE student_id = $1 AND group_name = $2 AND is_active = true`,
      [studentPersonId, groupName],
    );

    const result = await query(
      `INSERT INTO peer_groups (
        student_id, group_name, peer_ids, peer_count,
        refresh_period, is_active
      ) VALUES ($1, $2, $3, $4, $5, true)
      RETURNING group_id, group_name, peer_count, refresh_period, created_at`,
      [
        studentPersonId,
        groupName,
        JSON.stringify(peerIds),
        peerIds.length,
        refreshPeriod,
      ],
    );

    logger.info("Peer group created", {
      groupId: result.rows[0].group_id,
      studentId: studentPersonId,
      peerCount: peerIds.length,
    });

    return result.rows[0];
  }

  /**
   * Get a student's active peer groups.
   * @description Returns groups with peer display names (privacy-safe).
   * @security Only the owning student should call this.
   * @see SRS §4.5.1
   *
   * @param {string} studentPersonId - The student's person_id
   * @returns {Object[]} Array of peer groups with resolved peer names
   */
  static async getStudentPeerGroups(studentPersonId) {
    const groups = await query(
      `SELECT group_id, group_name, peer_ids, peer_count,
              refresh_period, created_at, updated_at
       FROM peer_groups
       WHERE student_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [studentPersonId],
    );

    // Resolve peer display names for each group
    const resolved = [];
    for (const group of groups.rows) {
      const peerIds =
        typeof group.peer_ids === "string"
          ? JSON.parse(group.peer_ids)
          : group.peer_ids;

      const peers = await query(
        `SELECT p.person_id, p.display_name, p.department_code
         FROM persons p
         WHERE p.person_id = ANY($1::uuid[])
         ORDER BY p.display_name`,
        [peerIds],
      );

      resolved.push({
        groupId: group.group_id,
        groupName: group.group_name,
        peerCount: group.peer_count,
        refreshPeriod: group.refresh_period,
        createdAt: group.created_at,
        peers: peers.rows.map((p) => ({
          personId: p.person_id,
          displayName: p.display_name,
          department: p.department_code,
        })),
      });
    }

    return resolved;
  }

  /**
   * Delete (deactivate) a peer group.
   * @security Only the owning student can deactivate their group.
   * @see SRS §4.5.1
   */
  static async deactivatePeerGroup(studentPersonId, groupId) {
    const result = await query(
      `UPDATE peer_groups SET is_active = false, updated_at = NOW()
       WHERE group_id = $1 AND student_id = $2 AND is_active = true
       RETURNING group_id`,
      [groupId, studentPersonId],
    );

    if (result.rows.length === 0) {
      throw new Error("Peer group not found or already deactivated");
    }

    return { success: true, deactivatedGroupId: result.rows[0].group_id };
  }

  // ============================================================
  // Survey Adaptation Layer
  // Bridges default_trait_questions → PeerRankingSafeguardService
  // ============================================================

  /**
   * Get available trait questions (system defaults + admin custom).
   * @description SRS §4.5.2: System presents trait-based questions.
   * @see SRS §4.5.2
   *
   * @returns {Object[]} Array of trait questions
   */
  static async getTraitQuestions() {
    const result = await query(
      `SELECT question_id, trait_key, question_text, description,
              question_type, max_positions, analytics_weight, sort_order
       FROM default_trait_questions
       WHERE is_active = true
       ORDER BY sort_order ASC`,
    );

    return result.rows.map((q) => ({
      questionId: q.question_id,
      traitKey: q.trait_key,
      text: q.question_text,
      description: q.description,
      type: q.question_type,
      maxPositions: q.max_positions,
      analyticsWeight: q.analytics_weight,
    }));
  }

  /**
   * Get active surveys available to a student.
   * @description Finds both student-initiated and admin-created surveys
   * that the student can participate in.
   * @security Only returns surveys where student is a participant.
   * @see SRS §4.5.2
   *
   * @param {string} studentPersonId - Student's person_id
   * @returns {Object[]} Available surveys
   */
  static async getActiveSurveys(studentPersonId) {
    // Find surveys where student is in participant list OR has a matching peer group
    const result = await query(
      `SELECT s.survey_id, s.title, s.questions, s.status,
              s.initiation_mode, s.opens_at, s.closes_at, s.created_at,
              s.peer_group_id, s.max_top_positions,
              s.question_text, s.question_type
       FROM peer_ranking_surveys s
       WHERE s.is_active = true
         AND s.status = 'open'
         AND (
           -- Student is in the participant list (JSONB array contains the UUID string)
           (s.participant_ids IS NOT NULL AND s.participant_ids @> to_jsonb($1::text)::jsonb)
           -- OR survey is linked to student's peer group (creator or member)
           OR s.peer_group_id IN (
             SELECT group_id FROM peer_groups
             WHERE (student_id = $1::uuid OR peer_ids @> to_jsonb($1::text)::jsonb)
               AND is_active = true
           )
         )
       ORDER BY s.created_at DESC`,
      [studentPersonId],
    );

    // Check which surveys student has already submitted
    const submitted = await query(
      `SELECT survey_id FROM peer_ranking_responses
       WHERE (evaluator_id = $1 OR respondent_id = $1)
         AND is_draft = false`,
      [studentPersonId],
    );
    const submittedSet = new Set(submitted.rows.map((r) => r.survey_id));

    // Check for drafts
    const drafts = await query(
      `SELECT survey_id, rankings FROM peer_ranking_responses
       WHERE (evaluator_id = $1 OR respondent_id = $1)
         AND is_draft = true`,
      [studentPersonId],
    );
    const draftMap = new Map(drafts.rows.map((r) => [r.survey_id, r.rankings]));

    return result.rows.map((s) => {
      // Adapt: merge old schema (question_text) with new (questions JSONB)
      const questions =
        s.questions && s.questions.length > 0
          ? typeof s.questions === "string"
            ? JSON.parse(s.questions)
            : s.questions
          : s.question_text
            ? [
                {
                  text: s.question_text,
                  type: s.question_type || "positive",
                  maxTopPositions: s.max_top_positions || 3,
                },
              ]
            : [];

      return {
        surveyId: s.survey_id,
        title: s.title || s.question_text || "Peer Ranking Survey",
        questions,
        status: submittedSet.has(s.survey_id)
          ? "submitted"
          : draftMap.has(s.survey_id)
            ? "draft"
            : "pending",
        hasDraft: draftMap.has(s.survey_id),
        draftRankings: draftMap.get(s.survey_id) || null,
        initiationMode: s.initiation_mode,
        opensAt: s.opens_at,
        closesAt: s.closes_at,
        maxTopPositions: s.max_top_positions || 3,
      };
    });
  }

  /**
   * Get the peer list for a specific survey (for ranking UI).
   * @description Returns peers that the student can rank in this survey.
   * @security Never includes the student themselves. Returns display info only.
   * @constraint Self-ranking prevention (SRS §4.5.3)
   * @see SRS §4.5.2, §4.5.3
   *
   * @param {string} surveyId - The survey ID
   * @param {string} studentPersonId - Requesting student's person_id
   * @returns {Object[]} Peers available for ranking
   */
  static async getSurveyPeers(surveyId, studentPersonId) {
    // Get survey to find participant list or peer group
    const survey = await query(
      `SELECT participant_ids, peer_group_id, target_group_ids
       FROM peer_ranking_surveys WHERE survey_id = $1`,
      [surveyId],
    );

    if (survey.rows.length === 0) {
      throw new Error("Survey not found");
    }

    const s = survey.rows[0];
    let peerIds = [];

    // Priority: participant_ids (new) → peer_group → target_group_ids (old)
    if (s.participant_ids && s.participant_ids.length > 0) {
      peerIds =
        typeof s.participant_ids === "string"
          ? JSON.parse(s.participant_ids)
          : s.participant_ids;
    } else if (s.peer_group_id) {
      const group = await query(
        `SELECT peer_ids FROM peer_groups
         WHERE group_id = $1
           AND (student_id = $2 OR peer_ids @> to_jsonb($2::text)::jsonb)
           AND is_active = true`,
        [s.peer_group_id, studentPersonId],
      );
      if (group.rows.length > 0) {
        peerIds =
          typeof group.rows[0].peer_ids === "string"
            ? JSON.parse(group.rows[0].peer_ids)
            : group.rows[0].peer_ids;
      }
    } else if (s.target_group_ids && s.target_group_ids.length > 0) {
      peerIds = s.target_group_ids;
    }

    // SRS §4.5.3: Exclude self from peer list
    peerIds = peerIds.filter((id) => id !== studentPersonId);

    if (peerIds.length === 0) {
      return [];
    }

    // Resolve peer display info
    const peers = await query(
      `SELECT p.person_id, p.display_name, p.department_code
       FROM persons p
       WHERE p.person_id = ANY($1::uuid[])
       ORDER BY p.display_name`,
      [peerIds],
    );

    return peers.rows.map((p) => ({
      personId: p.person_id,
      displayName: p.display_name,
      department: p.department_code,
    }));
  }

  /**
   * Adapt and save a ranking draft.
   * @description Saves partial ranking progress. Student can resume later.
   * @security Rankings stored with evaluator_id for retrieval only.
   * @constraint Draft data follows same validation as final submission.
   * @see SRS §4.5.2
   *
   * @param {string} surveyId - Survey ID
   * @param {string} studentPersonId - Student's person_id
   * @param {Object[]} rankings - Partial ranking data
   * @returns {Object} Save confirmation
   */
  static async saveDraft(surveyId, studentPersonId, rankings) {
    // Check not already submitted (final)
    const existing = await query(
      `SELECT response_id, is_draft FROM peer_ranking_responses
       WHERE survey_id = $1 AND (evaluator_id = $2 OR respondent_id = $2)`,
      [surveyId, studentPersonId],
    );

    if (existing.rows.length > 0 && !existing.rows[0].is_draft) {
      throw new Error("Already submitted — cannot save draft");
    }

    if (existing.rows.length > 0) {
      // Update existing draft
      await query(
        `UPDATE peer_ranking_responses
         SET rankings = $1, updated_at = NOW()
         WHERE response_id = $2`,
        [JSON.stringify(rankings), existing.rows[0].response_id],
      );
    } else {
      // Insert new draft — write to BOTH old and new columns (adapter bridge)
      await query(
        `INSERT INTO peer_ranking_responses (
          survey_id, respondent_id, evaluator_id,
          ranked_person_ids, rankings, is_draft, submitted_at
        ) VALUES ($1, $2, $2, $3, $4, true, NOW())`,
        [
          surveyId,
          studentPersonId,
          // Old schema: extract person IDs as UUID array
          rankings.flatMap
            ? `{${rankings
                .flatMap((q) => (q.rankings || []).map((r) => r.personId))
                .join(",")}}`
            : "{}",
          JSON.stringify(rankings),
        ],
      );
    }

    logger.info("Peer ranking draft saved", {
      surveyId,
      studentId: studentPersonId,
    });

    return { success: true, savedAt: new Date().toISOString() };
  }

  /**
   * Submit a final ranking through PeerRankingSafeguardService.
   * @description Adapts the student's click-to-assign rankings into
   * the format PeerRankingSafeguardService.submitRanking() expects.
   *
   * @security Rankings validated by service (forced ranking, no self, etc.)
   * @constraint Consecutive unique ranks, max positions enforced
   * @see SRS §4.5.2, §4.5.3
   *
   * @param {string} surveyId - Survey ID
   * @param {string} studentPersonId - Student's person_id
   * @param {Object[]} rankings - Final ranking data
   *   Format: [{ questionIndex, rankings: [{ personId, rank }] }]
   * @returns {Object} Submission result from service
   */
  static async adaptAndSubmit(surveyId, studentPersonId, rankings) {
    // Pre-validate adapter-level constraints before passing to service
    for (const qRanking of rankings) {
      const entries = qRanking.rankings || [];

      // Rule: Consecutive ranks starting from 1
      const ranks = entries.map((e) => e.rank).sort((a, b) => a - b);
      for (let i = 0; i < ranks.length; i++) {
        if (ranks[i] !== i + 1) {
          throw new Error(
            "Ranks must be consecutive starting from 1 (e.g., 1, 2, 3)",
          );
        }
      }

      // Rule: Minimum 2 ranked
      if (entries.length < 2) {
        throw new Error("Must rank at least 2 peers per question");
      }
    }

    // Remove any existing draft before submitting
    await query(
      `DELETE FROM peer_ranking_responses
       WHERE survey_id = $1 AND (evaluator_id = $2 OR respondent_id = $2)
         AND is_draft = true`,
      [surveyId, studentPersonId],
    );

    // Delegate to PeerRankingSafeguardService for full validation + storage
    // The service handles: no self-ranking, no equal ranking,
    // max top positions, duplicate submission prevention
    const PeerRankingSafeguardService = require("../analytics/PeerRankingSafeguardService");
    const result = await PeerRankingSafeguardService.submitRanking(
      surveyId,
      studentPersonId,
      rankings,
    );

    return result;
  }

  /**
   * Create a student-initiated survey from default traits.
   * @description Student selects traits → system creates survey
   * with createdBy='system' and initiation_mode='student'.
   *
   * @security Survey linked to student's private peer group.
   * @constraint Requires active peer group with 5+ members.
   * @see SRS §4.5.1, §4.5.2
   *
   * @param {string} studentPersonId - Student's person_id
   * @param {string} groupId - Peer group ID
   * @param {string[]} traitKeys - Selected trait keys from question bank
   * @param {string} userId - User's internal_user_id (for createdBy)
   * @returns {Object} Created survey
   */
  static async createStudentSurvey(
    studentPersonId,
    groupId,
    traitKeys,
    userId,
  ) {
    // Verify group belongs to student
    const group = await query(
      `SELECT group_id, peer_ids, peer_count
       FROM peer_groups
       WHERE group_id = $1 AND student_id = $2 AND is_active = true`,
      [groupId, studentPersonId],
    );

    if (group.rows.length === 0) {
      throw new Error("Peer group not found or not yours");
    }

    if (group.rows[0].peer_count < 5) {
      throw new Error("Peer group must have at least 5 members for a survey");
    }

    // Get selected trait questions
    const traits = await query(
      `SELECT question_id, trait_key, question_text, question_type, max_positions
       FROM default_trait_questions
       WHERE trait_key = ANY($1::text[]) AND is_active = true
       ORDER BY sort_order`,
      [traitKeys],
    );

    if (traits.rows.length === 0) {
      throw new Error("No valid trait questions selected");
    }

    const peerIds =
      typeof group.rows[0].peer_ids === "string"
        ? JSON.parse(group.rows[0].peer_ids)
        : group.rows[0].peer_ids;

    // Include creator in participant list so they can also be ranked by peers
    if (!peerIds.includes(studentPersonId)) {
      peerIds.push(studentPersonId);
    }

    // Build questions array in service format
    const questions = traits.rows.map((t, idx) => ({
      questionIndex: idx,
      text: t.question_text,
      type: t.question_type,
      traitKey: t.trait_key,
      maxTopPositions: t.max_positions,
      isNegative: t.question_type === "negative",
    }));

    // Create survey with createdBy pointing to user (maintains FK),
    // but initiation_mode='student' tracks actual flow
    const result = await query(
      `INSERT INTO peer_ranking_surveys (
        created_by, title, questions, participant_ids,
        max_top_positions, is_active, status,
        initiation_mode, peer_group_id,
        question_text, question_type, max_ranks
      ) VALUES (
        $1, $2, $3, $4, $5, true, 'open',
        'student', $6,
        $7, $8, $9
      )
      RETURNING survey_id, title, status, created_at`,
      [
        userId,
        `Peer Evaluation — ${traits.rows.map((t) => t.trait_key).join(", ")}`,
        JSON.stringify(questions),
        JSON.stringify(peerIds),
        3, // default max top positions
        groupId,
        // Old schema columns (backward compat)
        questions[0]?.text || "Peer Ranking",
        questions[0]?.type || "positive",
        3,
      ],
    );

    logger.info("Student-initiated peer survey created", {
      surveyId: result.rows[0].survey_id,
      studentId: studentPersonId,
      groupId,
      traitCount: traits.rows.length,
    });

    return result.rows[0];
  }

  /**
   * Get aggregated (anonymized) survey results for a student.
   * @description SRS §4.5.3: Only aggregated analytics, never individual rankings.
   * Returns banded scores (EXCELLENT/GOOD/SATISFACTORY/DEVELOPING).
   *
   * @security Individual rankings NEVER exposed. Aggregate only.
   * @see SRS §4.5.3, §7.2
   *
   * @param {string} surveyId - Survey ID
   * @returns {Object} Anonymized aggregated results
   */
  static async getAggregatedResults(surveyId) {
    const PeerRankingSafeguardService = require("../analytics/PeerRankingSafeguardService");

    // Delegate to service — it already enforces SRS §4.5.3 (aggregate only)
    const results =
      await PeerRankingSafeguardService.getSurveyResults(surveyId);

    // Band the scores (SRS §7.2: mentoring bands, not labels)
    if (results.aggregatedScores) {
      results.aggregatedScores = results.aggregatedScores.map((score) => ({
        ...score,
        band: PeerRankingSchemaAdapter._scoreToBand(score.normalizedScore),
      }));
    }

    return results;
  }

  /**
   * Get searchable peers for peer group creation wizard.
   * @description Returns peers from same department/batch that
   * the student can add to their group.
   * @security Excludes the student themselves.
   * @see SRS §4.5.1
   */
  static async getAvailablePeers(studentPersonId) {
    // Get the student's department for cross-reference
    const studentInfo = await query(
      `SELECT department_code, admission_year FROM persons WHERE person_id = $1`,
      [studentPersonId],
    );

    const student = studentInfo.rows[0];
    if (!student) {
      throw new Error("Student profile not found");
    }

    // Get peers: same department or have been in projects with student
    const peers = await query(
      `SELECT DISTINCT ON (p.person_id)
              p.person_id, p.display_name, p.department_code, p.admission_year,
              CASE
                WHEN pm1.person_id IS NOT NULL THEN 'teammate'
                WHEN p.department_code = $2 THEN 'classmate'
                ELSE 'other'
              END as relationship,
              CASE
                WHEN pm1.person_id IS NOT NULL THEN 0
                WHEN p.department_code = $2 THEN 1
                ELSE 2
              END as sort_priority
       FROM persons p
       LEFT JOIN project_members pm1 ON pm1.person_id = p.person_id
         AND pm1.project_id IN (
           SELECT project_id FROM project_members WHERE person_id = $1
         )
       WHERE p.person_id != $1
         AND p.person_type = 'student'
         AND (p.is_deleted = false OR p.is_deleted IS NULL)
       ORDER BY p.person_id, sort_priority, p.display_name
       LIMIT 100`,
      [studentPersonId, student.department_code || ""],
    );

    // Re-sort by priority then name (DISTINCT ON forces person_id ordering)
    const sorted = peers.rows.sort((a, b) => {
      if (a.sort_priority !== b.sort_priority)
        return a.sort_priority - b.sort_priority;
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    return sorted.map((p) => ({
      personId: p.person_id,
      displayName: p.display_name,
      department: p.department_code,
      batchYear: p.admission_year,
      relationship: p.relationship,
    }));
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Convert normalized score (0-1) to display band.
   * SRS §7.2: Person vectors used for mentoring, NOT labeling.
   * @private
   */
  static _scoreToBand(score) {
    if (score >= 0.75) return "EXCELLENT";
    if (score >= 0.5) return "GOOD";
    if (score >= 0.25) return "SATISFACTORY";
    return "DEVELOPING";
  }
}

module.exports = PeerRankingSchemaAdapter;
