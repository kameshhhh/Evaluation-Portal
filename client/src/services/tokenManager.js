// ============================================================
// TOKEN MANAGER — In-Memory JWT Token Storage
// ============================================================
// Manages the JWT token in memory (JavaScript variable), NOT in
// localStorage or sessionStorage. Memory storage is the most
// secure option because:
// 1. XSS attacks cannot read JavaScript variables (only storage APIs)
// 2. Token is automatically cleared on page refresh (fail-safe)
// 3. No persistent exposure to browser extensions or DevTools
// TRADEOFF: Token is lost on page refresh — user must re-verify
// ============================================================

// ============================================================
// In-memory token store — the token lives only in this variable
// It's a module-level variable, so it persists for the app's lifetime
// but is cleared when the browser tab is closed or refreshed
// ============================================================
let accessToken = null;

// ============================================================
// In-memory user data store — cached user profile from login
// Stored alongside the token for quick access without API calls
// ============================================================
let userData = null;

/**
 * Store the JWT access token in memory.
 * Called after successful login to enable authenticated API requests.
 *
 * @param {string} token - JWT access token from the backend
 */
export const setToken = (token) => {
  // Store the token in the module-level variable
  // This is accessible from any file that imports this module
  accessToken = token;
};

/**
 * Retrieve the current JWT access token from memory.
 * Used by the Axios interceptor to attach the Authorization header.
 *
 * @returns {string|null} The current JWT token or null if not authenticated
 */
export const getToken = () => {
  return accessToken;
};

/**
 * Store the user profile data in memory.
 * Cached for display purposes — the backend is always authoritative.
 *
 * @param {Object} user - User profile data from login response
 */
export const setUser = (user) => {
  userData = user;
};

/**
 * Retrieve the cached user profile data.
 *
 * @returns {Object|null} Cached user data or null
 */
export const getUser = () => {
  return userData;
};

/**
 * Clear all stored authentication data.
 * Called during logout to remove all traces of the session.
 * Also called when the backend returns 401 (token expired/invalid).
 */
export const clearAuth = () => {
  // Set both to null — garbage collector will reclaim the memory
  accessToken = null;
  userData = null;
};

/**
 * Check if the user is currently authenticated.
 * Simple presence check — the backend validates the actual token.
 *
 * @returns {boolean} True if a token exists in memory
 */
export const isAuthenticated = () => {
  return !!accessToken;
};
