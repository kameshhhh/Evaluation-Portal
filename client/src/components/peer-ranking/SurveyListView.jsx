// ============================================================
// SURVEY LIST VIEW — Available Surveys + Create New
// ============================================================
// SRS §4.5.2: Shows active surveys for the student and
// allows creating a student-initiated survey from trait bank.
// ============================================================

import React, { useState } from "react";
import {
  ClipboardList,
  PlusCircle,
  Check,
  Clock,
  FileEdit,
  ChevronRight,
  Users,
  Sparkles,
} from "lucide-react";

const SurveyListView = ({
  surveys,
  peerGroups,
  traitQuestions,
  onSelectSurvey,
  onCreateSurvey,
  onGoToGroupSetup,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(
    peerGroups[0]?.groupId || "",
  );
  const [selectedTraits, setSelectedTraits] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const toggleTrait = (traitKey) => {
    setSelectedTraits((prev) => {
      const next = new Set(prev);
      if (next.has(traitKey)) next.delete(traitKey);
      else next.add(traitKey);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!selectedGroupId || selectedTraits.size === 0) return;
    try {
      setCreating(true);
      setCreateError(null);
      await onCreateSurvey(selectedGroupId, Array.from(selectedTraits));
      setShowCreate(false);
      setSelectedTraits(new Set());
    } catch (err) {
      setCreateError(err.response?.data?.error || err.message);
    } finally {
      setCreating(false);
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case "submitted":
        return { icon: Check, color: "green", label: "Completed" };
      case "draft":
        return { icon: FileEdit, color: "amber", label: "In Progress" };
      default:
        return { icon: Clock, color: "blue", label: "Ready" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Your Peer Surveys
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onGoToGroupSetup}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Users className="h-4 w-4" />
            Manage Groups
          </button>
          {peerGroups.length > 0 && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
            >
              <PlusCircle className="h-4 w-4" />
              New Survey
            </button>
          )}
        </div>
      </div>

      {/* No groups warning */}
      {peerGroups.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <Users className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">
            Create a peer group first to start ranking surveys
          </p>
          <button
            onClick={onGoToGroupSetup}
            className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
          >
            Create Peer Group
          </button>
        </div>
      )}

      {/* Create Survey Panel */}
      {showCreate && (
        <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Start a New Peer Evaluation
          </h3>

          {/* Select group */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Peer Group
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
            >
              {peerGroups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.groupName} ({g.peerCount} peers)
                </option>
              ))}
            </select>
          </div>

          {/* Select traits */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">
              What traits do you want to evaluate? (Select 1+)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {traitQuestions.map((trait) => {
                const selected = selectedTraits.has(trait.traitKey);
                return (
                  <button
                    key={trait.traitKey}
                    onClick={() => toggleTrait(trait.traitKey)}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all text-sm ${
                      selected
                        ? "bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selected
                          ? "bg-indigo-600 border-indigo-600"
                          : "border-gray-300"
                      }`}
                    >
                      {selected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div>
                      <span className="font-medium text-gray-900 block">
                        {trait.text}
                      </span>
                      {trait.description && (
                        <span className="text-xs text-gray-500">
                          {trait.description}
                        </span>
                      )}
                      {trait.type === "negative" && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded text-xs">
                          Sensitive — extra anonymization
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {createError && <p className="text-sm text-red-600">{createError}</p>}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={
                creating || selectedTraits.size === 0 || !selectedGroupId
              }
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {creating ? "Creating..." : "Create Survey"}
            </button>
          </div>
        </div>
      )}

      {/* Survey Cards */}
      <div className="space-y-3">
        {surveys.length === 0 && peerGroups.length > 0 && !showCreate && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
            <ClipboardList className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No surveys yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Create a new survey to start evaluating your peers on key traits.
            </p>
          </div>
        )}

        {surveys.map((survey) => {
          const status = getStatusConfig(survey.status);
          const StatusIcon = status.icon;
          return (
            <button
              key={survey.surveyId}
              onClick={() => onSelectSurvey(survey)}
              className="w-full bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {survey.title}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-700`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {survey.initiationMode === "student"
                      ? "Self-initiated"
                      : "Assigned"}{" "}
                    •{" "}
                    {
                      (typeof survey.questions === "string"
                        ? JSON.parse(survey.questions)
                        : survey.questions || []
                      ).length
                    }{" "}
                    question(s)
                    {survey.closesAt && (
                      <>
                        {" "}
                        • Closes{" "}
                        {new Date(survey.closesAt).toLocaleDateString()}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SurveyListView;
