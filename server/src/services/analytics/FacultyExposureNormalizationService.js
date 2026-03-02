// ============================================================
// FACULTY EXPOSURE NORMALIZATION SERVICE
// ============================================================
// Implements SRS Section 4.4.3: Faculty Feedback Normalization
//
// Faculty evaluators have varying degrees of exposure to students:
//   - Some faculty see a student daily (lab instructor)
//   - Some faculty see a student weekly (lecture-only)
//   - Some interact only during project presentations
//
// RAW faculty scores are systematically biased by exposure level.
// This service normalizes scores so that:
//   high_exposure_faculty_score  ≈ low_exposure_faculty_score
//   (after normalization)
//
// NORMALIZATION FORMULA (SRS 4.4.3):
//   normalized_score = raw_score × exposure_weight
//   exposure_weight  = base_weight × (1 + log(session_count) / log(max_sessions))
//
//   Where:
//     base_weight depends on role_type (instructor=1.0, reviewer=0.8, observer=0.6)
//     session_count = number of evaluation sessions faculty has with this student
//     max_sessions  = highest session count in the cohort
//
// TABLES USED (created in migration 013):
//   faculty_exposure_log       — track faculty-student interaction history
//   faculty_normalized_scores  — store normalized score outputs
//
// ENTRY POINTS:
//   • logExposure(facultyId, targetId, sessionId, details)
//   • computeExposureWeight(facultyId, targetId)
//   • normalizeScore(facultyId, targetId, rawScore, sessionId)
//   • batchNormalize(sessionId) — normalize all faculty scores in a session
//   • getExposureProfile(facultyId) — faculty's exposure stats across students
//
// DOES NOT modify any existing services or tables.
// ============================================================

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");

// ============================================================
// Role-based weight configuration (SRS 4.4.3)
// ============================================================
const ROLE_BASE_WEIGHTS = Object.freeze({
  instructor: 1.0, // Direct instruction — highest exposure reliability
  co_instructor: 0.95,
  lab_instructor: 0.9,
  mentor: 0.85,
  reviewer: 0.8, // Review-only — moderate exposure reliability
  panelist: 0.75,
  observer: 0.6, // Observation-only — lower exposure reliability
  guest: 0.5,
});

// ============================================================
// Exposure category thresholds (SRS 4.4.3)
// ============================================================
const EXPOSURE_CATEGORIES = Object.freeze({
  HIGH: { minSessions: 8, minHours: 20, label: "high_exposure" },
  MEDIUM: { minSessions: 4, minHours: 8, label: "medium_exposure" },
  LOW: { minSessions: 1, minHours: 1, label: "low_exposure" },
  NONE: { minSessions: 0, minHours: 0, label: "no_exposure" },
});

