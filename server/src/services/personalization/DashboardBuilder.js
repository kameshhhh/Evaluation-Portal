// ============================================================
// DASHBOARD BUILDER — Constructs Role-Specific Dashboard Data
// ============================================================
// Builds the structured dashboard payload for each user type.
// The frontend receives this exact structure and renders it.
//
// DESIGN PRINCIPLE: Frontend is dumb. Backend decides everything.
//   - What sections to show
//   - What data each section contains
//   - What actions are available
//   - What the labels and descriptions say
//
// Each builder method returns a standardized shape:
//   { type, user, sections, actions, notifications }
//
// The PersonalizationService calls the appropriate builder
// based on the user's resolved personType.
// ============================================================

// Import database query function for custom aggregation queries
const { query } = require("../../config/database");

// Import logger for performance tracking
const logger = require("../../utils/logger");

// Import department registry for canonical department lists
// Used by DefaultDashboard to populate the department dropdown
const { getAllDepartmentCodes } = require("./academic/DepartmentRegistry");

// ============================================================
// DashboardBuilder — Constructs role-specific payloads
// ============================================================
class DashboardBuilder {
  // ============================================================
  // STUDENT DASHBOARD BUILDER
  // ============================================================
  /**
   * Build the student dashboard data structure.
   *
   * Students see:
   *   1. Personal info (name, department, year, email)
   *   2. Their current projects with role and team size
   *   3. Pending work items (work logs, plans not submitted)
   *   4. Upcoming evaluation sessions
   *   5. Quick actions relevant to their current state
   *
   * @param {Object} userContext - Combined auth + PEMM person data
   * @param {Array} projects - Active project memberships
   * @param {Object} teamCounts - Map of projectId → member count
   * @returns {Object} Complete student dashboard structure
   */
  static buildStudentDashboard(userContext, projects, teamCounts) {
    // Start timer for performance monitoring
    const startTime = Date.now();

    // ---------------------------------------------------------
    // SECTION 1: Personal Information
    // Shows the student's identity and academic details
    // ---------------------------------------------------------
    const personalInfo = {
      name: userContext.displayName, // Full display name
      email: userContext.email, // College email
      department: userContext.departmentName || userContext.departmentCode, // Full name preferred, code fallback
      departmentName: userContext.departmentName || null, // Full department name from registry
      departmentCode: userContext.departmentCode || null, // Official code for internal use
      admissionYear: userContext.admissionYear, // Year of joining
      graduationYear: userContext.graduationYear, // Expected graduation
      personType: "student", // Explicit type for frontend routing
      status: userContext.status, // Active/graduated/etc.
      // --- Academic context (from AcademicProfileBuilder) ---
      academicYear: userContext.academicProfile?.currentYear || null, // Year of study (1-4)
      semester: userContext.academicProfile?.currentSemester || null, // ODD or EVEN
      academicStatus: userContext.academicProfile?.academicStatus || null, // YEAR_1..YEAR_4
      departmentCategory:
        userContext.academicProfile?.departmentCategory || null, // engineering/tech/...
      academicConfidence: userContext.academicProfile?.confidence || null, // HIGH or LOW
    };

    // ---------------------------------------------------------
    // SECTION 2: My Projects
    // List of projects the student is part of with their role
    // Each project card shows: title, status, role, team size
    // ---------------------------------------------------------
    const myProjects = projects.map((proj) => ({
      projectId: proj.project_id, // For navigation links
      title: proj.project_title, // Display title
      description: proj.project_description, // Brief project description
      status: proj.project_status, // draft/active/under_review/etc.
      academicYear: proj.academic_year, // Academic year of project
      semester: proj.semester, // Semester (1 or 2)
      myRole: proj.role_in_project, // leader/member
      teamSize: teamCounts[proj.project_id] || 1, // Number of team members
      isFrozen: !!proj.frozen_at, // Whether evaluation freeze is active
      startDate: proj.start_date, // Project start date
      expectedEndDate: proj.expected_end_date, // Expected completion date
    }));

    // ---------------------------------------------------------
    // SECTION 3: Pending Work
    // Items the student needs to complete
    // For now, this is derived from project state
    // TODO: Integrate with work_logs and monthly_plans tables when available
    // ---------------------------------------------------------
    const pendingWork = [];

    // Check each active project for pending items
    projects.forEach((proj) => {
      // If project is active but not frozen, work log may be pending
      if (proj.project_status === "active") {
        pendingWork.push({
          type: "work_log", // Type of pending item
          label: `Monthly work log for "${proj.project_title}"`, // Display text
          projectId: proj.project_id, // Related project
          priority: "medium", // Urgency level
          dueDescription: "End of current month", // When it's due
        });
      }
      // If project is under review, student should prepare for evaluation
      if (proj.project_status === "under_review") {
        pendingWork.push({
          type: "evaluation_prep", // Evaluation preparation
          label: `Prepare for review: "${proj.project_title}"`, // Display text
          projectId: proj.project_id, // Related project
          priority: "high", // High priority — review is coming
          dueDescription: "Before evaluation session", // Timing
        });
      }
    });

    // ---------------------------------------------------------
    // SECTION 4: Upcoming Evaluations
    // Evaluation sessions relevant to this student
    // Queried separately to show timeline info
    // ---------------------------------------------------------
    // Evaluations are populated by PersonalizationService if available
    const upcomingEvaluations = [];

    // ---------------------------------------------------------
    // SECTION 5: Quick Actions
    // Context-sensitive actions the student can perform
    // Available flag controls which buttons render
    // ---------------------------------------------------------
    const hasActiveProjects = projects.some(
      (p) => p.project_status === "active",
    );
    const hasDraftProjects = projects.some((p) => p.project_status === "draft");

    const actions = [
      {
        id: "create-project", // Action identifier
        label: "Create New Project", // Button text
        description: "Start a new project for this semester", // Tooltip
        available: projects.length === 0, // Only if no projects yet
        icon: "plus-circle", // Lucide icon name
      },
      {
        id: "submit-work-log", // Work log submission
        label: "Submit Work Log", // Button text
        description: "Log your monthly work hours and tasks", // Tooltip
        available: hasActiveProjects, // Only with active projects
        icon: "file-text", // Lucide icon name
      },
      {
        id: "view-project", // Navigate to project
        label: "View My Project", // Button text
        description: "See project details and team", // Tooltip
        available: projects.length > 0, // Any project exists
        icon: "folder-open", // Lucide icon name
      },
    ];

    // ---------------------------------------------------------
    // SECTION 6: Statistics
    // Quick numerical summary for the student
    // ---------------------------------------------------------
    const stats = {
      totalProjects: projects.length, // How many projects
      activeProjects: projects.filter((p) => p.project_status === "active")
        .length,
      pendingItems: pendingWork.length, // Outstanding work items
      completedProjects: projects.filter(
        (p) => p.project_status === "completed",
      ).length,
    };

    // Log the build time for performance monitoring
    const elapsed = Date.now() - startTime;
    logger.debug("DashboardBuilder: Student dashboard built", {
      personId: userContext.personId,
      projectCount: projects.length,
      elapsed: `${elapsed}ms`,
    });

    // ---------------------------------------------------------
    // RETURN: Complete student dashboard structure
    // Frontend receives this exact shape and renders it
    // ---------------------------------------------------------
    return {
      type: "student", // Dashboard type — drives component routing
      user: personalInfo, // Personal information section
      sections: {
        personalInfo, // Card: user's identity info
        myProjects, // Card: project list with roles
        pendingWork, // Card: items needing attention
        upcomingEvaluations, // Card: evaluation timeline
        stats, // Card: numerical summary
      },
      actions, // Quick action buttons
      notifications: [], // Future: real-time notifications
    };
  }

