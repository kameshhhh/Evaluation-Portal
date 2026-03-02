// ============================================================
// PEER SUGGESTION PANEL — Student-facing Smart Peer Recommendations
// ============================================================
// SRS §4.5 + §1.2 — Part 6: Lightweight Peer Group Optimization
//
// Shows ranked peer suggestions with factor scores and reasons.
// Students see recommended peers for evaluation groups based on:
//   - Department match (30pts)
//   - Project overlap (40pts)
//   - Evaluation recency (20pts)
//   - Skill diversity (10pts)
//
// Usage:
//   <PeerSuggestionPanel /> (uses authenticated user context)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Star,
  Briefcase,
  BookOpen,
  Clock,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import * as cohortApi from "../../../services/cohortApi";

const PeerSuggestionPanel = () => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(10);
  const [expandedId, setExpandedId] = useState(null);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cohortApi.getPeerSuggestions({ limit });
      setSuggestions(result.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          <h3 className="text-base font-semibold text-gray-900">
            Suggested Peers
          </h3>
          <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-600 rounded-full font-medium">
            Smart Match
          </span>
        </div>
        <button
          onClick={loadSuggestions}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500
                     hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Info bar */}
      <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg text-sm text-purple-700">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Peers are recommended based on project overlap, department match,
          evaluation history, and skill diversity. Higher scores indicate
          stronger matches for meaningful evaluations.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Suggestion cards */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">
          Finding best peer matches...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No suggestions available yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Suggestions are generated as more evaluation data becomes available
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s, idx) => (
            <SuggestionCard
              key={s.suggested_peer_id || idx}
              suggestion={s}
              rank={idx + 1}
              expanded={expandedId === (s.suggested_peer_id || idx)}
              onToggle={() => toggleExpand(s.suggested_peer_id || idx)}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {suggestions.length >= limit && (
        <div className="text-center">
          <button
            onClick={() => setLimit((prev) => prev + 10)}
            className="text-sm text-purple-600 hover:text-purple-800"
          >
            Show more suggestions
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// SUGGESTION CARD
// ============================================================
const SuggestionCard = ({ suggestion, rank, expanded, onToggle }) => {
  const s = suggestion;
  const score = s.composite_score || 0;

  const scoreColor =
    score >= 70
      ? "text-green-700 bg-green-50 border-green-200"
      : score >= 40
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-gray-600 bg-gray-50 border-gray-200";

  const factors = [
    {
      label: "Department",
      score: s.department_score || 0,
      max: 30,
      icon: BookOpen,
      color: "text-blue-600",
    },
    {
      label: "Project Overlap",
      score: s.project_score || 0,
      max: 40,
      icon: Briefcase,
      color: "text-purple-600",
    },
    {
      label: "Eval Recency",
      score: s.recency_score || 0,
      max: 20,
      icon: Clock,
      color: "text-amber-600",
    },
    {
      label: "Skill Diversity",
      score: s.diversity_score || 0,
      max: 10,
      icon: Star,
      color: "text-emerald-600",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-purple-200 transition-colors">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        {/* Rank */}
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-bold text-gray-500">
          {rank}
        </div>

        {/* Name + dept */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {s.peer_name || s.suggested_peer_id?.slice(0, 12) || "Peer"}
          </div>
          <div className="text-xs text-gray-500">{s.department || "—"}</div>
        </div>

        {/* Reasons preview */}
        {s.reasons && s.reasons.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 flex-wrap max-w-xs">
            {s.reasons.slice(0, 2).map((r, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-xs bg-gray-50 text-gray-500 rounded-full truncate max-w-[10rem]"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Score badge */}
        <div
          className={`px-2.5 py-1 text-sm font-bold rounded-lg border ${scoreColor}`}
        >
          {score}
        </div>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Factor breakdown */}
          <div className="grid grid-cols-4 gap-2">
            {factors.map((f) => {
              const Icon = f.icon;
              const pct = f.max > 0 ? (f.score / f.max) * 100 : 0;
              return (
                <div key={f.label} className="text-center">
                  <Icon className={`h-4 w-4 mx-auto mb-1 ${f.color}`} />
                  <div className="text-xs text-gray-500 mb-1">{f.label}</div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mx-2">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs font-medium text-gray-700 mt-1">
                    {f.score}/{f.max}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reasons */}
          {s.reasons && s.reasons.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                Why this match:
              </p>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {s.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-purple-400 mt-0.5">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cache info */}
          {s.cached_at && (
            <p className="text-xs text-gray-400">
              Computed {new Date(s.cached_at).toLocaleDateString()} —{" "}
              {s.from_cache ? "cached" : "fresh"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PeerSuggestionPanel;
