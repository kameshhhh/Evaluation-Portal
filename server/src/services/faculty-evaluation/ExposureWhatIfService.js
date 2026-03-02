// ============================================================
// EXPOSURE WHAT-IF SCENARIO SERVICE
// ============================================================
// SRS §4.4.3 — Transparency: Faculty can simulate different
// weight configurations and see real-time impact on their score.
//
// Uses raw SQL via pg Pool (project convention).
// ============================================================

const { query } = require("../../config/database");
const logger = require("../../utils/logger");
const FacultyNormalizationService = require("./FacultyNormalizationService");

class ExposureWhatIfService {
  // ============================================================
  // SIMULATE CUSTOM WEIGHTS — real-time what-if
  // ============================================================

  /**
   * @param {string} facultyId
   * @param {string} sessionId
   * @param {Object} customWeights - { sessions_weight, hours_weight, role_weight }
   * @returns {Object} Simulated score with comparison
   */
  static async simulateCustomWeights(facultyId, sessionId, customWeights) {
    // 1. Get faculty assignment + existing normalized score
    const facResult = await query(
      `SELECT fea.sessions_conducted, fea.contact_hours, fea.role_type,
              fea.department, fea.enrolled_students,
              fns.raw_average_score, fns.normalized_score AS current_score,
              fns.response_rate, fns.student_count
       FROM faculty_evaluation_assignments fea
       LEFT JOIN faculty_normalized_scores fns
         ON fea.faculty_id = fns.faculty_id AND fea.session_id = fns.session_id
       WHERE fea.faculty_id = $1 AND fea.session_id = $2`,
      [facultyId, sessionId],
    );

    if (facResult.rows.length === 0) {
      throw new Error("Faculty data not found for this session");
    }

    const fac = facResult.rows[0];
    const rawScore = parseFloat(fac.raw_average_score) || 0;
    const currentScore = parseFloat(fac.current_score) || 0;

    // 2. Get current active weight config for comparison
    const currentWeights = await FacultyNormalizationService.getActiveWeights();

    // 3. Get session-wide maximums
    const maxResult = await query(
      `SELECT COALESCE(MAX(sessions_conducted), 1) AS max_sessions,
              COALESCE(MAX(contact_hours), 1) AS max_hours
       FROM faculty_evaluation_assignments
       WHERE session_id = $1 AND is_active = true`,
      [sessionId],
    );
    const maxEx = maxResult.rows[0];

    // 4. Build role-weight mapping from current config (only change dimension weights)
    const roleWeights = {
      lecture: currentWeights ? parseFloat(currentWeights.lecture_weight) : 1.0,
      lab: currentWeights ? parseFloat(currentWeights.lab_weight) : 0.8,
      tutorial: currentWeights
        ? parseFloat(currentWeights.tutorial_weight)
        : 0.7,
      seminar: currentWeights ? parseFloat(currentWeights.seminar_weight) : 0.9,
    };

    const sessions = parseInt(fac.sessions_conducted, 10) || 0;
    const hours = parseFloat(fac.contact_hours) || 0;
    const role = fac.role_type || "lecture";

    const maxSessions = parseFloat(maxEx.max_sessions) || 1;
    const maxHours = parseFloat(maxEx.max_hours) || 1;

    // 5. Check if config has log scaling
    const useLog = currentWeights && currentWeights.use_log_scaling !== false;
    const minFactor = currentWeights
      ? parseFloat(currentWeights.minimum_exposure_factor) || 0.3
      : 0.3;

    // Compute ratios
    const sessionRatio = useLog
      ? Math.log10(1 + sessions) / Math.log10(1 + maxSessions)
      : maxSessions > 0
        ? sessions / maxSessions
        : 0.5;
    const hoursRatio = useLog
      ? Math.log10(1 + hours) / Math.log10(1 + maxHours)
      : maxHours > 0
        ? hours / maxHours
        : 0.5;
    const roleMultiplier = roleWeights[role] ?? 1.0;

    // 6. Weighted exposure factor using CUSTOM weights
    const sw = parseFloat(customWeights.sessions_weight);
    const hw = parseFloat(customWeights.hours_weight);
    const rw = parseFloat(customWeights.role_weight);
    const total = sw + hw + rw;

    let exposureFactor =
      total > 0
        ? (sessionRatio * sw + hoursRatio * hw + roleMultiplier * rw) / total
        : 0.5;
    exposureFactor = Math.max(exposureFactor, minFactor);
    exposureFactor = Math.min(exposureFactor, 1.2);

    // 7. Response rate adjustment (optional)
    let responseAdj = 1.0;
    const enableResp =
      currentWeights && currentWeights.enable_response_adjustment !== false;
    if (enableResp && fac.response_rate && fac.response_rate > 0) {
      const rr = parseFloat(fac.response_rate) / 100; // stored as percentage
      const exp = currentWeights
        ? parseFloat(currentWeights.response_adjustment_exponent) || 0.5
        : 0.5;
      responseAdj = rr > 0 ? Math.pow(Math.min(rr, 1), exp) : 0.5;
    }

    // 8. Simulated final score
    const simulatedScore =
      Math.round(rawScore * exposureFactor * responseAdj * 100) / 100;
    const difference = Math.round((simulatedScore - currentScore) * 100) / 100;
    const percentChange =
      currentScore > 0
        ? Math.round((difference / currentScore) * 1000) / 10
        : 0;

    return {
      faculty_id: facultyId,
      session_id: sessionId,
      raw_score: rawScore,
      current_score: currentScore,
      current_weights: {
        sessions: currentWeights
          ? parseFloat(currentWeights.sessions_weight)
          : 0.3,
        hours: currentWeights ? parseFloat(currentWeights.hours_weight) : 0.5,
        role: currentWeights ? parseFloat(currentWeights.role_weight) : 0.2,
      },
      simulated_score: simulatedScore,
      simulated_weights: { sessions: sw, hours: hw, role: rw },
      simulated_exposure_factor: Math.round(exposureFactor * 10000) / 10000,
      response_adjustment: Math.round(responseAdj * 10000) / 10000,
      difference,
      percent_change: percentChange,
      is_improvement: difference > 0,
      exposure_data: {
        sessions: sessions,
        max_sessions: maxSessions,
        session_ratio: Math.round(sessionRatio * 10000) / 10000,
        hours: hours,
        max_hours: maxHours,
        hours_ratio: Math.round(hoursRatio * 10000) / 10000,
        role: role,
        role_multiplier: roleMultiplier,
      },
    };
  }