  // ============================================================
  // FACULTY DASHBOARD BUILDER
  // ============================================================
  /**
   * Build the faculty dashboard data structure.
   *
   * Faculty see:
   *   1. Personal info (name, department, role)
   *   2. Evaluation assignments (projects to evaluate)
   *   3. Department overview (student/project counts)
   *   4. Quick actions (create session, review, report)
   *
   * @param {Object} userContext - Combined auth + PEMM person data
   * @param {Object} departmentStats - Department-level statistics
   * @param {Array} evaluationSessions - Active/upcoming eval sessions
   * @param {Array} scarcitySessions - Scarcity-enabled eval sessions
   * @param {Array} departmentStudents - Student records in the department
   * @returns {Object} Complete faculty dashboard structure
   */
  static buildFacultyDashboard(
    userContext,
    departmentStats,
    evaluationSessions,
    scarcitySessions = [],
    departmentStudents = [],
  ) {
    // ---------------------------------------------------------
    // SECTION 1: Personal Information (Faculty)
    // ---------------------------------------------------------
    const personalInfo = {
      name: userContext.displayName, // Faculty name
      email: userContext.email, // College email
      department: userContext.departmentCode, // Department code
      departmentName: userContext.departmentName || null, // Full department name from registry
      personType: "faculty", // Explicit type
      status: userContext.status, // Active status
      // Academic context for faculty (may be null if not parsed)
      departmentCategory:
        userContext.academicProfile?.departmentCategory || null,
    };

    // ---------------------------------------------------------
    // SECTION 2: Evaluation Assignments
    // Projects this faculty needs to evaluate
    // ---------------------------------------------------------
    const evaluationAssignments = {
      totalSessions: evaluationSessions.length, // Total eval sessions
      pendingReviews: evaluationSessions.filter(
        (s) => s.status === "open" || s.status === "in_progress",
      ).length, // Sessions needing action
      sessions: evaluationSessions.map((session) => ({
        sessionId: session.session_id, // Session UUID
        sessionType: session.session_type, // project_review/faculty_assessment
        intent: session.intent, // growth/excellence/etc.
        status: session.status, // draft/open/in_progress/closed
        windowStart: session.evaluation_window_start, // When scoring opens
        windowEnd: session.evaluation_window_end, // When scoring closes
      })),
    };

    // ---------------------------------------------------------
    // SECTION 3: Department Overview
    // Aggregate statistics for the faculty's department
    // ---------------------------------------------------------
    const departmentOverview = {
      department: userContext.departmentCode, // Department code
      totalStudents: departmentStats.studentCount || 0, // Students in department
      activeProjects: departmentStats.activeProjectCount || 0, // Active projects
      totalProjects: departmentStats.totalProjectCount || 0, // All-time projects
      submittedProjects: departmentStats.submittedCount || 0, // Under review
    };

    // ---------------------------------------------------------
    // SECTION 4: Quick Actions (Faculty)
    // ---------------------------------------------------------
    const actions = [
      {
        id: "create-eval-session", // Create evaluation
        label: "Create Evaluation Session", // Button text
        description: "Set up a new evaluation for your department", // Tooltip
        available: true, // Always available
        icon: "clipboard-check", // Lucide icon name
      },
      {
        id: "review-submissions", // Go to review queue
        label: "Review Submissions", // Button text
        description: "Review projects pending evaluation", // Tooltip
        available: evaluationAssignments.pendingReviews > 0, // Only if pending
        icon: "eye", // Lucide icon name
      },
      {
        id: "department-report", // Generate report
        label: "Department Report", // Button text
        description: "View department-wide analytics", // Tooltip
        available: true, // Always available
        icon: "bar-chart-2", // Lucide icon name
      },
      {
        id: "view-students", // Browse students
        label: "View Students", // Button text
        description: "Browse students in your department", // Tooltip
        available: true, // Always available
        icon: "users", // Lucide icon name
      },
    ];

    // ---------------------------------------------------------
    // SECTION 5: Scarcity Evaluations
    // Sessions with scarcity allocation enabled (pool-based scoring)
    // Shows evaluation mode, pool size, and evaluator counts
    // ---------------------------------------------------------
    const scarcityEvaluations = scarcitySessions.map((session) => ({
      sessionId: session.session_id, // Session UUID
      evaluationMode: session.evaluation_mode, // project_member/cross_project/faculty/peer
      intent: session.intent, // growth/excellence/etc.
      status: session.status, // draft/open/in_progress/closed/locked/aggregated
      poolSize: session.scarcity_pool_size
        ? parseFloat(session.scarcity_pool_size)
        : null, // Points per evaluator
      evaluatorCount: parseInt(session.evaluator_count, 10) || 0, // How many evaluators participated
      windowStart: session.evaluation_window_start, // When scoring opens
      windowEnd: session.evaluation_window_end, // When scoring closes
    }));

    // ---------------------------------------------------------
    // SECTION 6: Department Students
    // Actual student records for selection and visibility
    // Faculty can see students in their department
    // ---------------------------------------------------------
    const students = departmentStudents.map((student) => ({
      personId: student.person_id, // Student UUID
      displayName: student.display_name, // Student name
      departmentCode: student.department_code, // Department code
      admissionYear: student.admission_year, // Year of admission
      graduationYear: student.graduation_year, // Expected graduation
      status: student.status, // active/inactive/graduated
      email: student.normalized_email, // College email
      projectCount: parseInt(student.project_count, 10) || 0, // Active projects
      lastLoginAt: student.last_login_at || null, // Last login timestamp
    }));

    // ---------------------------------------------------------
    // RETURN: Complete faculty dashboard structure
    // ---------------------------------------------------------
    return {
      type: "faculty", // Dashboard type
      user: personalInfo, // Personal info
      sections: {
        personalInfo, // Identity card
        evaluationAssignments, // Eval queue
        departmentOverview, // Department stats
        scarcityEvaluations, // Scarcity sessions with pool info
        students, // Student list in the department
      },
      actions, // Quick actions
      notifications: [], // Future notifications
    };
  }

