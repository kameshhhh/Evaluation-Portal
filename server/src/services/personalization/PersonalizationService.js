// ============================================================
// PERSONALIZATION SERVICE — Orchestrator for Dashboard Data
// ============================================================
// This is the main entry point for all personalization logic.
// It coordinates between:
//   - PersonProfileLinker (auth → PEMM identity bridge)
//   - DashboardBuilder (role-specific payload construction)
//   - PersonalizationCache (in-memory TTL caching)
//
// ONE METHOD TO RULE THEM ALL:
//   getDashboardData(authUser) → returns complete dashboard payload
//
// FLOW:
//   1. Check cache for existing dashboard data
//   2. If miss: Link auth user to PEMM person
//   3. If linked: Fetch projects, stats, evaluations
//   4. Build role-specific dashboard via DashboardBuilder
//   5. Cache the result and return it
//
// SECURITY:
//   - Only processes the authenticated user's data
//   - Never exposes raw DB rows to the caller
//   - All data access goes through scoped queries
// ============================================================

// Import the ProfileLinker for auth → PEMM identity bridging
const PersonProfileLinker = require("./PersonProfileLinker");

// Import the DashboardBuilder for role-specific payload construction
const DashboardBuilder = require("./DashboardBuilder");

// Import the cache singleton for in-memory TTL caching
const { PersonalizationCache } = require("./PersonalizationCache");

// Import database query function for aggregation queries
const { query } = require("../../config/database");

// Import logger for operation tracking and performance metrics
const logger = require("../../utils/logger");

// Import name extractor for better display name fallback
const {
  extractDisplayNameFromEmail,
} = require("./academic/AcademicIdentityParser");

// ============================================================
// PersonalizationService — Main orchestrator
// ============================================================
class PersonalizationService {
  // ============================================================
  // Constructor — Initialize with dependency references
  // ============================================================
  constructor() {
    // Instance of PersonProfileLinker for auth-to-PEMM bridging
    this.profileLinker = new PersonProfileLinker();

    // Reference to the singleton cache instance
    this.cache = PersonalizationCache;
  }

  // ============================================================
  // GET DASHBOARD DATA — Main entry point
  // ============================================================
  /**
   * Get the complete personalized dashboard data for a user.
   *
   * This is THE method the controller calls. It handles the
   * entire pipeline: cache check → identity linking → data fetch
   * → dashboard build → cache store.
   *
   * @param {Object} authUser - From req.user (set by auth middleware)
   * @param {string} authUser.userId - Internal user UUID
   * @param {string} authUser.email - Normalized email
   * @param {string} authUser.role - Auth role (student/faculty/admin)
   * @param {string} [authUser.name] - Display name from Google
   * @returns {Promise<Object>} Complete dashboard payload
   */
  async getDashboardData(authUser) {
    // Build the cache key from the user's auth ID
    const cacheKey = `dashboard:${authUser.userId}`;

    // ---------------------------------------------------------
    // STEP 1: Check cache
    // If we have a recent dashboard for this user, return it
    // ---------------------------------------------------------
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Cache hit — log and return immediately
      logger.debug("PersonalizationService: Cache hit", {
        userId: authUser.userId,
      });
      return cached;
    }

    // ---------------------------------------------------------
    // STEP 2: Link auth user to PEMM person
    // This bridges the authentication identity to the college entity
    // ---------------------------------------------------------
    logger.debug("PersonalizationService: Cache miss, building dashboard", {
      userId: authUser.userId,
    });

    // Normalize the auth user object for ProfileLinker
    // Auth middleware sets req.user = { userId, email, role, tokenId }
    // ProfileLinker expects { id, email, role, name }
    const normalizedAuthUser = {
      id: authUser.userId, // ProfileLinker uses 'id' not 'userId'
      email: authUser.email, // Email stays the same
      role: authUser.role, // Role stays the same
      name: authUser.name || extractDisplayNameFromEmail(authUser.email), // Google name or email-extracted
    };

    // Link auth identity to PEMM person
    const userContext =
      await this.profileLinker.linkAuthToPerson(normalizedAuthUser);

    // ---------------------------------------------------------
    // STEP 3: Route to appropriate dashboard builder
    // If profile is not linked, show the default "complete profile" dashboard
    // If linked, build the role-specific dashboard with real data
    // ---------------------------------------------------------
    let dashboardData;

