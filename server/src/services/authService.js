// ============================================================
// AUTH SERVICE — Core Login Pipeline (The Authoritative Brain)
// ============================================================
// Implements the 12-step zero-trust login pipeline.
// This is the SINGLE point of truth for authenticating users.
// Every login passes through this exact sequence — no shortcuts.
// Transaction-safe: if any step fails, all database changes roll back.
//
// Pipeline steps:
// 1. Verify Google token → 2. Validate claims → 3. Normalize email
// 4. Extract & validate domain → 5. Hash email → 6. Find/create user
// 7. Resolve role → 8. Update role if changed → 9. Create snapshot
// 10. Generate JWT → 11. Log session → 12. Return session data
// ============================================================

// Import services for each pipeline step
const { verifyGoogleToken } = require("./googleVerify");
const {
  normalizeEmail,
  extractDomain,
  validateDomain,
  hashEmail,
} = require("./emailService");
const { resolveUserRole, isAdminEmail, isFacultyEmail } = require("./roleService");
const { generateAccessToken, getTokenId } = require("./tokenService");

// Import models for database operations
const { User, IdentitySnapshot, Session } = require("../models");

// Import transaction utility for atomic database operations
const { withTransaction } = require("../utils/databaseUtils");

// Import custom error class for pipeline failure signaling
const { AppError } = require("../middleware/errorHandler");

// Import logger for pipeline step tracking
const logger = require("../utils/logger");

// ============================================================
// MAIN LOGIN PIPELINE — processes a Google login attempt
// This function implements the exact 12-step pipeline from the spec
// Each step is sequential and depends on the previous step's result
// ============================================================

/**
 * Process a Google login through the zero-trust pipeline.
 * Returns session data on success, throws AppError on any failure.
 *
 * @param {string} googleIdToken - Raw Google ID token from One-Tap
 * @param {string} userAgent - Client's User-Agent header for audit
 * @param {string} ipAddress - Client's IP address for audit
 * @returns {Promise<Object>} Session data with JWT and user info
 * @throws {AppError} On any authentication or authorization failure
 */
