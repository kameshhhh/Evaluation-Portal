// ============================================================
// COHORT ORCHESTRATION SERVICE — Evaluation Cohort Management
// ============================================================
// SRS §1.2 + §8.1 — Structured evaluation containers with
// fairness guarantees. Manages cohort lifecycle, target/evaluator
// enrollment, hybrid assignment generation, and coverage tracking.
//
// PATTERN: Static class methods (matches ScarcityEngine, etc.)
// DB ACCESS: { query, getClient } from config/database
// ============================================================

const { query, getClient } = require("../config/database");
const logger = require("../utils/logger");

class CohortOrchestrationService {
  // ==========================================================
  // COHORT CRUD
  // ==========================================================

  /**
   * Create a new evaluation cohort.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} params.description
   * @param {string} params.cohortType — 'monthly_review' | 'comparative_round' | 'peer_ranking_cycle' | 'faculty_feedback' | 'mixed'
   * @param {string} params.periodStart — ISO date
   * @param {string} params.periodEnd — ISO date
   * @param {string} [params.reviewCycle='monthly']
   * @param {number} [params.minEvaluationsPerTarget=2]
   * @param {number} [params.maxEvaluationsPerTarget=5]
   * @param {number} [params.maxAssignmentsPerEvaluator=8]
   * @param {Object} [params.evaluatorRules={}]
   * @param {Object} [params.targetFilter={}]
   * @param {string} params.createdBy — person_id of admin
   * @returns {Object} Created cohort
   */
  static async createCohort(params) {
    const {
      name,
      description = null,
      cohortType,
      periodStart,
      periodEnd,
      reviewCycle = "monthly",
      minEvaluationsPerTarget = 2,
      maxEvaluationsPerTarget = 5,
      maxAssignmentsPerEvaluator = 8,
      evaluatorRules = {},
      targetFilter = {},
      createdBy,
    } = params;

    const result = await query(
      `INSERT INTO evaluation_cohorts (
        name, description, cohort_type, period_start, period_end,
        review_cycle, min_evaluations_per_target, max_evaluations_per_target,
        max_assignments_per_evaluator, evaluator_rules, target_filter, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        name,
        description,
        cohortType,
        periodStart,
        periodEnd,
        reviewCycle,
        minEvaluationsPerTarget,
        maxEvaluationsPerTarget,
        maxAssignmentsPerEvaluator,
        JSON.stringify(evaluatorRules),
        JSON.stringify(targetFilter),
        createdBy,
      ]
    );

    logger.info(`Cohort created: ${result.rows[0].cohort_id} — ${name}`);
    return result.rows[0];
  }

  /**
   * Get a single cohort with summary counts.
   */
  static async getCohort(cohortId) {
    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM cohort_targets WHERE cohort_id = c.cohort_id) AS target_count,
        (SELECT COUNT(*) FROM cohort_evaluators WHERE cohort_id = c.cohort_id) AS evaluator_count,
        (SELECT COUNT(*) FROM cohort_assignments WHERE cohort_id = c.cohort_id) AS assignment_count,
        (SELECT COUNT(*) FROM cohort_assignments WHERE cohort_id = c.cohort_id AND status = 'completed') AS completed_count,
        (SELECT COUNT(*) FROM cohort_coverage_alerts WHERE cohort_id = c.cohort_id AND status = 'active') AS active_alerts
      FROM evaluation_cohorts c
      WHERE c.cohort_id = $1`,
      [cohortId]
    );
    return result.rows[0] || null;
  }

