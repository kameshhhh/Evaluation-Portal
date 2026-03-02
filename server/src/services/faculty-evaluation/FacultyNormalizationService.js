// ============================================================
// FACULTY NORMALIZATION SERVICE
// ============================================================
// SRS §4.4.3: Exposure Normalization
//
// PURPOSE: Normalize faculty scores based on:
//   1. Number of sessions conducted
//   2. Total contact hours
//   3. Role type (lecture/lab/tutorial/seminar)
//
// MATHEMATICAL MODEL:
//   Exposure Factor = (
//       (sessions / max_sessions) × sessions_weight +
//       (hours   / max_hours)     × hours_weight    +
//       role_type_weight           × role_weight
//   ) / (sessions_weight + hours_weight + role_weight)
//
//   Normalized Score = Raw Average × max(Exposure Factor, 0.3)
//
// Uses raw SQL via pg Pool (project convention).
// ============================================================

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

class FacultyNormalizationService {
  // ============================================================
  // GET ACTIVE NORMALIZATION WEIGHTS
  // ============================================================

  /**
   * @returns {Promise<Object>} Active weight configuration
   */
  static async getActiveWeights() {
    const result = await query(
      `SELECT id, name,
              sessions_weight, hours_weight, role_weight,
              lecture_weight, lab_weight, tutorial_weight, seminar_weight,
              is_active, created_at
       FROM faculty_normalization_weights
       WHERE is_active = true
       LIMIT 1`,
    );
    return result.rows[0] || null;
  }

  // ============================================================
  // CALCULATE NORMALIZED SCORE — single faculty
  // ============================================================

  /**
   * Compute a normalized score for one faculty member in a session.
   *
   * @param {string} sessionId
   * @param {string} facultyId
   * @param {number} rawAverage - Raw average score from all student allocations
   * @param {Object} exposureData
   * @param {number} exposureData.sessionsConducted
   * @param {number} exposureData.contactHours
   * @param {string} exposureData.roleType - 'lecture' | 'lab' | 'tutorial' | 'seminar'
   * @param {number} exposureData.studentCount
   * @param {number} exposureData.responseRate
   * @param {string} [exposureData.department]
   * @returns {Promise<Object>} Row data suitable for upsert into faculty_normalized_scores
   */
  static async calculateNormalizedScore(
    sessionId,
    facultyId,
    rawAverage,
    exposureData,
  ) {
    // 1. Fetch active weights
    const weights = await this.getActiveWeights();
    if (!weights) {
      logger.warn(
        "FacultyNormalization: No active weight config — using defaults",
      );
    }

    const sw = weights ? parseFloat(weights.sessions_weight) : 0.3;
    const hw = weights ? parseFloat(weights.hours_weight) : 0.5;
    const rw = weights ? parseFloat(weights.role_weight) : 0.2;

    // Role-type weight mapping
    const roleWeights = {
      lecture: weights ? parseFloat(weights.lecture_weight) : 1.0,
      lab: weights ? parseFloat(weights.lab_weight) : 0.8,
      tutorial: weights ? parseFloat(weights.tutorial_weight) : 0.7,
      seminar: weights ? parseFloat(weights.seminar_weight) : 0.9,
    };

    // 2. Session-wide maximums for normalization
    const maxExposure = await this._getSessionMaxExposure(sessionId);

    // 3. Compute individual factors — use log scaling if enabled
    const useLog = weights && weights.use_log_scaling !== false;
    const minFactor = weights
      ? parseFloat(weights.minimum_exposure_factor) || 0.3
      : 0.3;

    const sessionsFactor = useLog
      ? this._logRatio(exposureData.sessionsConducted, maxExposure.maxSessions)
      : maxExposure.maxSessions > 0
        ? exposureData.sessionsConducted / maxExposure.maxSessions
        : 0.5;

    const hoursFactor = useLog
      ? this._logRatio(exposureData.contactHours, maxExposure.maxHours)
      : maxExposure.maxHours > 0
        ? exposureData.contactHours / maxExposure.maxHours
        : 0.5;

    const roleWeightValue = roleWeights[exposureData.roleType] ?? 1.0;

    // 4. Weighted exposure factor
    const totalWeight = sw + hw + rw;
    let exposureFactor =
      (sessionsFactor * sw + hoursFactor * hw + roleWeightValue * rw) /
      totalWeight;
    exposureFactor = Math.max(exposureFactor, minFactor);
    exposureFactor = Math.min(exposureFactor, 1.2);

    // 5. Response rate adjustment (optional)
    let responseAdj = 1.0;
    const enableResp = weights && weights.enable_response_adjustment !== false;
    if (
      enableResp &&
      exposureData.responseRate &&
      exposureData.responseRate > 0
    ) {
      const rr = exposureData.responseRate / 100; // stored as percentage
      const exp = weights
        ? parseFloat(weights.response_adjustment_exponent) || 0.5
        : 0.5;
      responseAdj = rr > 0 ? Math.pow(Math.min(rr, 1), exp) : 0.5;
    }

    // 6. Final normalized score
    const normalizedScore = rawAverage * exposureFactor * responseAdj;

    return {
      session_id: sessionId,
      faculty_id: facultyId,
      raw_total_points: parseFloat(
        (rawAverage * exposureData.studentCount).toFixed(2),
      ),
      raw_average_score: parseFloat(rawAverage.toFixed(2)),
      student_count: exposureData.studentCount,
      response_rate: exposureData.responseRate ?? null,
      normalized_score: parseFloat(normalizedScore.toFixed(2)),
      exposure_factor: parseFloat(exposureFactor.toFixed(4)),
      role_weight: roleWeightValue,
      department_percentile: null, // calculated separately
    };
  }

