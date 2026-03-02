// ============================================================
// LOGIN STATE MACHINE — Deterministic Authentication Flow
// ============================================================
// Implements a strict state machine for the login process.
// Each state has defined transitions — no undefined behaviors.
// Prevents race conditions by enforcing sequential state flow.
// The frontend ONLY tracks visual state — backend is authoritative.
// ============================================================

import { LOGIN_STATES, STATE_TRANSITIONS } from "../utils/constants";

/**
 * Check if a state transition is valid.
 * Only allows transitions defined in STATE_TRANSITIONS.
 *
 * @param {string} fromState - Current state
 * @param {string} toState - Desired next state
 * @returns {boolean} True if the transition is allowed
 */
export const isValidTransition = (fromState, toState) => {
  // Look up the allowed transitions for the current state
  const allowedTransitions = STATE_TRANSITIONS[fromState];

  // If no transitions are defined, the state is terminal (or invalid)
  if (!allowedTransitions) return false;

  // Check if the desired state is in the allowed list
  return allowedTransitions.includes(toState);
};

/**
 * Attempt a state transition, returning the new state or the current state.
 * If the transition is invalid, returns the current state unchanged.
 * This prevents the UI from entering undefined states.
 *
 * @param {string} currentState - Current state machine state
 * @param {string} desiredState - Target state to transition to
 * @returns {{ state: string, transitioned: boolean }}
 */
export const transition = (currentState, desiredState) => {
  // Validate the transition against the defined rules
  if (isValidTransition(currentState, desiredState)) {
    return { state: desiredState, transitioned: true };
  }

  // Invalid transition — log a warning and keep current state
  console.warn(
    `[StateMachine] Invalid transition: ${currentState} → ${desiredState}`,
  );
  return { state: currentState, transitioned: false };
};

/**
 * Get the initial state for the login state machine.
 *
 * @returns {string} The UNAUTHENTICATED state
 */
export const getInitialState = () => LOGIN_STATES.UNAUTHENTICATED;

/**
 * Check if the current state represents an active (authenticated) session.
 *
 * @param {string} state - Current state
 * @returns {boolean} True if the user has an active session
 */
export const isSessionActive = (state) => state === LOGIN_STATES.SESSION_ACTIVE;

/**
 * Check if the current state represents a loading/in-progress condition.
 *
 * @param {string} state - Current state
 * @returns {boolean} True if authentication is in progress
 */
export const isLoading = (state) => {
  return [
    LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS,
    LOGIN_STATES.GOOGLE_TOKEN_RECEIVED,
    LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS,
    LOGIN_STATES.IDENTITY_ISSUED,
  ].includes(state);
};

/**
 * Check if the current state is an error state.
 *
 * @param {string} state - Current state
 * @returns {boolean} True if the state represents an error
 */
export const isError = (state) => state === LOGIN_STATES.ERROR;
