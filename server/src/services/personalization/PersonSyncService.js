// ============================================================
// PERSON SYNC SERVICE — Ensures Person Records Exist on Login
// ============================================================
// This service bridges the authentication system and the PEMM
// person system by guaranteeing that every authenticated user
// has a corresponding person record in the persons table.
//
// WHY THIS EXISTS:
//   Previously, person records were created LAZILY — only when
//   the user visited their dashboard for the first time. This
//   caused critical data gaps:
//     - Faculty dashboard showed 0 students (no person records)
//     - Admin user list was incomplete
//     - Project membership broke (no person_id to reference)
//
// HOW IT WORKS:
//   Called immediately after login (in authController), it:
//   1. Checks if a person record already exists for this user
//   2. If not, creates one using email-based academic inference
//   3. If yes, updates last_login_at and returns person_id
//   4. Returns { personId, personType, displayName } for the JWT
//
// PRINCIPLE: This service is ADDITIVE — it never modifies the
// existing auth pipeline. It runs AFTER processLogin succeeds.
// ============================================================

// Import person repository for person lookups and creation
const PersonRepository = require("../../repositories/PersonRepository");

// Import database query function for direct SQL operations
const { query } = require("../../config/database");

// Import logger for operation tracking
const logger = require("../../utils/logger");

// Import the academic identity parser for email-based inference
// Extracts department, admission year, graduation year from email
const {
  parseStudentAcademicInfo,
  isAcademicProfileComplete,
  extractDisplayNameFromEmail,
} = require("../personalization/academic/AcademicIdentityParser");

// ============================================================
// PersonSyncService — Static utility class (no state needed)
// ============================================================
class PersonSyncService {
  /**
   * Ensure a person record exists for the given authenticated user.
   *
   * This is the main entry point called from authController after
   * a successful login. It guarantees:
   *   - A person row exists in the persons table
   *   - The person's identity_id matches the user's internal_user_id
   *   - The person_type matches the user's resolved role
   *
   * @param {Object} user - User record from processLogin
   * @param {string} user.internal_user_id - UUID from users table
   * @param {string} user.normalized_email - Canonical email address
   * @param {string} user.user_role - Resolved role (student/faculty/admin)
   * @param {string} [displayName] - Google display name from OAuth payload
   * @returns {Promise<Object>} { personId, personType, displayName }
   */
  static async syncPersonOnLogin(user, displayName = null) {
    try {
      // -------------------------------------------------------
      // STEP 1: Check if a person record already exists
      // This is the fast path — most returning users will have one
      // -------------------------------------------------------
      const existingPerson = await PersonRepository.findByIdentityId(
        user.internal_user_id,
      );

      if (existingPerson) {
        // Person record found — update last_login_at on the users table
        // and return the existing person data
        logger.debug("PersonSyncService: Existing person found on login", {
          userId: user.internal_user_id,
          personId: existingPerson.personId,
          personType: existingPerson.personType,
        });

        // Update last_login_at timestamp (fire-and-forget, non-blocking)
        PersonSyncService._updateLastLogin(user.internal_user_id).catch(
          (err) => {
            // Don't fail the login if this update fails
            logger.warn("PersonSyncService: Failed to update last_login_at", {
              error: err.message,
            });
          },
        );

        return {
          personId: existingPerson.personId,
          personType: existingPerson.personType,
          displayName: existingPerson.displayName || displayName,
        };
      }

      // -------------------------------------------------------
      // STEP 2: No person record — create one based on email
      // Use the same academic inference logic as PersonProfileLinker
      // -------------------------------------------------------
      logger.info("PersonSyncService: Creating person record on login", {
        userId: user.internal_user_id,
        email: user.normalized_email,
        role: user.user_role,
      });

      // Parse the email for academic identity (department, year)
      const academicInfo = parseStudentAcademicInfo(user.normalized_email);
      const isHighConfidence = isAcademicProfileComplete(academicInfo);

      // Determine person_type from user_role
      // Map: student → student, faculty → faculty, admin → admin, pending → student
      const personType = PersonSyncService._resolvePersonType(user.user_role);

      // Resolve display name: Google name > email-extracted name
      const resolvedName =
        displayName ||
        extractDisplayNameFromEmail(user.normalized_email) ||
        user.normalized_email.split("@")[0];

      // Build the person creation payload
      const personData = {
        identityId: user.internal_user_id, // FK → users.internal_user_id
        personType: personType, // student/faculty/admin
        displayName: resolvedName, // Human-readable name
        departmentCode: isHighConfidence // From email pattern (students only)
          ? academicInfo.departmentCode
          : null,
        admissionYear: isHighConfidence // From email pattern (students only)
          ? academicInfo.admissionYear
          : null,
        graduationYear: isHighConfidence // Calculated from admission year
          ? academicInfo.admissionYear
            ? academicInfo.admissionYear + 4
            : null
          : null,
      };

      // Create the person record in the database
      const newPerson = await PersonRepository.create(personData);

      logger.info("PersonSyncService: Person record created", {
        personId: newPerson.personId,
        personType: personType,
        department: personData.departmentCode,
        displayName: resolvedName,
      });

      // Update last_login_at (fire-and-forget)
      PersonSyncService._updateLastLogin(user.internal_user_id).catch(() => {});

      return {
        personId: newPerson.personId,
        personType: newPerson.personType,
        displayName: newPerson.displayName || resolvedName,
      };
    } catch (error) {
      // -------------------------------------------------------
      // RECOVERY: If person creation fails (e.g., race condition
      // where another request created it simultaneously), try to
      // find the just-created person one more time.
      // -------------------------------------------------------
      logger.warn("PersonSyncService: Sync failed, attempting recovery", {
        userId: user.internal_user_id,
        error: error.message,
      });

      try {
        const recovered = await PersonRepository.findByIdentityId(
          user.internal_user_id,
        );
        if (recovered) {
          return {
            personId: recovered.personId,
            personType: recovered.personType,
            displayName: recovered.displayName,
          };
        }
      } catch (recoveryError) {
        // Recovery also failed — log and fall through
        logger.error("PersonSyncService: Recovery also failed", {
          error: recoveryError.message,
        });
      }

      // Return null — login still succeeds, person will be
      // created lazily by PersonProfileLinker on dashboard visit
      return null;
    }
  }

  /**
   * Resolve person_type from user_role.
   * Maps auth roles to PEMM person types.
   *
   * @param {string} userRole - Auth role from users table
   * @returns {string} PEMM person_type value
   * @private
   */
  static _resolvePersonType(userRole) {
    // Map each auth role to the corresponding PEMM person type
    const roleMap = {
      admin: "admin", // System administrator
      faculty: "faculty", // Faculty / instructor
      student: "student", // Enrolled student
      pending: "student", // Default to student (most common)
    };

    // Return mapped type or default to 'student'
    return roleMap[userRole] || "student";
  }

  /**
   * Update the last_login_at timestamp on the users table.
   * This timestamp is used by the Faculty "Students" tab to show
   * when each student was last active.
   *
   * @param {string} userId - internal_user_id UUID
   * @returns {Promise<void>}
   * @private
   */
  static async _updateLastLogin(userId) {
    // Update the last_login_at column with the current timestamp
    // This column was added by migration 011_fix_person_data_sync.sql
    await query(
      `UPDATE users SET last_login_at = NOW() WHERE internal_user_id = $1`,
      [userId],
    );
  }
}

// ============================================================
// Export the PersonSyncService for use in authController
// ============================================================
module.exports = PersonSyncService;
