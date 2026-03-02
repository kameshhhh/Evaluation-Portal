// ============================================================
// AUTH CONTEXT — React Context for Global Authentication State
// ============================================================
// Provides authentication state and actions to the entire React tree.
// Uses React Context + useReducer pattern for predictable state updates.
// The AuthProvider wraps the app in App.jsx, making auth state
// available to every component via the useAuth() hook.
// ============================================================

import React, { createContext, useState, useEffect, useCallback } from "react";
import {
  loginWithGoogle,
  logout as logoutApi,
  getProfile,
} from "../services/auth";
import {
  setToken,
  getToken,
  setUser,
  clearAuth,
  isAuthenticated as checkAuth,
} from "../services/tokenManager";
import { LOGIN_STATES } from "../utils/constants";
import useLoginState from "../hooks/useLoginState";

// ============================================================
// Create the context object
// This is consumed by the useAuth() hook in child components
// ============================================================
export const AuthContext = createContext(null);

// ============================================================
// AUTH PROVIDER COMPONENT — Wraps the app with auth state
// ============================================================

/**
 * AuthProvider component that provides authentication state to the React tree.
 * Manages: user data, login state machine, token lifecycle.
 *
 * @param {{ children: React.ReactNode }} props
 */
export const AuthProvider = ({ children }) => {
  // ============================================================
  // State management
  // ============================================================

  // User profile data — null when not authenticated
  const [user, setUserState] = useState(null);

  // Loading flag for initial authentication check on mount
  const [isLoading, setIsLoading] = useState(true);

  // Login state machine hook — manages the auth flow states
  const {
    loginState,
    error,
    isLoadingState,
    isErrorState,
    transitionTo,
    setErrorState,
    reset,
  } = useLoginState();

  // ============================================================
  // Check authentication status on mount
  // If a token exists in memory (shouldn't after refresh, but
  // handles edge cases), verify it with the backend
  // ============================================================
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // If there's no token in memory, user is not authenticated
        if (!checkAuth()) {
          setIsLoading(false);
          return;
        }

        // Token exists — verify it with the backend
        const response = await getProfile();

        if (response.success) {
          // Token is still valid — restore the user state
          // Merge with localStorage cache for fields not returned by /auth/me
          // (picture, name come from Google OAuth, not stored in DB)
          const cachedProfile = (() => {
            try {
              const stored = localStorage.getItem("user_profile_cache");
              return stored ? JSON.parse(stored) : {};
            } catch {
              return {};
            }
          })();

          const mergedUser = {
            ...cachedProfile,
            ...response.data,
            // Restore picture from cache if not in /auth/me response
            picture: response.data.picture || cachedProfile.picture || null,
            // Restore name: prefer displayName from Person, fallback to cached Google name
            name:
              response.data.displayName ||
              cachedProfile.name ||
              response.data.email?.split("@")[0],
          };

          setUserState(mergedUser);
          setUser(mergedUser);
          transitionTo(LOGIN_STATES.SESSION_ACTIVE);
        } else {
          // Token is invalid — clear everything
          clearAuth();
        }
      } catch (err) {
        // Verification failed — clear auth state
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };



    checkAuthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Refreshes the user profile data from the backend.
   * Useful after profile updates (e.g. Scope Setup).
   */
  const refreshUser = useCallback(async () => {
    try {
      const response = await getProfile();
      if (response.success) {
        const cachedProfile = (() => {
          try {
            const stored = localStorage.getItem("user_profile_cache");
            return stored ? JSON.parse(stored) : {};
          } catch {
            return {};
          }
        })();

        const mergedUser = {
          ...cachedProfile,
          ...response.data,
          picture: response.data.picture || cachedProfile.picture || null,
          name: response.data.displayName || cachedProfile.name || response.data.email?.split("@")[0],
        };

        setUserState(mergedUser);
        setUser(mergedUser);
        return true;
      }
    } catch (err) {
      console.error("Failed to refresh user:", err);
    }
    return false;
  }, []);

  // ============================================================
  // Login with Google credential — the main authentication action
  // Called by the GoogleSignIn component when a credential is received
  // ============================================================
  const loginWithGoogleCredential = useCallback(
    async (credential) => {
      try {
        // Transition state: Google token received
        transitionTo(LOGIN_STATES.GOOGLE_TOKEN_RECEIVED);

        // Transition state: sending to server for validation
        transitionTo(LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS);

        // Call the backend's login endpoint with the Google credential
        // This runs the 12-step zero-trust pipeline on the server
        const response = await loginWithGoogle(credential);

        if (response.success) {
          // Store the JWT token in memory (NOT localStorage)
          setToken(response.data.token);

          // Store the user data in memory for quick access
          setUser(response.data.user);
          setUserState(response.data.user);

          // Cache picture and name in localStorage for persistence across refresh
          // (these come from Google OAuth and are NOT stored in DB)
          try {
            localStorage.setItem(
              "user_profile_cache",
              JSON.stringify({
                picture: response.data.user.picture || null,
                name: response.data.user.name || null,
                email: response.data.user.email || null,
                personId: response.data.user.personId || null,
              }),
            );
          } catch {
            /* localStorage may be unavailable */
          }

          // Transition through the remaining states
          transitionTo(LOGIN_STATES.IDENTITY_ISSUED);

          // Activate session immediately — no artificial delay
          transitionTo(LOGIN_STATES.SESSION_ACTIVE);

          return true;
        } else {
          setErrorState(response.error || "Login failed");
          return false;
        }
      } catch (err) {
        // Handle login errors — display user-friendly message
        const errorMessage =
          err.message || "Authentication failed — please try again";
        setErrorState(errorMessage);
        return false;
      }
    },
    [transitionTo, setErrorState],
  );

  // ============================================================
  // Logout — revoke session and clear all auth state
  // ============================================================
  const handleLogout = useCallback(async () => {
    try {
      // Tell the backend to revoke the session
      await logoutApi();
    } catch (err) {
      // Logout API failure shouldn't prevent local cleanup
      console.error("Logout API call failed:", err);
    } finally {
      // Always clear local auth state, regardless of API result
      clearAuth();
      setUserState(null);
      reset();
      // Clear cached profile
      try {
        localStorage.removeItem("user_profile_cache");
      } catch { }
    }
  }, [reset]);

  // ============================================================
  // Context value — all state and actions provided to children
  // ============================================================
  const contextValue = {
    // User data
    user,
    isAuthenticated: !!user,
    isLoading,

    // Login state machine
    loginState,
    error,
    isLoadingState,
    isErrorState,

    // Actions
    loginWithGoogleCredential,
    handleLogout,
    transitionTo,
    setErrorState,
    setErrorState,
    reset,
    refreshUser,
  };

  // ============================================================
  // Render the provider with the context value
  // All children can access auth state via useAuth() hook
  // ============================================================
  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
