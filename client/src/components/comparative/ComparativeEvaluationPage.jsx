// ============================================================
// COMPARATIVE EVALUATION PAGE — SRS §4.3 Entry Point
// ============================================================
// Main page for Cross-Project Comparative Evaluation.
// Shows: Active rounds → Project selection → Allocation matrix → Submit
// Handles both judge flow and links to admin management.
// ============================================================

import React, { useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LayoutGrid, ArrowLeft, Plus, ClipboardList } from "lucide-react";
import useAuth from "../../hooks/useAuth";
import {
  useMyActiveRounds,
  useMyComparativeSessions,
} from "../../hooks/useComparativeRounds";
import ProjectSelectionStep from "./ProjectSelectionStep";
import AllocationMatrix from "./AllocationMatrix";
import ComparativeSubmittedView from "./ComparativeSubmittedView";
import ZeroScoreReasonDialog from "../Common/ZeroScoreReasonDialog";
import {
  ComparativeProvider,
  useComparativeEvaluation,
} from "../../hooks/useComparativeEvaluation";

// ============================================================
// STATUS BADGE
// ============================================================
function StatusBadge({ status }) {
  const colors = {
    draft: "bg-gray-100 text-gray-700",
    active: "bg-green-100 text-green-700",
    closed: "bg-red-100 text-red-700",
    archived: "bg-gray-200 text-gray-500",
    in_progress: "bg-blue-100 text-blue-700",
    submitted: "bg-purple-100 text-purple-700",
    locked: "bg-yellow-100 text-yellow-700",
    assigned: "bg-blue-100 text-blue-600",
    completed: "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        colors[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status?.replace("_", " ")}
    </span>
  );
}

// ============================================================
// ROUND CARD — Shows a round available to the judge
// ============================================================
function RoundCard({ round, onSelect }) {
  const hasSession = !!round.existing_session_id;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{round.name}</h3>
          {round.description && (
            <p className="text-sm text-gray-500 mt-1">{round.description}</p>
          )}
        </div>
        <StatusBadge
          status={hasSession ? round.existing_session_status : "active"}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm text-gray-600 mb-4">
        <div>
          <span className="text-gray-400 block text-xs">Pool</span>
          <span className="font-medium">{round.total_pool} pts</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Projects</span>
          <span className="font-medium">{round.project_count || 0}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Criteria</span>
          <span className="font-medium">{(round.criteria || []).length}</span>
        </div>
      </div>

      {round.evaluation_window_end && (
        <p className="text-xs text-gray-400 mb-3">
          Deadline: {new Date(round.evaluation_window_end).toLocaleDateString()}
        </p>
      )}

      <button
        onClick={() => onSelect(round)}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
          hasSession
            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
      >
        {hasSession
          ? round.existing_session_status === "submitted"
            ? "View Submission"
            : "Continue Evaluation"
          : "Start Evaluation"}
      </button>
    </div>
  );
}

// ============================================================
// SESSION CARD — Shows a judge's past session
// ============================================================
function SessionCard({ session, onClick }) {
  return (
    <div
      onClick={() => onClick(session)}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900">{session.round_name}</h4>
        <StatusBadge status={session.status} />
      </div>
      <div className="text-sm text-gray-500">
        <span>{(session.project_ids || []).length} projects</span>
        <span className="mx-2">·</span>
        <span>Pool: {session.total_pool} pts</span>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {session.submitted_at
          ? `Submitted: ${new Date(session.submitted_at).toLocaleDateString()}`
          : `Created: ${new Date(session.created_at).toLocaleDateString()}`}
      </p>
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export default function ComparativeEvaluationPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin" || user?.role === "faculty";

  // If we have a sessionId from route, show the session directly
  if (sessionId) {
    return <SessionView sessionId={sessionId} />;
  }

  return <RoundsListView navigate={navigate} isAdmin={isAdmin} />;
}

// ============================================================
// ROUNDS LIST VIEW — Judge sees available rounds & past sessions
// ============================================================
function RoundsListView({ navigate, isAdmin }) {
  const {
    rounds,
    isLoading: roundsLoading,
    error: roundsError,
  } = useMyActiveRounds();
  const { sessions, isLoading: sessionsLoading } = useMyComparativeSessions();
  const [selectedRound, setSelectedRound] = useState(null);

  // Handle round selection
  const handleRoundSelect = useCallback(
    (round) => {
      if (round.existing_session_id) {
        navigate(`/comparative/${round.existing_session_id}`);
      } else {
        setSelectedRound(round);
      }
    },
    [navigate],
  );

  // Handle session creation from project selection
  const handleSessionCreated = useCallback(
    (session) => {
      navigate(`/comparative/${session.session_id}`);
    },
    [navigate],
  );

  // Project selection step
  if (selectedRound) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button
          onClick={() => setSelectedRound(null)}
          className="flex items-center text-gray-500 hover:text-gray-700 mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to rounds
        </button>
        <ProjectSelectionStep
          round={selectedRound}
          onSessionCreated={handleSessionCreated}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-6 h-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Comparative Evaluation
            </h1>
            <p className="text-sm text-gray-500">
              Compare projects side-by-side with scarcity allocation
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => navigate("/comparative/admin")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Manage Rounds
          </button>
        )}
      </div>

      {/* Active Rounds */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Active Rounds
        </h2>

        {roundsLoading ? (
          <div className="text-center py-8 text-gray-400">
            Loading rounds...
          </div>
        ) : roundsError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {roundsError}
          </div>
        ) : rounds.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No active rounds available</p>
            <p className="text-gray-400 text-sm mt-1">
              Check back later or contact an admin
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rounds.map((round) => (
              <RoundCard
                key={round.round_id}
                round={round}
                onSelect={handleRoundSelect}
              />
            ))}
          </div>
        )}
      </section>

      {/* Past Sessions */}
      {!sessionsLoading && sessions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            My Sessions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <SessionCard
                key={session.session_id}
                session={session}
                onClick={(s) => navigate(`/comparative/${s.session_id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// SESSION VIEW — Wraps with ComparativeProvider
// ============================================================
function SessionView({ sessionId }) {
  return (
    <ComparativeProvider sessionId={sessionId}>
      <SessionViewInner />
    </ComparativeProvider>
  );
}

function SessionViewInner() {
  const navigate = useNavigate();
  const {
    session,
    isLoading,
    error,
    showZeroReasonDialog,
    setShowZeroReasonDialog,
    pendingZeroAllocations,
    submit,
  } = useComparativeEvaluation();

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-gray-400">
        Loading session...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
        <button
          onClick={() => navigate("/comparative")}
          className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm"
        >
          ← Back to rounds
        </button>
      </div>
    );
  }

  // Route based on session status
  if (session?.status === "submitted" || session?.status === "locked") {
    return <ComparativeSubmittedView />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <button
        onClick={() => navigate("/comparative")}
        className="flex items-center text-gray-500 hover:text-gray-700 mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to rounds
      </button>
      <AllocationMatrix />

      {/* SRS §4.1.5 — Zero-Score Reason Dialog */}
      <ZeroScoreReasonDialog
        isOpen={showZeroReasonDialog}
        onConfirm={(reasons) => submit(reasons)}
        onCancel={() => setShowZeroReasonDialog(false)}
        zeroAllocations={pendingZeroAllocations}
        evaluationType="comparative"
      />
    </div>
  );
}