  // ============================================================
  // RECALCULATE ALL SCORES FOR A SESSION
  // ============================================================

  /**
   * Re-derive normalized scores for every faculty in the session.
   * Called after each student submission or when weights change.
   *
   * @param {string} sessionId
   * @returns {Promise<Array>} Upserted score rows
   */
  static async recalculateSession(sessionId) {
    // 1. All faculty assigned to this session
    const assignResult = await query(
      `SELECT faculty_id, sessions_conducted, contact_hours, role_type, department
       FROM faculty_evaluation_assignments
       WHERE session_id = $1 AND is_active = true`,
      [sessionId],
    );

    // If no assignments table data, fallback to distinct faculty in allocations
    let assignments = assignResult.rows;
    if (assignments.length === 0) {
      const fallback = await query(
        `SELECT DISTINCT faculty_person_id AS faculty_id
         FROM faculty_evaluation_allocations
         WHERE session_id = $1`,
        [sessionId],
      );
      assignments = fallback.rows.map((r) => ({
        faculty_id: r.faculty_id,
        sessions_conducted: 0,
        contact_hours: 0,
        role_type: "lecture",
        department: null,
      }));
    }

    // 2. All submitted allocations grouped by faculty
    const allocResult = await query(
      `SELECT faculty_person_id AS faculty_id,
              SUM(points)     AS total_points,
              AVG(points)     AS avg_points,
              COUNT(DISTINCT student_person_id) AS student_count
       FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND is_draft = false
       GROUP BY faculty_person_id`,
      [sessionId],
    );

    const scoreMap = {};
    for (const row of allocResult.rows) {
      scoreMap[row.faculty_id] = {
        totalPoints: parseFloat(row.total_points),
        avgPoints: parseFloat(row.avg_points),
        studentCount: parseInt(row.student_count, 10),
      };
    }

    // 3. Total unique students who submitted
    const totalSubResult = await query(
      `SELECT COUNT(DISTINCT student_person_id) AS cnt
       FROM faculty_evaluation_allocations
       WHERE session_id = $1 AND is_draft = false`,
      [sessionId],
    );
    const totalSubmissions = parseInt(totalSubResult.rows[0]?.cnt || 0, 10);

    // 4. Calculate normalized scores for each faculty
    const results = [];
    for (const asn of assignments) {
      const sd = scoreMap[asn.faculty_id] || {
        totalPoints: 0,
        avgPoints: 0,
        studentCount: 0,
      };

      const responseRate =
        totalSubmissions > 0
          ? parseFloat(((sd.studentCount / totalSubmissions) * 100).toFixed(2))
          : 0;

      const normalized = await this.calculateNormalizedScore(
        sessionId,
        asn.faculty_id,
        sd.avgPoints,
        {
          sessionsConducted: parseInt(asn.sessions_conducted, 10) || 0,
          contactHours: parseFloat(asn.contact_hours) || 0,
          roleType: asn.role_type || "lecture",
          studentCount: sd.studentCount,
          responseRate,
          department: asn.department,
        },
      );

      results.push(normalized);
    }

    // 5. Upsert into faculty_normalized_scores
    for (const row of results) {
      await query(
        `INSERT INTO faculty_normalized_scores
           (session_id, faculty_id, raw_total_points, raw_average_score,
            student_count, response_rate, normalized_score, exposure_factor,
            role_weight, calculated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())
         ON CONFLICT (session_id, faculty_id) DO UPDATE SET
           raw_total_points  = EXCLUDED.raw_total_points,
           raw_average_score = EXCLUDED.raw_average_score,
           student_count     = EXCLUDED.student_count,
           response_rate     = EXCLUDED.response_rate,
           normalized_score  = EXCLUDED.normalized_score,
           exposure_factor   = EXCLUDED.exposure_factor,
           role_weight       = EXCLUDED.role_weight,
           calculated_at     = NOW()`,
        [
          row.session_id,
          row.faculty_id,
          row.raw_total_points,
          row.raw_average_score,
          row.student_count,
          row.response_rate,
          row.normalized_score,
          row.exposure_factor,
          row.role_weight,
        ],
      );
    }

    // 6. Compute department percentiles
    await this._updateDepartmentPercentiles(sessionId);

    return results;
  }