  /**
   * List cohorts with optional status filter.
   */
  static async listCohorts({ status, cohortType, limit = 50, offset = 0 } = {}) {
    let sql = `SELECT * FROM cohort_coverage_summary WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (status) {
      sql += ` AND cohort_status = $${idx++}`;
      params.push(status);
    }
    if (cohortType) {
      sql += ` AND cohort_type = $${idx++}`;
      params.push(cohortType);
    }

    sql += ` ORDER BY period_start DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Update a draft/scheduled cohort's configuration.
   */
  static async updateCohort(cohortId, updates) {
    const allowedFields = [
      "name",
      "description",
      "period_start",
      "period_end",
      "review_cycle",
      "min_evaluations_per_target",
      "max_evaluations_per_target",
      "max_assignments_per_evaluator",
      "evaluator_rules",
      "target_filter",
    ];

    const sets = [];
    const params = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
      if (allowedFields.includes(dbKey)) {
        sets.push(`${dbKey} = $${idx++}`);
        params.push(
          typeof value === "object" && !Array.isArray(value) && value !== null
            ? JSON.stringify(value)
            : value
        );
      }
    }

    if (sets.length === 0) return this.getCohort(cohortId);

    sets.push(`updated_at = NOW()`);
    params.push(cohortId);

    const result = await query(
      `UPDATE evaluation_cohorts SET ${sets.join(", ")}
       WHERE cohort_id = $${idx} AND status IN ('draft', 'scheduled')
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error("Cohort not found or not editable (must be draft/scheduled)");
    }
    return result.rows[0];
  }

  // ==========================================================
  // TARGET MANAGEMENT
  // ==========================================================

  /**
   * Add targets (entities to be evaluated) to a cohort.
   * @param {string} cohortId
   * @param {Array<{targetId, targetType, targetLabel, targetEvaluations}>} targets
   */
  static async addTargets(cohortId, targets) {
    if (!targets || targets.length === 0) return [];

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const inserted = [];
      for (const t of targets) {
        const result = await client.query(
          `INSERT INTO cohort_targets (cohort_id, target_id, target_type, target_label, target_evaluations)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (cohort_id, target_id) DO UPDATE SET
             target_label = EXCLUDED.target_label,
             target_evaluations = EXCLUDED.target_evaluations
           RETURNING *`,
          [cohortId, t.targetId, t.targetType, t.targetLabel || null, t.targetEvaluations || 2]
        );
        inserted.push(result.rows[0]);
      }

      await client.query("COMMIT");
      return inserted;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Remove a target from a cohort.
   */
  static async removeTarget(cohortId, targetId) {
    await query(
      `DELETE FROM cohort_targets WHERE cohort_id = $1 AND target_id = $2`,
      [cohortId, targetId]
    );
  }

  /**
   * Get all targets for a cohort with coverage info.
   */
  static async getTargets(cohortId) {
    const result = await query(
      `SELECT ct.*,
        ct.current_evaluations >= ct.target_evaluations AS is_compliant
       FROM cohort_targets ct
       WHERE ct.cohort_id = $1
       ORDER BY ct.target_type, ct.target_label`,
      [cohortId]
    );
    return result.rows;
  }

  /**
   * Auto-populate targets from projects/persons based on target_filter.
   */
  static async autoPopulateTargets(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort) throw new Error("Cohort not found");

    const filter = cohort.target_filter || {};
    const targets = [];

    if (
      cohort.cohort_type === "monthly_review" ||
      cohort.cohort_type === "mixed"
    ) {
      // Add non-archived projects as targets
      let sql = `SELECT p.project_id, p.title FROM projects p WHERE p.status IN ('draft','active','under_review')`;
      const params = [];
      let idx = 1;

      if (filter.academic_year) {
        sql += ` AND p.academic_year = $${idx++}`;
        params.push(filter.academic_year);
      }

      const result = await query(sql, params);
      for (const row of result.rows) {
        targets.push({
          targetId: row.project_id,
          targetType: "project",
          targetLabel: row.title,
          targetEvaluations: cohort.min_evaluations_per_target,
        });
      }
    }

    if (
      cohort.cohort_type === "peer_ranking_cycle" ||
      cohort.cohort_type === "mixed"
    ) {
      // Add active students as targets
      let sql = `SELECT person_id, display_name, department_code
                 FROM persons WHERE person_type = 'student' AND status = 'active'`;
      const params = [];
      let idx = 1;

      if (filter.departments && filter.departments.length > 0) {
        sql += ` AND department_code = ANY($${idx++})`;
        params.push(filter.departments);
      }
      if (filter.admission_year) {
        sql += ` AND admission_year = $${idx++}`;
        params.push(filter.admission_year);
      }

      const result = await query(sql, params);
      for (const row of result.rows) {
        targets.push({
          targetId: row.person_id,
          targetType: "person",
          targetLabel: `${row.display_name} (${row.department_code})`,
          targetEvaluations: cohort.min_evaluations_per_target,
        });
      }
    }

    if (targets.length > 0) {
      return this.addTargets(cohortId, targets);
    }
    return [];
  }

  // ==========================================================
  // EVALUATOR MANAGEMENT
  // ==========================================================

  /**
   * Add evaluators to a cohort.
   * @param {string} cohortId
   * @param {Array<{evaluatorId, evaluatorRole, maxAssignments, assignmentMethod}>} evaluators
   */
  static async addEvaluators(cohortId, evaluators) {
    if (!evaluators || evaluators.length === 0) return [];

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const inserted = [];
      for (const e of evaluators) {
        const result = await client.query(
          `INSERT INTO cohort_evaluators (cohort_id, evaluator_id, evaluator_role, max_assignments, assignment_method)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (cohort_id, evaluator_id) DO UPDATE SET
             evaluator_role = EXCLUDED.evaluator_role,
             max_assignments = EXCLUDED.max_assignments,
             assignment_method = EXCLUDED.assignment_method
           RETURNING *`,
          [
            cohortId,
            e.evaluatorId,
            e.evaluatorRole || "judge",
            e.maxAssignments || 5,
            e.assignmentMethod || "auto",
          ]
        );
        inserted.push(result.rows[0]);
      }

      await client.query("COMMIT");
      return inserted;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Remove an evaluator from a cohort.
   */
  static async removeEvaluator(cohortId, evaluatorId) {
    // Also remove their pending assignments
    await query(
      `DELETE FROM cohort_assignments
       WHERE cohort_id = $1 AND evaluator_id = $2 AND status = 'pending'`,
      [cohortId, evaluatorId]
    );
    await query(
      `DELETE FROM cohort_evaluators WHERE cohort_id = $1 AND evaluator_id = $2`,
      [cohortId, evaluatorId]
    );
  }

  /**
   * Get all evaluators for a cohort with workload info.
   */
  static async getEvaluators(cohortId) {
    const result = await query(
      `SELECT ce.*,
        p.display_name, p.department_code, p.person_type,
        ce.current_assignments >= ce.max_assignments AS at_capacity
       FROM cohort_evaluators ce
       JOIN persons p ON ce.evaluator_id = p.person_id
       WHERE ce.cohort_id = $1
       ORDER BY p.display_name`,
      [cohortId]
    );
    return result.rows;
  }

  /**
   * Auto-populate evaluators based on evaluator_rules.
   */
  static async autoPopulateEvaluators(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort) throw new Error("Cohort not found");

    const rules = cohort.evaluator_rules || {};
    const evaluators = [];

    if (
      cohort.cohort_type === "faculty_feedback" ||
      cohort.cohort_type === "monthly_review" ||
      cohort.cohort_type === "mixed"
    ) {
      // Add faculty as evaluators
      let sql = `SELECT person_id FROM persons WHERE person_type = 'faculty' AND status = 'active'`;
      const params = [];
      let idx = 1;

      if (rules.departments && rules.departments.length > 0) {
        sql += ` AND department_code = ANY($${idx++})`;
        params.push(rules.departments);
      }

      const result = await query(sql, params);
      for (const row of result.rows) {
        evaluators.push({
          evaluatorId: row.person_id,
          evaluatorRole: "faculty",
          maxAssignments: cohort.max_assignments_per_evaluator,
          assignmentMethod: "auto",
        });
      }
    }

    if (
      cohort.cohort_type === "peer_ranking_cycle" ||
      cohort.cohort_type === "monthly_review" ||
      cohort.cohort_type === "mixed"
    ) {
      // Add students as peer evaluators (students evaluate in monthly reviews too)
      let sql = `SELECT person_id FROM persons WHERE person_type = 'student' AND status = 'active'`;
      const params = [];
      let idx = 1;

      if (rules.departments && rules.departments.length > 0) {
        sql += ` AND department_code = ANY($${idx++})`;
        params.push(rules.departments);
      }

      const result = await query(sql, params);
      for (const row of result.rows) {
        evaluators.push({
          evaluatorId: row.person_id,
          evaluatorRole: "peer",
          maxAssignments: cohort.max_assignments_per_evaluator,
          assignmentMethod: "auto",
        });
      }
    }

    if (evaluators.length > 0) {
      return this.addEvaluators(cohortId, evaluators);
    }
    return [];
  }

  // ==========================================================
  // HYBRID ASSIGNMENT ENGINE
  // ==========================================================

  /**
   * Generate fair assignments using round-robin distribution.
   * System proposes, admin can override before activation.
   *
   * Algorithm:
   * 1. Get all targets and evaluators
   * 2. Round-robin assign evaluators to targets
   * 3. Ensure min coverage per target
   * 4. Respect max assignments per evaluator
   * 5. Return proposed assignments with fairness metrics
   *
   * @param {string} cohortId
   * @returns {Object} { assignments, fairnessReport }
   */
  static async generateAssignments(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort) throw new Error("Cohort not found");

    const targets = await this.getTargets(cohortId);
    const evaluators = await this.getEvaluators(cohortId);

    if (targets.length === 0) throw new Error("No targets in cohort");
    if (evaluators.length === 0) throw new Error("No evaluators in cohort");

    // Clear existing pending assignments (regenerate)
    await query(
      `DELETE FROM cohort_assignments WHERE cohort_id = $1 AND status = 'pending'`,
      [cohortId]
    );

    const assignments = [];
    const evaluatorLoad = new Map(); // evaluatorId → count

    for (const ev of evaluators) {
      evaluatorLoad.set(ev.evaluator_id, 0);
    }

    // Round-robin: For each target, assign min_evaluations_per_target evaluators
    // Priority: faculty first, then peers — within each group sort by current load
    const sortedEvaluators = [...evaluators].sort((a, b) => {
      // Faculty evaluators get priority over peers
      const roleOrder = { faculty: 0, judge: 1, peer: 2, student: 3 };
      const aRole = roleOrder[a.evaluator_role] ?? 9;
      const bRole = roleOrder[b.evaluator_role] ?? 9;
      if (aRole !== bRole) return aRole - bRole;
      return a.current_assignments - b.current_assignments;
    });

    for (const target of targets) {
      const neededEvals = target.target_evaluations - target.current_evaluations;
      if (neededEvals <= 0) continue;

      let assigned = 0;

      // Sort evaluators by current load (round-robin fairness)
      const available = sortedEvaluators
        .filter((ev) => {
          // Don't assign evaluator to themselves
          if (ev.evaluator_id === target.target_id) return false;
          // Don't exceed max
          const currentLoad = evaluatorLoad.get(ev.evaluator_id) || 0;
          if (currentLoad >= ev.max_assignments) return false;
          return true;
        })
        .sort(
          (a, b) =>
            (evaluatorLoad.get(a.evaluator_id) || 0) -
            (evaluatorLoad.get(b.evaluator_id) || 0)
        );

      for (const ev of available) {
        if (assigned >= neededEvals) break;

        assignments.push({
          cohortId,
          evaluatorId: ev.evaluator_id,
          targetId: target.target_id,
          targetType: target.target_type,
          assignmentMethod: "auto",
          assignmentReason: `Round-robin: evaluator load ${evaluatorLoad.get(ev.evaluator_id) || 0}`,
        });

        evaluatorLoad.set(
          ev.evaluator_id,
          (evaluatorLoad.get(ev.evaluator_id) || 0) + 1
        );
        assigned++;
      }
    }

    // Store proposed assignments
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const stored = [];
      for (const a of assignments) {
        const result = await client.query(
          `INSERT INTO cohort_assignments (
            cohort_id, evaluator_id, target_id, target_type,
            assignment_method, assignment_reason
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (cohort_id, evaluator_id, target_id) DO UPDATE SET
            assignment_method = EXCLUDED.assignment_method,
            assignment_reason = EXCLUDED.assignment_reason
          RETURNING *`,
          [
            a.cohortId,
            a.evaluatorId,
            a.targetId,
            a.targetType,
            a.assignmentMethod,
            a.assignmentReason,
          ]
        );
        stored.push(result.rows[0]);
      }

      await client.query("COMMIT");

      // Calculate fairness report
      const fairnessReport = this._calculateFairness(stored, evaluators, targets);

      logger.info(
        `Generated ${stored.length} assignments for cohort ${cohortId}, ` +
          `fairness gap: ${fairnessReport.coverageGap}`
      );

      return { assignments: stored, fairnessReport };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin override: change an assignment's evaluator.
   * Validates that the override doesn't worsen fairness beyond threshold.
   */
  static async overrideAssignment(
    assignmentId,
    newEvaluatorId,
    reason,
    adminId
  ) {
    // Get current assignment
    const current = await query(
      `SELECT * FROM cohort_assignments WHERE assignment_id = $1 AND status = 'pending'`,
      [assignmentId]
    );
    if (current.rows.length === 0) {
      throw new Error("Assignment not found or not in pending status");
    }

    const assignment = current.rows[0];

    // Check new evaluator exists in cohort
    const evalCheck = await query(
      `SELECT * FROM cohort_evaluators
       WHERE cohort_id = $1 AND evaluator_id = $2`,
      [assignment.cohort_id, newEvaluatorId]
    );
    if (evalCheck.rows.length === 0) {
      throw new Error("New evaluator is not in this cohort");
    }

    // Check capacity
    const loadCheck = await query(
      `SELECT COUNT(*) AS cnt FROM cohort_assignments
       WHERE cohort_id = $1 AND evaluator_id = $2 AND status != 'skipped'`,
      [assignment.cohort_id, newEvaluatorId]
    );
    if (
      parseInt(loadCheck.rows[0].cnt) >=
      evalCheck.rows[0].max_assignments
    ) {
      throw new Error("New evaluator is at capacity");
    }

    // Record override in history
    const overrideRecord = {
      previousEvaluator: assignment.evaluator_id,
      newEvaluator: newEvaluatorId,
      reason,
      overriddenBy: adminId,
      overriddenAt: new Date().toISOString(),
    };

    const history = [...(assignment.override_history || []), overrideRecord];

    const result = await query(
      `UPDATE cohort_assignments
       SET evaluator_id = $1, assignment_method = 'rebalanced',
           assignment_reason = $2, override_history = $3
       WHERE assignment_id = $4
       RETURNING *`,
      [newEvaluatorId, `Admin override: ${reason}`, JSON.stringify(history), assignmentId]
    );

    return result.rows[0];
  }

  /**
   * Get all assignments for a cohort (with evaluator names).
   */
  static async getAssignments(cohortId, { status } = {}) {
    let sql = `SELECT * FROM cohort_assignment_matrix WHERE cohort_id = $1`;
    const params = [cohortId];

    if (status) {
      sql += ` AND assignment_status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY evaluator_name, target_id`;
    const result = await query(sql, params);
    return result.rows;
  }

  // ==========================================================
  // COHORT LIFECYCLE
  // ==========================================================

  /**
   * Auto-setup a cohort — populates targets, evaluators, and generates assignments.
   * One-click convenience for admins. Returns summary of all 3 steps.
   */
  static async autoSetup(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort) throw new Error("Cohort not found");
    if (cohort.status !== "draft") {
      throw new Error("Auto-setup is only available for draft cohorts");
    }

    const summary = { targets: 0, evaluators: 0, assignments: 0, fairnessReport: null };

    // Step 1: Auto-populate targets
    try {
      const targets = await this.autoPopulateTargets(cohortId);
      summary.targets = targets.length;
    } catch (err) {
      logger.warn(`Auto-setup targets step failed for cohort ${cohortId}: ${err.message}`);
    }

    // Step 2: Auto-populate evaluators
    try {
      const evaluators = await this.autoPopulateEvaluators(cohortId);
      summary.evaluators = evaluators.length;
    } catch (err) {
      logger.warn(`Auto-setup evaluators step failed for cohort ${cohortId}: ${err.message}`);
    }

    // Step 3: Generate assignments (only if we have both targets and evaluators)
    if (summary.targets > 0 && summary.evaluators > 0) {
      try {
        const result = await this.generateAssignments(cohortId);
        summary.assignments = result.assignments?.length || 0;
        summary.fairnessReport = result.fairnessReport || null;
      } catch (err) {
        logger.warn(`Auto-setup assignments step failed for cohort ${cohortId}: ${err.message}`);
      }
    }

    logger.info(`Cohort auto-setup: ${cohortId} → ${summary.targets}T / ${summary.evaluators}E / ${summary.assignments}A`);
    return summary;
  }

  /**
   * Activate a cohort — move from draft/scheduled → active.
   * Validates that assignments exist and sets deadlines.
   */
  static async activateCohort(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort) throw new Error("Cohort not found");
    if (!["draft", "scheduled"].includes(cohort.status)) {
      throw new Error(`Cannot activate cohort in '${cohort.status}' status`);
    }

    // Must have at least one assignment
    if (parseInt(cohort.assignment_count) === 0) {
      throw new Error("Cannot activate cohort with no assignments. Generate assignments first.");
    }

    const result = await query(
      `UPDATE evaluation_cohorts
       SET status = 'active', activated_at = NOW(), updated_at = NOW()
       WHERE cohort_id = $1
       RETURNING *`,
      [cohortId]
    );

    // Set deadline on pending assignments
    await query(
      `UPDATE cohort_assignments
       SET deadline = $1
       WHERE cohort_id = $2 AND status = 'pending' AND deadline IS NULL`,
      [cohort.period_end, cohortId]
    );

    logger.info(`Cohort activated: ${cohortId}`);
    return result.rows[0];
  }

  /**
   * Complete a cohort — finalize and generate fairness report.
   */
  static async completeCohort(cohortId) {
    const assignments = await this.getAssignments(cohortId);
    const targets = await this.getTargets(cohortId);
    const evaluators = await this.getEvaluators(cohortId);

    const fairnessReport = this._calculateFairness(assignments, evaluators, targets);

    const result = await query(
      `UPDATE evaluation_cohorts
       SET status = 'completed', completed_at = NOW(), updated_at = NOW(),
           fairness_report = $1
       WHERE cohort_id = $2 AND status = 'active'
       RETURNING *`,
      [JSON.stringify(fairnessReport), cohortId]
    );

    if (result.rows.length === 0) {
      throw new Error("Cohort not found or not in active status");
    }

    logger.info(`Cohort completed: ${cohortId}, compliance: ${fairnessReport.complianceRate}%`);
    return result.rows[0];
  }

  // ==========================================================
  // ASSIGNMENT COMPLETION — Called when evaluation is submitted
  // ==========================================================

  /**
   * Mark an assignment as completed and update coverage.
   * Called by evaluation submission flows (scarcity, comparative, etc.)
   *
   * @param {string} cohortId
   * @param {string} evaluatorId
   * @param {string} targetId
   * @param {string} sessionId — The evaluation session that was completed
   */
  static async markAssignmentCompleted(cohortId, evaluatorId, targetId, sessionId) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Update assignment status
      await client.query(
        `UPDATE cohort_assignments
         SET status = 'completed', completed_at = NOW(), session_id = $1
         WHERE cohort_id = $2 AND evaluator_id = $3 AND target_id = $4
           AND status IN ('pending', 'session_created', 'in_progress')`,
        [sessionId, cohortId, evaluatorId, targetId]
      );

      // Increment target's current_evaluations
      await client.query(
        `UPDATE cohort_targets
         SET current_evaluations = current_evaluations + 1
         WHERE cohort_id = $1 AND target_id = $2`,
        [cohortId, targetId]
      );

      // Increment evaluator's current_assignments
      await client.query(
        `UPDATE cohort_evaluators
         SET current_assignments = current_assignments + 1
         WHERE cohort_id = $1 AND evaluator_id = $2`,
        [cohortId, evaluatorId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ==========================================================
  // COHORT COVERAGE METRICS
  // ==========================================================

  /**
   * Get detailed coverage dashboard data for a cohort.
   */
  static async getCoverageDashboard(cohortId) {
    const [cohort, targets, evaluators, assignments, alerts] = await Promise.all([
      this.getCohort(cohortId),
      this.getTargets(cohortId),
      this.getEvaluators(cohortId),
      this.getAssignments(cohortId),
      this.getActiveAlerts(cohortId),
    ]);

    if (!cohort) throw new Error("Cohort not found");

    const fairnessReport = this._calculateFairness(assignments, evaluators, targets);

    return {
      cohort,
      targets,
      evaluators,
      assignments,
      alerts,
      fairnessReport,
      summary: {
        totalTargets: targets.length,
        compliantTargets: targets.filter(
          (t) => t.current_evaluations >= t.target_evaluations
        ).length,
        totalEvaluators: evaluators.length,
        totalAssignments: assignments.length,
        completedAssignments: assignments.filter(
          (a) => a.assignment_status === "completed"
        ).length,
        pendingAssignments: assignments.filter(
          (a) => a.assignment_status === "pending"
        ).length,
        complianceRate: fairnessReport.complianceRate,
        fairnessGap: fairnessReport.coverageGap,
        activeAlerts: alerts.length,
      },
    };
  }

  // ==========================================================
  // ALERTS
  // ==========================================================

  /**
   * Detect coverage gaps and create alerts.
   */
  static async detectGapsAndAlert(cohortId) {
    const cohort = await this.getCohort(cohortId);
    if (!cohort || cohort.status !== "active") return [];

    const targets = await this.getTargets(cohortId);
    const evaluators = await this.getEvaluators(cohortId);
    const newAlerts = [];

    // Check for under-evaluated targets
    for (const target of targets) {
      if (target.current_evaluations < target.target_evaluations) {
        const gap = target.target_evaluations - target.current_evaluations;
        const severity = gap >= 2 ? "critical" : "warning";

        newAlerts.push({
          cohortId,
          alertType: "coverage_gap",
          severity,
          title: `${target.target_label || target.target_id} needs ${gap} more evaluation(s)`,
          description: `Target has ${target.current_evaluations}/${target.target_evaluations} evaluations. SRS §8.1 requires minimum coverage.`,
          targetIds: [target.target_id],
          suggestedActions: [
            `Assign ${gap} more evaluator(s) to this target`,
            "Check if assigned evaluators have started their evaluations",
          ],
        });
      }
    }

    // Check for overloaded evaluators
    for (const ev of evaluators) {
      if (ev.current_assignments >= ev.max_assignments) {
        newAlerts.push({
          cohortId,
          alertType: "evaluator_overload",
          severity: "warning",
          title: `${ev.display_name} is at assignment capacity (${ev.current_assignments}/${ev.max_assignments})`,
          description: `Consider redistributing assignments for workload balance.`,
          evaluatorIds: [ev.evaluator_id],
          suggestedActions: [
            "Redistribute some assignments to less loaded evaluators",
            "Increase evaluator's max assignments if appropriate",
          ],
        });
      }
    }

    // Check deadline approaching
    const now = new Date();
    const periodEnd = new Date(cohort.period_end);
    const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 3 && daysRemaining > 0) {
      const pendingCount = parseInt(cohort.assignment_count) - parseInt(cohort.completed_count);
      if (pendingCount > 0) {
        newAlerts.push({
          cohortId,
          alertType: "deadline_approaching",
          severity: daysRemaining <= 1 ? "critical" : "warning",
          title: `${daysRemaining} day(s) remaining — ${pendingCount} assignment(s) pending`,
          description: `Cohort period ends ${cohort.period_end}. Ensure all evaluations are completed.`,
          suggestedActions: [
            "Send reminders to evaluators with pending assignments",
            "Consider extending the deadline if needed",
          ],
        });
      }
    }

    // Store new alerts (avoid duplicates by type within last 24h)
    const stored = [];
    for (const alert of newAlerts) {
      const existing = await query(
        `SELECT alert_id FROM cohort_coverage_alerts
         WHERE cohort_id = $1 AND alert_type = $2 AND status = 'active'
         AND created_at > NOW() - INTERVAL '24 hours'
         AND target_ids = $3`,
        [alert.cohortId, alert.alertType, alert.targetIds || null]
      );

      if (existing.rows.length === 0) {
        const result = await query(
          `INSERT INTO cohort_coverage_alerts (
            cohort_id, alert_type, severity, title, description,
            target_ids, evaluator_ids, suggested_actions
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          RETURNING *`,
          [
            alert.cohortId,
            alert.alertType,
            alert.severity,
            alert.title,
            alert.description,
            alert.targetIds || null,
            alert.evaluatorIds || null,
            alert.suggestedActions ? JSON.stringify(alert.suggestedActions) : null,
          ]
        );
        stored.push(result.rows[0]);
      }
    }

    return stored;
  }

  /**
   * Get active alerts for a cohort.
   */
  static async getActiveAlerts(cohortId) {
    const result = await query(
      `SELECT * FROM cohort_coverage_alerts
       WHERE cohort_id = $1 AND status = 'active'
       ORDER BY severity DESC, created_at DESC`,
      [cohortId]
    );
    return result.rows;
  }

  /**
   * Get all alerts for a cohort (including resolved).
   */
  static async getAllAlerts(cohortId) {
    const result = await query(
      `SELECT cca.*,
        p.display_name AS acknowledged_by_name
       FROM cohort_coverage_alerts cca
       LEFT JOIN persons p ON cca.acknowledged_by = p.person_id
       WHERE cca.cohort_id = $1
       ORDER BY cca.created_at DESC`,
      [cohortId]
    );
    return result.rows;
  }

  /**
   * Acknowledge an alert.
   */
  static async acknowledgeAlert(alertId, personId) {
    const result = await query(
      `UPDATE cohort_coverage_alerts
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
       WHERE alert_id = $2 AND status = 'active'
       RETURNING *`,
      [personId, alertId]
    );
    return result.rows[0];
  }

  /**
   * Resolve an alert.
   */
  static async resolveAlert(alertId, personId, notes) {
    const result = await query(
      `UPDATE cohort_coverage_alerts
       SET status = 'resolved', resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE alert_id = $3 AND status IN ('active', 'acknowledged')
       RETURNING *`,
      [personId, notes || null, alertId]
    );
    return result.rows[0];
  }

  // ==========================================================
  // EVALUATOR ACTION — Start an evaluation from an assignment
  // ==========================================================

  /**
   * Create an evaluation session for a cohort assignment.
   * Looks up the assignment, creates an evaluation_session,
   * registers the evaluator, links the session back to the assignment,
   * and returns session details so the UI can navigate to it.
   *
   * @param {string} assignmentId — UUID of the cohort_assignment
   * @param {string} evaluatorPersonId — person_id of the authenticated evaluator
   * @returns {Object} { sessionId, assignmentId, targetLabel, ... }
   */
  static async startEvaluationForAssignment(assignmentId, evaluatorPersonId) {
    // 1. Read the assignment + cohort details
    const aResult = await query(
      `SELECT ca.*, c.name AS cohort_name, c.cohort_type, c.period_start, c.period_end,
              ct.target_label, ct.target_type
       FROM cohort_assignments ca
       JOIN evaluation_cohorts c ON ca.cohort_id = c.cohort_id
       LEFT JOIN cohort_targets ct ON ca.cohort_id = ct.cohort_id AND ca.target_id = ct.target_id
       WHERE ca.assignment_id = $1`,
      [assignmentId]
    );

    if (aResult.rows.length === 0) {
      throw new Error("Assignment not found");
    }

    const assignment = aResult.rows[0];

    // Verify ownership
    if (assignment.evaluator_id !== evaluatorPersonId) {
      throw new Error("You are not the assigned evaluator for this assignment");
    }

    // Don't allow re-starting already started assignments
    if (assignment.session_id) {
      return {
        sessionId: assignment.session_id,
        alreadyStarted: true,
        message: "Evaluation already started — resuming",
      };
    }

    if (assignment.status === "completed") {
      throw new Error("This assignment is already completed");
    }

    // 2. Build the list of students to evaluate (selectedStudentIds)
    //    For project targets: get all project members' person_ids
    //    For person targets: just the target_id itself
    let selectedStudentIds = [];

    if (assignment.target_type === "project") {
      const membersResult = await query(
        `SELECT pm.person_id
         FROM project_members pm
         WHERE pm.project_id = $1`,
        [assignment.target_id]
      );
      // Exclude the evaluator themselves — you don't evaluate yourself
      selectedStudentIds = membersResult.rows
        .map((r) => r.person_id)
        .filter((id) => id !== evaluatorPersonId);
    } else {
      // person target — the target IS the student
      selectedStudentIds = [assignment.target_id];
    }

    if (selectedStudentIds.length === 0) {
      throw new Error(
        "No evaluatable students found for this assignment's target"
      );
    }

    // 3. Map cohort_type → session intent
    //    Allowed intents: 'growth', 'excellence', 'leadership', 'comparative'
    const intentMap = {
      monthly_review: "growth",
      comparative_round: "comparative",
      peer_ranking_cycle: "comparative",
      faculty_feedback: "excellence",
      mixed: "growth",
    };
    const intent = intentMap[assignment.cohort_type] || "growth";

    // 3b. Determine session_type from evaluator's person_type
    //     Allowed: 'project_review', 'faculty_assessment', 'peer_evaluation'
    const evalPersonResult = await query(
      `SELECT person_type FROM persons WHERE person_id = $1 LIMIT 1`,
      [evaluatorPersonId]
    );
    const personType = evalPersonResult.rows[0]?.person_type;
    const sessionType =
      personType === "faculty" ? "faculty_assessment" : "peer_evaluation";

    // 4. Get or create an academic period
    const periodResult = await query(
      `SELECT period_id FROM academic_months ORDER BY start_date DESC LIMIT 1`
    );
    let periodId;
    if (periodResult.rows.length > 0) {
      periodId = periodResult.rows[0].period_id;
    } else {
      const newPeriod = await query(
        `INSERT INTO academic_months (month_name, start_date, end_date, semester, academic_year)
         VALUES ('Default Period', NOW(), NOW() + INTERVAL '30 days', 'odd', '2025-2026')
         RETURNING period_id`
      );
      periodId = newPeriod.rows[0].period_id;
    }

    // 5. Calculate pool size (5 points per student, SRS 4.1.3)
    const poolSize = selectedStudentIds.length * 5;

    // 6. Create session + link to assignment in a transaction
    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Create evaluation session
      const windowEnd =
        assignment.deadline ||
        assignment.period_end ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const sessionResult = await client.query(
        `INSERT INTO evaluation_sessions (
           session_type, intent, period_id,
           evaluation_window_start, evaluation_window_end,
           status, created_by, scarcity_pool_size, evaluation_mode
         ) VALUES ($1, $2, $3, NOW(), $4, 'open', $5, $6, 'project_member')
         RETURNING session_id, session_type, intent, status,
                   evaluation_window_start, evaluation_window_end,
                   scarcity_pool_size`,
        [sessionType, intent, periodId, windowEnd, evaluatorPersonId, poolSize]
      );

      const session = sessionResult.rows[0];

      // Register evaluator in session_evaluators
      await client.query(
        `INSERT INTO session_evaluators (session_id, evaluator_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [session.session_id, evaluatorPersonId]
      );

      // Store selected students as frozen_entities
      await client.query(
        `UPDATE evaluation_sessions SET frozen_entities = $1 WHERE session_id = $2`,
        [JSON.stringify(selectedStudentIds), session.session_id]
      );

      // Update assignment: link session + change status
      await client.query(
        `UPDATE cohort_assignments
         SET session_id = $1, status = 'session_created', started_at = NOW()
         WHERE assignment_id = $2`,
        [session.session_id, assignmentId]
      );

      await client.query("COMMIT");

      logger.info("CohortOrchestration: Evaluation session created from assignment", {
        assignmentId,
        sessionId: session.session_id,
        evaluatorPersonId,
        studentCount: selectedStudentIds.length,
      });

      return {
        sessionId: session.session_id,
        assignmentId,
        cohortName: assignment.cohort_name,
        targetLabel: assignment.target_label,
        poolSize: session.scarcity_pool_size,
        studentCount: selectedStudentIds.length,
        alreadyStarted: false,
      };
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  }

  // ==========================================================
  // EVALUATOR'S VIEW — What assignments are mine?
  // ==========================================================

  /**
   * Get all active cohort assignments for an evaluator.
   */
  static async getMyAssignments(evaluatorId) {
    const result = await query(
      `SELECT ca.*, ca.status AS assignment_status,
        c.name AS cohort_name, c.cohort_type, c.period_end,
        ct.target_label
       FROM cohort_assignments ca
       JOIN evaluation_cohorts c ON ca.cohort_id = c.cohort_id
       LEFT JOIN cohort_targets ct ON ca.cohort_id = ct.cohort_id AND ca.target_id = ct.target_id
       WHERE ca.evaluator_id = $1
         AND c.status IN ('active', 'completed')
       ORDER BY
         CASE ca.status WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 WHEN 'session_created' THEN 3 ELSE 4 END,
         ca.deadline ASC NULLS LAST`,
      [evaluatorId]
    );
    return result.rows;
  }

  // ==========================================================
  // PRIVATE HELPERS
  // ==========================================================

  /**
   * Calculate fairness metrics for a set of assignments.
   */
  static _calculateFairness(assignments, evaluators, targets) {
    // Evaluations per target
    const targetCounts = new Map();
    for (const t of targets) {
      targetCounts.set(t.target_id, t.current_evaluations || 0);
    }

    // Count completed/total per target from assignments
    for (const a of assignments) {
      const status = a.assignment_status || a.status;
      if (status === "completed") {
        targetCounts.set(
          a.target_id,
          (targetCounts.get(a.target_id) || 0)
        );
      }
    }

    const counts = [...targetCounts.values()];
    const minEvals = counts.length > 0 ? Math.min(...counts) : 0;
    const maxEvals = counts.length > 0 ? Math.max(...counts) : 0;
    const avgEvals =
      counts.length > 0
        ? counts.reduce((s, c) => s + c, 0) / counts.length
        : 0;

    // Evaluator workload variance
    const evalLoads = [];
    for (const ev of evaluators) {
      const load = assignments.filter(
        (a) => (a.evaluator_id || a.evaluator_id) === ev.evaluator_id
      ).length;
      evalLoads.push(load);
    }

    const avgLoad =
      evalLoads.length > 0
        ? evalLoads.reduce((s, l) => s + l, 0) / evalLoads.length
        : 0;
    const variance =
      evalLoads.length > 0
        ? evalLoads.reduce((s, l) => s + (l - avgLoad) ** 2, 0) /
          evalLoads.length
        : 0;

    // Compliance: targets meeting minimum
    const compliantCount = targets.filter((t) => {
      return t.current_evaluations >= t.target_evaluations;
    }).length;

    const complianceRate =
      targets.length > 0
        ? Math.round((100 * compliantCount) / targets.length * 10) / 10
        : 100;

    return {
      coverageGap: maxEvals - minEvals,
      minEvaluations: minEvals,
      maxEvaluations: maxEvals,
      avgEvaluations: Math.round(avgEvals * 10) / 10,
      workloadVariance: Math.round(variance * 100) / 100,
      avgWorkload: Math.round(avgLoad * 10) / 10,
      compliantTargets: compliantCount,
      totalTargets: targets.length,
      complianceRate,
      isFair: maxEvals - minEvals <= 1,
    };
  }
}

module.exports = CohortOrchestrationService;
