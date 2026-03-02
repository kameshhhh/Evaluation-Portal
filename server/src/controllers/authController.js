// ============================================================
// AUTH CONTROLLER — HTTP Endpoint Handlers for Authentication
// ============================================================
// Maps HTTP requests to auth service operations.
// Controllers are THIN — they extract request data, call services,
// and format HTTP responses. No business logic lives here.
// Every response follows the format: { success, data?, error? }
// ============================================================

// Import the auth service for login and logout operations
const { processLogin, processLogout } = require("../services/authService");

// Import the User model for profile lookups
const { User } = require("../models");

// Import PersonSyncService to ensure person records exist on login
// This bridges the auth system (users table) to the PEMM system (persons table)
// Without this, students who login won't appear in Faculty/Admin dashboards
const PersonSyncService = require("../services/personalization/PersonSyncService");

// Import PersonRepository for profile enrichment on /me endpoint
const PersonRepository = require("../repositories/PersonRepository");

// Import logger for request tracking
const logger = require("../utils/logger");

// Import Faculty Scope Service for profile enrichment
const facultyScopeService = require("../services/facultyScopeService");

// ============================================================
// POST /api/auth/google/login — Google One-Tap Login
// Receives the Google ID token from the frontend and processes
// it through the 12-step zero-trust login pipeline
// ============================================================

/**
 * Handle Google login request.
 * Extracts the Google credential, client metadata, and
 * delegates to the authService pipeline.
 *
 * @param {Request} req - Express request with Google credential in body
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware (error handler)
 */
const googleLogin = async (req, res, next) => {
  try {
    // Extract the Google ID token from the request body
    // The frontend sends this after receiving it from Google One-Tap
    const { credential } = req.body;

    // Validate that the credential is present
    // This is a basic check — detailed validation happens in the pipeline
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: "Google credential token is required",
        code: "MISSING_CREDENTIAL",
      });
    }

    // Extract client metadata for audit logging
    // User-Agent identifies the client browser/device
    const userAgent = req.get("User-Agent") || "unknown";

    // IP address for audit trail — may be forwarded by proxy
    // req.ip respects Express's 'trust proxy' setting
    const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";

    // ============================================================
    // Delegate to the auth service pipeline
    // This runs the full 12-step zero-trust verification process
    // Returns { token, user } on success, throws on failure
    // ============================================================
    const result = await processLogin(credential, userAgent, ipAddress);

    // ============================================================
    // POST-LOGIN: Ensure a person record exists in the PEMM system
    // ============================================================
    let personData = null;
    let scopeData = null;
    try {
      const userRecord = await User.findByEmailHash(result.user.email);
      if (userRecord) {
        personData = await PersonSyncService.syncPersonOnLogin(
          userRecord,
          result.user.name,
        );

        // ENRICHMENT: Fetch scope status for immediate frontend redirection
        if (userRecord.user_role === 'faculty' || userRecord.user_role === 'admin') {
          try {
            scopeData = await facultyScopeService.getScope(userRecord.internal_user_id);
          } catch (scopeErr) {
            logger.error("googleLogin: Scope lookup failed", { error: scopeErr.message });
          }
        }
      }
    } catch (syncError) {
      logger.warn("Person sync after login failed", {
        email: result.user.email,
        error: syncError.message,
      });
    }

    // ============================================================
    // Return the session data to the client
    // ============================================================
    return res.status(200).json({
      success: true,
      data: {
        token: result.token,
        user: {
          ...result.user,
          personId: personData?.personId || null,
          personType: personData?.personType || null,
          // Scope Data for immediate redirection logic
          scopeStatus: scopeData?.scope_status || null,
          scopeLabels: scopeData?.scope_labels || [],
        },
      },
    });
  } catch (error) {
    // Pass errors to the global error handler middleware
    // The error handler normalizes the response format
    next(error);
  }
};

// ============================================================
// POST /api/auth/logout — Revoke Session
// Invalidates the current JWT by revoking its session record
// The client should also clear the token from memory
// ============================================================

