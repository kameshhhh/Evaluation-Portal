// ============================================================
// PERSON PROFILE LINKER — Bridges Auth System to PEMM System
// ============================================================
// This service connects the authentication identity (Google login)
// to the PEMM person profile (college-specific data).
//
// WHY THIS EXISTS:
//   Auth system knows: email, Google ID, JWT token, auth role
//   PEMM system knows: department, admission year, projects, history
//   This service connects them so the dashboard knows BOTH
//
// KEY PRINCIPLE: Never modify the auth flow. This runs AFTER login
// as a post-authentication enrichment step.
//
// FLOW:
//   1. User logs in via Google → Auth system creates/verifies identity
//   2. Auth system returns JWT with userId, email, role
//   3. THIS SERVICE: Takes auth user data, finds matching PEMM person
//   4. Returns combined identity + person data for personalization
//
// SECURITY:
//   - No sensitive auth data is exposed to PEMM system
//   - No PEMM-internal IDs leak to frontend
//   - All queries scoped to the authenticated user only
// ============================================================

// Import the PersonRepository for PEMM person lookups
const PersonRepository = require("../../repositories/PersonRepository");

// Import the database query function for direct queries
const { query } = require("../../config/database");

// Import logger for operation tracking
const logger = require("../../utils/logger");

// ============================================================
// ACADEMIC LAYER IMPORTS — Added for academic identity enrichment
// These are pure functions — no side effects, no DB calls
// ============================================================

// Import the academic profile builder for email-based inference
// Transforms email → department, year, semester, graduation
const { buildAcademicProfile } = require("./academic/AcademicProfileBuilder");

// Import the academic integrity guard for cross-validation
// Ensures DB data is consistent with email-inferred data
const {
  crossValidateEmailVsStored,
} = require("./academic/AcademicIntegrityGuard");

// Import identity parser for email-based name extraction and completeness check
const {
  parseStudentAcademicInfo,
  isAcademicProfileComplete,
  extractDisplayNameFromEmail,
} = require("./academic/AcademicIdentityParser");

