// ============================================================
// RESULTS VIEW — Aggregated Peer Ranking Results
// ============================================================
// SRS §4.5.3: "Individual rankings are NEVER revealed.
// Only aggregated analytics are used."
//
// Displays:
//   - Banded scores per peer (EXCELLENT/GOOD/SATISFACTORY/DEVELOPING)
//   - Horizontal bar chart visualization
//   - Respondent count & privacy threshold info
//   - No individual ranking data shown
// ============================================================

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  ShieldCheck,
  Users,
  Loader2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Award,
  TrendingUp,
  Star,
  Target,
} from "lucide-react";
import * as peerRankingApi from "../../services/peerRankingApi";

// Band styling configuration
const BAND_CONFIG = {
  EXCELLENT: {
    color: "bg-emerald-500",
    bgLight: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    label: "Excellent",
    icon: Star,
    description: "Top-tier performance recognized by peers",
  },
  GOOD: {
    color: "bg-blue-500",
    bgLight: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    label: "Good",
    icon: TrendingUp,
    description: "Strong performance acknowledged by peers",
  },
  SATISFACTORY: {
    color: "bg-amber-500",
    bgLight: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    label: "Satisfactory",
    icon: Target,
    description: "Solid baseline with room for growth",
  },
  DEVELOPING: {
    color: "bg-gray-400",
    bgLight: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-600",
    label: "Developing",
    icon: Award,
    description: "Early stage — growth trajectory ahead",
  },
};

const ResultsView = ({ surveyId, surveyTitle, onBack }) => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await peerRankingApi.getSurveyResults(surveyId);
      setResults(res.data || res);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          "Could not load results at this time."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (surveyId) loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading aggregated results...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-lg mx-auto py-8 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h3 className="font-semibold text-amber-800 mb-1">
            Results Not Available Yet
          </h3>
          <p className="text-sm text-amber-700">{error}</p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={loadResults}
            className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Surveys
          </button>
        </div>
      </div>
    );
  }

  const scores = results?.aggregatedScores || [];
  const safeguards = results?.safeguardSummary || [];
  const survey = results?.survey || {};
  const respondentCount = scores[0]?.respondents || 0;

  // Find max score for bar scaling
  const maxScore = Math.max(...scores.map((s) => s.normalizedScore), 0.01);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {surveyTitle || survey?.title || "Survey Results"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Aggregated from {respondentCount} anonymous responses
          </p>
        </div>
        <button
          onClick={loadResults}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          title="Refresh results"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Privacy Banner */}
      <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
        <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-green-700">
          These results are fully aggregated and anonymous. No individual
          rankings are shown. Bands are computed from collective peer
          assessments.
        </p>
      </div>

      {/* Results Grid */}
      {scores.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <Users className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-700 mb-1">
            No Results Yet
          </h3>
          <p className="text-sm text-gray-500">
            Results will appear once enough peers have submitted their rankings
            (minimum 3 participants).
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">Peer</div>
            <div className="col-span-6">Score</div>
            <div className="col-span-3 text-right">Band</div>
          </div>

          {/* Score rows */}
          <div className="divide-y divide-gray-100">
            {scores.map((score, idx) => {
              const band = BAND_CONFIG[score.band] || BAND_CONFIG.DEVELOPING;
              const barWidth = Math.max(
                (score.normalizedScore / maxScore) * 100,
                4
              );
              const BandIcon = band.icon;

              return (
                <div
                  key={score.personId || idx}
                  className="px-5 py-3.5 grid grid-cols-12 gap-3 items-center hover:bg-gray-50/50 transition-colors"
                >
                  {/* Name */}
                  <div className="col-span-3">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {score.displayName || "Participant"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {score.mentions} mentions
                    </p>
                  </div>

                  {/* Bar */}
                  <div className="col-span-6 flex items-center gap-3">
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${band.color} rounded-full transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                        {(score.normalizedScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Band Badge */}
                  <div className="col-span-3 flex justify-end">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${band.bgLight} ${band.border} ${band.text} border`}
                    >
                      <BandIcon className="h-3.5 w-3.5" />
                      {band.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Band Legend */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Band Definitions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(BAND_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <div
                key={key}
                className={`p-3 rounded-lg ${config.bgLight} ${config.border} border`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${config.text}`} />
                  <span className={`text-xs font-semibold ${config.text}`}>
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{config.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safeguard Flags (shown but not alarming) */}
      {safeguards.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Integrity Monitoring
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            The system automatically monitors for response patterns to ensure
            fair results.
          </p>
          <div className="flex flex-wrap gap-2">
            {safeguards.map((flag, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  flag.severity === "critical"
                    ? "bg-red-100 text-red-700"
                    : flag.severity === "high"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {flag.type.replace(/_/g, " ")} ({flag.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Surveys
        </button>
      </div>
    </div>
  );
};

export default ResultsView;