// ============================================================
// FacultyExposureNormalizationService
// ============================================================
class FacultyExposureNormalizationService {
  // ============================================================
  // logExposure — Record a faculty-student interaction event
  // Each evaluation session, lab, or meeting adds to exposure
  //
  // @param {string} facultyId — Person ID of the faculty member
  // @param {string} targetId — Person ID of the student
  // @param {string} sessionId — The evaluation session (nullable)
  // @param {Object} details — Additional context
  // @param {string} details.roleType — instructor|reviewer|observer etc.
  // @param {number} details.contactHours — Duration of interaction
  // @param {string} details.interactionType — lecture|lab|review|meeting
  // ============================================================
  static async logExposure(facultyId, targetId, sessionId, details = {}) {
    const result = await query(
      `INSERT INTO faculty_exposure_log (
        faculty_id, target_id, session_id, role_type,
        contact_hours, interaction_type
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        facultyId,
        targetId,
        sessionId,
        details.roleType || "observer",
        details.contactHours || 1,
        details.interactionType || "evaluation",
      ],
    );

    return result.rows[0];
  }

  // ============================================================
  // computeExposureWeight — Calculate normalization weight
  // SRS 4.4.3: "Normalize based on session count, contact hours, role"
  //
  // Formula:
  //   weight = role_base × (1 + log(sessions + 1) / log(maxSessions + 1))
  //            × hour_factor
  //
  //   hour_factor = min(1.0, totalHours / median_hours)
  //
  // Returns weight in range [0.3, 1.0] — clamped to prevent extremes
  // ============================================================
  static async computeExposureWeight(facultyId, targetId) {
    // Get faculty's exposure with this specific student
    const exposureResult = await query(
      `SELECT
        COUNT(*) as session_count,
        SUM(contact_hours) as total_hours,
        MODE() WITHIN GROUP (ORDER BY role_type) as primary_role
       FROM faculty_exposure_log
       WHERE faculty_id = $1 AND target_id = $2`,
      [facultyId, targetId],
    );

    const exposure = exposureResult.rows[0];
    const sessionCount = parseInt(exposure.session_count) || 0;
    const totalHours = parseFloat(exposure.total_hours) || 0;
    const primaryRole = exposure.primary_role || "observer";

    if (sessionCount === 0) {
      return {
        weight: 0.5,
        category: EXPOSURE_CATEGORIES.NONE.label,
        sessionCount: 0,
        totalHours: 0,
        role: "observer",
      };
    }

    // Get cohort maximum for normalization
    const maxResult = await query(
      `SELECT
        MAX(session_count) as max_sessions,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_hours) as median_hours
       FROM (
         SELECT faculty_id, target_id,
                COUNT(*) as session_count,
                SUM(contact_hours) as total_hours
         FROM faculty_exposure_log
         GROUP BY faculty_id, target_id
       ) cohort`,
    );

    const maxSessions = parseInt(maxResult.rows[0].max_sessions) || 1;
    const medianHours = parseFloat(maxResult.rows[0].median_hours) || 1;

    // Role-based weight
    const roleBase = ROLE_BASE_WEIGHTS[primaryRole] || 0.6;

    // Session factor: logarithmic scaling relative to max
    const sessionFactor =
      1 + Math.log(sessionCount + 1) / Math.log(maxSessions + 1);

    // Hour factor: capped at 1.0, relative to median
    const hourFactor = Math.min(1.0, totalHours / medianHours);

    // Combined weight, clamped to [0.3, 1.0]
    const rawWeight = roleBase * (sessionFactor / 2) * (0.5 + 0.5 * hourFactor);
    const weight = parseFloat(
      Math.max(0.3, Math.min(1.0, rawWeight)).toFixed(4),
    );

    // Categorize exposure level
    let category = EXPOSURE_CATEGORIES.NONE.label;
    if (
      sessionCount >= EXPOSURE_CATEGORIES.HIGH.minSessions &&
      totalHours >= EXPOSURE_CATEGORIES.HIGH.minHours
    ) {
      category = EXPOSURE_CATEGORIES.HIGH.label;
    } else if (
      sessionCount >= EXPOSURE_CATEGORIES.MEDIUM.minSessions &&
      totalHours >= EXPOSURE_CATEGORIES.MEDIUM.minHours
    ) {
      category = EXPOSURE_CATEGORIES.MEDIUM.label;
    } else if (sessionCount >= EXPOSURE_CATEGORIES.LOW.minSessions) {
      category = EXPOSURE_CATEGORIES.LOW.label;
    }

    return { weight, category, sessionCount, totalHours, role: primaryRole };
  }

  // ============================================================
  // normalizeScore — Apply exposure normalization to a raw score
  // SRS 4.4.3: "normalized_score = raw_score × exposure_weight"
  //
  // @param {string} facultyId — The faculty evaluator
  // @param {string} targetId — The student being evaluated
  // @param {number} rawScore — The original score given by faculty
  // @param {string} sessionId — The session context (for record-keeping)
  // @returns {Object} — Normalized score with provenance data
  // ============================================================
  static async normalizeScore(facultyId, targetId, rawScore, sessionId) {
    const exposureInfo =
      await FacultyExposureNormalizationService.computeExposureWeight(
        facultyId,
        targetId,
      );

    const normalizedScore = parseFloat(
      (rawScore * exposureInfo.weight).toFixed(4),
    );

    // Store normalized score
    const result = await query(
      `INSERT INTO faculty_normalized_scores (
        faculty_id, target_id, session_id,
        raw_score, exposure_weight, normalized_score,
        exposure_category, role_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (faculty_id, target_id, session_id)
      DO UPDATE SET
        raw_score = EXCLUDED.raw_score,
        exposure_weight = EXCLUDED.exposure_weight,
        normalized_score = EXCLUDED.normalized_score,
        exposure_category = EXCLUDED.exposure_category,
        role_type = EXCLUDED.role_type,
        computed_at = NOW()
      RETURNING *`,
      [
        facultyId,
        targetId,
        sessionId,
        rawScore,
        exposureInfo.weight,
        normalizedScore,
        exposureInfo.category,
        exposureInfo.role,
      ],
    );

    return result.rows[0];
  }

  // ============================================================
  // batchNormalize — Normalize all faculty scores in a session
  //
  // Called after an evaluation session is finalized. Retrieves
  // all faculty-given scores and applies exposure normalization.
  //
  // @param {string} sessionId — The evaluation session to normalize
  // @returns {Object} — Summary of normalization results
  // ============================================================
  static async batchNormalize(sessionId) {
    // Get all scarcity allocations with faculty evaluators
    // (Faculty identified by user_role = 'faculty' or role in evaluation context)
    const allocations = await query(
      `SELECT sa.evaluator_id, sa.target_id, sa.allocated_points,
              u.user_role
       FROM scarcity_allocations sa
       JOIN persons p ON sa.evaluator_id = p.person_id
       JOIN users u ON p.identity_id = u.internal_user_id
       WHERE sa.session_id = $1
         AND u.user_role IN ('faculty', 'admin')`,
      [sessionId],
    );

    if (allocations.rows.length === 0) {
      return {
        sessionId,
        normalized: 0,
        message: "No faculty allocations found in session",
      };
    }

    const results = [];
    for (const alloc of allocations.rows) {
      try {
        const normalized =
          await FacultyExposureNormalizationService.normalizeScore(
            alloc.evaluator_id,
            alloc.target_id,
            parseFloat(alloc.allocated_points),
            sessionId,
          );
        results.push(normalized);
      } catch (err) {
        logger.warn("Normalization failed for allocation", {
          evaluatorId: alloc.evaluator_id,
          targetId: alloc.target_id,
          error: err.message,
        });
      }
    }

    logger.info("Batch normalization complete", {
      sessionId,
      totalAllocations: allocations.rows.length,
      normalized: results.length,
    });

    return {
      sessionId,
      totalAllocations: allocations.rows.length,
      normalized: results.length,
      results,
    };
  }

  // ============================================================
  // getExposureProfile — Faculty's exposure stats across all students
  // Returns aggregate stats without exposing individual student data
  // ============================================================
  static async getExposureProfile(facultyId) {
    const result = await query(
      `SELECT
        COUNT(DISTINCT target_id) as unique_students,
        COUNT(*) as total_interactions,
        SUM(contact_hours) as total_hours,
        AVG(contact_hours) as avg_hours_per_interaction,
        MODE() WITHIN GROUP (ORDER BY role_type) as primary_role,
        MODE() WITHIN GROUP (ORDER BY interaction_type) as primary_interaction_type,
        MIN(logged_at) as first_interaction,
        MAX(logged_at) as last_interaction
       FROM faculty_exposure_log
       WHERE faculty_id = $1`,
      [facultyId],
    );

    // Per-student exposure distribution (anonymized)
    const distribution = await query(
      `SELECT
        exposure_category,
        COUNT(*) as student_count,
        AVG(normalized_score) as avg_normalized_score
       FROM faculty_normalized_scores
       WHERE faculty_id = $1
       GROUP BY exposure_category`,
      [facultyId],
    );

    return {
      facultyId,
      profile: result.rows[0],
      exposureDistribution: distribution.rows,
    };
  }
}

module.exports = FacultyExposureNormalizationService;
