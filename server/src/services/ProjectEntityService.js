// ============================================================
// PROJECT ENTITY SERVICE — Central Project Orchestrator
// ============================================================
// The MAIN service for all project operations. Orchestrates:
//   - Project creation with initial team assembly
//   - State transitions via the ProjectStateMachine
//   - Team member management with validation
//   - Work log and plan submission
//
// This service coordinates multiple repositories and validators
// within database transactions for atomicity.
//
// CRITICAL: This is the only entry point for project mutations.
// Controllers MUST go through this service — never call
// repositories directly.
// ============================================================

// Import repositories for data access
const ProjectRepository = require("../repositories/ProjectRepository");
const PersonRepository = require("../repositories/PersonRepository");

// Import validators for business rule enforcement
const { TeamSizeValidator } = require("../validators/TeamSizeValidator");
const { MembershipValidator } = require("../validators/MembershipValidator");
const { TemporalValidator } = require("../validators/TemporalValidator");

// Import the state machine for lifecycle management
const { ProjectStateMachine } = require("../entities/ProjectStateMachine");

// Import domain events
const {
  projectCreated,
  projectStateChanged,
  memberAdded,
  memberRemoved,
} = require("../events/EntityEvents");

// Import custom errors
const {
  ProjectNotFoundError,
  FreezeViolationError,
  ImmutableDataError,
} = require("../entities/EntityErrors");

// Import database client for transactions
const { getClient, query } = require("../config/database");

// Import logger
const logger = require("../utils/logger");

