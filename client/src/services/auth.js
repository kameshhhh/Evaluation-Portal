// ============================================================
// AUTH SERVICE — Frontend Authentication API Layer
// ============================================================
// Provides functions for calling authentication endpoints.
// This is a thin wrapper around the Axios API instance.
// NO business logic here — just HTTP request formatting.
// The backend is AUTHORITATIVE for all auth decisions.
// ============================================================

import api from "./api";

/**
 * Send a Google credential to the backend for verification.
 * This initiates the 12-step zero-trust login pipeline.
 *
 * @param {string} credential - Google ID token from One-Tap
 * @returns {Promise<{ success: boolean, data: { token: string, user: Object } }>}
 */
export const loginWithGoogle = async (credential) => {
  // POST the Google credential to the backend's login endpoint
  // The backend will verify it against Google's public keys,
  // validate the domain, create/find the user, and return a JWT
  const response = await api.post("/auth/google/login", { credential });
  return response.data;
};

/**
 * Revoke the current session (logout).
 * The backend marks the JWT as revoked in the sessions table.
 *
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const logout = async () => {
  const response = await api.post("/auth/logout");
  return response.data;
};

/**
 * Get the current authenticated user's profile.
 * Used to load user data after page refresh or token verification.
 *
 * @returns {Promise<{ success: boolean, data: Object }>}
 */
export const getProfile = async () => {
  const response = await api.get("/auth/me");
  return response.data;
};

/**
 * Verify that the current JWT token is still valid.
 * Lightweight endpoint that returns 200 if the token is valid.
 * Used on app initialization to check if the user is still logged in.
 *
 * @returns {Promise<{ success: boolean, data: { email: string, role: string } }>}
 */
export const verifyToken = async () => {
  const response = await api.get("/auth/verify");
  return response.data;
};
