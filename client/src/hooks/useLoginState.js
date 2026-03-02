// ============================================================
// LOGIN STATE MACHINE HOOK — React State Management for Login Flow
// ============================================================
// Custom React hook that wraps the state machine with React state.
// Provides state transitions, error handling, and loading states.
// Ensures the login UI always reflects the correct authentication step.
// ============================================================

import { useState, useCallback } from "react";
import { LOGIN_STATES } from "../utils/constants";
import {
  transition,
  getInitialState,
  isLoading,
  isError,
} from "../services/stateMachine";

/**
 * Custom hook for managing the login state machine.
 * Provides the current state, transition functions, and error handling.
 *
 * @returns {{
 *   loginState: string,
 *   error: string|null,
 *   isLoadingState: boolean,
 *   isErrorState: boolean,
 *   transitionTo: (state: string) => boolean,
 *   setErrorState: (message: string) => void,
 *   reset: () => void,
 * }}
 */
const useLoginState = () => {
  // Current state of the login state machine
  // Initialized to UNAUTHENTICATED — the starting state
  const [loginState, setLoginState] = useState(getInitialState());

  // Error message associated with the ERROR state
  // Null when not in an error state
  const [error, setError] = useState(null);

  /**
   * Attempt to transition to a new state.
   * Only allows valid transitions defined in the state machine.
   * Returns true if the transition succeeded, false otherwise.
   *
   * @param {string} newState - Desired target state
   * @returns {boolean} Whether the transition was successful
   */
  const transitionTo = useCallback(
    (newState) => {
      const result = transition(loginState, newState);

      if (result.transitioned) {
        // Valid transition — update React state
        setLoginState(result.state);

        // Clear error when transitioning away from ERROR state
        if (newState !== LOGIN_STATES.ERROR) {
          setError(null);
        }

        return true;
      }

      // Invalid transition — state unchanged
      return false;
    },
    [loginState],
  );

  /**
   * Transition to the ERROR state with an error message.
   * This is a convenience function that handles the transition
   * and error message in one call.
   *
   * @param {string} errorMessage - Human-readable error description
   */
  const setErrorState = useCallback(
    (errorMessage) => {
      const result = transition(loginState, LOGIN_STATES.ERROR);

      if (result.transitioned) {
        setLoginState(LOGIN_STATES.ERROR);
        setError(errorMessage);
      } else {
        // If we can't transition to ERROR from current state,
        // force the error anyway for safety
        setLoginState(LOGIN_STATES.ERROR);
        setError(errorMessage);
      }
    },
    [loginState],
  );

  /**
   * Reset the state machine to the initial UNAUTHENTICATED state.
   * Clears any error messages. Used after logout or error recovery.
   */
  const reset = useCallback(() => {
    setLoginState(LOGIN_STATES.UNAUTHENTICATED);
    setError(null);
  }, []);

  // Return the state, computed flags, and action functions
  return {
    loginState,
    error,
    isLoadingState: isLoading(loginState),
    isErrorState: isError(loginState),
    transitionTo,
    setErrorState,
    reset,
  };
};

export default useLoginState;