// ============================================================
// ProjectEntityService class — the project orchestrator
// ============================================================
class ProjectEntityService {
  /**
   * Create a new project with an initial team.
   * Runs in a TRANSACTION — if member addition fails,
   * the project creation is rolled back too.
   *
   * @param {Object} projectData - { title, description, academicYear, semester, startDate, expectedEndDate }
   * @param {Array<Object>} initialMembers - [{ personId, roleInProject }]
   * @param {string} actorId - Who is creating the project
   * @returns {Promise<{ project: Object, members: Array }>}
   */
  static async createProjectWithTeam(
    projectData,
    initialMembers = [],
    actorId,
  ) {
    // Acquire a database client for the transaction
    const client = await getClient();

    try {
      // Begin the transaction
      await client.query("BEGIN");

      // ---------------------------------------------------------
      // ACTOR RESOLUTION: actorId might be a person_id directly,
      // or an identity_id from the auth system (users table).
      // projects.created_by REFERENCES persons(person_id) so we
      // must resolve to a valid person_id before inserting.
      // ---------------------------------------------------------
      let resolvedActorId = actorId || null;
      if (actorId) {
        const actorLookup = await client.query(
          `SELECT person_id FROM persons WHERE person_id = $1 OR identity_id = $1 LIMIT 1`,
          [actorId],
        );
        resolvedActorId = actorLookup.rows[0]?.person_id || actorId;
      }

      // Validate temporal constraints (dates)
      if (projectData.startDate && projectData.expectedEndDate) {
        TemporalValidator.validateProjectDates(
          projectData.startDate,
          projectData.expectedEndDate,
        );
      }

      // Create the project in DRAFT status
      const project = await ProjectRepository.create(
        projectData,
        resolvedActorId,
        client,
      );

      // Add initial team members (if provided)
      const members = [];
      for (const memberInput of initialMembers) {
        // Validate the person exists and is eligible
        const person = await PersonRepository.findById(
          memberInput.personId,
          client,
        );
        MembershipValidator.validatePersonEligibility(person);

        // Add the member
        const member = await ProjectRepository.addMember(
          {
            projectId: project.projectId,
            personId: memberInput.personId,
            roleInProject: memberInput.roleInProject || "member",
            declaredSharePercentage:
              memberInput.declaredSharePercentage || null,
          },
          resolvedActorId,
          client,
        );

        members.push(member);
      }

      // Commit the transaction — all or nothing
      await client.query("COMMIT");

      // Emit domain event (after commit, not inside transaction)
      const event = projectCreated(project, actorId);
      logger.info("Domain event emitted", {
        eventType: event.type,
        projectId: project.projectId,
      });

      // Return the project and its members
      return { project, members };
    } catch (error) {
      // Rollback on any failure
      await client.query("ROLLBACK");
      logger.error("Project creation failed, transaction rolled back", {
        error: error.message,
        title: projectData.title,
      });
      throw error;
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  }

  /**
   * Transition a project to a new state.
   * Uses the state machine for validation and guard checks.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} targetStatus - Desired new status
   * @param {string} actorId - Who is triggering the transition
   * @param {string} reason - Why the transition is happening
   * @param {Object} context - Additional context for guard conditions
   * @returns {Promise<Object>} Updated project entity
   */
  static async transitionProject(
    projectId,
    targetStatus,
    actorId,
    reason = "",
    context = {},
  ) {
    // Fetch the current project
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    // Check if project is frozen (frozen projects can't transition)
    if (project.isFrozen() && targetStatus !== "archived") {
      throw new FreezeViolationError(
        `Project ${projectId} is frozen and cannot be modified`,
        { frozenAt: project.frozenAt },
      );
    }

    // If transitioning to ACTIVE, count members for the guard
    if (targetStatus === "active") {
      const memberCount = await ProjectRepository.countActiveMembers(projectId);
      context.activeMembers = memberCount;
    }

    // Run the state machine validation (includes guard conditions)
    const transition = ProjectStateMachine.validateTransition(
      project,
      targetStatus,
      context,
    );

    // Execute the transition in the database
    const updated = await ProjectRepository.transitionStatus(
      projectId,
      transition.from,
      transition.to,
      actorId,
      reason,
      context,
    );

    // Emit domain event
    const event = projectStateChanged(
      projectId,
      transition.from,
      transition.to,
      actorId,
      reason,
    );
    logger.info("Domain event emitted", {
      eventType: event.type,
      projectId,
      from: transition.from,
      to: transition.to,
    });

    return updated;
  }

  /**
   * Add a member to a project team.
   * Validates eligibility, duplicates, and team size.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} memberData - { personId, roleInProject, declaredSharePercentage }
   * @param {string} actorId - Who is adding the member
   * @returns {Promise<Object>} Created ProjectMember entity
   */
  static async addMember(projectId, memberData, actorId) {
    // Validate input format
    const validated = MembershipValidator.validateAddMemberInput({
      ...memberData,
      projectId,
    });

    // Fetch the project
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    // Check project allows member changes
    MembershipValidator.validateProjectAcceptsMemberChanges(project);

    // Fetch the person
    const person = await PersonRepository.findById(memberData.personId);

    // Check person is eligible
    MembershipValidator.validatePersonEligibility(person);

    // Check for duplicate membership
    const existingMembers = await ProjectRepository.getActiveMembers(projectId);
    MembershipValidator.validateNotDuplicate(
      memberData.personId,
      existingMembers,
    );

    // Check team size constraint
    TeamSizeValidator.validateCanAddMember(existingMembers.length);

    // All validations passed — resolve actorId to person_id
    // actorId may be a users.internal_user_id, but project_members.created_by REFs persons.person_id
    let resolvedActorId = actorId || null;
    if (actorId) {
      const { getClient } = require("../config/database");
      const client = await getClient();
      try {
        const actorLookup = await client.query(
          `SELECT person_id FROM persons WHERE person_id = $1 OR identity_id = $1 LIMIT 1`,
          [actorId],
        );
        resolvedActorId = actorLookup.rows[0]?.person_id || actorId;
      } finally {
        client.release();
      }
    }

    // Add the member
    const member = await ProjectRepository.addMember(
      {
        projectId,
        personId: memberData.personId,
        roleInProject: validated.roleInProject,
        declaredSharePercentage: validated.declaredSharePercentage,
      },
      resolvedActorId,
    );

    // Emit domain event
    const event = memberAdded(
      projectId,
      memberData.personId,
      validated.roleInProject,
      actorId,
    );
    logger.info("Domain event emitted", { eventType: event.type, projectId });

    return member;
  }

  /**
   * Remove a member from a project team.
   * Validates team size constraint after removal.
   *
   * @param {string} projectId - UUID of the project
   * @param {string} personId - UUID of the person leaving
   * @param {string} actorId - Who is removing the member
   * @param {string} reason - Why the member is being removed
   * @returns {Promise<boolean>} True if removed
   */
  static async removeMember(projectId, personId, actorId, reason = "") {
    // Fetch the project
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    // Check project allows changes
    MembershipValidator.validateProjectAcceptsMemberChanges(project);

    // Check team size constraint after removal
    const currentCount = await ProjectRepository.countActiveMembers(projectId);
    TeamSizeValidator.validateCanRemoveMember(currentCount, project.status);

    // Perform the removal
    const removed = await ProjectRepository.removeMember(
      projectId,
      personId,
      reason,
    );

    // Emit domain event if removal was successful
    if (removed) {
      const event = memberRemoved(projectId, personId, reason, actorId);
      logger.info("Domain event emitted", { eventType: event.type, projectId });
    }

    return removed;
  }

  /**
   * Get a project with its team members.
   *
   * @param {string} projectId - UUID of the project
   * @returns {Promise<{ project: Object, members: Array }>}
   */
  static async getProjectWithTeam(projectId) {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    const members = await ProjectRepository.getActiveMembers(projectId);

    return { project, members };
  }

  /**
   * Update project details (title, description, dates).
   * Only allowed for DRAFT and ACTIVE projects.
   *
   * @param {string} projectId - UUID of the project
   * @param {Object} updates - Fields to update
   * @param {string} actorId - Who is making the change
   * @returns {Promise<Object>} Updated project entity
   */
  static async updateProject(projectId, updates, actorId) {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    // Check project is modifiable
    if (!project.isModifiable()) {
      throw new ImmutableDataError(
        `Project ${projectId} is in ${project.status} status and cannot be modified`,
      );
    }

    return ProjectRepository.update(projectId, updates, actorId);
  }

  /**
   * List projects with filters.
   *
   * @param {Object} filters - { academicYear, semester, status }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<{ projects: Array, total: number }>}
   */
  static async listProjects(filters = {}, pagination = {}) {
    return ProjectRepository.list(filters, pagination);
  }

  /**
   * List projects where a specific person is an active team member.
   * Used for scoped project views (students/faculty see only their projects).
   *
   * @param {string} personId - PEMM person UUID
   * @param {Object} filters - { academicYear, semester, status }
   * @param {Object} pagination - { limit, offset }
   * @returns {Promise<{ projects: Array, total: number }>}
   */
  static async listProjectsByMember(personId, filters = {}, pagination = {}) {
    return ProjectRepository.listByMember(personId, filters, pagination);
  }

  /**
   * Get the full transition history (audit trail) for a project.
   *
   * @param {string} projectId - UUID
   * @returns {Promise<Array>}
   */
  static async getProjectHistory(projectId) {
    const project = await ProjectRepository.findById(projectId);
    if (!project) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }

    return ProjectRepository.getTransitionHistory(projectId);
  }
}

// ============================================================
// Export ProjectEntityService class
// ============================================================
module.exports = ProjectEntityService;