    if (!userContext.profileComplete) {
      // ============================================================
      // ADMIN OVERRIDE: Admins don't require PEMM profiles
      // System administrators may use non-institutional emails
      // and won't have a linked person record. Route them directly
      // to the admin dashboard with auth-only context.
      // ============================================================
      if (authUser.role === "admin") {
        userContext.personType = "admin";
        userContext.displayName = authUser.name || authUser.email;
        dashboardData = await this._buildAdminDashboard(userContext);
      } else {
        // User has no PEMM profile yet — show onboarding dashboard
        dashboardData = DashboardBuilder.buildDefaultDashboard(userContext);
      }
    } else {
      // Profile is linked — build role-specific dashboard
      dashboardData = await this._buildRoleDashboard(userContext);
    }

    // ---------------------------------------------------------
    // STEP 4: Add metadata to the dashboard payload
    // Timestamp and cache control info for the frontend
    // ---------------------------------------------------------
    dashboardData.meta = {
      generatedAt: new Date().toISOString(), // When this data was built
      cacheMaxAge: 60, // Seconds until next refresh recommended
      userId: authUser.userId, // For frontend cache key management
    };

    // ---------------------------------------------------------
    // STEP 5: Cache the result before returning
    // ---------------------------------------------------------
    this.cache.set(cacheKey, dashboardData);

    // Log successful dashboard generation
    logger.info("PersonalizationService: Dashboard generated", {
      userId: authUser.userId,
      type: dashboardData.type,
      profileComplete: userContext.profileComplete,
    });

