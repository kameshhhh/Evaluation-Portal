// ============================================================
// WHAT-IF SIMULATOR PAGE — Faculty scenario playground
// ============================================================
// SRS §4.4.3 — Faculty can simulate different weight configs
// and see real-time impact on their normalized score.
// Features: interactive sliders, instant simulation, save scenarios.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Save,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Bookmark,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { getAllFacultyEvalSessions } from "../../services/facultyEvaluationApi";
import useWhatIfScenario from "../../hooks/useWhatIfScenario";
import WeightSliders from "./WeightSliders";
import WhatIfScenarioCard from "./WhatIfScenarioCard";
import useAuth from "../../hooks/useAuth";

const WhatIfSimulatorPage = () => {
  const { sessionId: paramSession } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const facultyId = user?.personId;

  // Session selection
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(paramSession || null);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const nameRef = useRef(null);

  // What-if hook
  const {
    weights,
    updateWeights,
    simulation,
    simulating,
    runSimulation,
    scenarios,
    scenariosLoading,
    loadScenarios,
    save,
    saving,
    removeScenario,
    applyScenario,
    error,
    clearError,
  } = useWhatIfScenario(selectedSession, facultyId);

  // Load sessions
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getAllFacultyEvalSessions();
        if (!cancelled && result.success) {
          const closed = (result.data || []).filter(
            (s) => s.status === "closed" || s.status === "completed",
          );
          setSessions(closed);
          if (!selectedSession && closed.length > 0) {
            setSelectedSession(closed[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

  // Load scenarios when session changes
  useEffect(() => {
    if (selectedSession && facultyId) {
      loadScenarios();
    }
  }, [selectedSession, facultyId, loadScenarios]);

  // Debounced simulation when weights change
  const debounceRef = useRef(null);
  const handleWeightsChange = useCallback(
    (newWeights) => {
      updateWeights(newWeights);
      clearError();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runSimulation(newWeights);
      }, 400);
    },
    [updateWeights, runSimulation, clearError],
  );

  // Save handler
  const handleSave = async () => {
    if (!scenarioName.trim()) return;
    const success = await save(scenarioName.trim());
    if (success) {
      setShowSaveModal(false);
      setScenarioName("");
    }
  };

  // Simulation result display helpers
  const diff = simulation?.difference ?? 0;
  const DiffIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const diffColor =
    diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-500";

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ── Header ───────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="p-2.5 bg-violet-100 rounded-xl">
          <FlaskConical className="h-6 w-6 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            What-If Simulator
          </h1>
          <p className="text-sm text-gray-500">
            See how different weight configurations affect your normalized score
          </p>
        </div>
      </div>

      {/* ── Session Selector ─────────────────────── */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Session:</label>
          <select
            value={selectedSession || ""}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-violet-300"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.academic_year} {s.semester}
              </option>
            ))}
          </select>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-16">
          <FlaskConical className="h-16 w-16 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No completed sessions available</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {selectedSession && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Left: Weight Sliders ────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sticky top-6">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                Adjust Weights
              </h3>
              <WeightSliders
                weights={weights}
                onChange={handleWeightsChange}
                showPresets
              />

              {/* Run simulation button */}
              <button
                onClick={() => runSimulation()}
                disabled={simulating}
                className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {simulating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FlaskConical className="h-4 w-4" />
                )}
                {simulating ? "Simulating..." : "Simulate"}
              </button>
            </div>
          </div>

          {/* ── Right: Results ──────────────────── */}
          <div className="lg:col-span-3 space-y-5">
            {/* Simulation Result */}
            {simulation && (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-800">
                    Simulation Result
                  </h3>
                </div>

                <div className="p-5">
                  {/* Score Cards */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                        Current
                      </p>
                      <p className="text-2xl font-bold text-gray-700">
                        {simulation.current_score?.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-200">
                      <p className="text-[10px] text-violet-500 uppercase tracking-wider mb-1">
                        Simulated
                      </p>
                      <p className="text-2xl font-bold text-violet-700">
                        {simulation.simulated_score?.toFixed(2)}
                      </p>
                    </div>
                    <div
                      className={`rounded-xl p-3 text-center border ${
                        diff > 0
                          ? "bg-emerald-50 border-emerald-200"
                          : diff < 0
                            ? "bg-red-50 border-red-200"
                            : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                        Change
                      </p>
                      <div
                        className={`flex items-center justify-center gap-1 ${diffColor}`}
                      >
                        <DiffIcon className="h-5 w-5" />
                        <p className="text-2xl font-bold">
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Exposure data */}
                  {simulation.exposure_data && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2">
                        Exposure Details
                      </p>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400">Sessions</span>
                          <p className="font-bold text-gray-700">
                            {simulation.exposure_data.sessions} /{" "}
                            {simulation.exposure_data.max_sessions}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Ratio:{" "}
                            {simulation.exposure_data.session_ratio?.toFixed(3)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Hours</span>
                          <p className="font-bold text-gray-700">
                            {simulation.exposure_data.hours} /{" "}
                            {simulation.exposure_data.max_hours}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Ratio:{" "}
                            {simulation.exposure_data.hours_ratio?.toFixed(3)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">Role</span>
                          <p className="font-bold text-gray-700 capitalize">
                            {simulation.exposure_data.role}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            ×
                            {simulation.exposure_data.role_multiplier?.toFixed(
                              2,
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Factor summary */}
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>
                      Exposure Factor:{" "}
                      <span className="font-bold text-violet-700">
                        {simulation.simulated_exposure_factor?.toFixed(4)}
                      </span>
                    </span>
                    <span>
                      Response Adj:{" "}
                      <span className="font-bold text-blue-600">
                        {simulation.response_adjustment?.toFixed(4)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Save button */}
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => {
                      setShowSaveModal(true);
                      setTimeout(() => nameRef.current?.focus(), 100);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Bookmark className="h-4 w-4" />
                    Save This Scenario
                  </button>
                </div>
              </div>
            )}

            {/* Saved Scenarios */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  Saved Scenarios
                </h3>
                <span className="text-xs text-gray-400">
                  {scenarios.length} saved
                </span>
              </div>

              <div className="p-5">
                {scenariosLoading ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    Loading...
                  </div>
                ) : scenarios.length === 0 ? (
                  <div className="text-center py-6">
                    <Bookmark className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">
                      No saved scenarios yet. Adjust weights and save
                      interesting configurations.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {scenarios.map((s) => (
                      <WhatIfScenarioCard
                        key={s.id}
                        scenario={s}
                        onApply={applyScenario}
                        onDelete={removeScenario}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Modal ─────────────────────────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Save Scenario
            </h3>
            <input
              ref={nameRef}
              type="text"
              placeholder="e.g., Higher session weight"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setScenarioName("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!scenarioName.trim() || saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatIfSimulatorPage;
