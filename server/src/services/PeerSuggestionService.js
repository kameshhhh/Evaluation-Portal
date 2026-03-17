// ============================================================
// PEER SUGGESTION SERVICE — Lightweight Smart Peer Recommendations
// ============================================================
// SRS §4.5.1 — Students define peer groups WITH guidance.
// Instead of showing 100+ students, this service provides ranked
// suggestions based on simple, transparent rules:
//
//   1. Department match   (weight 30) — same dept = higher relevance
//   2. Project overlap    (weight 40) — shared project teammates
//   3. Evaluation recency (weight 20) — haven't evaluated recently
//   4. Skill diversity    (weight 10) — complementary skills
//
// NOT ML-based. All scores are explainable.
// ============================================================

const { query } = require("../config/database");
const logger = require("../utils/logger");
const { getCanonicalDepartment } = require("./personalization/academic/DepartmentRegistry");

// Resolve department_code (e.g. "MZ") to full name (e.g. "Mechatronics Engineering")
function resolveDeptName(code) {
  if (!code) return null;
  const dept = getCanonicalDepartment(code.toLowerCase());
  return dept ? dept.name : code;
}

// Factor weights (out of 100 total)
const FACTOR_WEIGHTS = {
  department: 30,
  project: 40,
  recency: 20,
  skill: 10,
};

class PeerSuggestionService {
  // ==========================================================
  // MAIN API — Get suggestions for a student
  // ==========================================================

  /**
   * Get ranked peer suggestions for a student.
   *
   * @param {string} studentId — person_id of the requesting student
   * @param {Object} [options]
   * @param {number} [options.limit=12] — max suggestions
   * @param {string} [options.department] — filter to specific department
   * @param {string} [options.cohortId] — scope to a cohort's participants
   * @returns {Array} Ranked suggestions with scores and reasons
   */
  static async getSuggestions(studentId, options = {}) {
    const { limit = 12, department, cohortId } = options;

    // First, try to return cached suggestions if fresh (< 6 hours)
    const cached = await this._getCached(studentId, limit);
    if (cached.length > 0) {
      return cached;
    }

    // Compute fresh suggestions
    const suggestions = await this._computeSuggestions(studentId, {
      department,
      cohortId,
    });

    // Sort by total score descending
    suggestions.sort((a, b) => b.totalScore - a.totalScore);

    // Cache the results
    await this._cacheSuggestions(studentId, suggestions);

    return suggestions.slice(0, limit);
  }

  // ==========================================================
  // COMPUTATION — Factor-based scoring
  // ==========================================================