    // Return the complete dashboard payload
    return dashboardData;
  }

  // ============================================================
  // PRIVATE: Build role-specific dashboard with data
  // ============================================================
  /**
   * Build a role-specific dashboard by fetching relevant data
   * and passing it to the appropriate DashboardBuilder method.
   *
   * Routes based on personType:
   *   - student → fetch projects + team counts → student dashboard
   *   - faculty → fetch eval sessions + dept stats → faculty dashboard
   *   - admin → fetch system stats + dept breakdown → admin dashboard
   *
   * @param {Object} userContext - Combined auth + PEMM context
   * @returns {Promise<Object>} Role-specific dashboard payload
   * @private
   */
  async _buildRoleDashboard(userContext) {
    // Determine which builder to use based on personType
    const role = userContext.personType;

    // Log the routing decision
    logger.debug("PersonalizationService: Routing to dashboard builder", {
      personId: userContext.personId,
      role,
    });

    // ---------------------------------------------------------
    // STUDENT DASHBOARD
    // ---------------------------------------------------------
    if (role === "student") {
      return this._buildStudentDashboard(userContext);
    }

    // ---------------------------------------------------------
    // FACULTY DASHBOARD
    // ---------------------------------------------------------
    if (role === "faculty") {
      return this._buildFacultyDashboard(userContext);
    }

    // ---------------------------------------------------------
    // ADMIN DASHBOARD
    // ---------------------------------------------------------
    if (role === "admin") {
      return this._buildAdminDashboard(userContext);
    }

    // ---------------------------------------------------------
    // FALLBACK: Unknown role → default dashboard
    // This should not happen in normal flow, but handles edge cases
    // ---------------------------------------------------------
    logger.warn("PersonalizationService: Unknown personType, using default", {
      personType: role,
      personId: userContext.personId,
    });
    return DashboardBuilder.buildDefaultDashboard(userContext);
  }

  // ============================================================
  // PRIVATE: Student dashboard data assembly
  // ============================================================
  /**
   * Fetch student-specific data and build the student dashboard.
   *
   * Data fetched:
   *   1. Projects the student belongs to (via ProfileLinker)
   *   2. Team member counts per project (via ProfileLinker)
   *   3. Upcoming evaluations (direct query)
   *
   * @param {Object} userContext - Combined auth + PEMM context
   * @returns {Promise<Object>} Student dashboard payload
   * @private
   */
  async _buildStudentDashboard(userContext) {
    // Fetch projects, evaluations, assigned evaluations, and faculty schedules in parallel
    const [projects, upcomingEvaluations, assignedEvaluations, facultySchedules, facultyEvaluationAssignments] =
      await Promise.all([
        // Fetch all active project memberships for this student
        this.profileLinker.getPersonProjects(userContext.personId),
        // Fetch upcoming evaluation sessions
        this._getUpcomingEvaluations(),
        // Fetch evaluations specifically assigned to this student by faculty (PEER/COHORT)
        this._getAssignedEvaluations(userContext.personId),
        // Fetch faculty evaluation schedules (FACULTY -> STUDENT)
        this._getFacultyEvaluations(userContext.personId),
        // Fetch new Credibility Engine assignments (Faculty Evaluation Sessions)
        this._getFacultyEvaluationAssignments(userContext.personId),
      ]);

    // Extract project IDs for team count lookup
    const projectIds = projects.map((p) => p.project_id);

    // Fetch team member counts for all projects in one query
    const teamCounts =
      await this.profileLinker.getProjectTeamCounts(projectIds);

    // Build the student dashboard structure
    const dashboard = DashboardBuilder.buildStudentDashboard(
      userContext, // Combined user context
      projects, // Project membership records
      teamCounts, // Map of projectId → team size
    );

    // Inject upcoming evaluations into the sections
    // DashboardBuilder creates empty array; we populate here
    dashboard.sections.upcomingEvaluations = upcomingEvaluations;

    // Inject faculty-assigned evaluations for this specific student (PEER/COHORT)
    // MERGE with new Credibility Engine assignments
    dashboard.sections.assignedEvaluations = [
      ...assignedEvaluations,
      ...facultyEvaluationAssignments
    ];

    // Inject faculty evaluation schedules (FACULTY -> STUDENT)
    dashboard.sections.facultySchedules = facultySchedules;

    // Return the complete student dashboard
    return dashboard;
  }

  // ============================================================
  // PRIVATE: Faculty dashboard data assembly
  // ============================================================
  /**
   * Fetch faculty-specific data and build the faculty dashboard.
   *
   * Data fetched:
   *   1. Department statistics (students, projects in their dept)
   *   2. Evaluation sessions (current and upcoming)
   *
   * @param {Object} userContext - Combined auth + PEMM context
   * @returns {Promise<Object>} Faculty dashboard payload
   * @private
   */
  async _buildFacultyDashboard(userContext) {
    // Fetch department stats, evaluation sessions, scarcity sessions, students,
    // AND faculty session planner assignments in parallel
    const [
      departmentStats,
      evaluationSessions,
      scarcitySessions,
      departmentStudents,
      sessionPlannerSessions,
    ] = await Promise.all([
      // Get student and project counts across ALL departments
      // Faculty can see all students — not restricted to their own dept
      this._getDepartmentStats(null),
      // Get evaluation sessions (open/in-progress for review)
      this._getEvaluationSessions(),
      // Get scarcity-enabled evaluation sessions with pool info
      this._getScarcityEvaluations(),
      // Get ALL student records — faculty visibility is not dept-restricted
      this._getDepartmentStudents(null),
      // Get sessions where this faculty has session planner assignments
      this._getFacultySessionPlannerSessions(userContext.personId),
    ]);

    // Filter scarcity sessions for faculty view
    // Faculty should only see project_review sessions (SRS §4.1)
    // Exclude: peer_evaluation (SRS §4.5), faculty_assessment (cohort-specific)
    const facultyScarcitySessions = scarcitySessions.filter(
      (session) => session.session_type === "project_review",
    );

    // Build the faculty dashboard structure
    const dashboard = DashboardBuilder.buildFacultyDashboard(
      userContext, // Combined user context
      departmentStats, // Department statistics
      evaluationSessions, // Evaluation session records
      facultyScarcitySessions, // Scarcity sessions (project_review only)
      departmentStudents, // Student list in the department
    );

    // Inject session planner sessions (from faculty_evaluation_sessions)
    // These are the sessions where this faculty has been assigned students
    dashboard.sections.sessionPlannerSessions = sessionPlannerSessions;

    return dashboard;
  }

  // ============================================================
  // PRIVATE: Admin dashboard data assembly
  // ============================================================
  /**
   * Fetch admin-specific data and build the admin dashboard.
   *
   * Data fetched:
   *   1. System-wide statistics (total users, projects, etc.)
   *   2. Per-department breakdown (student/project counts per dept)
   *
   * @param {Object} userContext - Combined auth + PEMM context
   * @returns {Promise<Object>} Admin dashboard payload
   * @private
   */
  async _buildAdminDashboard(userContext) {
    // Fetch system stats and department breakdown in parallel
    const [systemStats, departmentBreakdown] = await Promise.all([
      // Get system-wide aggregate statistics
      this._getSystemStats(),
      // Get per-department student and project counts
      this._getDepartmentBreakdown(),
    ]);

    // Build the admin dashboard structure
    return DashboardBuilder.buildAdminDashboard(
      userContext, // Combined user context
      systemStats, // System-wide statistics
      departmentBreakdown, // Per-department breakdown
    );
  }

  // ============================================================
  // DATA FETCHING HELPERS — Direct database queries
  // ============================================================

  /**
   * Get upcoming evaluation sessions.
   *
   * Fetches evaluation sessions that are relevant for the current
   * academic period. Used by both student and faculty dashboards.
   *
   * @returns {Promise<Array>} Array of evaluation session records
   * @private
   */
  async _getUpcomingEvaluations() {
    try {
      // Query for open/upcoming evaluation sessions
      const sql = `
        SELECT
          session_id,
          session_type,
          intent,
          status,
          evaluation_window_start,
          evaluation_window_end,
          created_at
        FROM evaluation_sessions
        WHERE status IN ('draft', 'open', 'in_progress')
        ORDER BY evaluation_window_start ASC
        LIMIT 10
      `;

      // Execute the query
      const result = await query(sql);

      // Return the rows as-is — DashboardBuilder will format them
      return result.rows;
    } catch (error) {
      // Log error but don't crash the dashboard for missing evaluations
      logger.warn("PersonalizationService: Failed to fetch evaluations", {
        error: error.message,
      });
      // Return empty array — dashboard still works without evaluations
      return [];
    }
  }

  /**
   * Get department-level statistics.
   *
   * Counts students and projects in a specific department.
   * Used by the faculty dashboard.
   *
   * @param {string} departmentCode - Department code (CSE/ECE/MECH)
   * @returns {Promise<Object>} Department statistics
   * @private
   */
  async _getDepartmentStats(departmentCode) {
    try {
      // Count students — if departmentCode is null, count ALL students
      // Faculty dashboard passes null to see all students across departments
      const studentSql = departmentCode
        ? `SELECT COUNT(*) as count
           FROM persons
           WHERE department_code = $1
             AND person_type = 'student'
             AND is_deleted = false`
        : `SELECT COUNT(*) as count
           FROM persons
           WHERE person_type = 'student'
             AND is_deleted = false`;

      // Count projects — if departmentCode is null, count ALL projects
      const projectSql = departmentCode
        ? `SELECT
             COUNT(DISTINCT p.project_id) as total_count,
             COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.project_id END) as active_count,
             COUNT(DISTINCT CASE WHEN p.status = 'under_review' THEN p.project_id END) as submitted_count
           FROM projects p
           INNER JOIN project_members pm ON p.project_id = pm.project_id
           INNER JOIN persons per ON pm.person_id = per.person_id
           WHERE per.department_code = $1
             AND pm.left_at IS NULL
             AND p.is_deleted = false`
        : `SELECT
             COUNT(DISTINCT p.project_id) as total_count,
             COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.project_id END) as active_count,
             COUNT(DISTINCT CASE WHEN p.status = 'under_review' THEN p.project_id END) as submitted_count
           FROM projects p
           INNER JOIN project_members pm ON p.project_id = pm.project_id
           WHERE pm.left_at IS NULL
             AND p.is_deleted = false`;

      // Execute both queries in parallel
      // Pass departmentCode as param only when filtering by department
      const params = departmentCode ? [departmentCode] : [];
      const [studentResult, projectResult] = await Promise.all([
        query(studentSql, params),
        query(projectSql, params),
      ]);

      // Parse and return the combined statistics
      return {
        studentCount: parseInt(studentResult.rows[0]?.count, 10) || 0,
        totalProjectCount:
          parseInt(projectResult.rows[0]?.total_count, 10) || 0,
        activeProjectCount:
          parseInt(projectResult.rows[0]?.active_count, 10) || 0,
        submittedCount:
          parseInt(projectResult.rows[0]?.submitted_count, 10) || 0,
      };
    } catch (error) {
      // Log error but return default zero stats
      logger.warn("PersonalizationService: Failed to fetch department stats", {
        departmentCode,
        error: error.message,
      });
      return {
        studentCount: 0,
        totalProjectCount: 0,
        activeProjectCount: 0,
        submittedCount: 0,
      };
    }
  }

  /**
   * Get evaluation sessions for faculty review.
   *
   * Returns evaluation sessions relevant to faculty (used by faculty dashboard).
   * Faculty can see: project_review (SRS §4.1 — faculty evaluates projects)
   * Faculty should NOT see:
   *   - peer_evaluation (SRS §4.5 — students evaluating each other)
   *   - faculty_assessment (cohort-specific, accessed via My Assignments)
   * Includes both current and upcoming sessions.
   *
   * @returns {Promise<Array>} Array of evaluation sessions
   * @private
   */
  async _getEvaluationSessions() {
    try {
      // Query non-closed evaluation sessions that are relevant to faculty
      // Only show project_review sessions (SRS §4.1)
      // faculty_assessment sessions are accessed via cohort assignments, not dashboard
      const sql = `
        SELECT
          session_id,
          session_type,
          intent,
          status,
          evaluation_window_start,
          evaluation_window_end,
          created_at
        FROM evaluation_sessions
        WHERE status != 'closed'
          AND session_type = 'project_review'
        ORDER BY created_at DESC
        LIMIT 20
      `;

      // Execute the query
      const result = await query(sql);

      // Return the evaluation session rows
      return result.rows;
    } catch (error) {
      // Log and return empty list — dashboard still works
      logger.warn("PersonalizationService: Failed to fetch eval sessions", {
        error: error.message,
      });
      return [];
    }
  }

  // ============================================================
  // PRIVATE: Fetch scarcity evaluation sessions
  // ============================================================
  /**
   * Get evaluation sessions that have scarcity allocation enabled.
   *
   * Fetches sessions where scarcity_pool_size is configured,
   * along with evaluator count for each session. Used by both
   * faculty and student dashboards to show scarcity evaluation cards.
   *
   * @returns {Promise<Array>} Array of scarcity evaluation sessions
   * @private
   */
  async _getScarcityEvaluations() {
    try {
      // Query evaluation sessions with scarcity pool configured
      // Join with scarcity_allocations to get evaluator counts
      const sql = `
        SELECT
          es.session_id,
          es.session_type,
          es.intent,
          es.status,
          es.scarcity_pool_size,
          es.evaluation_mode,
          es.evaluation_window_start,
          es.evaluation_window_end,
          COUNT(DISTINCT sa.evaluator_id) as evaluator_count
        FROM evaluation_sessions es
        LEFT JOIN scarcity_allocations sa
          ON es.session_id = sa.session_id
        WHERE es.scarcity_pool_size IS NOT NULL
          AND es.status IN ('draft', 'open', 'in_progress', 'closed', 'locked', 'aggregated')
        GROUP BY es.session_id
        ORDER BY es.created_at DESC
        LIMIT 15
      `;

      // Execute the query
      const result = await query(sql);

      // Return the scarcity session rows
      return result.rows;
    } catch (error) {
      // Log error but don't crash the dashboard
      logger.warn(
        "PersonalizationService: Failed to fetch scarcity evaluations",
        {
          error: error.message,
        },
      );
      // Return empty array — dashboard still works without scarcity data
      return [];
    }
  }

  /**
   * Get system-wide statistics for admin dashboard.
   *
   * Counts total users, persons, projects across the entire system.
   * Used exclusively by the admin dashboard.
   *
   * @returns {Promise<Object>} System-wide statistics
   * @private
   */
  async _getSystemStats() {
    try {
      // Run all count queries in parallel
      const [usersResult, personsResult, projectsResult] = await Promise.all([
        // Count total auth users
        query("SELECT COUNT(*) as count FROM users WHERE is_active = true"),
        // Count total PEMM persons
        query("SELECT COUNT(*) as count FROM persons WHERE is_deleted = false"),
        // Count projects with status breakdown
        query(`
          SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
            COUNT(CASE WHEN frozen_at IS NOT NULL THEN 1 END) as frozen
          FROM projects
          WHERE is_deleted = false
        `),
      ]);

      // Parse and return the combined system statistics
      return {
        totalUsers: parseInt(usersResult.rows[0]?.count, 10) || 0,
        totalPersons: parseInt(personsResult.rows[0]?.count, 10) || 0,
        totalProjects: parseInt(projectsResult.rows[0]?.total, 10) || 0,
        activeProjects: parseInt(projectsResult.rows[0]?.active, 10) || 0,
        frozenProjects: parseInt(projectsResult.rows[0]?.frozen, 10) || 0,
        lastIntegrityCheck: null, // Will be populated when integrity checks run
      };
    } catch (error) {
      // Log and return zeroed stats
      logger.warn("PersonalizationService: Failed to fetch system stats", {
        error: error.message,
      });
      return {
        totalUsers: 0,
        totalPersons: 0,
        totalProjects: 0,
        activeProjects: 0,
        frozenProjects: 0,
        lastIntegrityCheck: null,
      };
    }
  }

  /**
   * Get per-department student and project breakdown.
   *
   * Used by admin dashboard to show a department-level view.
   * Returns an array of objects with department_code, student_count, project_count.
   *
   * @returns {Promise<Array>} Per-department breakdown
   * @private
   */
  async _getDepartmentBreakdown() {
    try {
      // Aggregate students and projects per department in a single query
      const sql = `
        SELECT
          per.department_code,
          COUNT(DISTINCT per.person_id) as student_count,
          COUNT(DISTINCT pm.project_id) as project_count
        FROM persons per
        LEFT JOIN project_members pm
          ON per.person_id = pm.person_id AND pm.left_at IS NULL
        WHERE per.is_deleted = false
          AND per.person_type = 'student'
        GROUP BY per.department_code
        ORDER BY per.department_code
      `;

      // Execute the query
      const result = await query(sql);

      // Return the department rows
      return result.rows;
    } catch (error) {
      // Log and return empty array
      logger.warn(
        "PersonalizationService: Failed to fetch department breakdown",
        {
          error: error.message,
        },
      );
      return [];
    }
  }

  // ============================================================
  // PRIVATE: Fetch students in a department
  // ============================================================
  /**
   * Get a list of actual student records in a specific department.
   *
   * Used by the faculty dashboard to show students they can
   * select for evaluation sessions.
   *
   * @param {string} departmentCode - Department code (CSE/ECE/MECH)
   * @returns {Promise<Array>} Array of student records
   * @private
   */
  async _getDepartmentStudents(departmentCode) {
    try {
      // Query students from the persons table, joined with users
      // for email and last login. Also counts active project memberships.
      //
      // NOTE: u.last_login_at was added by migration 011. If the
      // migration hasn't run yet, the COALESCE wrapping handles
      // potential NULL gracefully. The column itself must exist —
      // run 011_fix_person_data_sync.sql to add it.
      //
      // JOINS:
      //   persons → users (for email + last_login_at)
      //   persons → project_members (for project count)
      //
      // FILTERS:
      //   - person_type = 'student' (exclude faculty/admin)
      //   - is_deleted = false (exclude soft-deleted persons)
      //   - Optional: department_code filter for faculty's dept
      const sql = `
        SELECT
          p.person_id,
          p.display_name,
          p.department_code,
          p.admission_year,
          p.graduation_year,
          p.status,
          u.normalized_email,
          u.last_login_at,
          COALESCE(proj.project_count, 0) AS project_count
        FROM persons p
        LEFT JOIN users u ON p.identity_id = u.internal_user_id
        LEFT JOIN (
          SELECT person_id, COUNT(DISTINCT project_id) AS project_count
          FROM project_members
          WHERE left_at IS NULL
          GROUP BY person_id
        ) proj ON p.person_id = proj.person_id
        WHERE p.person_type = 'student'
          AND p.is_deleted = false
          AND p.status = 'active'
          ${departmentCode ? "AND p.department_code = $1" : ""}
        ORDER BY p.display_name ASC
        LIMIT 200
      `;

      const params = departmentCode ? [departmentCode] : [];
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.warn(
        "PersonalizationService: Failed to fetch department students",
        {
          departmentCode,
          error: error.message,
        },
      );
      return [];
    }
  }

  // ============================================================
  // PRIVATE: Fetch evaluations assigned to a specific student
  // ============================================================
  /**
   * Get evaluation sessions where the student has been selected
   * as a target by faculty. These are stored in the
   * frozen_entities JSONB array on evaluation_sessions.
   *
   * @param {string} personId - The student's person_id UUID
   * @returns {Promise<Array>} Array of assigned evaluation sessions
   * @private
   */
  async _getAssignedEvaluations(personId) {
    try {
      // Query sessions where this student's person_id is in frozen_entities
      // frozen_entities is a JSONB array like ["uuid1", "uuid2", ...]
      const sql = `
        SELECT
          es.session_id,
          es.session_type,
          es.intent,
          es.status,
          es.evaluation_window_start,
          es.evaluation_window_end,
          es.scarcity_pool_size,
          es.evaluation_mode,
          es.created_at,
          creator.display_name AS created_by_name
        FROM evaluation_sessions es
        LEFT JOIN persons creator ON es.created_by = creator.person_id
        WHERE es.frozen_entities @> $1::jsonb
          AND es.status IN ('draft', 'scheduled', 'open', 'in_progress', 'closed', 'locked', 'aggregated')
        ORDER BY es.evaluation_window_start ASC
      `;

      // Pass the personId wrapped in a JSON array for @> containment check
      const result = await query(sql, [JSON.stringify([personId])]);
      return result.rows;
    } catch (error) {
      logger.warn(
        "PersonalizationService: Failed to fetch assigned evaluations",
        {
          personId,
          error: error.message,
        },
      );
      return [];
    }
  }

  // ============================================================
  // CACHE INVALIDATION METHODS
  // ============================================================

  /**
   * Invalidate cached dashboard for a specific user.
   *
   * Call this when a mutation occurs that affects a user's dashboard:
   *   - User joins/leaves a project
   *   - User's profile is updated
   *   - Evaluation session changes
   *
   * @param {string} userId - Auth user ID to invalidate
   */
  invalidateUserCache(userId) {
    // Build the same cache key used in getDashboardData
    const cacheKey = `dashboard:${userId}`;
    // Remove the cached entry
    this.cache.invalidate(cacheKey);
    // Log the invalidation
    logger.debug("PersonalizationService: Cache invalidated for user", {
      userId,
    });
  }

  /**
  // ============================================================
  // PRIVATE: Fetch faculty session planner sessions
  // ============================================================
  /**
   * Get sessions where this faculty has been assigned students
   * via the session planner (faculty_evaluation_sessions).
   *
   * @param {string} personId - The faculty's person_id UUID
   * @returns {Promise<Array>} Array of sessions with student details
   * @private
   */
  async _getFacultySessionPlannerSessions(personId) {
    try {
      // Get distinct sessions where this faculty has assignments
      const sessionsResult = await query(
        `SELECT DISTINCT
           fes.id AS session_id,
           fes.title,
           fes.status,
           fes.academic_year,
           fes.semester,
           fes.venue,
           fes.session_date,
           fes.session_time,
           fes.opens_at,
           fes.closes_at,
           fes.preferred_rubric_ids,
           fes.min_judges,
           fes.created_at,
           COUNT(spa.id) OVER (PARTITION BY fes.id) AS assignment_count,
           COUNT(CASE WHEN spa.marks_submitted_at IS NOT NULL THEN 1 END) OVER (PARTITION BY fes.id) AS evaluated_count
         FROM session_planner_assignments spa
         JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
         WHERE spa.faculty_id = $1
           AND spa.status != 'removed'
         ORDER BY fes.created_at DESC`,
        [personId]
      );

      // Deduplicate session rows (window functions cause duplication)
      const seen = new Set();
      const sessions = [];
      for (const row of sessionsResult.rows) {
        if (!seen.has(row.session_id)) {
          seen.add(row.session_id);
          sessions.push(row);
        }
      }

      // For each session, get assigned students
      const result = [];
      for (const sess of sessions) {
        const studentsResult = await query(
          `SELECT
             spa.id AS assignment_id,
             spa.student_id,
             spa.status AS assignment_status,
             spa.marks,
             spa.feedback,
             spa.marks_submitted_at,
             p.display_name,
             p.department_code,
             p.admission_year,
             sts.track
           FROM session_planner_assignments spa
           JOIN persons p ON p.person_id = spa.student_id
           LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
           WHERE spa.session_id = $1
             AND spa.faculty_id = $2
             AND spa.status != 'removed'
           ORDER BY p.display_name`,
          [sess.session_id, personId]
        );

        result.push({
          sessionId: sess.session_id,
          title: sess.title,
          status: sess.status,
          academicYear: sess.academic_year,
          semester: sess.semester,
          venue: sess.venue,
          sessionDate: sess.session_date,
          sessionTime: sess.session_time,
          opensAt: sess.opens_at,
          closesAt: sess.closes_at,
          rubricIds: sess.preferred_rubric_ids,
          minJudges: sess.min_judges,
          assignmentCount: parseInt(sess.assignment_count),
          evaluatedCount: parseInt(sess.evaluated_count),
          students: studentsResult.rows.map(s => ({
            assignmentId: s.assignment_id,
            studentId: s.student_id,
            displayName: s.display_name,
            departmentCode: s.department_code,
            admissionYear: s.admission_year,
            track: s.track,
            status: s.assignment_status,
            marks: s.marks,
            feedback: s.feedback,
            marksSubmittedAt: s.marks_submitted_at,
          })),
        });
      }

      return result;
    } catch (error) {
      logger.warn("PersonalizationService: Failed to fetch faculty session planner sessions", {
        personId,
        error: error.message,
      });
      return [];
    }
  }

  // ============================================================
  // PRIVATE: Fetch faculty evaluation schedules
  // ============================================================
  /**
   * Get faculty evaluation schedules for a student.
   *
   * Fetches the specific slots where a faculty member will evaluate
   * this student (date, time, venue).
   *
   * @param {string} personId - The student's person_id UUID
   * @returns {Promise<Array>} Array of scheduled evaluations
   * @private
   */
  async _getFacultyEvaluations(personId) {
    try {
      const sql = `
        SELECT
          es.id,
          es.session_id,
          fes.title AS session_title,
          es.faculty_id,
          f.display_name AS faculty_name,
          f.department_code AS faculty_department,
          es.scheduled_date,
          es.scheduled_time,
          es.venue,
          es.updated_at
        FROM evaluation_schedules es
        JOIN faculty_evaluation_sessions fes ON fes.id = es.session_id
        JOIN persons f ON f.person_id = es.faculty_id
        WHERE es.student_id = $1
        ORDER BY es.scheduled_date ASC, es.scheduled_time ASC
      `;

      const result = await query(sql, [personId]);
      return result.rows;
    } catch (error) {
      logger.warn(
        "PersonalizationService: Failed to fetch faculty evaluations",
        {
          personId,
          error: error.message,
        },
      );
      return [];
    }
  }

  // ============================================================
  // PRIVATE: Fetch Faculty Evaluation Assignments (Credibility Engine)
  // ============================================================
  /**
   * Get assignments from the new Credibility Engine (faculty_evaluation_sessions).
   *
   * @param {string} personId - The student's person_id
   * @returns {Promise<Array>} Array of assignments with status and results
   * @private
   */
  async _getFacultyEvaluationAssignments(personId) {
    try {
      const sql = `
        SELECT
          spa.id as assignment_id,
          fes.id as session_id,
          fes.title as cohort_name,
          'faculty_evaluation' as target_type,
          spa.status as assignment_status,
          fes.closes_at as deadline,
          fes.status as session_status,
          fsr.normalized_score,
          fsr.confidence_score,
          fsr.finalized_at,
          -- scale_max = rubric_count × 5  (fallback to 5 for no-rubric sessions)
          GREATEST(
            COALESCE(jsonb_array_length(fes.preferred_rubric_ids), 0), 1
          ) * 5 AS scale_max
        FROM session_planner_assignments spa
        JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
        LEFT JOIN final_student_results fsr ON fsr.session_id = fes.id AND fsr.student_id = spa.student_id
        WHERE spa.student_id = $1
          AND spa.status != 'removed'
          AND fes.status NOT IN ('archived', 'ARCHIVED')
        ORDER BY fes.closes_at ASC
      `;
      const result = await query(sql, [personId]);
      return result.rows;
    } catch (error) {
      logger.warn("PersonalizationService: Failed to fetch faculty evaluation assignments", {
        personId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Invalidate all cached dashboards.
   *
   * Call this for system-wide changes:
   *   - Academic calendar update
   *   - Evaluation freeze applied
   *   - Bulk data import
   */
  invalidateAllCaches() {
    // Clear the entire cache
    this.cache.invalidateAll();
    // Log the bulk invalidation
    logger.debug("PersonalizationService: All caches invalidated");
  }
}

// ============================================================
// Export a singleton instance for use across the application
// The controller uses this instance directly
// ============================================================
module.exports = new PersonalizationService();
