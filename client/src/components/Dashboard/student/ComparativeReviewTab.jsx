// ============================================================
// STUDENT — Comparative Review Tab
// ============================================================
// Shows the student's team comparative reviews.
// View opponent team's project, scores, and global rankings.
// Completely standalone module.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Scale,
  Trophy,
  Users,
  Loader2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Github,
  ShieldCheck,
  ShieldAlert,
  Edit3,
} from "lucide-react";
import {
  getMyReviews,
  getGlobalRankings,
} from "../../../services/comparativeReviewApi";
import { getGitHubTokenStatus, saveGitHubToken, updateGitHubToken } from "../../../services/githubApi";

const TRACK_LABELS = { core: "Core", it_core: "IT & Core", premium: "Premium" };

export default function StudentComparativeReviewTab() {
  const [reviews, setReviews] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRankings, setShowRankings] = useState(false);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsTrack, setRankingsTrack] = useState("");

  // --- GitHub Token State ---
  const [tokenStatus, setTokenStatus] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [tokenEditing, setTokenEditing] = useState(false);

  const TRACKS = [
    { value: "core", label: "Core" },
    { value: "it_core", label: "IT & Core" },
    { value: "premium", label: "Premium" },
  ];

  // Fetch token status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await getGitHubTokenStatus();
        setTokenStatus(res.data);
      } catch { /* no token yet */ }
      finally { setTokenLoading(false); }
    })();
  }, []);

  const handleTokenSubmit = async () => {
    if (!tokenInput.trim() || tokenInput.trim().length < 10) {
      setTokenError("Please enter a valid GitHub Personal Access Token");
      return;
    }
    setTokenSaving(true);
    setTokenError("");
    try {
      const fn = tokenStatus?.is_valid ? updateGitHubToken : saveGitHubToken;
      const res = await fn(tokenInput.trim());
      setTokenStatus(res.data);
      setTokenInput("");
      setTokenEditing(false);
    } catch (err) {
      setTokenError(err.response?.data?.error || "Failed to save token. Check scopes: public_repo, read:user, user:email");
    } finally {
      setTokenSaving(false);
    }
  };

  // ============================================================
  // Fetch data
  // ============================================================
  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getMyReviews();
      const data = res?.data || res || [];
      setReviews(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRankings = useCallback(async () => {
    try {
      setRankingsLoading(true);
      const params = rankingsTrack ? { track: rankingsTrack } : {};
      const res = await getGlobalRankings(params);
      const data = res?.data || res || [];
      setRankings(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setRankingsLoading(false);
    }
  }, [rankingsTrack]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    if (showRankings) fetchRankings();
  }, [showRankings, fetchRankings]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Scale className="h-5 w-5 text-blue-600" />
          Comparative Review
        </h2>
        <button
          onClick={() => setShowRankings(!showRankings)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition-colors"
        >
          <Trophy className="h-3.5 w-3.5" /> {showRankings ? "Hide Rankings" : "View Rankings"}
        </button>
      </div>

      {/* ── GitHub Token Banner ── */}
      <div className="mb-4">
        {tokenLoading ? (
          <div className="bg-white/30 backdrop-blur-xl rounded-2xl border border-white/50 p-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            <span className="text-xs text-gray-400">Checking GitHub token...</span>
          </div>
        ) : tokenStatus?.is_valid && !tokenEditing ? (
          <div className="bg-emerald-500/5 backdrop-blur-xl rounded-2xl border border-emerald-500/15 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  GitHub Linked
                  <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">
                    @{tokenStatus.github_username}
                  </span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Token valid — Last verified {tokenStatus.last_validated_at ? new Date(tokenStatus.last_validated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "recently"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setTokenEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold text-gray-500 hover:text-violet-600 hover:bg-violet-500/5 rounded-lg transition-colors"
            >
              <Edit3 className="h-3 w-3" />
              Edit
            </button>
          </div>
        ) : (
          <div className="bg-amber-500/5 backdrop-blur-xl rounded-2xl border border-amber-500/15 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {tokenEditing ? "Update GitHub Token" : "GitHub Token Required"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Paste your GitHub Personal Access Token (needs: public_repo, read:user, user:email scopes)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => { setTokenInput(e.target.value); setTokenError(""); }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="flex-1 px-3 py-2 text-xs bg-white/60 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder-gray-300"
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              />
              <button
                onClick={handleTokenSubmit}
                disabled={tokenSaving || !tokenInput.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl hover:from-violet-600 hover:to-indigo-600 disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                {tokenSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Github className="h-3 w-3" />}
                {tokenSaving ? "Validating..." : tokenEditing ? "Update" : "Link GitHub"}
              </button>
              {tokenEditing && (
                <button
                  onClick={() => { setTokenEditing(false); setTokenInput(""); setTokenError(""); }}
                  className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
            {tokenError && (
              <p className="text-[10px] text-red-500 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {tokenError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ====== GLOBAL RANKINGS ====== */}
      {showRankings && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Global Team Rankings
          </h3>

          {/* Track filter */}
          <div className="flex items-center gap-1.5 mb-3">
            <button onClick={() => setRankingsTrack("")}
              className={`px-2.5 py-1 text-[10px] rounded-lg font-medium transition-colors ${!rankingsTrack ? "bg-amber-200 text-amber-800" : "bg-white text-amber-600 hover:bg-amber-100"}`}>
              All
            </button>
            {TRACKS.map((t) => (
              <button key={t.value} onClick={() => setRankingsTrack(t.value)}
                className={`px-2.5 py-1 text-[10px] rounded-lg font-medium transition-colors ${rankingsTrack === t.value ? "bg-amber-200 text-amber-800" : "bg-white text-amber-600 hover:bg-amber-100"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {rankingsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            </div>
          ) : rankings.length === 0 ? (
            <p className="text-xs text-amber-600 text-center py-2">No rankings available yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
              {rankings.map((r) => (
                <div key={r.team_id}
                  className={`rounded-xl p-3 border flex flex-col justify-between ${
                    r.global_rank <= 3 ? "bg-amber-100/50 border-amber-200" : "bg-white border-amber-100"
                  }`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-lg font-bold ${
                      r.global_rank === 1 ? "text-yellow-500" : r.global_rank === 2 ? "text-gray-400" : r.global_rank === 3 ? "text-orange-400" : "text-gray-400"
                    }`}>
                      #{r.global_rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.project_title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {r.leader_name} • {TRACK_LABELS[r.track] || r.track}
                      </p>
                      {r.rounds_participated > 1 && (
                        <p className="text-[10px] text-gray-400">{r.rounds_participated} rounds avg</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="font-bold text-indigo-700 text-lg">
                      {parseFloat(r.marks).toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400">/{parseFloat(r.mark_pool).toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== MY REVIEWS ====== */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Scale className="h-10 w-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No comparative reviews for your team yet.</p>
          <p className="text-xs text-gray-400 mt-1">When admin pairs your team for a head-to-head review, it will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((review) => {
            const isMarked = review.pairing_status === "marked" || review.pairing_status === "finalized";
            const myMarks = review.my_marks != null ? parseFloat(review.my_marks) : null;

            return (
              <div key={review.pairing_id} className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-200/60 hover:scale-[1.02] transition-all duration-300 group">
                {/* Review Header */}
                <div className="px-4 py-3 border-b border-white/30 bg-gradient-to-r from-white/50 to-gray-50/50 group-hover:from-indigo-50/40 group-hover:to-violet-50/30 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900 group-hover:text-indigo-700 transition-colors duration-300">{review.round_title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{review.pairing_label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                        {TRACK_LABELS[review.track] || review.track}
                      </span>
                      {isMarked ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          Reviewed
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Awaiting
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {!isMarked ? (
                    /* Awaiting review — show team matchup without marks */
                    <div className="space-y-3">
                      {/* Your Team */}
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-xs font-semibold text-blue-600 mb-0.5">Your Team</p>
                        <p className="font-medium text-sm text-gray-900">{review.my_project_title || "Your Project"}</p>
                      </div>

                      {/* VS divider */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <span className="text-xs font-bold text-gray-400 px-2">VS</span>
                        <div className="flex-1 h-px bg-gray-200"></div>
                      </div>

                      {/* Opponent Teams */}
                      {review.opponents?.map((opp) => (
                        <div key={opp.team_id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 mb-0.5">Opponent Team</p>
                          <p className="font-medium text-sm text-gray-900 mt-0.5">{opp.project_title || "Opponent Project"}</p>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Users className="h-3 w-3" /> {opp.leader_name}
                          </p>
                          {opp.member_names && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Members: {opp.member_names}</p>
                          )}
                        </div>
                      ))}

                      {/* Awaiting badge */}
                      <div className="text-center py-2">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-200">
                          <Clock className="h-3 w-3 text-amber-500" />
                          <span className="text-xs text-amber-700 font-medium">Awaiting faculty marks</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Results available */
                    <div className="space-y-3">
                      {/* Your Team Score */}
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-blue-600 mb-0.5">Your Team</p>
                            <p className="font-medium text-sm text-gray-900">{review.my_project_title || "Your Project"}</p>
                          </div>
                          {myMarks != null && (
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-700">{myMarks.toFixed(2)}</p>
                              <p className="text-xs text-blue-400">/ {parseFloat(review.mark_pool).toFixed(1)}</p>
                            </div>
                          )}
                        </div>
                        {review.my_feedback && (
                          <div className="mt-2 bg-blue-100/50 rounded-lg px-3 py-2 border border-blue-200/50">
                            <p className="text-[10px] font-semibold text-blue-600 mb-0.5">Faculty Feedback:</p>
                            <p className="text-xs text-blue-800">"{review.my_feedback}"</p>
                          </div>
                        )}
                      </div>

                      {/* VS divider */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <span className="text-xs font-bold text-gray-400 px-2">VS</span>
                        <div className="flex-1 h-px bg-gray-200"></div>
                      </div>

                      {/* Opponent Teams */}
                      {review.opponents?.map((opp) => {
                        const oppMarks = opp.marks != null ? parseFloat(opp.marks) : null;
                        const comparison = myMarks != null && oppMarks != null
                          ? myMarks > oppMarks ? "win" : myMarks < oppMarks ? "loss" : "tie"
                          : null;

                        return (
                          <div key={opp.team_id}
                            className={`rounded-xl p-4 border ${
                              comparison === "win" ? "bg-green-50 border-green-100" :
                              comparison === "loss" ? "bg-red-50 border-red-100" :
                              "bg-gray-50 border-gray-100"
                            }`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-500">Opponent Team</p>
                                  {comparison === "win" && <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />}
                                  {comparison === "loss" && <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
                                  {comparison === "tie" && <Minus className="h-3.5 w-3.5 text-gray-500" />}
                                </div>
                                <p className="font-medium text-sm text-gray-900 mt-0.5">{opp.project_title || "Opponent Project"}</p>
                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                  <Users className="h-3 w-3" /> {opp.leader_name}
                                </p>
                                {opp.member_names && (
                                  <p className="text-[10px] text-gray-400 mt-0.5">Members: {opp.member_names}</p>
                                )}
                              </div>
                              {oppMarks != null && (
                                <div className="text-right">
                                  <p className={`text-2xl font-bold ${
                                    comparison === "win" ? "text-green-600" :
                                    comparison === "loss" ? "text-red-600" :
                                    "text-gray-600"
                                  }`}>
                                    {oppMarks.toFixed(2)}
                                  </p>
                                  <p className="text-xs text-gray-400">/ {parseFloat(review.mark_pool).toFixed(1)}</p>
                                </div>
                              )}
                            </div>
                            {opp.feedback && (
                              <div className="mt-2 bg-white/70 rounded-lg px-3 py-2 border border-gray-200/50">
                                <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Faculty Feedback:</p>
                                <p className="text-xs text-gray-700">"{opp.feedback}"</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
