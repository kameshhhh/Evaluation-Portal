// ============================================================
// ALERTS & APPEALS TAB — Admin View for Anomaly Alerts + Student Appeals
// ============================================================
// Provides the admin a unified view of:
//   1. Anomaly alerts (identical marks, low credibility, incomplete)
//   2. Student score appeals (pending / resolved)
//
// DESIGN: Self-contained tab — fetches its own data via alertsApi & appealsApi.
// Does NOT modify any existing component or data flow.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  RefreshCw,
  Loader2,
  MessageSquare,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getUnacknowledgedAlerts,
  getSessionAlerts,
  acknowledgeAlert,
  triggerDetection,
} from "../../../services/alertsApi";
import {
  listAppeals,
  resolveAppeal,
} from "../../../services/appealsApi";

// ============================================================
// AlertsAppealsTab Component
// ============================================================
const AlertsAppealsTab = () => {
  // ── State ──
  const [activeSection, setActiveSection] = useState("alerts"); // "alerts" | "appeals"
  const [alerts, setAlerts] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolveModal, setResolveModal] = useState(null); // appeal being resolved
  const [resolveAction, setResolveAction] = useState("accepted");
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectSessionId, setDetectSessionId] = useState("");

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [alertsRes, appealsRes] = await Promise.all([
        getUnacknowledgedAlerts().catch(() => ({ data: [] })),
        listAppeals().catch(() => ({ data: [] })),
      ]);
      setAlerts(alertsRes.data || []);
      setAppeals(appealsRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Acknowledge alert ──
  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to acknowledge alert");
    }
  };

  // ── Resolve appeal ──
  const handleResolve = async () => {
    if (!resolveModal) return;
    try {
      setResolving(true);
      await resolveAppeal(resolveModal.id, resolveAction, resolveNote.trim() || undefined);
      setResolveModal(null);
      setResolveNote("");
      await loadData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to resolve appeal");
    } finally {
      setResolving(false);
    }
  };

  // ── Trigger anomaly detection ──
  const handleTriggerDetection = async () => {
    if (!detectSessionId.trim()) {
      alert("Please enter a session ID to run detection on.");
      return;
    }
    try {
      setDetecting(true);
      const result = await triggerDetection(detectSessionId.trim());
      await loadData();
      const count = result?.data?.length || 0;
      alert(`Detection complete. ${count} anomalies found.`);
    } catch (err) {
      alert(err.response?.data?.error || "Detection failed.");
    } finally {
      setDetecting(false);
    }
  };

  // ── Alert type styling ──
  const ALERT_TYPE_STYLE = {
    identical_marks: { bg: "bg-orange-50", border: "border-orange-200", icon: AlertTriangle, iconColor: "text-orange-500", label: "Identical Marks" },
    low_credibility: { bg: "bg-red-50", border: "border-red-200", icon: Shield, iconColor: "text-red-500", label: "Low Credibility" },
    incomplete_evaluation: { bg: "bg-yellow-50", border: "border-yellow-200", icon: Clock, iconColor: "text-yellow-600", label: "Incomplete Evaluation" },
  };

  const APPEAL_STATUS_STYLE = {
    pending: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Pending" },
    accepted: { bg: "bg-green-100", text: "text-green-800", label: "Approved" },
    rejected: { bg: "bg-red-100", text: "text-red-800", label: "Rejected" },
  };

  const pendingAppeals = appeals.filter((a) => a.status === "pending");
  const resolvedAppeals = appeals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setActiveSection("alerts")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeSection === "alerts"
              ? "bg-red-600 text-white shadow-md"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Bell className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Alerts ({alerts.length})
        </button>
        <button
          onClick={() => setActiveSection("appeals")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeSection === "appeals"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <MessageSquare className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          Appeals ({pendingAppeals.length} pending)
        </button>
        <button
          onClick={loadData}
          disabled={loading}
          className="ml-auto px-3 py-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">Loading...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── ALERTS SECTION ── */}
      {!loading && activeSection === "alerts" && (
        <div className="space-y-3">
          {/* Manual Detection Trigger */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
            <input
              type="text"
              value={detectSessionId}
              onChange={(e) => setDetectSessionId(e.target.value)}
              placeholder="Paste session ID to scan..."
              className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleTriggerDetection}
              disabled={detecting || !detectSessionId.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
              {detecting ? "Scanning..." : "Run Detection"}
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-400" />
              <p className="text-sm font-medium text-gray-500">No unacknowledged alerts</p>
              <p className="text-xs text-gray-400 mt-1">All anomaly alerts have been reviewed.</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const style = ALERT_TYPE_STYLE[alert.alert_type] || ALERT_TYPE_STYLE.incomplete_evaluation;
              const Icon = style.icon;
              return (
                <div
                  key={alert.id}
                  className={`${style.bg} ${style.border} border rounded-xl p-4 flex items-start justify-between gap-3`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${style.iconColor}`} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{style.label}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{alert.title}</p>
                      {alert.target_name && (
                        <p className="text-xs text-gray-500 mt-1">
                          Student: <span className="font-medium">{alert.target_name}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors"
                  >
                    Acknowledge
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── APPEALS SECTION ── */}
      {!loading && activeSection === "appeals" && (
        <div className="space-y-4">
          {/* Pending appeals */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending Appeals ({pendingAppeals.length})
            </h3>
            {pendingAppeals.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">No pending appeals.</p>
            ) : (
              <div className="space-y-2">
                {pendingAppeals.map((appeal) => (
                  <div
                    key={appeal.id}
                    className="bg-white border border-yellow-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {appeal.student_name || "Unknown Student"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Session: {appeal.session_title || appeal.session_id?.slice(0, 8)}
                          {" · "}Score: {appeal.score_at_appeal != null ? Number(appeal.score_at_appeal).toFixed(2) : "N/A"}
                        </p>
                        <p className="text-xs text-gray-600 mt-2 italic">
                          "{appeal.reason}"
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Filed: {new Date(appeal.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setResolveModal(appeal);
                          setResolveAction("accepted");
                          setResolveNote("");
                        }}
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolved appeals */}
          {resolvedAppeals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-gray-400" />
                Resolved ({resolvedAppeals.length})
              </h3>
              <div className="space-y-2">
                {resolvedAppeals.map((appeal) => {
                  const style = APPEAL_STATUS_STYLE[appeal.status] || APPEAL_STATUS_STYLE.pending;
                  return (
                    <div
                      key={appeal.id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 opacity-75"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700">
                            {appeal.student_name || "Unknown Student"}
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Score: {appeal.score_at_appeal != null ? Number(appeal.score_at_appeal).toFixed(2) : "N/A"}
                            {appeal.resolution_notes && ` · Note: ${appeal.resolution_notes}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESOLVE MODAL ── */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Review Appeal</h3>
            <p className="text-xs text-gray-500 mb-3">
              Student: <span className="font-medium">{resolveModal.student_name}</span>
              {" · "}Score: {resolveModal.score != null ? Number(resolveModal.score).toFixed(2) : "N/A"}
            </p>
            <p className="text-sm text-gray-700 italic mb-4">"{resolveModal.reason}"</p>

            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={resolveAction === "accepted"}
                  onChange={() => setResolveAction("accepted")}
                  className="accent-green-600"
                />
                <span className="text-sm font-medium text-green-700">Approve</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={resolveAction === "rejected"}
                  onChange={() => setResolveAction("rejected")}
                  className="accent-red-600"
                />
                <span className="text-sm font-medium text-red-700">Reject</span>
              </label>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply Message to Student
            </label>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Write your reply to the student here... (This message will be visible to the student)"
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setResolveModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-40 ${
                  resolveAction === "accepted"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {resolving ? "Saving..." : resolveAction === "accepted" ? "Approve Appeal" : "Reject Appeal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertsAppealsTab;