// ============================================================
// PersonProfileLinker — Connects auth identity to PEMM person
// ============================================================
class PersonProfileLinker {
  /**
   * Link an authenticated user to their PEMM person profile.
   *
   * This is the main bridge method. It takes the auth user context
   * (from JWT via req.user) and returns a combined data object that
   * includes both auth identity AND PEMM person data.
   *
   * Three resolution strategies (tried in order):
   *   1. Direct identity_id match (fastest, most common case)
   *   2. Email-based match (fallback for users created before PEMM)
   *   3. Auto-create basic profile (first-time PEMM users)
   *
   * @param {Object} authUser - Auth context from JWT middleware
   * @param {string} authUser.id - internal_user_id from users table
   * @param {string} authUser.email - Normalized email address
   * @param {string} authUser.role - Auth role (student/faculty/admin)
   * @param {string} authUser.name - Display name from Google profile
   * @returns {Promise<Object>} Combined auth + PEMM person data
   */
  async linkAuthToPerson(authUser) {
    // Log the linking attempt for audit trail
    logger.debug(
      "PersonProfileLinker: Attempting to link auth user to PEMM person",
      {
        userId: authUser.id, // Log the auth user ID for debugging
        email: authUser.email, // Log email for support troubleshooting
      },
    );

    // ---------------------------------------------------------
    // STRATEGY 1: Direct identity_id match
    // The persons.identity_id column is a FK to users.internal_user_id
    // This is the fastest and most reliable path
    // ---------------------------------------------------------
    const person = await PersonRepository.findByIdentityId(authUser.id);

    // If found, enrich the auth user with PEMM data and return
    if (person) {
      // Log successful direct match
      logger.debug("PersonProfileLinker: Direct identity match found", {
        personId: person.personId, // Log the PEMM person ID
        personType: person.personType, // Log their PEMM role
      });
      // Return combined auth + person data
      return this.enrichAuthWithPerson(authUser, person);
    }

    // ---------------------------------------------------------
    // STRATEGY 2: Email-based fallback match
    // For users who existed in auth before PEMM was deployed,
    // we can match by looking up their email in the users table
    // and then checking for a person with that identity_id.
    // This is a rare case — only happens during migration period.
    // ---------------------------------------------------------
    // Note: We don't implement email-based matching because the
    // identity_id is always set when a person is created via the
    // PEMM API. This strategy would only matter if persons were
    // imported from an external system without identity linking.

    // ---------------------------------------------------------
    // STRATEGY 3: Auto-create PEMM person from email identity
    // If the email has HIGH confidence (student email pattern),
    // we auto-create a person — no registration form needed.
    // 10,000+ students can't manually register. The email IS
    // their identity: name.dept+year@bitsathy.ac.in
    //
    // For LOW confidence (faculty), we still auto-create but
    // with fewer fields — the email still tells us they're faculty.
    // ---------------------------------------------------------
    const academicInfo = parseStudentAcademicInfo(authUser.email);

    if (isAcademicProfileComplete(academicInfo)) {
      // HIGH confidence — student email with valid dept + year
      // Auto-create person record and go straight to dashboard
      logger.info(
        "PersonProfileLinker: Auto-creating person from HIGH-confidence email",
        {
          userId: authUser.id,
          email: authUser.email,
          department: academicInfo.departmentCode,
          year: academicInfo.admissionYear,
        },
      );

      const person = await this._autoCreatePerson(authUser, academicInfo);
      return this.enrichAuthWithPerson(authUser, person);
    }

    // LOW confidence — faculty or non-standard email
    // Still auto-create with what we have (role-based)
    if (authUser.email && authUser.email.endsWith("@bitsathy.ac.in")) {
      logger.info(
        "PersonProfileLinker: Auto-creating faculty/staff person from email",
        {
          userId: authUser.id,
          email: authUser.email,
        },
      );

      const person = await this._autoCreateFacultyPerson(authUser);
      return this.enrichAuthWithPerson(authUser, person);
    }

    // Non-bitsathy email or unknown domain — show profile form
    logger.info(
      "PersonProfileLinker: Non-institutional email, profile needed",
      {
        userId: authUser.id,
        email: authUser.email,
      },
    );
    return this.buildUnlinkedContext(authUser);
  }

