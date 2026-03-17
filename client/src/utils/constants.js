// ============================================================
// APP CONSTANTS — Centralized Configuration Values
// ============================================================
// All magic strings, URLs, and configuration values live here.
// Importing from constants.js ensures single-source-of-truth
// for values used across multiple components and services.
// ============================================================

// ============================================================
// API Configuration
// Base URL for all backend API requests
// Auto-detects dev tunnel: if accessed via devtunnels.ms, swap port 3000→5000
// Otherwise uses REACT_APP_API_URL or localhost fallback
// ============================================================
const _buildApiUrl = () => {
  // If env var is explicitly set and not the default localhost, use it
  if (
    process.env.REACT_APP_API_URL &&
    process.env.REACT_APP_API_URL !== "http://localhost:5000/api" &&
    typeof window === "undefined"
  ) {
    return process.env.REACT_APP_API_URL;
  }
  // Auto-detect dev tunnel (devtunnels.ms) — swap frontend port to backend port
  if (
    typeof window !== "undefined" &&
    window.location.hostname.includes("devtunnels.ms")
  ) {
    const backendOrigin = window.location.origin.replace("-3000.", "-5000.");
    return `${backendOrigin}/api`;
  }
  return process.env.REACT_APP_API_URL || "http://localhost:5000/api";
};
export const API_BASE_URL = _buildApiUrl();

// ============================================================
// Google OAuth Configuration
// Client ID must match the backend's GOOGLE_CLIENT_ID exactly
// Any mismatch causes token verification failure on the backend
// ============================================================
export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

// ============================================================
// Login State Machine States
// Explicit state definitions for the authentication flow
// Each state has defined transitions — no undefined behaviors
// ============================================================
export const LOGIN_STATES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  GOOGLE_AUTH_IN_PROGRESS: "GOOGLE_AUTH_IN_PROGRESS",
  GOOGLE_TOKEN_RECEIVED: "GOOGLE_TOKEN_RECEIVED",
  SERVER_VALIDATION_IN_PROGRESS: "SERVER_VALIDATION_IN_PROGRESS",
  IDENTITY_ISSUED: "IDENTITY_ISSUED",
  SESSION_ACTIVE: "SESSION_ACTIVE",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  LOGOUT: "LOGOUT",
  ERROR: "ERROR",
};

// ============================================================
// State transition rules — defines which states can follow which
// Prevents invalid state transitions that could cause race conditions
// ============================================================
export const STATE_TRANSITIONS = {
  [LOGIN_STATES.UNAUTHENTICATED]: [LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS],
  [LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS]: [
    LOGIN_STATES.GOOGLE_TOKEN_RECEIVED,
    LOGIN_STATES.ERROR,
  ],
  [LOGIN_STATES.GOOGLE_TOKEN_RECEIVED]: [
    LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS,
    LOGIN_STATES.ERROR,
  ],
  [LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS]: [
    LOGIN_STATES.IDENTITY_ISSUED,
    LOGIN_STATES.ERROR,
  ],
  [LOGIN_STATES.IDENTITY_ISSUED]: [LOGIN_STATES.SESSION_ACTIVE],
  [LOGIN_STATES.SESSION_ACTIVE]: [
    LOGIN_STATES.SESSION_EXPIRED,
    LOGIN_STATES.LOGOUT,
  ],
  [LOGIN_STATES.SESSION_EXPIRED]: [LOGIN_STATES.UNAUTHENTICATED],
  [LOGIN_STATES.LOGOUT]: [LOGIN_STATES.UNAUTHENTICATED],
  [LOGIN_STATES.ERROR]: [LOGIN_STATES.UNAUTHENTICATED],
};

// ============================================================
// User-friendly state labels for the UI state indicator
// Maps internal state names to display-friendly text
// ============================================================
export const STATE_LABELS = {
  [LOGIN_STATES.UNAUTHENTICATED]: "Ready to sign in",
  [LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS]: "Authenticating with Google...",
  [LOGIN_STATES.GOOGLE_TOKEN_RECEIVED]:
    "Google verified — contacting server...",
  [LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS]: "Verifying identity...",
  [LOGIN_STATES.IDENTITY_ISSUED]: "Identity confirmed!",
  [LOGIN_STATES.SESSION_ACTIVE]: "Session active",
  [LOGIN_STATES.SESSION_EXPIRED]: "Session expired",
  [LOGIN_STATES.LOGOUT]: "Logging out...",
  [LOGIN_STATES.ERROR]: "Authentication error",
};

