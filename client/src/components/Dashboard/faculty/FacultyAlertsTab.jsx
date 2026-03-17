// ============================================================
// FACULTY ALERTS TAB — Faculty-specific anomaly alerts dashboard
// ============================================================
// Displays faculty member's own anomaly alerts:
//   - Identical marks (same score given to all students)
//   - Low credibility (credibility score < 0.4)
//   - Incomplete evaluation (pending student evaluations)
//
// DESIGN PRINCIPLES:
//   - Only shows alerts for THIS faculty member
//   - Cannot modify alerts (admin-only actions)
//   - Shows timestamp + severity badge
//   - Auto-refreshes via socket events
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Shield,
  Clock,
  RefreshCw,
  Loader2,
  CheckCircle,
} from "lucide-react";
import useAuth from "../../../hooks/useAuth";
import { getMyAlerts } from "../../../services/alertsApi";

/**
 * FacultyAlertsTab Component
 * Displays alerts specific to the logged-in faculty member
 */
const FacultyAlertsTab = () => {
  // ── State ──
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // ── Alert type styling ──
  const ALERT_TYPE_STYLE = {
    identical_marks: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      icon: AlertTriangle,
      iconColor: "text-orange-500",
      label: "Identical Marks",
      description: "You gave the same score to multiple students",
    },
    low_credibility: {
      bg: "bg-red-50",
      border: "border-red-200",
      icon: Shield,
      iconColor: "text-red-500",
      label: "Low Credibility",
      description: "Your credibility score dropped below the threshold",
    },
    incomplete_evaluation: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      icon: Clock,
      iconColor: "text-yellow-600",
      label: "Incomplete Evaluation",
      description: "You have pending student evaluations",
    },
  };

  // ── Load faculty alerts ──
  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use the faculty-specific endpoint (returns only this faculty's alerts)
      const data = await getMyAlerts();

      // Backend wraps responses in { success, data }, so extract .data
      const alertsArr = Array.isArray(data) ? data : (data?.data || []);
      setAlerts(Array.isArray(alertsArr) ? alertsArr : []);
    } catch (err) {
      console.error("FacultyAlertsTab: Load error", err);
      setError(err.message || "Failed to load alerts");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load data on mount ──
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  return (
    <div className="space-y-4">
      {/* Header + Refresh */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Your Alerts
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Anomalies detected in your evaluations
          </p>
        </div>
        <button
          onClick={loadAlerts}
          disabled={loading}
          className="px-3 py-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          title="Refresh alerts"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">Loading alerts...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && alerts.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
          <p className="text-sm font-medium text-gray-500">No active alerts</p>
          <p className="text-xs text-gray-400 mt-1">
            Keep up the great evaluation work!
          </p>
        </div>
      )}

      {/* Alerts list */}
      {!loading && !error && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const style =
              ALERT_TYPE_STYLE[alert.alert_type] ||
              ALERT_TYPE_STYLE.incomplete_evaluation;
            const Icon = style.icon;

            return (
              <div
                key={alert.id}
                className={`${style.bg} ${style.border} border rounded-xl p-4`}
              >
                {/* Alert content */}
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${style.iconColor}`} />

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {/* Alert title */}
                    <p className="text-sm font-semibold text-gray-900">
                      {style.label}
                    </p>

                    {/* Alert description */}
                    <p className="text-xs text-gray-600 mt-0.5">
                      {style.description}
                    </p>

                    {/* Alert title from API */}
                    {alert.title && (
                      <p className="text-xs text-gray-700 mt-1.5 font-medium">
                        {alert.title}
                      </p>
                    )}

                    {/* Details JSON if exists */}
                    {alert.details && (
                      <div className="text-[10px] text-gray-500 mt-1.5 bg-white bg-opacity-50 p-1.5 rounded">
                        {typeof alert.details === "string"
                          ? alert.details
                          : JSON.stringify(alert.details, null, 2)}
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-[10px] text-gray-400 mt-2">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>

                    {/* Severity badge */}
                    {alert.severity && (
                      <div className="mt-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            alert.severity === "critical"
                              ? "bg-red-200 text-red-700"
                              : alert.severity === "warning"
                                ? "bg-yellow-200 text-yellow-700"
                                : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info note for faculty */}
                <div className="mt-3 pt-3 border-t border-current border-opacity-20 text-xs text-gray-600">
                  ℹ️ This alert has been reported to administrators. They may
                  contact you for follow-up.
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FacultyAlertsTab;
