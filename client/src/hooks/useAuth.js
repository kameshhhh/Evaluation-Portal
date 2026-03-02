// ============================================================
// AUTH HOOK — Authentication State Access Hook
// ============================================================
// Custom hook that provides easy access to the AuthContext.
// Components use this hook instead of directly consuming the context.
// Throws an error if used outside of the AuthProvider.
// ============================================================

import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext";

/**
 * Custom hook for accessing authentication state and actions.
 * Must be used within an AuthProvider component.
 *
 * @returns {{
 *   user: Object|null,
 *   token: string|null,
 *   isAuthenticated: boolean,
 *   isLoading: boolean,
 *   loginState: string,
 *   error: string|null,
 *   loginWithGoogleCredential: Function,
 *   handleLogout: Function,
 * }}
 * @throws {Error} If used outside of AuthProvider
 */
const useAuth = () => {
  // Consume the AuthContext — contains all auth state and actions
  const context = useContext(AuthContext);

  // Guard: Ensure the hook is used within an AuthProvider
  // This prevents cryptic 'undefined' errors in components
  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider. " +
        "Wrap your app in <AuthProvider> in App.jsx.",
    );
  }

  // Return the full context value for the consuming component
  return context;
};

export default useAuth;
