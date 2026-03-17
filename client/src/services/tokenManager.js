// ============================================================
// TOKEN MANAGER — JWT Token Storage with localStorage persistence
// ============================================================
// Manages the JWT token in memory AND localStorage so the session
// survives page refreshes. On module load the token is restored
// from localStorage into the in-memory variable for fast access.
// ============================================================
  
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

// Restore from localStorage on module load (survives refresh)
let accessToken = (() => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
})();

let userData = (() => {
  try {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
})();

/**
 * Store the JWT access token in memory.
 * Called after successful login to enable authenticated API requests.
 *
 * @param {string} token - JWT access token from the backend
 */
export const setToken = (token) => {
  accessToken = token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
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
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
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
  accessToken = null;
  userData = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("user_profile_cache");
  } catch { /* ignore */ }
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
