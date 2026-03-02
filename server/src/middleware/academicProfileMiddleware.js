// ============================================================
// ACADEMIC PROFILE MIDDLEWARE — INJECT ACADEMIC PROFILE INTO REQUEST
// ============================================================
// This Express middleware runs AFTER auth middleware and BEFORE
// personalization routes. It automatically infers academic
// profile data from the authenticated user's email and attaches
// it to req.academicProfile for downstream handlers.
//
// FLOW:
//   1. Auth middleware runs → sets req.user = { userId, email, role }
//   2. THIS middleware runs → parses email → sets req.academicProfile
//   3. Personalization controller runs → uses req.academicProfile
//
// WHY MIDDLEWARE AND NOT INLINE IN CONTROLLER:
//   - Separation of concerns: parsing ≠ request handling
//   - Reusable: any route can access academic profile
//   - Testable: middleware can be tested independently
//   - Non-blocking: if parsing fails, request continues
//
// SECURITY:
//   - Only runs after authentication (req.user must exist)
//   - No database calls (pure email parsing)
//   - No modification of req.user (preserves auth data)
//   - Adds a NEW field (req.academicProfile), never overwrites existing
//
// PERFORMANCE:
//   - Pure function parsing is < 1ms per request
//   - No I/O, no network calls, no database queries
//   - Zero impact on request latency
// ============================================================

// Import the academic identity parser — pure function, no side effects
const {
  parseStudentAcademicInfo, // Parses email → academic profile
} = require("../services/personalization/academic/AcademicIdentityParser");

// Import the academic profile builder — enriches with context
const {
  buildAcademicProfile, // Builds full profile with academic context
} = require("../services/personalization/academic/AcademicProfileBuilder");

// Import logger for middleware operation tracking
const logger = require("../utils/logger");

// ============================================================
// MIDDLEWARE: Inject Academic Profile
// ============================================================
/**
 * Express middleware that parses the authenticated user's email
 * and attaches an academic profile object to the request.
 *
 * After this middleware runs, downstream handlers can access:
 *   req.academicProfile — contains department, year, confidence, etc.
 *
 * This middleware NEVER blocks the request. If parsing fails,
 * req.academicProfile is set to a LOW-confidence fallback.
 *
 * @param {Request} req - Express request (must have req.user from auth)
 * @param {Response} res - Express response (unused — middleware passes through)
 * @param {Function} next - Express next function (always called)
 *
 * @example
 *   // In route definition:
 *   app.use('/api/personalization', authenticate, academicProfileMiddleware, routes);
 *
 *   // In controller:
 *   const dept = req.academicProfile?.departmentCode; // 'MZ' or null
 */
const academicProfileMiddleware = (req, res, next) => {
  // ---------------------------------------------------------
  // GUARD: Auth middleware must have set req.user
  // If not, skip academic parsing — auth already failed upstream
  // ---------------------------------------------------------
  if (!req.user || !req.user.email) {
    // No authenticated user — skip parsing, continue to next handler
    // The auth middleware will have already returned 401 if needed
    req.academicProfile = null; // Explicitly null — not undefined
    return next(); // Pass through without blocking
  }

  try {
    // ---------------------------------------------------------
    // STEP 1: Parse academic info from the email
    // This is a pure function call — no I/O, no DB, < 1ms
    // ---------------------------------------------------------
    const academicInfo = parseStudentAcademicInfo(req.user.email);

    // ---------------------------------------------------------
    // STEP 2: Build the full academic profile with context
    // Adds year of study, semester, graduation year, etc.
    // ---------------------------------------------------------
    const personStub = {
      identity_id: req.user.userId, // Auth identity for linking
      person_type: req.user.role || "student", // Role from auth JWT
    };

    // Build the complete academic profile
    const academicProfile = buildAcademicProfile(personStub, req.user.email);

    // ---------------------------------------------------------
    // STEP 3: Attach academic profile to the request
    // Downstream handlers access via req.academicProfile
    // ---------------------------------------------------------
    req.academicProfile = academicProfile;

    // Log successful academic inference (debug level)
    logger.debug("AcademicProfileMiddleware: Profile injected", {
      userId: req.user.userId, // For correlation
      departmentCode: academicProfile.departmentCode, // Inferred dept
      admissionYear: academicProfile.admissionYear, // Inferred year
      confidence: academicProfile.academicConfidence, // HIGH or LOW
    });
  } catch (error) {
    // ---------------------------------------------------------
    // ERROR HANDLING: Parsing failed — set fallback, do NOT block request
    // Academic parsing should never prevent a user from accessing their dashboard
    // ---------------------------------------------------------
    logger.warn("AcademicProfileMiddleware: Parsing failed, using fallback", {
      userId: req.user.userId,
      email: req.user.email,
      error: error.message,
    });

    // Set a minimal fallback profile — LOW confidence, no department
    req.academicProfile = {
      identityId: req.user.userId,
      personType: req.user.role || "student",
      departmentCode: null,
      departmentName: null,
      admissionYear: null,
      academicConfidence: "LOW",
      academicSource: "MIDDLEWARE_FALLBACK",
      requiresManualCompletion: true,
      isComplete: false,
    };
  }

  // Always continue to the next handler
  // Academic parsing is non-blocking — the dashboard still works without it
  next();
};

// ============================================================
// EXPORT — Single middleware function
// ============================================================
module.exports = academicProfileMiddleware;
