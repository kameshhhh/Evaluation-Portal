// ============================================================
// PROJECT REPOSITORY — Database Operations for Projects
// ============================================================
// Handles all database interactions for the projects table
// and related tables (project_members, project_state_transitions).
//
// Implements the REPOSITORY PATTERN — centralizes all SQL
// for project-related data access.
//
// Key features:
//   - Full CRUD with optimistic concurrency control
//   - State transition recording in audit table
//   - Team member management (add/remove with constraints)
//   - Soft-delete only — never hard delete
//   - Transaction support via client parameter
// ============================================================

// Import database functions
const { query, getClient } = require("../config/database");

// Import the Project domain entity
const { Project, ProjectStatus } = require("../entities/Project");

// Import the ProjectMember domain entity
const { ProjectMember } = require("../entities/ProjectMember");

// Import crypto for UUID generation
const crypto = require("crypto");

// Import custom errors
const {
  ProjectNotFoundError,
  ProjectCreationError,
  BusinessRuleViolationError,
} = require("../entities/EntityErrors");

// Import logger for operation tracking
const logger = require("../utils/logger");

// ============================================================
// ProjectRepository class — CRUD + audit for projects
// ============================================================
class ProjectRepository {
  /**
   * Create a new project in DRAFT status.
   * Projects always start as drafts — the state machine
   * controls transitions from there.
   *
   * @param {Object} data - Validated project data
   * @param {string} actorId - Who is creating the project
   * @param {Object} [client] - Optional DB client for transaction
   * @returns {Promise<Project>} The created Project domain object
   */
  static async create(data, actorId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    // Generate a UUID for the new project
    const projectId = crypto.randomUUID();

    // Insert the project in DRAFT status
    const sql = `
      INSERT INTO projects (
        project_id, title, description,
        academic_year, semester,
        start_date, expected_end_date,
        status, created_by, updated_by, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $8, 1)
      RETURNING *
    `;

    try {
      const result = await queryFn(sql, [
        projectId, // $1: project_id UUID
        data.title, // $2: project title
        data.description || "", // $3: description
        data.academicYear, // $4: academic_year
        data.semester, // $5: semester (1 or 2)
        data.startDate || null, // $6: start_date
        data.expectedEndDate || null, // $7: expected_end_date
        actorId, // $8: created_by AND updated_by
      ]);

      // Get the inserted row
      const row = result.rows[0];

      // Log the creation
      logger.info("Project created", {
        projectId,
        title: data.title,
        academicYear: data.academicYear,
        semester: data.semester,
      });

      // Return frozen Project domain object
      return new Project(row);
    } catch (error) {
      // If it's a constraint violation, wrap it in our error type
      throw new ProjectCreationError(
        `Failed to create project: ${error.message}`,
        { title: data.title, detail: error.detail },
      );
    }
  }

