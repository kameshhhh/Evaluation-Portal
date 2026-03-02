// ============================================================
// LOGIN STATE INDICATOR — Visual State Machine Display
// ============================================================
// Shows the current authentication state as a step indicator.
// Provides visual feedback during the multi-step login process.
// Users can see exactly where they are in the authentication flow.
// ============================================================

import React from "react";
import { LOGIN_STATES, STATE_LABELS } from "../../utils/constants";
import { CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";

/**
 * LoginState component — displays the current login state visually.
 *
 * @param {{ state: string, error?: string }} props
 */
const LoginState = ({ state, error }) => {
  // Define the ordered steps to display
  const steps = [
    { key: LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS, label: "Google Auth" },
    {
      key: LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS,
      label: "Server Validation",
    },
    { key: LOGIN_STATES.IDENTITY_ISSUED, label: "Identity Confirmed" },
  ];

  // Determine which step index we're at based on the current state
  const getStepStatus = (stepKey) => {
    const stateOrder = [
      LOGIN_STATES.UNAUTHENTICATED,
      LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS,
      LOGIN_STATES.GOOGLE_TOKEN_RECEIVED,
      LOGIN_STATES.SERVER_VALIDATION_IN_PROGRESS,
      LOGIN_STATES.IDENTITY_ISSUED,
      LOGIN_STATES.SESSION_ACTIVE,
    ];

    const currentIndex = stateOrder.indexOf(state);
    const stepIndex = stateOrder.indexOf(stepKey);

    if (state === LOGIN_STATES.ERROR) return "error";
    if (stepIndex < currentIndex) return "completed";
    if (
      stepIndex === currentIndex ||
      (stepKey === LOGIN_STATES.GOOGLE_AUTH_IN_PROGRESS &&
        state === LOGIN_STATES.GOOGLE_TOKEN_RECEIVED)
    )
      return "active";
    return "pending";
  };

  // Don't show steps when fully unauthenticated or in active session
  if (
    state === LOGIN_STATES.UNAUTHENTICATED ||
    state === LOGIN_STATES.SESSION_ACTIVE
  ) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* State label text */}
      <p className="text-sm text-center text-gray-500 mb-4">
        {STATE_LABELS[state] || state}
      </p>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(step.key);

          return (
            <React.Fragment key={step.key}>
              {/* Step indicator circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    ${status === "completed" ? "bg-green-100 text-green-600" : ""}
                    ${status === "active" ? "bg-blue-100 text-blue-600" : ""}
                    ${status === "pending" ? "bg-gray-100 text-gray-400" : ""}
                    ${status === "error" ? "bg-red-100 text-red-600" : ""}
                  `}
                >
                  {status === "completed" && (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  {status === "active" && (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  {status === "pending" && <Clock className="h-5 w-5" />}
                  {status === "error" && <AlertCircle className="h-5 w-5" />}
                </div>
                <span className="text-xs text-gray-500 mt-1 text-center max-w-[80px]">
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mt-[-20px] ${
                    getStepStatus(steps[index + 1].key) === "completed" ||
                    getStepStatus(steps[index + 1].key) === "active"
                      ? "bg-blue-300"
                      : "bg-gray-200"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Error message display */}
      {state === LOGIN_STATES.ERROR && error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginState;
