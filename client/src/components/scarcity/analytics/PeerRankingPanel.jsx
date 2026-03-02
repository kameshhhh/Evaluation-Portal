// ============================================================
// PEER RANKING PANEL — Peer Survey Submission + Results UI
// ============================================================
// Implements SRS Section 4.5.3: Peer Ranking with Ethical Safeguards
//
// TWO VIEWS:
//   1. SUBMISSION: Drag-and-drop ranking interface for participants
//      - Enforces no self-ranking (hidden from list)
//      - Enforces unique ranks (no ties)
//      - Shows limited top positions warning
//   2. RESULTS: Anonymized aggregated view for admin/faculty
//      - Individual rankings NEVER shown
//      - Safeguard flag summary displayed
//
// PROPS:
//   surveyId  — UUID of the peer ranking survey (for results view)
//   mode      — "submit" | "results"
//   userId    — Current user's ID (for self-exclusion)
//
// DOES NOT modify any existing components.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  AlertTriangle,
  Shield,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertCircle,
  Send,
  BarChart3,
  Lock,
  EyeOff,
} from "lucide-react";
import {
  submitPeerRanking,
  getPeerSurveyResults,
} from "../../../services/analyticsApi";

// ============================================================
// SEVERITY COLORS for safeguard flags
// ============================================================
const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
};

// ============================================================
// PeerRankingPanel Component
// ============================================================
const PeerRankingPanel = ({
  surveyId,
  mode = "results",
  userId,
  participants = [],
}) => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // For submission mode: ranking state
  const [rankings, setRankings] = useState([]);

  // Initialize rankings for submission mode
  useEffect(() => {
    if (mode === "submit" && participants.length > 0) {
      // SRS 4.5.3: Remove self from ranking list
      const eligiblePeers = participants.filter((p) => p.personId !== userId);
      setRankings(
        eligiblePeers.map((p, idx) => ({
          personId: p.personId,
          displayName: p.displayName,
          rank: idx + 1,
        })),
      );
    }
  }, [mode, participants, userId]);

  // Fetch results for results mode
  const fetchResults = useCallback(async () => {
    if (mode !== "results" || !surveyId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getPeerSurveyResults(surveyId);
      setResults(response.data);
    } catch (err) {
      setError(err.message || "Failed to load survey results");
    } finally {
      setLoading(false);
    }
  }, [surveyId, mode]);

  useEffect(() => {
    if (mode === "results") {
      fetchResults();
    } else {
      setLoading(false);
    }
  }, [mode, fetchResults]);

  // Move a person up in ranking
  const moveUp = (index) => {
    if (index <= 0) return;
    const updated = [...rankings];
    // Swap positions
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    // Update rank values
    updated.forEach((item, i) => {
      item.rank = i + 1;
    });
    setRankings(updated);
  };

  // Move a person down in ranking
  const moveDown = (index) => {
    if (index >= rankings.length - 1) return;
    const updated = [...rankings];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updated.forEach((item, i) => {
      item.rank = i + 1;
    });
    setRankings(updated);
  };

  // Submit ranking
  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      // Format rankings for API: [{ questionIndex: 0, rankings: [{ personId, rank }] }]
      const payload = [
        {
          questionIndex: 0,
          rankings: rankings.map((r) => ({
            personId: r.personId,
            rank: r.rank,
          })),
        },
      ];

      await submitPeerRanking(surveyId, payload);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="ml-2 text-sm text-gray-500">
            Loading peer rankings...
          </span>
        </div>
      </div>
    );
  }

  // ============================================================
  // SUBMISSION MODE
  // ============================================================
  if (mode === "submit") {
    if (submitted) {
      return (
        <div className="bg-white rounded-xl border border-emerald-200 p-6">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle className="w-6 h-6" />
            <div>
              <h3 className="font-semibold">Ranking Submitted</h3>
              <p className="text-sm text-emerald-600">
                Your anonymized ranking has been recorded. Individual rankings
                are never revealed.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Peer Ranking
            <span className="text-xs font-normal text-gray-400">
              SRS §4.5.3
            </span>
          </h3>
        </div>

        {/* Safeguard notices */}
        <div className="space-y-2 mb-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <Lock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Your individual ranking is <strong>never revealed</strong> to
              anyone. Only anonymized aggregates are used.
            </p>
          </div>
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              Each person must have a <strong>unique rank</strong>. No ties
              allowed. Use arrows to reorder.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 mb-4 p-2 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs">{error}</span>
          </div>
        )}

        {/* Ranking list */}
        <div className="space-y-2 mb-4">
          {rankings.map((person, idx) => (
            <div
              key={person.personId}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              {/* Rank number */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  idx < 3
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {person.rank}
              </div>

              {/* Name */}
              <span className="flex-1 text-sm font-medium text-gray-700">
                {person.displayName}
              </span>

              {/* Reorder buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="p-1.5 rounded-md hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${person.displayName} up`}
                >
                  <ArrowUp className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === rankings.length - 1}
                  className="p-1.5 rounded-md hover:bg-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${person.displayName} down`}
                >
                  <ArrowDown className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting || rankings.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {submitting ? "Submitting..." : "Submit Ranking"}
        </button>
      </div>
    );
  }

  // ============================================================
  // RESULTS MODE — Anonymized aggregates (SRS 4.5.3)
  // ============================================================
  if (!results) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          <BarChart3 className="w-5 h-5 inline mr-2" />
          Peer Ranking Results
        </h3>
        <p className="text-sm text-gray-500">No results available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-500" />
          Peer Ranking Results
          <span className="text-xs font-normal text-gray-400">SRS §4.5.3</span>
        </h3>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <EyeOff className="w-3 h-3" />
          Individual rankings hidden
        </div>
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
        <Shield className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-indigo-700">
          Showing <strong>aggregated scores only</strong>. Individual rankings
          are never revealed per SRS 4.5.3 ethical safeguards.
        </p>
      </div>

      {/* Aggregated scores */}
      <div className="space-y-3 mb-4">
        {(results.aggregatedScores || []).map((person, idx) => {
          const score = parseFloat(person.normalizedScore || 0);
          const barWidth = Math.max(5, score * 100);

          return (
            <div key={person.personId} className="flex items-center gap-3">
              <div className="w-6 text-center text-xs font-medium text-gray-400">
                {idx + 1}
              </div>
              <span className="w-32 text-sm text-gray-700 truncate">
                {person.displayName}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="w-16 text-right text-xs font-medium text-gray-600">
                {(score * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-gray-400">
                ({person.respondents} raters)
              </span>
            </div>
          );
        })}
      </div>

      {/* Safeguard flag summary */}
      {results.safeguardSummary && results.safeguardSummary.length > 0 && (
        <div className="pt-4 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <Shield className="w-4 h-4" />
            Safeguard Flags
          </h4>
          <div className="flex flex-wrap gap-2">
            {results.safeguardSummary.map((flag, idx) => (
              <span
                key={idx}
                className={`text-xs px-2 py-1 rounded-md border ${SEVERITY_COLORS[flag.severity] || SEVERITY_COLORS.info}`}
              >
                {flag.type.replace("_", " ")} ({flag.count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PeerRankingPanel;