  // ============================================================
  // ADMIN DASHBOARD BUILDER
  // ============================================================
  /**
   * Build the admin dashboard data structure.
   *
   * Admins see:
   *   1. System health (user count, project count, DB status)
   *   2. Department management (per-department breakdown)
   *   3. Configuration shortcuts
   *   4. Integrity check actions
   *
   * @param {Object} userContext - Combined auth + PEMM person data
   * @param {Object} systemStats - System-wide statistics
   * @param {Array} departmentBreakdown - Per-department data
   * @returns {Object} Complete admin dashboard structure
   */
  static buildAdminDashboard(userContext, systemStats, departmentBreakdown) {
    // ---------------------------------------------------------
    // SECTION 1: Personal Information (Admin)
    // ---------------------------------------------------------
    const personalInfo = {
      name: userContext.displayName, // Admin name
      email: userContext.email, // Admin email
      personType: "admin", // Explicit type
      status: userContext.status || "active", // Status
    };

    // ---------------------------------------------------------
    // SECTION 2: System Health
    // High-level overview of the entire system
    // ---------------------------------------------------------
    const systemHealth = {
      totalUsers: systemStats.totalUsers || 0, // Auth system users
      totalPersons: systemStats.totalPersons || 0, // PEMM persons
      totalProjects: systemStats.totalProjects || 0, // All projects
      activeProjects: systemStats.activeProjects || 0, // Active projects
      frozenProjects: systemStats.frozenProjects || 0, // Frozen for eval
      databaseStatus: "healthy", // DB connection status
      lastIntegrityCheck: systemStats.lastIntegrityCheck || null, // When last run
    };

    // ---------------------------------------------------------
    // SECTION 3: Department Breakdown
    // Per-department student and project counts
    // ---------------------------------------------------------
    const departments = departmentBreakdown.map((dept) => ({
      code: dept.department_code, // CSE/ECE/MECH
      studentCount: parseInt(dept.student_count, 10) || 0, // Students
      projectCount: parseInt(dept.project_count, 10) || 0, // Projects
    }));

    // ---------------------------------------------------------
    // SECTION 4: Quick Actions (Admin)
    // System-wide configuration and integrity actions
    // ---------------------------------------------------------
    const actions = [
      {
        id: "integrity-check", // Run integrity check
        label: "Run Integrity Check", // Button text
        description: "Verify hash chain integrity across all entities", // Tooltip
        available: true, // Always available for admin
        icon: "shield-check", // Lucide icon name
      },
      {
        id: "manage-calendar", // Calendar management
        label: "Manage Academic Calendar", // Button text
        description: "Configure academic months and evaluation periods", // Tooltip
        available: true, // Always available
        icon: "calendar", // Lucide icon name
      },
      {
        id: "user-management", // User admin
        label: "User Management", // Button text
        description: "View and manage all system users", // Tooltip
        available: true, // Always available
        icon: "users", // Lucide icon name
      },
      {
        id: "audit-trail", // View audit logs
        label: "View Audit Trail", // Button text
        description: "Review system-wide change history", // Tooltip
        available: true, // Always available
        icon: "file-search", // Lucide icon name
      },
      {
        id: "department-report", // Cross-department report
        label: "All Departments Report", // Button text
        description: "Generate cross-department analytics", // Tooltip
        available: true, // Always available
        icon: "bar-chart-2", // Lucide icon name
      },
    ];

    // ---------------------------------------------------------
    // RETURN: Complete admin dashboard structure
    // ---------------------------------------------------------
    return {
      type: "admin", // Dashboard type
      user: personalInfo, // Personal info
      sections: {
        personalInfo, // Identity card
        systemHealth, // System overview
        departments, // Department breakdown
      },
      actions, // Quick actions
      notifications: [], // Future notifications
    };
  }