  /**
   * Combine auth user data with PEMM person data.
   *
   * Creates a unified context object that holds both identity info
   * (from auth system) and college-specific info (from PEMM system).
   * This is what the PersonalizationService uses to build dashboards.
   *
   * SECURITY: We control exactly which fields are included.
   * No raw database rows leak into this context object.
   *
   * @param {Object} authUser - Auth context from JWT middleware
   * @param {Object} person - Person domain entity from PEMM
   * @returns {Object} Combined user context for personalization
   */
  enrichAuthWithPerson(authUser, person) {
    // ---------------------------------------------------------
    // ACADEMIC LAYER: Build academic profile from email
    // This is a pure function call — no DB, no I/O, < 1ms
    // Infers department, admission year, semester from email
    // ---------------------------------------------------------
    const academicProfile = buildAcademicProfile(
      { identity_id: authUser.id, person_type: person.personType }, // Person stub
      authUser.email, // Google-verified email for parsing
    );

    // ---------------------------------------------------------
    // ACADEMIC LAYER: Cross-validate email inference vs DB data
    // If the email says 'MZ' but DB says 'CS', log a discrepancy
    // This does NOT block the request — just logs for audit
    // ---------------------------------------------------------
    const crossValidation = crossValidateEmailVsStored(authUser.email, {
      departmentCode: person.departmentCode, // Stored in DB
      admissionYear: person.admissionYear, // Stored in DB
    });

    // Log cross-validation discrepancies if any (for admin review)
    if (!crossValidation.passed && !crossValidation.skipped) {
      logger.warn(
        "PersonProfileLinker: Academic cross-validation discrepancy",
        {
          personId: person.personId,
          discrepancies: crossValidation.discrepancies,
        },
      );
    }

    // ---------------------------------------------------------
    // DETERMINE BEST DEPARTMENT: email inference wins when HIGH
    // The email is Google-verified — it's the most trustworthy
    // source for which department a student actually belongs to.
    // DB values may be stale or manually entered incorrectly.
    // If email inference is HIGH confidence, always use it.
    // If LOW (faculty/admin email), fall back to DB value.
    // ---------------------------------------------------------
    const emailIsHighConfidence = academicProfile.academicConfidence === "HIGH";
    const resolvedDepartmentCode = emailIsHighConfidence
      ? academicProfile.departmentCode // Email is trusted → use it
      : person.departmentCode || academicProfile.departmentCode; // Fallback to DB
    const resolvedDepartmentName = emailIsHighConfidence
      ? academicProfile.departmentName // Email is trusted → use registry name
      : person.departmentName || academicProfile.departmentName; // Fallback

    // ---------------------------------------------------------
    // DETERMINE BEST ADMISSION YEAR: email inference wins when HIGH
    // Same logic: Google-verified email is more trustworthy
    // ---------------------------------------------------------
    const resolvedAdmissionYear = emailIsHighConfidence
      ? academicProfile.admissionYear // Email is trusted
      : person.admissionYear || academicProfile.admissionYear; // Fallback

    // Build the combined context object
    return {
      // --- Auth identity fields ---
      authId: authUser.id, // Internal user UUID (for backend use only)
      email: authUser.email, // Normalized email address
      authRole: authUser.role, // Auth system role (may differ from personType)
      displayName: person.displayName || authUser.name, // PEMM name takes priority

      // --- PEMM person fields ---
      personId: person.personId, // PEMM person UUID
      personType: person.personType, // student/faculty/admin
      departmentCode: resolvedDepartmentCode, // DB value or email-inferred
      departmentName: resolvedDepartmentName, // Official name from registry
      admissionYear: resolvedAdmissionYear, // DB value or email-inferred
      graduationYear:
        person.graduationYear || academicProfile.expectedGraduationYear, // Calculated
      status: person.status, // active/inactive/graduated/etc.
      version: person.version, // Optimistic concurrency version

      // --- Academic context (NEW: from AcademicProfileBuilder) ---
      academicProfile: {
        currentYear: academicProfile.currentAcademicYear, // Year of study (1-4)
        currentSemester: academicProfile.currentSemester, // ODD or EVEN
        academicStatus: academicProfile.academicStatus, // YEAR_1..YEAR_4, ALUMNI
        departmentCategory: academicProfile.departmentCategory, // engineering/technology/...
        confidence: academicProfile.academicConfidence, // HIGH or LOW
        source: academicProfile.academicSource, // EMAIL_PARSER or fallback
        crossValidation: crossValidation.passed ? "CONSISTENT" : "DISCREPANCY",
      },

      // --- Profile linking state ---
      profileComplete: true, // Person profile exists and is linked
      profileLinked: true, // Identity is directly linked via identity_id
    };
  }

