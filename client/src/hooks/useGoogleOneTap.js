// ============================================================
// GOOGLE ONE-TAP HOOK — Google Sign-In Integration
// ============================================================
// Custom React hook that initializes and manages Google One-Tap.
// Loads the Google Identity Services script, configures One-Tap,
// and handles the credential callback.
// The hook manages the script lifecycle with proper cleanup.
// ============================================================

import { useEffect, useCallback, useRef } from "react";
import { GOOGLE_CLIENT_ID } from "../utils/constants";

/**
 * Custom hook for Google One-Tap sign-in.
 * Initializes the Google Identity Services library and triggers One-Tap prompt.
 *
 * @param {Object} options - Hook configuration
 * @param {Function} options.onCredentialReceived - Callback with the Google credential
 * @param {Function} options.onError - Callback for Google sign-in errors
 * @param {boolean} options.enabled - Whether One-Tap should be active
 * @returns {{ triggerPrompt: Function, renderButton: Function }}
 */
const useGoogleOneTap = ({ onCredentialReceived, onError, enabled = true }) => {
  // Ref to track if the Google script has been loaded
  const scriptLoadedRef = useRef(false);

  // Ref to track if One-Tap has been initialized
  const initializedRef = useRef(false);

  /**
   * Handle the Google credential callback.
   * Called by Google when the user selects an account.
   * Extracts the credential and passes it to the parent component.
   */
  const handleCredentialResponse = useCallback(
    (response) => {
      // response.credential contains the Google ID token
      // This is a JWT signed by Google — must be verified by our backend
      if (response.credential) {
        onCredentialReceived(response.credential);
      } else {
        onError("Google sign-in did not return a credential");
      }
    },
    [onCredentialReceived, onError],
  );

  /**
   * Initialize Google One-Tap after the script loads.
   * Sets up the client configuration and triggers the prompt.
   */
  const initializeGoogleOneTap = useCallback(() => {
    // Check if the Google Identity Services library is available
    if (!window.google?.accounts?.id) {
      return;
    }

    // Prevent double-initialization
    if (initializedRef.current) return;
    initializedRef.current = true;

    try {
      // Initialize the Google Identity Services client
      // This configures One-Tap with our client ID and callback
      window.google.accounts.id.initialize({
        // Our Google OAuth Client ID — must match backend config
        client_id: GOOGLE_CLIENT_ID,

        // Callback function when user selects an account
        callback: handleCredentialResponse,

        // Auto-select: automatically sign in if only one Google account
        // Disabled for security — user should explicitly choose
        auto_select: false,

        // Cancel on tap outside: close One-Tap when user clicks elsewhere
        cancel_on_tap_outside: true,

        // ITP support: improved tracking prevention support for Safari
        itp_support: true,

        // Context: sign-in (vs sign-up) — affects the prompt text
        context: "signin",
      });

      // Display the One-Tap prompt overlay
      // This shows the "Sign in with Google" popup in the top-right corner
      window.google.accounts.id.prompt((notification) => {
        // Handle prompt status notifications
        if (notification.isNotDisplayed()) {
          // One-Tap couldn't display — user may have opt-out cookies
          // or browser blocked the prompt. Fallback button is available.
          console.log(
            "One-Tap prompt not displayed:",
            notification.getNotDisplayedReason(),
          );
        }

        if (notification.isSkippedMoment()) {
          // User dismissed the prompt or it timed out
          console.log(
            "One-Tap prompt skipped:",
            notification.getSkippedReason(),
          );
        }
      });
    } catch (err) {
      console.error("Google One-Tap initialization error:", err);
      onError("Failed to initialize Google sign-in");
    }
  }, [handleCredentialResponse, onError]);

  // ============================================================
  // Effect: Load Google Identity Services script on mount
  // Only loads once — useRef tracks whether it's already been loaded
  // ============================================================
  useEffect(() => {
    // Don't load if not enabled or already loaded
    if (!enabled || scriptLoadedRef.current) return;

    // Check if the script is already in the DOM (loaded by another component)
    if (window.google?.accounts?.id) {
      scriptLoadedRef.current = true;
      initializeGoogleOneTap();
      return;
    }

    // Create and inject the Google Identity Services script tag
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    // Initialize One-Tap when the script finishes loading
    script.onload = () => {
      scriptLoadedRef.current = true;
      initializeGoogleOneTap();
    };

    // Handle script loading errors
    script.onerror = () => {
      onError("Failed to load Google sign-in library");
    };

    // Add the script to the document head
    document.head.appendChild(script);

    // Cleanup: cancel One-Tap on unmount
    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel();
      }
      initializedRef.current = false;
    };
  }, [enabled, initializeGoogleOneTap, onError]);

  /**
   * Manually trigger the One-Tap prompt.
   * Used as a retry mechanism after the initial prompt is dismissed.
   */
  const triggerPrompt = useCallback(() => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  }, []);

  /**
   * Render a Google Sign-In button in a target element.
   * Used as a fallback when One-Tap prompt is not available.
   *
   * @param {HTMLElement} element - DOM element to render the button in
   */
  const renderButton = useCallback((element) => {
    if (window.google?.accounts?.id && element) {
      window.google.accounts.id.renderButton(element, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: "100%",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
      });
    }
  }, []);

  return { triggerPrompt, renderButton };
};

export default useGoogleOneTap;
