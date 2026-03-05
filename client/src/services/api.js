// ============================================================
// AXIOS API INSTANCE — Configured HTTP Client with Interceptors
// ============================================================
// Creates a pre-configured Axios instance for all API communication.
// Interceptors automatically:
// - Attach JWT token to every request (Authorization header)
// - Handle 401 responses by triggering logout
// - Provide consistent error formatting across all API calls
// ============================================================

import axios from "axios";
import { API_BASE_URL } from "../utils/constants";
import { getToken, getUser, clearAuth } from "./tokenManager";

// ============================================================
// Create Axios instance with base configuration
// All API calls use this instance instead of raw axios
// This ensures consistent settings across the entire frontend
// ============================================================
const api = axios.create({
  // Base URL — all request paths are appended to this
  // e.g., api.get('/auth/me') → GET http://localhost:5000/api/auth/me
  baseURL: API_BASE_URL,

  // Default timeout — 30 seconds for all requests
  // Allows enough time for batch operations (auto-assign, recalculate)
  timeout: 30000,

  // Default headers — JSON content type for all requests
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================================
// REQUEST INTERCEPTOR — Runs before EVERY outgoing request
// Attaches the JWT token from memory to the Authorization header
// This is the main authentication mechanism for protected endpoints
// ============================================================
api.interceptors.request.use(
  (config) => {
    // Get the current JWT token from the in-memory store
    const token = getToken();

    // If a token exists, attach it as a Bearer token in the header
    // The backend's auth middleware reads this header for verification
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach Google display name for personalization
    // The backend uses this to create person records with real names
    const user = getUser();
    if (user?.name) {
      config.headers["X-Display-Name"] = user.name;
    }

    return config;
  },
  (error) => {
    // Request configuration error — pass through to catch handler
    return Promise.reject(error);
  },
);

// ============================================================
// RESPONSE INTERCEPTOR — Runs after EVERY incoming response
// Handles authentication errors (401) globally:
// - Clears the stored token
// - Redirects to the login page
// - Prevents silent authentication failures
// ============================================================
api.interceptors.response.use(
  // Success handler — pass successful responses through unchanged
  (response) => response,

  // Error handler — process authentication and other errors
  async (error) => {
    const originalRequest = error.config;

    // ============================================================
    // Handle 401 Unauthorized responses
    // This means the JWT is expired, invalid, or revoked
    // Clear the token and force a re-login
    // ============================================================
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Mark this request to prevent infinite retry loops
      originalRequest._retry = true;

      // Clear all authentication data from memory
      // The user will need to re-authenticate via Google One-Tap
      clearAuth();

      // Redirect to login page if not already there
      // Check current path to prevent redirect loops
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    // ============================================================
    // Format the error for consistent handling by callers
    // Extract the error message from the response or use a default
    // ============================================================
    // Extract the error message — ensure it's always a string
    // Backend may return error as an object {type, message} or as a string
    let rawMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred";

    // If the extracted message is an object (e.g., {type, message}), extract the string
    if (rawMessage && typeof rawMessage === "object") {
      rawMessage =
        rawMessage.message || rawMessage.error || JSON.stringify(rawMessage);
    }

    const formattedError = {
      message: String(rawMessage),
      status: error.response?.status || 0,
      code: error.response?.data?.code || "UNKNOWN_ERROR",
    };

    return Promise.reject(formattedError);
  },
);

// ============================================================
// Export the configured Axios instance
// All components and services use this for API calls
// ============================================================
export default api;
