// ============================================================
// JWT AUTHENTICATION MIDDLEWARE — Zero-Trust Token Verification
// ============================================================
// Intercepts every protected request to verify the JWT token.
// This is the CRITICAL zero-trust enforcement point — no request
// reaches a controller without passing through this middleware.
// Verifies: token existence, signature, expiry, revocation status,
// and client fingerprint (token binding to prevent theft).
// ============================================================

// Import JWT library for token verification
// jsonwebtoken verifies the HS256 signature and checks expiry
const jwt = require("jsonwebtoken");

// Import Node.js crypto for fingerprint verification
const crypto = require("crypto");

// Import JWT configuration — secret, algorithm, issuer, audience
const jwtConfig = require("../config/jwtConfig");

// Import Session model to check for token revocation
// Even a cryptographically valid JWT can be revoked server-side
const { Session } = require("../models");

// Import User model for real-time role verification on admin routes
const User = require("../models/User");

// Import PersonRepository for person_id enrichment on req.user
// This allows controllers to access the PEMM person_id without
// a separate database lookup on every request
const PersonRepository = require("../repositories/PersonRepository");

// Import logger for authentication event tracking
const logger = require("../utils/logger");

// ============================================================
// Authentication middleware function
// Extracts JWT from Authorization header, verifies it, and
// attaches the decoded user data to req.user for controllers
// ============================================================