/**
 * Handle logout request.
 * Revokes the current session, making the JWT invalid.
 *
 * @param {Request} req - Express request with user data from auth middleware
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const logout = async (req, res, next) => {
  try {
    // Extract the token ID from the authenticated request
    // req.user is set by the auth middleware after JWT verification
    const tokenId = req.user?.tokenId;

    // Revoke the session in the database
    await processLogout(tokenId);

    // Return success — client should clear token from memory
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET /api/auth/me — Get Current User Profile
// Returns the authenticated user's profile data
// Requires a valid JWT — enforced by auth middleware
// ============================================================

/**
 * Get the current authenticated user's profile.
 * Uses the userId from the JWT to look up the user record.
 *
 * @param {Request} req - Express request with user data from auth middleware
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const getProfile = async (req, res, next) => {
  try {
    // Look up the user by their internal UUID from the JWT claims
    // The UUID was set during login and is embedded in the signed JWT
    const user = await User.findById(req.user.userId);

    // If the user doesn't exist (deleted between login and this request)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Look up the corresponding person record for PEMM data
    // This enriches the profile with personId, personType, displayName
    // Faculty/Admin dashboards need personId for student queries
    let personInfo = null;
    try {
      const person = await PersonRepository.findByIdentityId(req.user.userId);
      if (person) {
        personInfo = {
          personId: person.personId,
          personType: person.personType,
          displayName: person.displayName,
          departmentCode: person.departmentCode,
          admissionYear: person.admissionYear,
          status: person.status,
        };
      }
    } catch (personErr) {
      // Non-critical — profile still returns auth data if person lookup fails
      logger.warn("getProfile: Person lookup failed", {
        userId: req.user.userId,
        error: personErr.message,
      });
    }

    // Faculty Scope Enrichment
    // If user is faculty, fetch their scope status and labels for the UI badge
    let scopeData = null;
    if (user.user_role === 'faculty') {
      try {
        scopeData = await facultyScopeService.getScope(req.user.userId);
      } catch (scopeErr) {
        logger.error("getProfile: Faculty scope lookup failed", { userId: req.user.userId, error: scopeErr.message });
      }
    }

    // Return the user profile — NEVER include internal_user_id
    // Only return data that the client is authorized to see
    // Now enriched with PEMM person data for cross-dashboard sync
    return res.status(200).json({
      success: true,
      data: {
        email: user.normalized_email,
        role: user.user_role,
        isActive: user.is_active,
        createdAt: user.created_at,
        // PEMM person data — enables frontend to store personId in context
        personId: personInfo?.personId || null,
        personType: personInfo?.personType || null,
        displayName: personInfo?.displayName || null,
        departmentCode: personInfo?.departmentCode || null,
        admissionYear: personInfo?.admissionYear || null,
        personStatus: personInfo?.status || null,

        // Faculty Scope Data
        scopeStatus: scopeData?.scope_status || null,
        scopeLabels: scopeData?.scope_labels || [],
        scopeBootstrapComplete: scopeData?.scope_status === 'exists',
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// GET /api/auth/verify — Verify Token Validity
// Lightweight endpoint to check if the current JWT is still valid
// Used by the frontend to check auth state on page load
// ============================================================

/**
 * Verify the current JWT token is valid.
 * If this endpoint returns 200, the token is valid.
 * 401 is returned by the auth middleware if invalid.
 *
 * @param {Request} req - Express request (authenticated)
 * @param {Response} res - Express response
 */
const verifyToken = async (req, res) => {
  // If we reached this handler, the auth middleware already verified the JWT
  // Simply return the user data from the verified token
  return res.status(200).json({
    success: true,
    data: {
      email: req.user.email,
      role: req.user.role,
    },
  });
};

// ============================================================
// Export all auth controller handlers
// Mapped to routes in authRoutes.js
// ============================================================
module.exports = {
  googleLogin,
  logout,
  getProfile,
  verifyToken,
};