  // ============================================================
  // SAVE WHAT-IF SCENARIO
  // ============================================================

  static async saveScenario(
    facultyId,
    sessionId,
    scenarioName,
    customWeights,
    userId,
  ) {
    const simulation = await this.simulateCustomWeights(
      facultyId,
      sessionId,
      customWeights,
    );

    const result = await query(
      `INSERT INTO normalization_whatif_scenarios
         (faculty_id, session_id, scenario_name,
          alt_sessions_weight, alt_hours_weight, alt_role_weight,
          original_score, alternative_score, score_difference,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        facultyId,
        sessionId,
        scenarioName,
        customWeights.sessions_weight,
        customWeights.hours_weight,
        customWeights.role_weight,
        simulation.current_score,
        simulation.simulated_score,
        simulation.difference,
        userId,
      ],
    );

    return result.rows[0];
  }

  // ============================================================
  // GET SAVED SCENARIOS
  // ============================================================

  static async getFacultyScenarios(facultyId, sessionId = null) {
    const whereClause = sessionId
      ? "WHERE faculty_id = $1 AND session_id = $2"
      : "WHERE faculty_id = $1";
    const params = sessionId ? [facultyId, sessionId] : [facultyId];

    const result = await query(
      `SELECT * FROM normalization_whatif_scenarios
       ${whereClause}
       ORDER BY created_at DESC`,
      params,
    );

    return result.rows;
  }

  // ============================================================
  // DELETE SCENARIO
  // ============================================================

  static async deleteScenario(scenarioId, facultyId) {
    const result = await query(
      `DELETE FROM normalization_whatif_scenarios
       WHERE id = $1 AND faculty_id = $2
       RETURNING id`,
      [scenarioId, facultyId],
    );
    return result.rows.length > 0;
  }
}

module.exports = ExposureWhatIfService;
