// ============================================================
// FACULTY EVALUATION PAGE — Main orchestrator component
// ============================================================
// SRS §4.4 — Faculty Evaluation Module
// Students evaluate faculty using scarcity-based tier ranking.
// RULE: Only faculty who previously evaluated the student appear.
//
// Layout:
//   Session selector (if no session param)
//   → 2/3 TierRanking + 1/3 sidebar (PoolSummary + Actions + Info)
//
// Modes (SRS §4.4.2):
//   binary (0/1), small_pool (1-3), full_pool (10)
// ============================================================

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Undo2,
  RotateCcw,
  Send,
  Save,
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
  GraduationCap,
} from "lucide-react";
import useFacultyEvaluation from "../../hooks/useFacultyEvaluation";
import TierRanking from "./TierRanking";
import PoolSummary from "./PoolSummary";
import ConfirmSubmitModal from "./ConfirmSubmitModal";

const FacultyEvaluationPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    sessions,
    session,
    faculty,
    tiers,
    tierConfig,
    mode,
    pool,
    loading,
    saving,
    submitting,
    submitted,
    error,
    isDirty,
    lastSaved,
    canUndo,
    moveFaculty,
    undo,
    resetAll,
    saveDraft,
    submit,
    clearError,
    // selectSession available but used via navigate pattern
  } = useFacultyEvaluation(sessionId);

  // ── Loading state ───────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading faculty evaluation...</p>
        </div>
      </div>
    );
  }

  // ── Session Selector (when no sessionId in URL) ─────────
  if (!sessionId && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 rounded-xl hover:bg-white/80 text-gray-500"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Faculty Evaluation
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Evaluate your faculty using scarcity-based tier ranking
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Session list */}
          {sessions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-12 text-center">
              <GraduationCap className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-700 mb-2">
                No Active Sessions
              </h2>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                There are no faculty evaluation sessions available right now.
                Sessions are created by administrators when evaluation periods
                begin.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/faculty-evaluation/${s.id}`)}
                  className={`bg-white rounded-2xl shadow-lg border-2 p-6 text-left transition-all hover:shadow-xl hover:border-indigo-300 ${
                    s.hasSubmitted
                      ? "border-emerald-200 bg-emerald-50/30"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">{s.title}</h3>
                      {s.description && (
                        <p className="text-sm text-gray-500 mt-1">
                          {s.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {s.evaluation_mode?.replace("_", " ")}
                        </span>
                        {s.closes_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Closes {new Date(s.closes_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-3 py-1 rounded-full ${
                        s.hasSubmitted
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {s.hasSubmitted ? "Submitted ✓" : "Open"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Main Evaluation View ────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/faculty-evaluation")}
              className="p-2 rounded-xl hover:bg-white/80 text-gray-500"
              aria-label="Back to sessions"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {session?.title || "Faculty Evaluation"}
              </h1>
              <p className="text-sm text-gray-500">
                {faculty.length} eligible faculty • {mode?.replace("_", " ")}{" "}
                mode
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {!submitted && (
            <div className="flex items-center gap-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Undo last move"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={resetAll}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Reset all to unranked"
                title="Reset all"
              >
                <RotateCcw className="h-4 w-4 text-gray-600" />
              </button>
              <button
                onClick={saveDraft}
                disabled={saving || !isDirty}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 text-sm text-gray-600 transition-colors"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={pool.isExceeded || pool.used === 0}
                className={`flex items-center gap-1.5 px-5 py-2 font-bold text-sm rounded-xl transition-all shadow-md ${
                  pool.isExceeded || pool.used === 0
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg"
                }`}
              >
                <Send className="h-4 w-4" />
                Submit
              </button>
            </div>
          )}
        </div>

        {/* Error bar */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </span>
            <button
              onClick={clearError}
              className="text-red-400 hover:text-red-600 p-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Success bar */}
        {submitted && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <strong>Evaluation submitted successfully!</strong> Your feedback
            has been recorded. Results will be available after the session
            closes.
          </div>
        )}

        {/* No eligible faculty */}
        {faculty.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-12 text-center">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              No Eligible Faculty
            </h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Only faculty who have previously evaluated you can appear here.
              Once a faculty member evaluates your project, they'll show up for
              your feedback.
            </p>
          </div>
        ) : (
          /* ── Two-column layout ────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Tier Ranking (2/3) */}
            <div className="lg:col-span-2">
              <TierRanking
                tiers={tiers}
                tierConfig={tierConfig}
                onMoveFaculty={moveFaculty}
                disabled={submitted}
              />
            </div>

            {/* RIGHT: Sidebar (1/3) */}
            <div className="space-y-4">
              {/* Pool budget */}
              <PoolSummary
                pool={pool}
                mode={mode}
                facultyCount={faculty.length}
                saving={saving}
                lastSaved={lastSaved}
                submitted={submitted}
              />

              {/* How It Works card — SRS §8.2a: Rules are visible */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-5">
                <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-500" />
                  How It Works
                </h3>
                <ul className="space-y-2 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span>
                      <strong>Drag</strong> faculty cards into tiers (or{" "}
                      <strong>tap</strong> to select, then tap a tier)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    <span>
                      Higher tiers = more points. Points are{" "}
                      <strong>limited</strong> — you can't rank everyone high
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span>
                      Only faculty who have <strong>evaluated you</strong>{" "}
                      appear here — no unknowns
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    <span>
                      Your evaluation is <strong>anonymous</strong>. Faculty
                      only see aggregated bands.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Keyboard shortcuts */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-5">
                <h3 className="font-bold text-gray-900 text-sm mb-3">
                  Keyboard Shortcuts
                </h3>
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Select card</span>
                    <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                      Enter
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Place in tier</span>
                    <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                      Enter
                    </kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Navigate</span>
                    <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">
                      Tab
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      <ConfirmSubmitModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={async () => {
          await submit();
          setShowConfirm(false);
        }}
        tiers={tiers}
        tierConfig={tierConfig}
        pool={pool}
        submitting={submitting}
      />
    </div>
  );
};

export default FacultyEvaluationPage;