// ============================================================
// Application metadata
// ============================================================
export const APP_NAME = "BITSathy Auth";
export const APP_VERSION = "1.0.0";

// ============================================================
// Token storage key — used for memory-based token management
// Note: tokens are stored in memory (variable), NOT localStorage
// This constant is for the token manager's internal reference
// ============================================================
export const TOKEN_KEY = "auth_token";

// ============================================================
// Route paths — centralized route configuration
// ============================================================
export const ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  PROFILE: "/profile",
  // Project routes
  PROJECT_LIST: "/projects",
  CREATE_PROJECT: "/projects/new",
  PROJECT_DASHBOARD: "/projects/:projectId",
  // Scarcity evaluation routes (Step 4)
  SCARCITY_EVALUATION: "/scarcity/evaluate/:sessionId",
  SCARCITY_RESULTS: "/scarcity/results/:sessionId",
  // Credibility-weighted results route (Step 5)
  WEIGHTED_RESULTS: "/scarcity/weighted-results/:sessionId",
  // Showcase presentation page (Step 5 — Part 4.5)
  SHOWCASE: "/showcase/:sessionId",
  // Credibility Bands Overview (admin only — SRS 7.2)
  ADMIN_CREDIBILITY: "/admin/credibility",
  // Faculty-specific routes
  SCOPE_SETUP: "/scope/setup",
  SESSION_STATUS: "/sessions/status/:sessionId",
  CREATE_SESSION: "/sessions/create",
  // Student results
  MY_RESULTS: "/my-results",
  // SRS Analytics Dashboard (Sections 6, 6.2, 7, 4.4.3, 4.5.3)
  ANALYTICS: "/scarcity/analytics/:personId",
  // Faculty Evaluation — SRS §4.4 (scarcity-based tier ranking)
  FACULTY_EVALUATION: "/faculty-evaluation",
  FACULTY_EVALUATION_SESSION: "/faculty-evaluation/:sessionId",
  FACULTY_EVALUATION_DASHBOARD: "/faculty-evaluation/dashboard",
  FACULTY_RESULTS: "/faculty-results",
  FACULTY_RESULTS_SESSION: "/faculty-results/:sessionId",
  ADMIN_FACULTY_RESULTS: "/admin/faculty-results",
  ADMIN_FACULTY_RESULTS_SESSION: "/admin/faculty-results/:sessionId",
  ADMIN_NORMALIZATION: "/admin/normalization",
  // Exposure Normalization Engine — SRS §4.4.3 (B-02)
  NORMALIZATION_BREAKDOWN: "/normalization/breakdown/:sessionId/:facultyId",
  NORMALIZATION_BREAKDOWN_BASE: "/normalization/breakdown",
  WHAT_IF_SIMULATOR: "/normalization/what-if/:sessionId",
  WHAT_IF_SIMULATOR_BASE: "/normalization/what-if",
  // Peer Ranking Survey — SRS §4.5 (click-to-assign forced ranking)
  PEER_RANKING: "/peer-ranking",
  PEER_RANKING_SURVEY: "/peer-ranking/:surveyId",
  // Comparative Evaluation — SRS §4.3 (cross-project matrix grid)
  COMPARATIVE: "/comparative",
  COMPARATIVE_SESSION: "/comparative/:sessionId",
  COMPARATIVE_ADMIN: "/comparative/admin",
  // Zero-Score Analytics — SRS §4.1.5 (standalone dashboard)
  ZERO_SCORE_ANALYTICS: "/analytics/zero-scores",
  // Session Planner — team formation + faculty↔student assignment
  TEAM_FORMATION: "/team-formation",
  SESSION_PLANNER: "/session-planner/:sessionId",
  SESSION_PLANNER_BASE: "/session-planner",
  SESSION_PLANNER_DETAIL: "/session-planner/view/:sessionId",
  // Work Log — standalone time-tracking tab
  WORKLOG: "/worklog",
  // GitHub Profile — admin views student's GitHub
  GITHUB_PROFILE: "/github/:personId",
};