  // ============================================================
  // UPDATE NORMALIZATION WEIGHTS (admin action)
  // ============================================================

  /**
   * Deactivate old weights, insert new ones, trigger recalculation.
   *
   * @param {Object} weightConfig
   * @param {string} adminId - For audit
   * @returns {Promise<Object>} New weight row
   */
  static async updateWeights(weightConfig) {
    // Validate sum
    const sum =
      parseFloat(weightConfig.sessions_weight) +
      parseFloat(weightConfig.hours_weight) +
      parseFloat(weightConfig.role_weight);
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(
        `Normalization weights must sum to 1.0 (got ${sum.toFixed(2)})`,
      );
    }

    // Deactivate current
    await query(
      `UPDATE faculty_normalization_weights SET is_active = false WHERE is_active = true`,
    );

    // Insert new
    const result = await query(
      `INSERT INTO faculty_normalization_weights
         (name, sessions_weight, hours_weight, role_weight,
          lecture_weight, lab_weight, tutorial_weight, seminar_weight, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, true)
       RETURNING *`,
      [
        weightConfig.name || "Custom",
        weightConfig.sessions_weight,
        weightConfig.hours_weight,
        weightConfig.role_weight,
        weightConfig.lecture_weight ?? 1.0,
        weightConfig.lab_weight ?? 0.8,
        weightConfig.tutorial_weight ?? 0.7,
        weightConfig.seminar_weight ?? 0.9,
      ],
    );

    // Async recalc all active sessions
    setImmediate(() =>
      this._recalculateAllActiveSessions().catch(logger.error),
    );

