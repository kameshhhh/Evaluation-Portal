// ============================================================
// GOOGLE SIGN-IN — Google One-Tap Wrapper Component
// ============================================================
// Renders the Google Sign-In button and manages the One-Tap flow.
// This is the ONLY component that interacts with Google's auth SDK.
// The credential received here is passed directly to the backend —
// NO client-side processing of the token occurs.
// ============================================================

import React, { useRef, useEffect } from "react";
import useGoogleOneTap from "../../hooks/useGoogleOneTap";
import useAuth from "../../hooks/useAuth";
import { LOGIN_STATES } from "../../utils/constants";

/**
 * GoogleSignIn component — manages Google authentication UI.
 *
 * @param {{ onAuthStart: Function }} props
 */
const GoogleSignIn = ({ onAuthStart }) => {
  // Get auth actions from context
  const { loginWithGoogleCredential, transitionTo, setErrorState, loginState } =
    useAuth();

  // Ref for the Google button container element
  const buttonRef = useRef(null);

  // Determine if One-Tap should be active (only when unauthenticated)
  const isEnabled = loginState === LOGIN_STATES.UNAUTHENTICATED;

  // Initialize Google One-Tap with credential handler
  const { renderButton } = useGoogleOneTap({
    onCredentialReceived: async (credential) => {
      // Signal to parent that auth has started
      if (onAuthStart) onAuthStart();

      // Transition to Google auth in progress
      transitionTo(LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS);

      // Send the credential to the backend via auth context
      // The backend runs the 12-step zero-trust pipeline
      await loginWithGoogleCredential(credential);
    },
    onError: (errorMessage) => {
      setErrorState(errorMessage);
    },
    enabled: isEnabled,
  });

  // Render the Google button when the container ref is available
  useEffect(() => {
    if (buttonRef.current && isEnabled) {
      renderButton(buttonRef.current);
    }
  }, [renderButton, isEnabled]);

  return (
    <div className="space-y-4">
      {/* Google One-Tap prompt container — positioned by Google's SDK */}
      <div id="google-one-tap-container" />

      {/* Google Sign-In button — fallback for manual sign-in */}
      <div ref={buttonRef} className="flex justify-center min-h-[44px]" />

      {/* Divider with "or" text */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-400">
            Secured by Google OAuth 2.0
          </span>
        </div>
      </div>
    </div>
  );
};

export default GoogleSignIn;