/**
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header.
 * Attaches decoded user data to req.user on success.
 * Returns 401 on any authentication failure.
 *
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticate = async (req, res, next) => {
  try {
    // ============================================================
    // STEP 1: Extract the JWT token
    // Priority: Authorization header > query param (SSE fallback)
    // EventSource API does not support custom headers, so SSE
    // endpoints pass the token as ?token= query parameter.
    // ============================================================
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader) {
      // ---- Standard path: Bearer token from header ----
      const parts = authHeader.split(" ");
      if (parts.length !== 2 || parts[0] !== "Bearer") {
        logger.warn("Authentication failed — malformed authorization header", {
          ip: req.ip,
        });
        return res.status(401).json({
          success: false,
          error: "Invalid authorization header format — use Bearer <token>",
        });
      }
      token = parts[1];
    } else if (req.query && req.query.token) {
      // ---- SSE fallback: token from query parameter ----
      token = req.query.token;
    }

    // Reject if no token found from any source
    if (!token) {
      logger.warn("Authentication failed — no token provided", {
        ip: req.ip,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        error: "Authentication required — no token provided",
      });
    }

    // ============================================================
    // STEP 3: Verify the JWT signature, expiry, and claims
    // jwt.verify() checks: signature integrity, expiration time,
    // issuer claim, audience claim, and algorithm
    // ============================================================
    const decoded = jwt.verify(token, jwtConfig.JWT_SECRET, {
      algorithms: [jwtConfig.JWT_ALGORITHM],
      issuer: jwtConfig.JWT_ISSUER,
      audience: jwtConfig.JWT_AUDIENCE,
    });

    // ============================================================
    // STEP 4: Check if the session has been revoked server-side
    // Even a valid JWT can be invalidated via the user_sessions table
    // This enables logout and security-incident token revocation
    // ============================================================
    if (decoded.jti) {
      const session = await Session.findByTokenId(decoded.jti);

      // If session record exists and is revoked, reject the token
      // This is the server-side override of JWT statelessness
      if (session && session.revoked) {
        logger.warn("Authentication failed — token has been revoked", {
          tokenId: decoded.jti,
          userId: decoded.userId,
        });
        return res.status(401).json({
          success: false,
          error: "Token has been revoked — please log in again",
        });
      }
    }

    // ============================================================
    // STEP 5: Verify client fingerprint (token binding)
    // The fingerprint in the JWT must match the current client context.
    // If someone steals the token and uses it from a different
    // client/IP, the fingerprint won't match → reject.
    // ============================================================
    if (decoded.fgp) {
      const currentFingerprint = crypto
        .createHash("sha256")
        .update(`${req.get("User-Agent") || ""}|${req.ip || ""}`)
        .digest("hex");

      if (decoded.fgp !== currentFingerprint) {
        logger.warn(
          "Authentication failed — token fingerprint mismatch (possible token theft)",
          {
            ip: req.ip,
            userId: decoded.userId,
            tokenId: decoded.jti,
          },
        );
        return res.status(401).json({
          success: false,
          error: "Token binding verification failed — please log in again",
          code: "FINGERPRINT_MISMATCH",
        });
      }
    }

    // ============================================================
    // STEP 6: Attach decoded user data to the request object
    // Controllers access req.user to get the authenticated identity
    // This data is TRUSTED because it came from our signed JWT
    // ============================================================
    req.user = {
      userId: decoded.userId, // Internal UUID — NEVER exposed to client
      email: decoded.email, // Normalized email from login
      role: decoded.role, // Role at time of token issuance
      tokenId: decoded.jti, // JWT token ID for session tracking
    };

    // ============================================================
    // STEP 6.5: Enrich req.user with PEMM person_id
    // Resolves the auth identity to the PEMM person record so
    // controllers can access personId without extra DB lookups.
    // This is non-blocking — if the lookup fails, the request
    // proceeds with personId = null (controllers handle gracefully).
    // The indexed persons.identity_id column makes this fast (~1ms).
    // ============================================================
    try {
      const person = await PersonRepository.findByIdentityId(decoded.userId);
      if (person) {
        req.user.personId = person.personId; // PEMM person UUID
        req.user.personType = person.personType; // student/faculty/admin
        req.user.displayName = person.displayName; // PEMM display name
      }
    } catch (personErr) {
      // Person lookup failure is NON-FATAL — login still works
      // PersonProfileLinker creates the record lazily on dashboard visit
      logger.debug("Auth middleware: Person lookup skipped", {
        userId: decoded.userId,
        reason: personErr.message,
      });
    }

    // ============================================================
    // STEP 7: Pass control to the next middleware or controller
    // The request is now authenticated — controllers can proceed
    // ============================================================
    next();
  } catch (error) {
    // ============================================================
    // Handle specific JWT verification errors with clear messages
    // Each error type maps to a specific user-facing explanation
    // ============================================================

    if (error.name === "TokenExpiredError") {
      // JWT's exp claim has passed — token is no longer valid
      // The frontend should detect 401 and redirect to login
      logger.info("Authentication failed — token expired", {
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        error: "Token has expired — please log in again",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      // JWT signature verification failed — token may be tampered
      // This is a potential attack vector — log with details
      logger.warn("Authentication failed — invalid token signature", {
        ip: req.ip,
        error: error.message,
      });
      return res.status(401).json({
        success: false,
        error: "Invalid authentication token",
        code: "TOKEN_INVALID",
      });
    }

    // Unexpected error — log and return generic 401
    logger.error("Authentication middleware error", {
      error: error.message,
      ip: req.ip,
    });
    return res.status(401).json({
      success: false,
      error: "Authentication failed",
    });
  }
};

// ============================================================
// Role-based authorization middleware factory
// Creates middleware that checks if the authenticated user
// has one of the required roles to access the endpoint
// ============================================================

/**
 * Create role-checking middleware.
 * Must be used AFTER authenticate middleware in the chain.
 *
 * @param {...string} roles - Allowed roles for this endpoint
 * @returns {Function} Express middleware that checks user role
 *
 * @example
 * router.get('/admin', authenticate, authorize('admin', 'superadmin'), handler);
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // req.user is set by the authenticate middleware above
    // If it's missing, authentication didn't run or failed
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Check if the user's role is in the allowed roles list
    // Role comes from the JWT payload — set during login
    if (!roles.includes(req.user.role)) {
      logger.warn("Authorization failed — insufficient role", {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions for this action",
      });
    }

    // User has the required role — proceed to the controller
    next();
  };
};

// ============================================================
// REAL-TIME ADMIN VERIFICATION MIDDLEWARE
// Checks the user's CURRENT role from the database on every
// admin request — not just the role embedded in the JWT.
// This catches: role revocation between logins, deactivated accounts,
// and stale JWT claims from long-lived tokens.
// Use AFTER authenticate + authorize('admin') in the chain.
// ============================================================

/**
 * Verify the user is still a real admin in the database right now.
 * Prevents stale JWT role claims from granting admin access.
 *
 * @param {Request} req - Express request (authenticated)
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
const verifyAdminRealtime = async (req, res, next) => {
  try {
    // Fetch the user's CURRENT state from the database
    const user = await User.findById(req.user.userId);

    // User deleted or not found → reject
    if (!user) {
      logger.warn("Admin realtime check failed — user not found in DB", {
        userId: req.user.userId,
        ip: req.ip,
      });
      return res.status(401).json({
        success: false,
        error: "User account not found — please log in again",
      });
    }

    // Account deactivated since token was issued → reject
    if (!user.is_active) {
      logger.warn("Admin realtime check failed — account deactivated", {
        userId: req.user.userId,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        error: "Account has been deactivated",
      });
    }

    // Role changed from admin since token was issued → reject
    if (user.user_role !== "admin") {
      logger.warn("Admin realtime check failed — role downgraded since login", {
        userId: req.user.userId,
        jwtRole: req.user.role,
        dbRole: user.user_role,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        error: "Admin privileges have been revoked — please log in again",
      });
    }

    // All checks passed — user is still a real admin
    next();
  } catch (error) {
    logger.error("Admin realtime verification error", {
      error: error.message,
      userId: req.user.userId,
    });
    return res.status(500).json({
      success: false,
      error: "Authorization verification failed",
    });
  }
};

// ============================================================
// Export authentication, authorization, and admin verification
// ============================================================
module.exports = {
  authenticate,
  authorize,
  verifyAdminRealtime,
};