  /**
   * Compute peer suggestions from scratch.
   */
  static async _computeSuggestions(studentId, { department, cohortId } = {}) {
    // Get the student's profile
    const studentResult = await query(
      `SELECT person_id, department_code, admission_year
       FROM persons WHERE person_id = $1`,
      [studentId],
    );
    if (studentResult.rows.length === 0) return [];
    const student = studentResult.rows[0];

    // Get all eligible peers (active students, not self)
    let peerSql = `
      SELECT p.person_id, p.display_name, p.department_code, p.admission_year
      FROM persons p
      WHERE p.person_type = 'student'
        AND p.status = 'active'
        AND p.person_id != $1
    `;
    const peerParams = [studentId];
    let idx = 2;

    if (department) {
      peerSql += ` AND p.department_code = $${idx++}`;
      peerParams.push(department);
    }

    if (cohortId) {
      // Scope to cohort's evaluator pool
      peerSql += ` AND p.person_id IN (
        SELECT evaluator_id FROM cohort_evaluators WHERE cohort_id = $${idx++}
      )`;
      peerParams.push(cohortId);
    }

    const peersResult = await query(peerSql, peerParams);
    const peers = peersResult.rows;

    if (peers.length === 0) return [];

    // Batch-fetch scoring data
    const [projectOverlaps, recentEvaluations, studentSkills] =
      await Promise.all([
        this._getProjectOverlaps(studentId),
        this._getRecentEvaluations(studentId),
        this._getStudentSkills(studentId),
      ]);

    // Score each peer
    const suggestions = [];
    for (const peer of peers) {
      const scores = {};
      const reasons = [];

      // Factor 1: Department match
      if (peer.department_code === student.department_code) {
        scores.department = FACTOR_WEIGHTS.department;
        reasons.push(`Same department (${resolveDeptName(peer.department_code)})`);
      } else {
        scores.department = Math.round(FACTOR_WEIGHTS.department * 0.3);
        reasons.push(`Different department — adds diversity`);
      }

      // Factor 2: Project overlap
      const sharedProjects = projectOverlaps.get(peer.person_id) || 0;
      if (sharedProjects > 0) {
        scores.project = Math.min(
          FACTOR_WEIGHTS.project,
          sharedProjects * Math.round(FACTOR_WEIGHTS.project / 2),
        );
        reasons.push(`${sharedProjects} shared project(s)`);
      } else {
        scores.project = 0;
      }

      // Factor 3: Evaluation recency — favor peers not recently evaluated
      const daysSinceLast = recentEvaluations.get(peer.person_id);
      if (daysSinceLast === undefined) {
        // Never evaluated this peer — strong candidate
        scores.recency = FACTOR_WEIGHTS.recency;
        reasons.push("Never evaluated before");
      } else if (daysSinceLast > 30) {
        scores.recency = Math.round(FACTOR_WEIGHTS.recency * 0.8);
        reasons.push(`Last evaluated ${daysSinceLast} days ago`);
      } else {
        scores.recency = Math.round(
          FACTOR_WEIGHTS.recency * (daysSinceLast / 30) * 0.5,
        );
        reasons.push(`Recently evaluated (${daysSinceLast} days ago)`);
      }

      // Factor 4: Skill diversity
      const peerSkills = await this._getStudentSkills(peer.person_id);
      const complementaryCount = this._countComplementary(
        studentSkills,
        peerSkills,
      );
      if (complementaryCount > 0) {
        scores.skill = Math.min(
          FACTOR_WEIGHTS.skill,
          complementaryCount * Math.round(FACTOR_WEIGHTS.skill / 2),
        );
        reasons.push(`${complementaryCount} complementary skill(s)`);
      } else {
        scores.skill = 0;
      }

      const totalScore =
        scores.department + scores.project + scores.recency + scores.skill;

      suggestions.push({
        suggested_peer_id: peer.person_id,
        peer_name: peer.display_name,
        department: resolveDeptName(peer.department_code),
        admissionYear: peer.admission_year,
        departmentScore: scores.department,
        projectScore: scores.project,
        recencyScore: scores.recency,
        skillScore: scores.skill,
        composite_score: totalScore,
        totalScore,
        reasons,
        factors: scores,
      });
    }

    return suggestions;
  }

  // ==========================================================
  // DATA HELPERS — Fetch scoring inputs
  // ==========================================================

  /**
   * Get project overlap count for each peer.
   * Returns Map<peerId, sharedProjectCount>
   */
  static async _getProjectOverlaps(studentId) {
    const result = await query(
      `SELECT pm2.person_id, COUNT(DISTINCT pm1.project_id) AS shared_count
       FROM project_members pm1
       JOIN project_members pm2 ON pm1.project_id = pm2.project_id
       WHERE pm1.person_id = $1
         AND pm2.person_id != $1
         AND pm2.left_at IS NULL
       GROUP BY pm2.person_id`,
      [studentId],
    );

    const map = new Map();
    for (const row of result.rows) {
      map.set(row.person_id, parseInt(row.shared_count));
    }
    return map;
  }

  /**
   * Get days since last evaluation of each peer.
   * Returns Map<peerId, daysSinceLastEvaluation>
   */
  static async _getRecentEvaluations(studentId) {
    const result = await query(
      `SELECT DISTINCT ON (target_id)
        target_id,
        EXTRACT(DAY FROM NOW() - sa.created_at)::INTEGER AS days_since
       FROM scarcity_allocations sa
       JOIN evaluation_sessions es ON sa.session_id = es.session_id
       WHERE sa.evaluator_id = $1
       ORDER BY target_id, sa.created_at DESC`,
      [studentId],
    );

    const map = new Map();
    for (const row of result.rows) {
      map.set(row.target_id, parseInt(row.days_since));
    }
    return map;
  }