  /**
   * Build context for users who have no PEMM person profile.
   *
   * Returns a minimal context that tells the frontend:
   * "This user is authenticated but needs to complete their PEMM profile."
   *
   * The frontend shows a profile completion form based on this signal.
   *
   * @param {Object} authUser - Auth context from JWT middleware
   * @returns {Object} Auth-only context with profileComplete: false
   */
  buildUnlinkedContext(authUser) {
    // ---------------------------------------------------------
    // ACADEMIC LAYER: Even without a PEMM profile, we can infer
    // academic data from the email. This pre-populates the
    // profile completion form with department and year.
    // ---------------------------------------------------------
    const academicProfile = buildAcademicProfile(
      { identity_id: authUser.id, person_type: authUser.role || "student" },
      authUser.email,
    );

    return {
      // --- Auth identity fields only ---
      authId: authUser.id, // Internal user UUID
      email: authUser.email, // Email address
      authRole: authUser.role, // Auth role for basic routing
      displayName: authUser.name || "User", // Google display name fallback

      // --- INFERRED ACADEMIC FIELDS (NEW) ---
      // Even without a PEMM person, email parsing can pre-fill these
      // The frontend uses these to pre-populate the profile form
      personId: null, // No PEMM person exists yet
      personType: authUser.role, // Use auth role as initial guess
      departmentCode: academicProfile.departmentCode, // Inferred from email (may be null)
      departmentName: academicProfile.departmentName, // Inferred dept name (may be null)
      admissionYear: academicProfile.admissionYear, // Inferred from email (may be null)
      graduationYear: academicProfile.expectedGraduationYear, // Calculated (may be null)
      status: null, // No PEMM status yet

      // --- Academic context (NEW) ---
      academicProfile: {
        currentYear: academicProfile.currentAcademicYear,
        currentSemester: academicProfile.currentSemester,
        academicStatus: academicProfile.academicStatus,
        departmentCategory: academicProfile.departmentCategory,
        confidence: academicProfile.academicConfidence,
        source: academicProfile.academicSource,
        crossValidation: null, // No stored data to cross-validate against
      },

      // --- Profile completion state ---
      profileComplete: false, // SIGNAL: frontend shows profile setup
      profileLinked: false, // Identity not yet linked to person
    };
  }

  // ============================================================
  // AUTO-CREATE: Student person from HIGH-confidence email
  // ============================================================
  /**
   * Auto-create a PEMM person for a student based on email identity.
   *
   * Called when:
   *   - User logs in with name.deptYY@bitsathy.ac.in
   *   - No person record exists in the DB
   *   - Email parsing yields HIGH confidence (valid dept + year)
   *
   * This eliminates the "Complete Profile" form for 10,000+ students.
   * The email IS the identity — no manual registration needed.
   *
   * @param {Object} authUser - Auth context { id, email, role, name }
   * @param {Object} academicInfo - Parsed email data from AcademicIdentityParser
   * @returns {Promise<Object>} Created Person domain entity
   */
  async _autoCreatePerson(authUser, academicInfo) {
    // Resolve display name: Google name > email-extracted name > email prefix
    const displayName =
      authUser.name && authUser.name !== authUser.email?.split("@")[0]
        ? authUser.name
        : extractDisplayNameFromEmail(authUser.email);

    // Calculate expected graduation year (4-year program)
    const graduationYear = academicInfo.admissionYear
      ? academicInfo.admissionYear + 4
      : null;

    try {
      // Create the person record in the PEMM system
      const person = await PersonRepository.create({
        identityId: authUser.id, // FK to users.internal_user_id
        personType: "student", // Determined by email pattern
        departmentCode: academicInfo.departmentCode, // From email (e.g., 'MZ')
        admissionYear: academicInfo.admissionYear, // From email (e.g., 2023)
        graduationYear: graduationYear, // Calculated (e.g., 2027)
        displayName: displayName, // Google name or email-derived
      });

      logger.info("PersonProfileLinker: Person auto-created for student", {
        personId: person.personId,
        department: academicInfo.departmentCode,
        admissionYear: academicInfo.admissionYear,
        displayName: displayName,
      });

      return person;
    } catch (error) {
      // If creation fails (e.g., race condition — another request created it),
      // try to find the just-created person by identity_id
      logger.warn(
        "PersonProfileLinker: Auto-create failed, attempting recovery",
        {
          error: error.message,
          userId: authUser.id,
        },
      );

      const existingPerson = await PersonRepository.findByIdentityId(
        authUser.id,
      );
      if (existingPerson) {
        return existingPerson;
      }

      // If recovery also fails, rethrow
      throw error;
    }
  }

