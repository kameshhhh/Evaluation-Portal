// ============================================================
// SECURITY HEADERS MIDDLEWARE — HTTP Security Hardening
// ============================================================
// Configures security-related HTTP headers using the Helmet library.
// These headers protect against common web attacks:
// - XSS (Cross-Site Scripting)
// - Clickjacking
// - MIME sniffing
// - Information leakage
// Headers are set on EVERY response for comprehensive protection.
// ============================================================

// Import Helmet — sets various HTTP headers for security
// Helmet is a collection of 15 smaller middleware functions
// that set security-related HTTP response headers
const helmet = require("helmet");

// ============================================================
// Configure security headers middleware
// Each header addresses a specific attack vector
// Production configuration is stricter than development
// ============================================================

/**
 * Create security headers middleware with production-safe defaults.
 * Must be registered EARLY in the middleware chain (before routes).
 *
 * @returns {Function} Express middleware that sets security headers
 */
const securityHeaders = () => {
  return helmet({
    // ============================================================
    // Content-Security-Policy (CSP)
    // Controls which resources the browser is allowed to load
    // Prevents XSS by restricting script sources
    // ============================================================
    contentSecurityPolicy: {
      directives: {
        // Only allow content from the same origin by default
        defaultSrc: ["'self'"],

        // Scripts: same origin + Google APIs (for One-Tap)
        // 'unsafe-inline' needed for Google's One-Tap script injection
        scriptSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://apis.google.com",
        ],

        // Styles: same origin + inline styles (Tailwind generates these)
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],

        // Images: same origin + Google profile pictures + data URIs
        imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],

        // Fonts: same origin + CDNs for Bootstrap Icons / Google Fonts
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"],

        // Frames: allow Google's One-Tap iframe
        frameSrc: ["'self'", "https://accounts.google.com"],

        // Connect: allow API calls to our backend + dev tunnels
        connectSrc: [
          "'self'",
          "https://accounts.google.com",
          "https://*.devtunnels.ms",
        ],
      },
    },

    // ============================================================
    // X-DNS-Prefetch-Control
    // Controls DNS prefetching — off to prevent privacy leaks
    // Browsers won't pre-resolve domains found in page content
    // ============================================================
    dnsPrefetchControl: { allow: false },

    // ============================================================
    // X-Frame-Options
    // Prevents the page from being embedded in iframes (clickjacking)
    // SAMEORIGIN allows our own iframes but blocks external embedding
    // ============================================================
    frameguard: { action: "sameorigin" },

    // ============================================================
    // Strict-Transport-Security (HSTS)
    // Forces HTTPS for all future requests (1 year)
    // includeSubDomains ensures all subdomains also use HTTPS
    // ============================================================
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true, // Allow inclusion in browser HSTS preload list
    },

    // ============================================================
    // X-Content-Type-Options: nosniff
    // Prevents browsers from MIME-sniffing responses
    // Ensures content is processed according to Content-Type header
    // ============================================================
    noSniff: true,

    // ============================================================
    // ============================================================
    // Referrer-Policy
    // Controls how much referrer information is sent with requests
    // 'strict-origin-when-cross-origin' balances functionality and privacy
    // ============================================================
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },

    // ============================================================
    // X-XSS-Protection
    // Legacy XSS filter — modern CSP supersedes this
    // Set to 0 to disable (can cause issues with some browsers)
    // ============================================================
    xssFilter: true,

    // ============================================================
    // Cross-Origin-Opener-Policy
    // Isolates the browsing context to prevent cross-origin attacks
    // 'same-origin' prevents external sites from accessing window reference
    // ============================================================
    // 'same-origin-allow-popups' allows Google One-Tap popup to communicate back
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },

    // ============================================================
    // Cross-Origin-Resource-Policy
    // 'cross-origin' allows tunnel frontend to load backend resources
    // ============================================================
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
};

// ============================================================
// Permissions-Policy middleware
// Controls which browser features the page can use
// Disables dangerous APIs like camera, microphone, geolocation
// that our app does not need — reduces attack surface
// ============================================================
const permissionsPolicy = () => {
  return (req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
    );
    next();
  };
};

// ============================================================
// Export the security headers middleware factory
// ============================================================
module.exports = { securityHeaders, permissionsPolicy };