  // ============================================================
  // DEFAULT DASHBOARD BUILDER
  // ============================================================
  /**
   * Build a minimal dashboard for users with incomplete profiles.
   *
   * Shown when:
   *   - User is authenticated but has no PEMM person record
   *   - User's personType is unrecognized
   *   - Profile data is incomplete (missing department, year)
   *
   * Prompts the user to complete their profile before showing
   * the full personalized dashboard.
   *
   * @param {Object} userContext - Auth-only or incomplete context
   * @returns {Object} Minimal dashboard with profile completion prompt
   */
  static buildDefaultDashboard(userContext) {
    // ---------------------------------------------------------
    // ACADEMIC INFERENCE: Pre-populate form with email-inferred data
    // If the email parser found a department/year, show them as
    // pre-filled values in the profile completion form.
    // This reduces manual input for students.
    // ---------------------------------------------------------
    const inferredDept = userContext.departmentCode || null;
    const inferredYear = userContext.admissionYear || null;
    const confidence = userContext.academicProfile?.confidence || "LOW";

    return {
      type: "default", // Default/incomplete dashboard
      user: {
        name: userContext.displayName || "User", // Best available name
        email: userContext.email, // Email from auth
        personType: userContext.personType || "unknown", // Tentative type
        // Pre-filled academic data from email inference (NEW)
        inferredDepartment: inferredDept, // May be null if parse failed
        inferredDepartmentName: userContext.departmentName || null, // Full name if available
        inferredAdmissionYear: inferredYear, // May be null if parse failed
        academicConfidence: confidence, // HIGH means auto-detected, LOW means manual needed
      },
      sections: {
        profileCompletion: {
          required: true, // SIGNAL: show profile form
          message:
            "Welcome! Please complete your profile to access the personalized dashboard.",
          fields: [
            {
              name: "personType", // Field to complete
              label: "I am a", // Form label
              type: "select", // Input type
              options: ["student", "faculty"], // Choices (admin set by system)
              required: true, // Must be filled
            },
            {
              name: "departmentCode", // Department selection
              label: "Department", // Form label
              type: "select", // Input type
              options: getAllDepartmentCodes(), // All valid department codes from canonical registry
              required: true, // Must be filled
              inferredValue: inferredDept, // Pre-fill with email-inferred dept (may be null)
            },
            {
              name: "admissionYear", // Year of admission (students)
              label: "Admission Year", // Form label
              type: "number", // Input type
              min: 2020, // Earliest valid year
              max: new Date().getFullYear(), // Can't be future
              required: false, // Only for students
              conditionalOn: { personType: "student" }, // Show only for students
            },
          ],
        },
      },
      actions: [
        {
          id: "complete-profile", // Profile completion action
          label: "Complete Profile", // Button text
          description: "Set up your college profile to get started", // Tooltip
          available: true, // Always available here
          icon: "user-plus", // Lucide icon name
        },
      ],
      notifications: [
        {
          type: "info", // Notification type
          message:
            "Complete your profile to unlock the personalized dashboard.", // Text
        },
      ],
    };
  }
}

// ============================================================
// Export the DashboardBuilder class
// All methods are static — no instance needed
// ============================================================
module.exports = DashboardBuilder;
