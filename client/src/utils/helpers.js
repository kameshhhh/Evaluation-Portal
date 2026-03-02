// ============================================================
// HELPER FUNCTIONS — Reusable Utility Functions
// ============================================================
// Provides common utility functions used across the frontend.
// These are pure functions with no side effects — easy to test.
// ============================================================

/**
 * Format a date to a human-readable string.
 * Uses the user's locale for culturally appropriate formatting.
 *
 * @param {string|Date} dateString - ISO date string or Date object
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  // Guard against null/undefined dates
  if (!dateString) return "N/A";

  // Create a Date object and format using the user's locale
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Capitalize the first letter of a string.
 * Used for displaying role names with proper casing.
 *
 * @param {string} str - Input string
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Get initials from a display name for avatar display.
 * Extracts the first letter of the first two words.
 *
 * @param {string} name - User's display name or email
 * @returns {string} Two-letter initials (uppercase)
 */
export const getInitials = (name) => {
  if (!name) return "??";

  const parts = name.trim().split(/[\s@.]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param {string} str - Input string
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} Truncated string with '...' if needed
 */
export const truncate = (str, maxLength = 30) => {
  if (!str || str.length <= maxLength) return str || "";
  return str.substring(0, maxLength) + "...";
};

/**
 * Get a role badge color class for Tailwind CSS.
 * Maps role names to specific color schemes for visual distinction.
 *
 * @param {string} role - User's role name
 * @returns {string} Tailwind CSS class string for the badge
 */
export const getRoleBadgeClasses = (role) => {
  const roleColors = {
    admin: "bg-red-100 text-red-800 border-red-200",
    faculty: "bg-purple-100 text-purple-800 border-purple-200",
    student: "bg-blue-100 text-blue-800 border-blue-200",
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  };

  return (
    roleColors[role?.toLowerCase()] ||
    "bg-gray-100 text-gray-800 border-gray-200"
  );
};

/**
 * Create a delay promise for controlled timing.
 * Used for minimum loading state durations (UX improvement).
 *
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