  // ============================================================
  // AUTO-CREATE: Faculty/staff person from LOW-confidence email
  // ============================================================
  /**
   * Auto-create a PEMM person for faculty/staff.
   *
   * Called when:
   *   - User logs in with name@bitsathy.ac.in (no dept token)
   *   - No person record exists in the DB
   *   - Email is bitsathy.ac.in domain but LOW confidence
   *
   * Faculty don't have dept+year in their email, so we create
   * with minimal data. They still get a dashboard immediately.
   *
   * @param {Object} authUser - Auth context { id, email, role, name }
   * @returns {Promise<Object>} Created Person domain entity
   */
  async _autoCreateFacultyPerson(authUser) {
    // Resolve display name: Google name > email-extracted name
    const displayName =
      authUser.name && authUser.name !== authUser.email?.split("@")[0]
        ? authUser.name
        : extractDisplayNameFromEmail(authUser.email);

    // Determine person type from auth role
    const personType = authUser.role === "admin" ? "admin" : "faculty";

    try {
      // Create the person record with minimal data
      const person = await PersonRepository.create({
        identityId: authUser.id, // FK to users.internal_user_id
        personType: personType, // faculty or admin
        departmentCode: null, // Unknown — not in email
        admissionYear: null, // Not applicable for faculty
        graduationYear: null, // Not applicable for faculty
        displayName: displayName, // Google name or email-derived
      });

      logger.info(
        "PersonProfileLinker: Person auto-created for faculty/staff",
        {
          personId: person.personId,
          personType: personType,
          displayName: displayName,
        },
      );

      return person;
    } catch (error) {
      // Race condition recovery — same as student path
      logger.warn(
        "PersonProfileLinker: Faculty auto-create failed, recovering",
        {
          error: error.message,
          userId: authUser.id,
        },
      );

      const existingPerson = await PersonRepository.findByIdentityId(
        authUser.id,
      );
      if (existingPerson) {
        return existingPerson;
      }

      throw error;
    }
  }

  /**
   * Get the PEMM person's project memberships.
   *
   * Fetches all active project memberships for a person.
   * Used by the PersonalizationService to build portfolio sections.
   *
   * @param {string} personId - PEMM person UUID
   * @returns {Promise<Array>} Array of project membership records
   */
  async getPersonProjects(personId) {
    // Query project_members for this person's active memberships
    // JOIN with projects to get project details (title, status, etc.)
    const sql = `
      SELECT
        pm.project_id,
        pm.role_in_project,
        pm.declared_share_percentage,
        pm.joined_at,
        p.title AS project_title,
        p.description AS project_description,
        p.status AS project_status,
        p.academic_year,
        p.semester,
        p.start_date,
        p.expected_end_date,
        p.frozen_at
      FROM project_members pm
      INNER JOIN projects p ON pm.project_id = p.project_id
      WHERE pm.person_id = $1
        AND pm.left_at IS NULL
        AND p.is_deleted = false
      ORDER BY p.created_at DESC
    `;

    // Execute the query with the person's UUID
    const result = await query(sql, [personId]);

    // Return the raw rows — the DashboardBuilder will format them
    return result.rows;
  }

  /**
   * Get project team members for all of a person's projects.
   *
   * For each project the person belongs to, fetches the full team.
   * Used to show "Team: 3 members" on project cards.
   *
   * @param {Array<string>} projectIds - Array of project UUIDs
   * @returns {Promise<Object>} Map of projectId → member count
   */
  async getProjectTeamCounts(projectIds) {
    // Return empty map if no project IDs provided
    if (!projectIds || projectIds.length === 0) return {};

    // Count active members per project in a single query
    const sql = `
      SELECT project_id, COUNT(*) as member_count
      FROM project_members
      WHERE project_id = ANY($1)
        AND left_at IS NULL
      GROUP BY project_id
    `;

    // Execute with the array of project IDs
    const result = await query(sql, [projectIds]);

    // Build a lookup map: projectId → memberCount
    const counts = {};
    result.rows.forEach((row) => {
      counts[row.project_id] = parseInt(row.member_count, 10);
    });

    return counts;
  }
}

// ============================================================
// Export a singleton instance for reuse across requests
// Using a class allows easy mocking in tests
// ============================================================
module.exports = PersonProfileLinker;