    return result.rows[0];
  }

  // ============================================================
  // GET NORMALIZATION EXPLANATION (transparency for faculty)
  // ============================================================

  /**
   * @param {string} sessionId
   * @param {string} facultyId
   * @returns {Promise<Object|null>}
   */
  static async getNormalizationExplanation(sessionId, facultyId) {
    const scoreResult = await query(
      `SELECT * FROM faculty_normalized_scores
       WHERE session_id = $1 AND faculty_id = $2`,
      [sessionId, facultyId],
    );

    const assignResult = await query(
      `SELECT * FROM faculty_evaluation_assignments
       WHERE session_id = $1 AND faculty_id = $2`,
      [sessionId, facultyId],
    );

    const weights = await this.getActiveWeights();

    const score = scoreResult.rows[0];
    const assignment = assignResult.rows[0];
    if (!score) return null;

    return {
      raw_score: parseFloat(score.raw_average_score),
      normalized_score: parseFloat(score.normalized_score),
      exposure_factor: parseFloat(score.exposure_factor),
      student_count: score.student_count,
      response_rate: score.response_rate
        ? parseFloat(score.response_rate)
        : null,
      department_percentile: score.department_percentile,
      calculation_steps: [
        {
          step: "Raw Score",
          description: `Average of ${score.student_count} student evaluations`,
          value: parseFloat(score.raw_average_score),
        },
        {
          step: "Sessions Factor",
          description: assignment
            ? `${assignment.sessions_conducted} sessions conducted`
            : "No assignment data",
          weight: weights ? parseFloat(weights.sessions_weight) : 0.3,
        },
        {
          step: "Contact Hours Factor",
          description: assignment
            ? `${assignment.contact_hours} contact hours`
            : "No assignment data",
          weight: weights ? parseFloat(weights.hours_weight) : 0.5,
        },
        {
          step: "Role Weight",
          description: assignment ? `${assignment.role_type} role` : "Unknown",
          factor: parseFloat(score.role_weight),
          weight: weights ? parseFloat(weights.role_weight) : 0.2,
        },
        {
          step: "Final Calculation",
          description: "Raw Score × max(Exposure Factor, 0.3)",
          value: parseFloat(score.normalized_score),
          formula: `${score.raw_average_score} × ${score.exposure_factor} = ${score.normalized_score}`,
        },
      ],
      percentile_rank: score.department_percentile
        ? `Top ${score.department_percentile}% in department`
        : "Not available",
    };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /** Session-wide max exposure values for normalization */
  static async _getSessionMaxExposure(sessionId) {
    const result = await query(
      `SELECT
         COALESCE(MAX(sessions_conducted), 1) AS max_sessions,
         COALESCE(MAX(contact_hours), 1)      AS max_hours
       FROM faculty_evaluation_assignments
       WHERE session_id = $1 AND is_active = true`,
      [sessionId],
    );
    const row = result.rows[0];
    return {
      maxSessions: parseFloat(row?.max_sessions) || 1,
      maxHours: parseFloat(row?.max_hours) || 1,
    };
  }

  /** Update percentile ranking within each department */
  static async _updateDepartmentPercentiles(sessionId) {
    try {
      await query(
        `UPDATE faculty_normalized_scores fns
         SET department_percentile = sub.pctl
         FROM (
           SELECT
             fns2.faculty_id,
             NTILE(100) OVER (
               PARTITION BY fea.department
               ORDER BY fns2.normalized_score DESC
             ) AS pctl
           FROM faculty_normalized_scores fns2
           JOIN faculty_evaluation_assignments fea
             ON fns2.faculty_id  = fea.faculty_id
            AND fns2.session_id = fea.session_id
           WHERE fns2.session_id = $1
             AND fea.department IS NOT NULL
         ) sub
         WHERE fns.session_id = $1
           AND fns.faculty_id = sub.faculty_id`,
        [sessionId],
      );
    } catch (err) {
      logger.warn("FacultyNormalization: percentile update failed", {
        error: err.message,
      });
    }
  }

  /** Recalculate all active sessions (after weight change) */
  static async _recalculateAllActiveSessions() {
    const result = await query(
      `SELECT id FROM faculty_evaluation_sessions WHERE status = 'active'`,
    );
    for (const row of result.rows) {
      await this.recalculateSession(row.id);
    }
  }

  // ============================================================
  // LOG-SCALED RATIO — prevents outlier domination
  // ============================================================

  static _logRatio(value, maxVal) {
    if (maxVal <= 0) return 0.5;
    const ratio = Math.log10(1 + value) / Math.log10(1 + maxVal);
    return Math.min(Math.max(ratio, 0), 1);
  }

  // ============================================================
  // AUDIT LOGGING — record every normalization calculation
  // ============================================================

  static async saveAuditEntry(params) {
    try {
      await query(
        `INSERT INTO normalization_audit_log
           (session_id, faculty_id, weight_config_id,
            raw_score, sessions_conducted, contact_hours, role_type, response_rate,
            session_ratio, hours_ratio, role_multiplier,
            exposure_factor, response_adjustment, normalized_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          params.sessionId,
          params.facultyId,
          params.weightConfigId || null,
          params.rawScore,
          params.sessionsConducted,
          params.contactHours,
          params.roleType,
          params.responseRate || 0,
          params.sessionRatio,
          params.hoursRatio,
          params.roleMultiplier,
          params.exposureFactor,
          params.responseAdj || 1.0,
          params.normalizedScore,
        ],
      );
    } catch (err) {
      logger.warn("Audit log insert failed (non-critical)", {
        error: err.message,
      });
    }
  }

  // ============================================================
  // GET AUDIT HISTORY — for transparency
  // ============================================================

  static async getAuditHistory(facultyId, sessionId = null, limit = 20) {
    const where = sessionId
      ? "WHERE al.faculty_id = $1 AND al.session_id = $2"
      : "WHERE al.faculty_id = $1";
    const params = sessionId
      ? [facultyId, sessionId, limit]
      : [facultyId, limit];
    const limitParam = sessionId ? "$3" : "$2";

    const result = await query(
      `SELECT al.*,
              fnw.name AS weight_config_name,
              fnw.version AS weight_config_version
       FROM normalization_audit_log al
       LEFT JOIN faculty_normalization_weights fnw ON al.weight_config_id = fnw.id
       ${where}
       ORDER BY al.calculated_at DESC
       LIMIT ${limitParam}`,
      params,
    );
    return result.rows;
  }

  // ============================================================
  // WEIGHT HISTORY — all weight configurations
  // ============================================================

  static async getWeightHistory() {
    const result = await query(
      `SELECT * FROM faculty_normalization_weights
       ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  // ============================================================
  // DEPARTMENT BENCHMARKS — calculate & cache benchmarks
  // ============================================================

  static async calculateDeptBenchmarks(sessionId) {
    // Get per-department stats
    const deptResult = await query(
      `SELECT
         fea.department,
         COUNT(DISTINCT fea.faculty_id) AS faculty_count,
         AVG(fea.sessions_conducted) AS avg_sessions,
         AVG(fea.contact_hours) AS avg_hours,
         MAX(fea.sessions_conducted) AS max_sessions,
         MAX(fea.contact_hours) AS max_hours,
         AVG(fns.raw_average_score) AS avg_raw_score,
         AVG(fns.normalized_score) AS avg_normalized_score,
         STDDEV(fns.normalized_score) AS std_deviation
       FROM faculty_evaluation_assignments fea
       LEFT JOIN faculty_normalized_scores fns
         ON fea.faculty_id = fns.faculty_id AND fea.session_id = fns.session_id
       WHERE fea.session_id = $1 AND fea.is_active = true
         AND fea.department IS NOT NULL
       GROUP BY fea.department`,
      [sessionId],
    );

    // Upsert benchmarks
    for (const dept of deptResult.rows) {
      await query(
        `INSERT INTO department_normalization_benchmarks
           (session_id, department, faculty_count,
            avg_sessions_per_faculty, avg_hours_per_faculty,
            max_sessions, max_hours,
            dept_avg_raw_score, dept_avg_normalized_score,
            dept_std_deviation, calculated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
         ON CONFLICT (session_id, department) DO UPDATE SET
           faculty_count = EXCLUDED.faculty_count,
           avg_sessions_per_faculty = EXCLUDED.avg_sessions_per_faculty,
           avg_hours_per_faculty = EXCLUDED.avg_hours_per_faculty,
           max_sessions = EXCLUDED.max_sessions,
           max_hours = EXCLUDED.max_hours,
           dept_avg_raw_score = EXCLUDED.dept_avg_raw_score,
           dept_avg_normalized_score = EXCLUDED.dept_avg_normalized_score,
           dept_std_deviation = EXCLUDED.dept_std_deviation,
           calculated_at = NOW()`,
        [
          sessionId,
          dept.department,
          parseInt(dept.faculty_count) || 0,
          parseFloat(dept.avg_sessions) || 0,
          parseFloat(dept.avg_hours) || 0,
          parseInt(dept.max_sessions) || 0,
          parseFloat(dept.max_hours) || 0,
          parseFloat(dept.avg_raw_score) || null,
          parseFloat(dept.avg_normalized_score) || null,
          parseFloat(dept.std_deviation) || null,
        ],
      );
    }

    return deptResult.rows;
  }

  static async getDeptBenchmarks(sessionId) {
    const result = await query(
      `SELECT * FROM department_normalization_benchmarks
       WHERE session_id = $1
       ORDER BY department ASC`,
      [sessionId],
    );
    return result.rows;
  }

  // ============================================================
  // ENHANCED TRANSPARENCY REPORT — full step-by-step for faculty
  // ============================================================

  static async getEnhancedTransparencyReport(sessionId, facultyId) {
    const scoreResult = await query(
      `SELECT fns.*, fea.sessions_conducted, fea.contact_hours,
              fea.role_type, fea.department, fea.enrolled_students,
              p.display_name AS faculty_name
       FROM faculty_normalized_scores fns
       JOIN faculty_evaluation_assignments fea
         ON fns.faculty_id = fea.faculty_id AND fns.session_id = fea.session_id
       LEFT JOIN persons p ON fns.faculty_id = p.person_id
       WHERE fns.session_id = $1 AND fns.faculty_id = $2`,
      [sessionId, facultyId],
    );

    const score = scoreResult.rows[0];
    if (!score) return null;

    const weights = await this.getActiveWeights();
    const maxExposure = await this._getSessionMaxExposure(sessionId);

    // Compute ratios (match the actual algorithm)
    const useLog = weights && weights.use_log_scaling !== false;
    const sessions = parseInt(score.sessions_conducted, 10) || 0;
    const hours = parseFloat(score.contact_hours) || 0;

    const sessionRatio = useLog
      ? this._logRatio(sessions, maxExposure.maxSessions)
      : maxExposure.maxSessions > 0
        ? sessions / maxExposure.maxSessions
        : 0.5;
    const hoursRatio = useLog
      ? this._logRatio(hours, maxExposure.maxHours)
      : maxExposure.maxHours > 0
        ? hours / maxExposure.maxHours
        : 0.5;

    const roleWeights_ = {
      lecture: weights ? parseFloat(weights.lecture_weight) : 1.0,
      lab: weights ? parseFloat(weights.lab_weight) : 0.8,
      tutorial: weights ? parseFloat(weights.tutorial_weight) : 0.7,
      seminar: weights ? parseFloat(weights.seminar_weight) : 0.9,
    };
    const roleMultiplier = roleWeights_[score.role_type] ?? 1.0;

    const sw = weights ? parseFloat(weights.sessions_weight) : 0.3;
    const hw = weights ? parseFloat(weights.hours_weight) : 0.5;
    const rw = weights ? parseFloat(weights.role_weight) : 0.2;
    const minFactor = weights
      ? parseFloat(weights.minimum_exposure_factor) || 0.3
      : 0.3;

    let exposureFactor =
      (sessionRatio * sw + hoursRatio * hw + roleMultiplier * rw) /
      (sw + hw + rw);
    exposureFactor = Math.max(exposureFactor, minFactor);
    exposureFactor = Math.min(exposureFactor, 1.2);

    // Response rate adjustment
    let responseAdj = 1.0;
    const rr = score.response_rate ? parseFloat(score.response_rate) / 100 : 0;
    if (weights && weights.enable_response_adjustment !== false && rr > 0) {
      const exp = parseFloat(weights.response_adjustment_exponent) || 0.5;
      responseAdj = Math.pow(Math.min(rr, 1), exp);
    }

    const rawAvg = parseFloat(score.raw_average_score);
    const normScore = parseFloat(score.normalized_score);

    // Get dept benchmarks
    const deptBench = await query(
      `SELECT * FROM department_normalization_benchmarks
       WHERE session_id = $1 AND department = $2`,
      [sessionId, score.department],
    );
    const bench = deptBench.rows[0] || null;

    return {
      faculty_name: score.faculty_name || "Unknown",
      department: score.department,
      raw_score: Math.round(rawAvg * 100) / 100,
      normalized_score: Math.round(normScore * 100) / 100,
      student_count: parseInt(score.student_count),
      response_rate: score.response_rate
        ? parseFloat(score.response_rate)
        : null,
      department_percentile: score.department_percentile,
      exposure: {
        sessions: {
          your_value: sessions,
          dept_max: maxExposure.maxSessions,
          ratio: Math.round(sessionRatio * 1000) / 1000,
          weight: sw,
          contribution: Math.round(sessionRatio * sw * 1000) / 1000,
        },
        hours: {
          your_value: hours,
          dept_max: maxExposure.maxHours,
          ratio: Math.round(hoursRatio * 1000) / 1000,
          weight: hw,
          contribution: Math.round(hoursRatio * hw * 1000) / 1000,
        },
        role: {
          type: score.role_type,
          multiplier: roleMultiplier,
          weight: rw,
          contribution: Math.round(roleMultiplier * rw * 1000) / 1000,
        },
      },
      exposure_factor: Math.round(exposureFactor * 1000) / 1000,
      response_adjustment: Math.round(responseAdj * 1000) / 1000,
      calculation_steps: [
        {
          step: 1,
          label: "Raw Average Score",
          description: `Average of ${score.student_count} student evaluations`,
          formula: `${rawAvg.toFixed(2)}`,
          result: Math.round(rawAvg * 100) / 100,
        },
        {
          step: 2,
          label: "Session Exposure Ratio",
          description: useLog
            ? `log₁₀(1 + ${sessions}) / log₁₀(1 + ${maxExposure.maxSessions})`
            : `${sessions} / ${maxExposure.maxSessions}`,
          formula: `${sessions} sessions → ratio = ${sessionRatio.toFixed(3)}`,
          result: Math.round(sessionRatio * 1000) / 1000,
        },
        {
          step: 3,
          label: "Contact Hours Ratio",
          description: useLog
            ? `log₁₀(1 + ${hours}) / log₁₀(1 + ${maxExposure.maxHours})`
            : `${hours} / ${maxExposure.maxHours}`,
          formula: `${hours} hours → ratio = ${hoursRatio.toFixed(3)}`,
          result: Math.round(hoursRatio * 1000) / 1000,
        },
        {
          step: 4,
          label: `Role Multiplier (${score.role_type})`,
          description: `${score.role_type} role → multiplier = ${roleMultiplier}`,
          formula: `${score.role_type} = ${roleMultiplier}`,
          result: roleMultiplier,
        },
        {
          step: 5,
          label: "Weighted Exposure Factor",
          description: `(${sessionRatio.toFixed(3)} × ${sw}) + (${hoursRatio.toFixed(3)} × ${hw}) + (${roleMultiplier} × ${rw})`,
          formula: `= ${exposureFactor.toFixed(3)} (min floor: ${minFactor})`,
          result: Math.round(exposureFactor * 1000) / 1000,
        },
        {
          step: 6,
          label: "Response Rate Adjustment",
          description:
            rr > 0
              ? `√(${rr.toFixed(3)}) = ${responseAdj.toFixed(3)}`
              : "Not applied",
          formula:
            rr > 0
              ? `${(score.response_rate || 0).toFixed(1)}% → adj = ${responseAdj.toFixed(3)}`
              : "1.000",
          result: Math.round(responseAdj * 1000) / 1000,
        },
        {
          step: 7,
          label: "Final Normalized Score",
          description: `${rawAvg.toFixed(2)} × ${exposureFactor.toFixed(3)} × ${responseAdj.toFixed(3)}`,
          formula: `= ${normScore.toFixed(2)}`,
          result: Math.round(normScore * 100) / 100,
        },
      ],
      weight_config: {
        name: weights ? weights.name : "Default",
        version: weights ? weights.version || 1 : 1,
        use_log_scaling: useLog,
      },
      department_benchmark: bench
        ? {
            avg_raw_score: bench.dept_avg_raw_score
              ? parseFloat(bench.dept_avg_raw_score)
              : null,
            avg_normalized_score: bench.dept_avg_normalized_score
              ? parseFloat(bench.dept_avg_normalized_score)
              : null,
            faculty_count: parseInt(bench.faculty_count) || 0,
            avg_sessions: bench.avg_sessions_per_faculty
              ? parseFloat(bench.avg_sessions_per_faculty)
              : null,
            avg_hours: bench.avg_hours_per_faculty
              ? parseFloat(bench.avg_hours_per_faculty)
              : null,
          }
        : null,
    };
  }
}

module.exports = FacultyNormalizationService;
