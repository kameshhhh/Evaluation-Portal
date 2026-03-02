// ============================================================
// PEER RANKING SURVEY PAGE — Main Page Component
// ============================================================
// SRS §4.5: Root component for the peer ranking system.
// Manages view routing between group setup, survey list,
// ranking interface, and results view.
//
// VIEWS:
//   1. GROUP_SETUP — Peer group creation wizard (§4.5.1)
//   2. SURVEY_LIST — Choose a survey to complete (§4.5.2)
//   3. RANKING — Click-to-assign ranking interface (§4.5.2)
//   4. RESULTS — Aggregated results view (§4.5.3)
//   5. SUBMITTED — Submission confirmation
// ============================================================

import React from "react";
import { useParams } from "react-router-dom";
import usePeerRanking from "../../hooks/usePeerRanking";
import PeerGroupWizard from "./PeerGroupWizard";
import SurveyListView from "./SurveyListView";
import RankingInterface from "./RankingInterface";
import SubmittedView from "./SubmittedView";
import ResultsView from "./ResultsView";
import { Users, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

const PeerRankingSurveyPage = () => {
  const { surveyId } = useParams();
  const pr = usePeerRanking(surveyId);

  // Loading state
  if (pr.loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading peer ranking...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6">
        {pr.view !== pr.VIEWS.SURVEY_LIST &&
          pr.view !== pr.VIEWS.GROUP_SETUP && (
            <button
              onClick={pr.goBackToList}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to surveys
            </button>
          )}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <Users className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Peer Ranking</h1>
            <p className="text-sm text-gray-500">
              Anonymous, ethical peer evaluations on key traits
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {pr.error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-red-700">{pr.error}</p>
          </div>
        </div>
      )}

      {/* Privacy Disclaimer (shown on all views) */}
      <div className="mb-6 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
        <p className="text-xs text-indigo-700">
          <strong>Privacy Guarantee:</strong> Your individual rankings are
          encrypted and never revealed. Only aggregated, anonymous results are
          used for insights.
        </p>
      </div>

      {/* View Router */}
      {pr.view === pr.VIEWS.GROUP_SETUP && (
        <PeerGroupWizard
          availablePeers={pr.availablePeers}
          loadAvailablePeers={pr.loadAvailablePeers}
          onCreateGroup={pr.createGroup}
          existingGroups={pr.peerGroups}
          onSkip={pr.peerGroups.length > 0 ? pr.goBackToList : null}
        />
      )}

      {pr.view === pr.VIEWS.SURVEY_LIST && (
        <SurveyListView
          surveys={pr.surveys}
          peerGroups={pr.peerGroups}
          traitQuestions={pr.traitQuestions}
          onSelectSurvey={pr.loadSurvey}
          onCreateSurvey={pr.createSurvey}
          onGoToGroupSetup={pr.goToGroupSetup}
        />
      )}

      {pr.view === pr.VIEWS.RANKING && (
        <RankingInterface
          survey={pr.activeSurvey}
          peers={pr.surveyPeers}
          currentQuestion={pr.currentQuestion}
          currentQuestionIndex={pr.currentQuestionIndex}
          totalQuestions={pr.totalQuestions}
          currentRankings={pr.currentRankings}
          maxRanks={pr.maxRanks}
          ranksAssigned={pr.ranksAssigned}
          canSubmit={pr.canSubmit}
          questionCompletionStatus={pr.questionCompletionStatus}
          saving={pr.saving}
          submitting={pr.submitting}
          lastSaved={pr.lastSaved}
          undoAvailable={pr.rankings && Object.keys(pr.rankings).length > 0}
          onAssignRank={pr.assignRank}
          onRemoveRank={pr.removeRank}
          onUndo={pr.undo}
          onClearQuestion={pr.clearCurrentQuestion}
          onNextQuestion={pr.nextQuestion}
          onPrevQuestion={pr.prevQuestion}
          onGoToQuestion={pr.goToQuestion}
          onSaveDraft={pr.handleSaveDraft}
          onSubmit={pr.handleSubmit}
        />
      )}

      {pr.view === pr.VIEWS.SUBMITTED && (
        <SubmittedView
          survey={pr.activeSurvey}
          onBackToList={pr.goBackToList}
          onViewResults={pr.viewResults}
        />
      )}

      {pr.view === pr.VIEWS.RESULTS && (
        <ResultsView
          surveyId={pr.activeSurvey?.surveyId}
          surveyTitle={pr.activeSurvey?.title}
          onBack={pr.goBackToList}
        />
      )}
    </div>
  );
};

export default PeerRankingSurveyPage;
