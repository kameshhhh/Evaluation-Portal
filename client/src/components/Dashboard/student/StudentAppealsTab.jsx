// ============================================================
// STUDENT APPEALS TAB — Student score appeal management
// ============================================================
// Allows students to:
//   1. Check appeal eligibility for a session
//   2. File a score appeal with reason
//   3. View their own appeals (pending + resolved)
//
// Appeal Conditions:
//   - Score < 2.5 OR Faculty gap > 1.5
//   - Within 7 days of session finalization
//   - One appeal per student per session
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import useAuth from "../../../hooks/useAuth";
import {
  checkAppealEligibility,
  fileAppeal,
  getMyAppeals,
  getAvailableSessionsForAppeal,
} from "../../../services/appealsApi";

/**
 * StudentAppealsTab Component
 * Displays appeal eligibility, file appeals, and track status
 */
const StudentAppealsTab = () => {
  // ── State ──
  const [view, setView] = useState("status"); // "status" | "file" | "history"
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // File appeal state
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [eligibilityCheck, setEligibilityCheck] = useState(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [filingAppeal, setFilingAppeal] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [sessions, setSessions] = useState([]); // For session selection

  // ── Load student's appeals AND available sessions ──
  const loadAppeals = useCallback(async () => {
    if (!user?.personId) {
      console.warn("❌ No user.personId found");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log("✅ Loading appeals and sessions...");

      // Load both appeals and available sessions in parallel
      const [appealsData, sessionsData] = await Promise.all([
        getMyAppeals(),
        getAvailableSessionsForAppeal(),
      ]);

      console.log("✅ Appeals data:", appealsData);
      console.log("✅ Sessions data:", sessionsData);

      // Backend wraps responses in { success, data }, so extract .data
      const appealsArr = Array.isArray(appealsData) ? appealsData : (appealsData?.data || []);
      const sessionsArr = Array.isArray(sessionsData) ? sessionsData : (sessionsData?.data || []);

      setAppeals(Array.isArray(appealsArr) ? appealsArr : []);

      // Set available sessions for selection
      if (Array.isArray(sessionsArr)) {
        console.log("✅ Setting", sessionsArr.length, "sessions");
        setSessions(sessionsArr);
      } else {
        console.warn("❌ Sessions not an array:", sessionsArr);
        setSessions([]);
      }
    } catch (err) {
      console.error("❌ StudentAppealsTab: Load error", err);
      setError(err.message || "Failed to load appeals");
      setAppeals([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.personId]);

  // ── Load data on mount ──
  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  // ── Check appeal eligibility ──
  const handleCheckEligibility = async () => {
    if (!selectedSessionId.trim()) {
      setFileError("Please enter a session ID");
      return;
    }

    try {
      setCheckingEligibility(true);
      setFileError(null);
      setEligibilityCheck(null);

      const result = await checkAppealEligibility(selectedSessionId.trim());
      // Backend wraps in { success, data }, extract the inner data
      const eligibility = result?.data || result;
      setEligibilityCheck(eligibility);
    } catch (err) {
      console.error("StudentAppealsTab: Eligibility check error", err);
      setFileError(
        err.message || err.response?.data?.error || "Failed to check eligibility"
      );
      setEligibilityCheck(null);
    } finally {
      setCheckingEligibility(false);
    }
  };

  // ── File appeal ──
  const handleFileAppeal = async () => {
    if (!selectedSessionId.trim() || !appealReason.trim()) {
      setFileError("Please enter session ID and appeal reason");
      return;
    }

    if (appealReason.trim().length < 10) {
      setFileError("Please provide at least 10 characters for your reason");
      return;
    }

    try {
      setFilingAppeal(true);
      setFileError(null);

      const result = await fileAppeal(selectedSessionId.trim(), appealReason.trim());
      // Backend wraps in { success, data }, extract the inner data
      const appealResult = result?.data || result;

      if (appealResult?.id || result?.success) {
        // Success! Reset form and reload appeals
        setSelectedSessionId("");
        setAppealReason("");
        setEligibilityCheck(null);
        setView("history");
        await loadAppeals();
        alert("Appeal filed successfully!");
      } else {
        setFileError(result?.error || "Filing failed");
      }
    } catch (err) {
      console.error("StudentAppealsTab: File appeal error", err);
      setFileError(
        err.message || err.response?.data?.error || "Network error"
      );
    } finally {
      setFilingAppeal(false);
    }
  };

  // ── Status badges ──
  const getStatusStyle = (status) => {
    switch (status) {
      case "pending":
        return {
          bg: "bg-yellow-100",
          text: "text-yellow-800",
          label: "Pending Review",
          icon: Clock,
        };
      case "accepted":
        return {
          bg: "bg-green-100",
          text: "text-green-800",
          label: "Approved",
          icon: CheckCircle,
        };
      case "rejected":
        return {
          bg: "bg-red-100",
          text: "text-red-800",
          label: "Rejected",
          icon: AlertCircle,
        };
      default:
        return {
          bg: "bg-gray-100",
          text: "text-gray-800",
          label: status,
          icon: MessageSquare,
        };
    }
  };

  const pendingAppeals = appeals.filter((a) => a.status === "pending");
  const resolvedAppeals = appeals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setView("status")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            view === "status"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <MessageSquare className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          My Appeals ({appeals.length})
        </button>
        <button
          onClick={() => setView("file")}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            view === "file"
              ? "bg-blue-600 text-white shadow-md"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Send className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          File Appeal
        </button>
        <button
          onClick={loadAppeals}
          disabled={loading}
          className="ml-auto px-3 py-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">Loading...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── MY APPEALS VIEW ── */}
      {!loading && view === "status" && (
        <div className="space-y-4">
          {/* Pending Appeals */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Pending ({pendingAppeals.length})
            </h3>
            {pendingAppeals.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-lg">
                No pending appeals
              </p>
            ) : (
              <div className="space-y-2">
                {pendingAppeals.map((appeal) => (
                  <div
                    key={appeal.id}
                    className="bg-white border border-yellow-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {appeal.session_title || "Session Appeal"}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Score: {appeal.score_at_appeal != null
                            ? Number(appeal.score_at_appeal).toFixed(2)
                            : "N/A"}
                          {appeal.faculty_gap != null &&
                            ` • Faculty Gap: ${Number(appeal.faculty_gap).toFixed(2)}`}
                        </p>
                        <p className="text-xs text-gray-600 mt-2 italic break-words">
                          "{appeal.reason}"
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Filed: {new Date(appeal.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-800">
                        Pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resolved Appeals */}
          {resolvedAppeals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-gray-400" />
                Resolved ({resolvedAppeals.length})
              </h3>
              <div className="space-y-2">
                {resolvedAppeals.map((appeal) => {
                  const style = getStatusStyle(appeal.status);
                  return (
                    <div
                      key={appeal.id}
                      className="bg-gray-50 border border-gray-200 rounded-xl p-3 opacity-75"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            {appeal.session_title || "Session Appeal"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Score: {appeal.score_at_appeal != null
                              ? Number(appeal.score_at_appeal).toFixed(2)
                              : "N/A"}
                          </p>
                          {appeal.resolution_notes && (
                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-[10px] font-semibold text-blue-700 mb-0.5">Admin Reply:</p>
                              <p className="text-xs text-blue-800">
                                "{appeal.resolution_notes}"
                              </p>
                            </div>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">
                            Resolved: {new Date(appeal.resolved_at).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-semibold ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {appeals.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">
                No appeals on record
              </p>
              <p className="text-xs text-gray-400 mt-1">
                You can file an appeal if your score meets the criteria
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── FILE APPEAL VIEW ── */}
      {!loading && view === "file" && (
        <div className="space-y-4">
          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-900 font-medium">
              Appeal Eligibility
            </p>
            <ul className="text-xs text-blue-800 mt-2 space-y-1">
              <li>✓ Your final score &lt; 2.5, OR</li>
              <li>✓ Faculty scores differ by &gt; 1.5 points</li>
              <li>✓ Within 7 days of session finalization</li>
              <li>✓ One appeal per session</li>
            </ul>
          </div>

          {/* Session selection - Show available sessions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Session to Appeal
            </label>

            {/* Quick select from existing sessions */}
            {sessions.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-800 font-medium mb-2">Recent Sessions:</p>
                <div className="flex flex-wrap gap-2">
                  {sessions.map((sess) => (
                    <button
                      key={sess.session_id}
                      onClick={() => setSelectedSessionId(sess.session_id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        selectedSessionId === sess.session_id
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
                      }`}
                    >
                      {sess.session_title || sess.session_id.slice(0, 8)}...
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Or paste session ID manually */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                placeholder={sessions.length > 0 ? "Or paste another session ID..." : "Paste the session ID..."}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleCheckEligibility}
                disabled={checkingEligibility || !selectedSessionId.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap flex items-center gap-1"
              >
                {checkingEligibility ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    Check
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Eligibility result */}
          {eligibilityCheck && (
            <div
              className={`border rounded-xl p-4 ${
                eligibilityCheck.eligible
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  eligibilityCheck.eligible
                    ? "text-green-900"
                    : "text-red-900"
                }`}
              >
                {eligibilityCheck.eligible
                  ? "✅ You are eligible to appeal"
                  : "❌ You are not eligible to appeal"}
              </p>
              {eligibilityCheck.reasons && eligibilityCheck.reasons.length > 0 && (
                <ul
                  className={`text-xs mt-2 space-y-1 ${
                    eligibilityCheck.eligible
                      ? "text-green-800"
                      : "text-red-800"
                  }`}
                >
                  {eligibilityCheck.reasons.map((reason, idx) => (
                    <li key={idx}>• {reason}</li>
                  ))}
                </ul>
              )}
              {!eligibilityCheck.eligible && (!eligibilityCheck.reasons || eligibilityCheck.reasons.length === 0) && (
                <p className="text-xs mt-2 text-red-700">
                  Your score does not meet appeal criteria (score &lt; 2.5 AND/OR faculty gap &gt; 1.5)
                </p>
              )}
              {eligibilityCheck.deadline && (
                <p className="text-xs text-gray-600 mt-2">
                  Deadline: {new Date(eligibilityCheck.deadline).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          {/* Appeal reason */}
          {eligibilityCheck?.eligible && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appeal Reason
                </label>
                <textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder="Explain why you believe your evaluation was unfair..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {appealReason.length}/500 characters
                </p>
              </div>

              {/* File error */}
              {fileError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {fileError}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleFileAppeal}
                disabled={
                  filingAppeal ||
                  !selectedSessionId.trim() ||
                  appealReason.trim().length < 10
                }
                className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {filingAppeal ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Filing Appeal...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    File Appeal
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentAppealsTab;