const processLogin = async (googleIdToken, userAgent, ipAddress) => {
  // Log the start of a login attempt — never log the actual token
  logger.info("Login pipeline started", { ip: ipAddress });

  // ============================================================
  // STEP 1: Verify Google token against Google's public keys
  // This is the cryptographic proof of identity from Google
  // If this fails, the token is forged, expired, or for another app
  // ============================================================
  const googlePayload = await verifyGoogleToken(googleIdToken);

  // ============================================================
  // STEP 2: Validate that the token has all required claims
  // Google tokens should always have email and sub, but we verify
  // because zero-trust means we NEVER assume — we always verify
  // ============================================================
  validateTokenClaims(googlePayload);

  // ============================================================
  // STEP 3: Normalize the email to canonical form (lowercase + trim)
  // Ensures consistent identity mapping regardless of how Google
  // or the user capitalizes their email address
  // ============================================================
  const normalizedEmailValue = normalizeEmail(googlePayload.email);

  // ============================================================
  // STEP 3.5: System admin bypass — admin emails skip domain check
  // System administrators may use non-institutional emails
  // (e.g., Gmail) and still need full system access.
  // This check runs BEFORE domain validation — if the email is
  // in the admin list, domain validation is skipped entirely.
  //
  // SECURITY: isAdminEmail() uses canonical Gmail comparison
  // that strips dots, plus-aliases, and blocks Unicode attacks.
  // Only the EXACT real Gmail identity passes this gate.
  // ============================================================
  const isAdmin = isAdminEmail(normalizedEmailValue);
  const isFaculty = isFacultyEmail(normalizedEmailValue);

  if (!isAdmin && !isFaculty) {
    // ============================================================
    // STEP 4: Extract domain and validate against allowed domains
    // This is the organizational boundary enforcement
    // Only emails from approved domains (e.g., bitsathy.ac.in) pass
    // ============================================================
    const domain = extractDomain(normalizedEmailValue);
    await validateDomain(domain);
  } else {
    logger.info("Domain validation bypassed for verified system admin/faculty", {
      ip: ipAddress,
      reason: isAdmin ? "admin_whitelist" : "faculty_whitelist",
    });
  }

  // ============================================================
  // STEP 5: Hash the email for privacy-preserving storage
  // bcrypt hash prevents email enumeration if database is compromised
  // Each hash includes a unique random salt
  // ============================================================
  const emailHash = await hashEmail(normalizedEmailValue);

  // ============================================================
  // STEPS 6-11: Execute within a database transaction
  // All database operations are atomic — if any fails, all roll back
  // This prevents partial state (user created but no snapshot)
  // ============================================================
  const result = await withTransaction(async (client) => {
    // ============================================================
    // STEP 6: Find existing user or create a new one
    // Look up by normalized email (email_hash comparison is expensive)
    // If no user exists, create one with a new UUID identity
    // ============================================================
    let user = await User.findByEmailHash(normalizedEmailValue);

    if (!user) {
      // First-time login — create a new user with generated UUID
      // The UUID becomes their permanent, immutable identity
      logger.info("Creating new user — first-time login");
      user = await User.create(
        {
          emailHash,
          normalizedEmail: normalizedEmailValue,
          role: "pending", // Default role until pattern matching or admin assignment
        },
        client,
      );
    }

    // ============================================================
    // Verify the user account is active — deactivated users are rejected
    // Soft-deleted users still exist in DB but cannot authenticate
    // ============================================================
    if (!user.is_active) {
      throw new AppError(
        "User account is deactivated — contact administrator",
        403,
        "ACCOUNT_DEACTIVATED",
      );
    }

    // ============================================================
    // STEP 7: Resolve the user's role based on the priority chain
    // Priority: admin override → pattern matching → default ('pending')
    // ============================================================
    const resolvedRole = await resolveUserRole(
      normalizedEmailValue,
      user.user_role,
    );

    // ============================================================
    // STEP 8: Update the user's role if it has changed
    // Role changes are recorded for audit (next step captures snapshot)
    // ============================================================
    if (resolvedRole !== user.user_role) {
      await User.updateRole(user.internal_user_id, resolvedRole, client);
      logger.info("User role updated during login", {
        userId: user.internal_user_id,
        oldRole: user.user_role,
        newRole: resolvedRole,
      });
    }

    // ============================================================
    // STEP 9: Create an immutable identity snapshot
    // Records the EXACT identity state at this moment of login
    // This snapshot can NEVER be modified — it's permanent history
    // ============================================================
    await IdentitySnapshot.create(
      {
        userId: user.internal_user_id,
        email: normalizedEmailValue,
        role: resolvedRole,
        googleSub: googlePayload.sub,
      },
      client,
    );

    // ============================================================
    // STEP 10: Generate a signed JWT access token
    // The token contains: userId, email, role, fgp, jti, iss, aud, exp
    // This is the session identity that the client will present
    // Token is fingerprinted to the client (User-Agent + IP)
    // ============================================================
    const { token, tokenId, expiresAt } = generateAccessToken({
      userId: user.internal_user_id,
      email: normalizedEmailValue,
      role: resolvedRole,
      userAgent,
      ipAddress,
    });

    // ============================================================
    // STEP 11: Create a session audit record in the database
    // Links the JWT's jti to the user for revocation and tracking
    // Records client fingerprint (user agent, IP) for security audit
    // ============================================================
    await Session.create(
      {
        userId: user.internal_user_id,
        tokenId,
        expiresAt: expiresAt.toISOString(),
        userAgent,
        ipAddress,
      },
      client,
    );

    // ============================================================
    // STEP 12: Return session data to the controller
    // CRITICAL: NEVER return internal_user_id to the client
    // The client receives: JWT token, email, role, display name
    // ============================================================
    return {
      token,
      user: {
        email: normalizedEmailValue,
        role: resolvedRole,
        // Display metadata from Google profile — NOT identity, NOT authorization
        // 'name' matches the frontend field name used in Dashboard, UserProfile, Navbar
        // Fallback to email prefix only if Google doesn't provide a name
        name: googlePayload.name || normalizedEmailValue.split("@")[0],
        firstName: googlePayload.given_name || "",
        lastName: googlePayload.family_name || "",
        picture: googlePayload.picture || null,
      },
    };
  });

  // Log successful login completion
  logger.info("Login pipeline completed successfully", {
    ip: ipAddress,
  });

  // Return the session data to the controller for HTTP response
  return result;
};

// ============================================================
// Validate that the Google token payload has required claims
// This is Step 2 of the pipeline — defense-in-depth validation
// ============================================================

/**
 * Validate Google token payload has all required claims.
 *
 * @param {Object} payload - Verified Google token payload
 * @throws {AppError} If any required claim is missing
 */
const validateTokenClaims = (payload) => {
  // Check for email claim — our primary identity attribute
  if (!payload.email) {
    throw new AppError(
      "Google token is missing the email claim",
      401,
      "MISSING_EMAIL",
    );
  }

  // Check for email_verified — Google must confirm email ownership
  if (!payload.email_verified) {
    throw new AppError(
      "Email has not been verified by Google",
      401,
      "EMAIL_NOT_VERIFIED",
    );
  }

  // Check for sub — Google's stable unique user identifier
  if (!payload.sub) {
    throw new AppError(
      "Google token is missing the subject identifier",
      401,
      "MISSING_SUB",
    );
  }
};

// ============================================================
// Logout service — revokes the session and invalidates the JWT
// ============================================================

/**
 * Process a user logout by revoking their session.
 *
 * @param {string} tokenId - JWT's jti claim to revoke
 * @returns {Promise<boolean>} True if session was successfully revoked
 */
const processLogout = async (tokenId) => {
  if (!tokenId) {
    logger.warn("Logout attempted without token ID");
    return false;
  }

  // Revoke the session in the database
  // This makes the JWT invalid even though it hasn't expired yet
  const revoked = await Session.revokeByTokenId(tokenId);

  if (revoked) {
    logger.info("User logged out — session revoked", {
      tokenId,
    });
  }

  return !!revoked;
};

// ============================================================
// Export the auth service functions
// processLogin: Called by authController.js for login requests
// processLogout: Called by authController.js for logout requests
// ============================================================
module.exports = {
  processLogin,
  processLogout,
};