  /**
   * Get a student's skill tags from their project technical_stack.
   * Returns Set of skill tags.
   */
  static async _getStudentSkills(studentId) {
    const result = await query(
      `SELECT DISTINCT unnest(pm.technical_stack) AS skill
       FROM project_members pm
       WHERE pm.person_id = $1
         AND pm.technical_stack IS NOT NULL
         AND pm.left_at IS NULL`,
      [studentId],
    );

    return new Set(result.rows.map((r) => r.skill.toLowerCase()));
  }

  /**
   * Count complementary skills (in peer but not in student).
   */
  static _countComplementary(studentSkills, peerSkills) {
    let count = 0;
    for (const skill of peerSkills) {
      if (!studentSkills.has(skill)) count++;
    }
    return count;
  }

  // ==========================================================
  // CACHE MANAGEMENT
  // ==========================================================

  /**
   * Get cached suggestions (< 6 hours old).
   */
  static async _getCached(studentId, limit) {
    const result = await query(
      `SELECT psc.*, p.display_name, p.department_code
       FROM peer_suggestion_cache psc
       LEFT JOIN persons p ON p.person_id = psc.suggested_peer_id
       WHERE psc.student_id = $1
         AND psc.cached_at > NOW() - INTERVAL '6 hours'
       ORDER BY psc.total_score DESC
       LIMIT $2`,
      [studentId, limit],
    );

    return result.rows.map((r) => ({
      suggested_peer_id: r.suggested_peer_id,
      peer_name: r.display_name || null,
      department: resolveDeptName(r.department_code),
      departmentScore: r.department_score,
      projectScore: r.project_score,
      recencyScore: r.recency_score,
      skillScore: r.skill_score,
      composite_score: r.total_score,
      totalScore: r.total_score,
      reasons: r.reasons || [],
      factors: {
        department: r.department_score,
        project: r.project_score,
        recency: r.recency_score,
        skill: r.skill_score,
      },
    }));
  }

  /**
   * Cache computed suggestions.
   */
  static async _cacheSuggestions(studentId, suggestions) {
    // Clear old cache
    await query(`DELETE FROM peer_suggestion_cache WHERE student_id = $1`, [
      studentId,
    ]);

    // Insert new (limit to top 30)
    for (const s of suggestions.slice(0, 30)) {
      await query(
        `INSERT INTO peer_suggestion_cache (
          student_id, suggested_peer_id,
          department_score, project_score, recency_score, skill_score,
          total_score, reasons
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (student_id, suggested_peer_id) DO UPDATE SET
          department_score = EXCLUDED.department_score,
          project_score = EXCLUDED.project_score,
          recency_score = EXCLUDED.recency_score,
          skill_score = EXCLUDED.skill_score,
          total_score = EXCLUDED.total_score,
          reasons = EXCLUDED.reasons,
          cached_at = NOW()`,
        [
          studentId,
          s.suggested_peer_id,
          s.departmentScore,
          s.projectScore,
          s.recencyScore,
          s.skillScore,
          s.totalScore,
          JSON.stringify(s.reasons),
        ],
      );
    }
  }

  /**
   * Refresh suggestions for all active students (batch job).
   * Can be called periodically (e.g., nightly cron).
   */
  static async refreshAllSuggestions() {
    const students = await query(
      `SELECT person_id FROM persons
       WHERE person_type = 'student' AND status = 'active'`,
    );

    let count = 0;
    for (const student of students.rows) {
      try {
        const suggestions = await this._computeSuggestions(
          student.person_id,
          {},
        );
        suggestions.sort((a, b) => b.totalScore - a.totalScore);
        await this._cacheSuggestions(student.person_id, suggestions);
        count++;
      } catch (err) {
        logger.error(
          `Failed to refresh suggestions for ${student.person_id}: ${err.message}`,
        );
      }
    }

    logger.info(`Refreshed peer suggestions for ${count} students`);
    return { refreshed: count, total: students.rows.length };
  }
}

module.exports = PeerSuggestionService;
