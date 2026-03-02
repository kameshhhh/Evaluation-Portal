// ============================================================
// CLIENT-SIDE VALIDATION — Input Validation Utilities
// ============================================================
// Even though the backend validates EVERYTHING (zero-trust),
// client-side validation improves UX by catching obvious errors
// before making network requests. These checks are NOT security
// — they are convenience for the user.
// ============================================================

/**
 * Validate that a Google credential token looks plausible.
 * This is NOT cryptographic verification — just format checking.
 * The backend does the real verification against Google's keys.
 *
 * @param {string} credential - Google ID token string
 * @returns {{ isValid: boolean, error?: string }}
 */
export const validateGoogleCredential = (credential) => {
  // Check that the credential exists and is a non-empty string
  if (!credential || typeof credential !== "string") {
    return { isValid: false, error: "Google credential is missing" };
  }

  // Google ID tokens are JWT format — three base64 parts separated by dots
  // Minimum reasonable length is ~500 characters
  if (credential.length < 100) {
    return { isValid: false, error: "Google credential appears invalid" };
  }

  // Basic JWT format check — should have exactly 3 parts separated by dots
  const parts = credential.split(".");
  if (parts.length !== 3) {
    return { isValid: false, error: "Google credential has invalid format" };
  }

  // Passed basic format checks — backend will do cryptographic verification
  return { isValid: true };
};

/**
 * Validate that an API response has the expected structure.
 * Prevents the client from crashing on malformed API responses.
 *
 * @param {Object} response - API response object
 * @returns {{ isValid: boolean, error?: string }}
 */
export const validateApiResponse = (response) => {
  // Response must be an object with a success boolean
  if (!response || typeof response !== "object") {
    return { isValid: false, error: "Invalid response format" };
  }

  // The 'success' property must be present
  if (typeof response.success !== "boolean") {
    return { isValid: false, error: "Response missing success indicator" };
  }

  return { isValid: true };
};