  /**
   * Find a project by UUID.
   * Returns null if not found.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<Project|null>}
   */
  static async findById(projectId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT * FROM projects
      WHERE project_id = $1 AND is_deleted = false
    `;

    const result = await queryFn(sql, [projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Project(result.rows[0]);
  }

  /**
   * Update a project's mutable fields with optimistic concurrency.
   * Status changes go through the state machine, not this method.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} updates - Fields to update
   * @param {string} actorId - Who is making the change
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<Project>} Updated Project domain object
   */
  static async update(projectId, updates, actorId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    // Fetch current project for version check
    const current = await ProjectRepository.findById(projectId, client);
    if (!current) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    // Version conflict check
    if (updates.version && updates.version !== current.version) {
      throw new BusinessRuleViolationError(
        `Version conflict: expected ${updates.version}, current ${current.version}`,
        { expected: updates.version, current: current.version },
      );
    }

    // Build dynamic SET clause
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.startDate !== undefined) {
      setClauses.push(`start_date = $${paramIndex++}`);
      values.push(updates.startDate);
    }
    if (updates.expectedEndDate !== undefined) {
      setClauses.push(`expected_end_date = $${paramIndex++}`);
      values.push(updates.expectedEndDate);
    }

    // Always update audit fields and increment version
    setClauses.push(`updated_by = $${paramIndex++}`);
    values.push(actorId);
    setClauses.push(`updated_at = NOW()`);
    setClauses.push(`version = version + 1`);

    // WHERE clause parameters
    values.push(projectId);
    values.push(current.version);

    const sql = `
      UPDATE projects
      SET ${setClauses.join(", ")}
      WHERE project_id = $${paramIndex++}
        AND version = $${paramIndex++}
        AND is_deleted = false
      RETURNING *
    `;

    const result = await queryFn(sql, values);

    if (result.rows.length === 0) {
      throw new BusinessRuleViolationError(
        "Update failed: project may have been modified by another user",
        { projectId, expectedVersion: current.version },
      );
    }

    logger.info("Project updated", {
      projectId,
      version: result.rows[0].version,
    });

    return new Project(result.rows[0]);
  }

  /**
   * Transition a project's status and record it in the audit table.
   * This is called AFTER the state machine validates the transition.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} fromStatus - Current status
   * @param {string} toStatus - New status
   * @param {string} actorId - Who triggered the transition
   * @param {string} reason - Why the transition happened
   * @param {Object} metadata - Additional context
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<Project>} Updated Project domain object
   */
  static async transitionStatus(
    projectId,
    fromStatus,
    toStatus,
    actorId,
    reason = "",
    metadata = {},
    client = null,
  ) {
    const queryFn = client ? client.query.bind(client) : query;

    // Update the project status
    const updateSql = `
      UPDATE projects
      SET status = $1, updated_by = $2, updated_at = NOW(), version = version + 1
      WHERE project_id = $3 AND status = $4 AND is_deleted = false
      RETURNING *
    `;

    const result = await queryFn(updateSql, [
      toStatus,
      actorId,
      projectId,
      fromStatus,
    ]);

    if (result.rows.length === 0) {
      throw new BusinessRuleViolationError(
        `Status transition failed: project may not be in ${fromStatus} status`,
        { projectId, expectedStatus: fromStatus },
      );
    }

    // Record the transition in the audit table
    const auditSql = `
      INSERT INTO project_state_transitions (
        project_id, from_status, to_status,
        transitioned_by, reason, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await queryFn(auditSql, [
      projectId,
      fromStatus,
      toStatus,
      actorId,
      reason,
      JSON.stringify(metadata),
    ]);

    logger.info("Project status transitioned", {
      projectId,
      from: fromStatus,
      to: toStatus,
      actor: actorId,
      reason,
    });

    return new Project(result.rows[0]);
  }

  /**
   * Add a member to a project team.
   * Checks the team size trigger will allow the insert.
   *
   * @param {Object} memberData - { projectId, personId, roleInProject, declaredSharePercentage }
   * @param {string} actorId - Who is adding the member
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<ProjectMember>}
   */
  static async addMember(memberData, actorId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      INSERT INTO project_members (
        project_id, person_id, role_in_project,
        declared_share_percentage, joined_at, created_by
      ) VALUES ($1, $2, $3, $4, NOW(), $5)
      RETURNING *
    `;

    try {
      const result = await queryFn(sql, [
        memberData.projectId,
        memberData.personId,
        memberData.roleInProject || "member",
        memberData.declaredSharePercentage || null,
        actorId,
      ]);

      logger.info("Member added to project", {
        projectId: memberData.projectId,
        personId: memberData.personId,
        role: memberData.roleInProject,
      });

      return new ProjectMember(result.rows[0]);
    } catch (error) {
      // Check if this is the team size trigger error
      if (error.message && error.message.includes("Maximum team size")) {
        throw new BusinessRuleViolationError(error.message, {
          projectId: memberData.projectId,
        });
      }
      // Check for duplicate key (person already a member)
      if (error.code === "23505") {
        throw new BusinessRuleViolationError(
          "Person is already an active member of this project",
          { personId: memberData.personId, projectId: memberData.projectId },
        );
      }
      throw error;
    }
  }

  /**
   * Remove a member from a project team (soft-remove).
   * Sets left_at timestamp — does NOT delete the record.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} personId - UUID of the person leaving
   * @param {string} reason - Why they're leaving
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<boolean>} True if removed
   */
  static async removeMember(projectId, personId, reason = "", client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    // Set left_at on the active membership (left_at IS NULL)
    const sql = `
      UPDATE project_members
      SET left_at = NOW(), left_reason = $3
      WHERE project_id = $1
        AND person_id = $2
        AND left_at IS NULL
      RETURNING *
    `;

    const result = await queryFn(sql, [projectId, personId, reason]);

    if (result.rows.length > 0) {
      logger.info("Member removed from project", {
        projectId,
        personId,
        reason,
      });
    }

    return result.rows.length > 0;
  }

  /**
   * Get all active members of a project.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<Array<ProjectMember>>}
   */
  static async getActiveMembers(projectId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT pm.*, p.display_name, p.person_type
      FROM project_members pm
      JOIN persons p ON pm.person_id = p.person_id
      WHERE pm.project_id = $1 AND pm.left_at IS NULL
      ORDER BY pm.joined_at ASC
    `;

    const result = await queryFn(sql, [projectId]);

    return result.rows.map((row) => new ProjectMember(row));
  }

  /**
   * Count active members in a project.
   * Used by validators before add/remove operations.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<number>}
   */
  static async countActiveMembers(projectId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      SELECT COUNT(*) as count
      FROM project_members
      WHERE project_id = $1 AND left_at IS NULL
    `;

    const result = await queryFn(sql, [projectId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Soft-delete a project.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} actorId - Who is deleting
   * @param {Object} [client] - Optional DB client
   * @returns {Promise<boolean>}
   */
  static async softDelete(projectId, actorId, client = null) {
    const queryFn = client ? client.query.bind(client) : query;

    const sql = `
      UPDATE projects
      SET is_deleted = true, updated_by = $2, updated_at = NOW(), version = version + 1
      WHERE project_id = $1 AND is_deleted = false
      RETURNING *
    `;

    const result = await queryFn(sql, [projectId, actorId]);

    if (result.rows.length > 0) {
      logger.info("Project soft-deleted", { projectId });
    }

    return result.rows.length > 0;
  }

  /**
   * List projects with filtering and pagination.
   *
   * @param {Object} filters - { academicYear, semester, status, createdBy }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<{ projects: Array<Project>, total: number }>}
   */
  static async list(filters = {}, pagination = { limit: 50, offset: 0 }) {
    const conditions = ["is_deleted = false"];
    const values = [];
    let paramIndex = 1;

    if (filters.academicYear) {
      conditions.push(`academic_year = $${paramIndex++}`);
      values.push(filters.academicYear);
    }
    if (filters.semester) {
      conditions.push(`semester = $${paramIndex++}`);
      values.push(filters.semester);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.createdBy) {
      conditions.push(`created_by = $${paramIndex++}`);
      values.push(filters.createdBy);
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM projects WHERE ${conditions.join(" AND ")}`;
    const countResult = await query(countSql, values);
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch page
    const limit = Math.min(pagination.limit || 50, 100);
    const offset = pagination.offset || 0;
    values.push(limit);
    values.push(offset);

    const sql = `
      SELECT * FROM projects
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await query(sql, values);
    const projects = result.rows.map((row) => new Project(row));

    return { projects, total };
  }

  /**
   * Get the state transition history for a project.
   * Useful for auditing and timeline display.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Array>} Transition records in chronological order
   */
  static async getTransitionHistory(projectId) {
    const sql = `
      SELECT * FROM project_state_transitions
      WHERE project_id = $1
      ORDER BY transitioned_at ASC
    `;

    const result = await query(sql, [projectId]);
    return result.rows;
  }
}

// ============================================================
// Export ProjectRepository class
// ============================================================
module.exports = ProjectRepository;
