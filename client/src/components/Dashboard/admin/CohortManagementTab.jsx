// ============================================================
// COHORT MANAGEMENT TAB — Admin Cohort Orchestration Dashboard
// ============================================================
// SRS §1.2 + §8.1 — Evaluation Cohort Management
//
// Tabs:
//   1. Cohorts        — Create, list, manage cohort lifecycle
//   2. Assignments    — View/generate/override assignments
//   3. Coverage       — Coverage matrix, fairness metrics
//   4. Alerts         — Active alerts and gap detection
//   5. Peer Suggest   — Peer suggestion config (admin only)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Target,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  ChevronRight,
  Zap,
  BarChart3,
  Eye,
  Play,
  Square,
  Shuffle,
  Trash2,
  UserPlus,
  ArrowLeft,
} from "lucide-react";
import * as cohortApi from "../../../services/cohortApi";

// ============================================================
// MAIN COMPONENT
// ============================================================
const CohortManagementTab = () => {
  const [activeView, setActiveView] = useState("list"); // list | detail | create
  const [selectedCohortId, setSelectedCohortId] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCohorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cohortApi.listCohorts();
      setCohorts(result.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  const handleSelectCohort = (cohortId) => {
    setSelectedCohortId(cohortId);
    setActiveView("detail");
  };

  const handleBack = () => {
    setActiveView("list");
    setSelectedCohortId(null);
    loadCohorts();
  };

  if (activeView === "create") {
    return <CreateCohortForm onBack={handleBack} onCreated={handleBack} />;
  }

  if (activeView === "detail" && selectedCohortId) {
    return <CohortDetail cohortId={selectedCohortId} onBack={handleBack} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Evaluation Cohorts
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            SRS §1.2 + §8.1 — Structured evaluation containers with fairness
            guarantees
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadCohorts}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600
                       hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setActiveView("create")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                       text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Cohort
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Cohort List */}
      {cohorts.length === 0 && !loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Shield className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No cohorts yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create your first evaluation cohort to organize evaluations
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cohorts.map((cohort) => (
            <CohortCard
              key={cohort.cohort_id}
              cohort={cohort}
              onClick={() => handleSelectCohort(cohort.cohort_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COHORT CARD — List item
// ============================================================
const CohortCard = ({ cohort, onClick }) => {
  const statusColors = {
    draft: "bg-gray-100 text-gray-700",
    scheduled: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    completed: "bg-purple-100 text-purple-700",
    archived: "bg-gray-100 text-gray-500",
  };

  const typeLabels = {
    monthly_review: "Monthly Review",
    comparative_round: "Comparative Round",
    peer_ranking_cycle: "Peer Ranking Cycle",
    faculty_feedback: "Faculty Feedback",
    mixed: "Mixed",
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-blue-300
                 hover:shadow-md p-4 transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">
              {cohort.cohort_name}
            </h3>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                statusColors[cohort.cohort_status] ||
                "bg-gray-100 text-gray-600"
              }`}
            >
              {cohort.cohort_status}
            </span>
            <span className="px-2 py-0.5 text-xs text-gray-500 bg-gray-50 rounded-full">
              {typeLabels[cohort.cohort_type] || cohort.cohort_type}
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              {cohort.total_targets || 0} targets
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {cohort.total_evaluators || 0} evaluators
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {cohort.period_start} → {cohort.period_end}
            </span>
            {cohort.active_alerts > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {cohort.active_alerts} alert(s)
              </span>
            )}
          </div>

          {/* Coverage bar */}
          {cohort.cohort_status === "active" && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (cohort.compliance_rate || 0) >= 80
                      ? "bg-green-500"
                      : (cohort.compliance_rate || 0) >= 50
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${cohort.compliance_rate || 0}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 min-w-[3rem] text-right">
                {cohort.compliance_rate || 0}%
              </span>
            </div>
          )}
        </div>

        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 transition-colors ml-4" />
      </div>
    </button>
  );
};

// ============================================================
// CREATE COHORT FORM
// ============================================================
const CreateCohortForm = ({ onBack, onCreated }) => {
  const [form, setForm] = useState({
    name: "",
    description: "",
    cohortType: "monthly_review",
    periodStart: "",
    periodEnd: "",
    reviewCycle: "monthly",
    minEvaluationsPerTarget: 2,
    maxEvaluationsPerTarget: 5,
    maxAssignmentsPerEvaluator: 8,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await cohortApi.createCohort(form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          Create Evaluation Cohort
        </h2>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cohort Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="e.g., CSE January 2025 Monthly Review"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Purpose of this evaluation cohort..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Type + Cycle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cohort Type *
            </label>
            <select
              value={form.cohortType}
              onChange={(e) => handleChange("cohortType", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="monthly_review">Monthly Review</option>
              <option value="comparative_round">Comparative Round</option>
              <option value="peer_ranking_cycle">Peer Ranking Cycle</option>
              <option value="faculty_feedback">Faculty Feedback</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Review Cycle
            </label>
            <select
              value={form.reviewCycle}
              onChange={(e) => handleChange("reviewCycle", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {/* Period */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period Start *
            </label>
            <input
              type="date"
              value={form.periodStart}
              onChange={(e) => handleChange("periodStart", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period End *
            </label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={(e) => handleChange("periodEnd", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* Fairness Config */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-3 flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            SRS §8.1 Fairness Configuration
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-blue-700 mb-1">
                Min Evaluations / Target
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.minEvaluationsPerTarget}
                onChange={(e) =>
                  handleChange(
                    "minEvaluationsPerTarget",
                    parseInt(e.target.value),
                  )
                }
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm
                           focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">
                Max Evaluations / Target
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxEvaluationsPerTarget}
                onChange={(e) =>
                  handleChange(
                    "maxEvaluationsPerTarget",
                    parseInt(e.target.value),
                  )
                }
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm
                           focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-1">
                Max Assignments / Evaluator
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.maxAssignmentsPerEvaluator}
                onChange={(e) =>
                  handleChange(
                    "maxAssignmentsPerEvaluator",
                    parseInt(e.target.value),
                  )
                }
                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm
                           focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600
                       hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Cohort"}
          </button>
        </div>
      </form>
    </div>
  );
};

// ============================================================
// COHORT DETAIL VIEW — Tabs for managing a single cohort
// ============================================================
const CohortDetail = ({ cohortId, onBack }) => {
  const [cohort, setCohort] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCohort = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cohortApi.getCohort(cohortId);
      setCohort(result.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    loadCohort();
  }, [loadCohort]);

  const handleAction = async (action, label) => {
    setActionLoading(true);
    setError(null);
    try {
      await action();
      await loadCohort();
    } catch (err) {
      setError(`${label} failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading)
    return (
      <div className="text-center py-12 text-gray-500">Loading cohort...</div>
    );
  if (!cohort)
    return (
      <div className="text-center py-12 text-gray-500">Cohort not found</div>
    );

  const tabs = [
    { id: "overview", label: "Overview", icon: Eye },
    { id: "targets", label: "Targets", icon: Target },
    { id: "evaluators", label: "Evaluators", icon: Users },
    { id: "assignments", label: "Assignments", icon: Shuffle },
    { id: "coverage", label: "Coverage", icon: BarChart3 },
    { id: "alerts", label: "Alerts", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {cohort.name}
            </h2>
            <p className="text-sm text-gray-500">
              {cohort.cohort_type} — {cohort.status}
            </p>
          </div>
        </div>

        {/* Lifecycle actions */}
        <div className="flex gap-2">
          {cohort.status === "draft" && (
            <>
              <button
                onClick={() =>
                  handleAction(
                    () => cohortApi.autoSetupCohort(cohortId),
                    "Auto-setup",
                  )
                }
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600
                           hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Zap className="h-4 w-4" />
                Auto-fill
              </button>
              <button
                onClick={() =>
                  handleAction(
                    () => cohortApi.activateCohort(cohortId),
                    "Activate",
                  )
                }
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                           text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm"
              >
                <Play className="h-4 w-4" />
                Activate
              </button>
            </>
          )}
          {cohort.status === "active" && (
            <button
              onClick={() =>
                handleAction(
                  () => cohortApi.completeCohort(cohortId),
                  "Complete",
                )
              }
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                         text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm"
            >
              <Square className="h-4 w-4" />
              Complete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                         transition-all ${
                           isActive
                             ? "bg-blue-50 text-blue-700 shadow-sm"
                             : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                         }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : ""}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "overview" && <CohortOverview cohort={cohort} />}
        {activeTab === "targets" && (
          <TargetsPanel cohortId={cohortId} cohortStatus={cohort.status} />
        )}
        {activeTab === "evaluators" && (
          <EvaluatorsPanel cohortId={cohortId} cohortStatus={cohort.status} />
        )}
        {activeTab === "assignments" && (
          <AssignmentsPanel
            cohortId={cohortId}
            cohortStatus={cohort.status}
            onRefresh={loadCohort}
          />
        )}
        {activeTab === "coverage" && <CoveragePanel cohortId={cohortId} />}
        {activeTab === "alerts" && <AlertsPanel cohortId={cohortId} />}
      </div>
    </div>
  );
};

// ============================================================
// COHORT OVERVIEW
// ============================================================
const CohortOverview = ({ cohort }) => {
  const stats = [
    {
      label: "Targets",
      value: cohort.target_count || 0,
      icon: Target,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Evaluators",
      value: cohort.evaluator_count || 0,
      icon: Users,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "Assignments",
      value: cohort.assignment_count || 0,
      icon: Shuffle,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "Completed",
      value: cohort.completed_count || 0,
      icon: CheckCircle,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Active Alerts",
      value: cohort.active_alerts || 0,
      icon: AlertTriangle,
      color:
        (cohort.active_alerts || 0) > 0
          ? "text-amber-600 bg-amber-50"
          : "text-gray-500 bg-gray-50",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-gray-200 p-4 text-center"
            >
              <div
                className={`inline-flex items-center justify-center w-10 h-10 rounded-lg mb-2 ${s.color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Configuration
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Type:</span>{" "}
            <span className="font-medium">{cohort.cohort_type}</span>
          </div>
          <div>
            <span className="text-gray-500">Review Cycle:</span>{" "}
            <span className="font-medium">{cohort.review_cycle}</span>
          </div>
          <div>
            <span className="text-gray-500">Period:</span>{" "}
            <span className="font-medium">
              {cohort.period_start} → {cohort.period_end}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Min Evals/Target:</span>{" "}
            <span className="font-medium">
              {cohort.min_evaluations_per_target}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Max Evals/Target:</span>{" "}
            <span className="font-medium">
              {cohort.max_evaluations_per_target}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Max Assign/Evaluator:</span>{" "}
            <span className="font-medium">
              {cohort.max_assignments_per_evaluator}
            </span>
          </div>
        </div>
      </div>

      {cohort.fairness_report && (
        <FairnessReport report={cohort.fairness_report} />
      )}
    </div>
  );
};

// ============================================================
// TARGETS PANEL
// ============================================================
const TargetsPanel = ({ cohortId, cohortStatus }) => {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cohortApi.getTargets(cohortId);
      setTargets(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAutoPopulate = async () => {
    try {
      await cohortApi.autoPopulateTargets(cohortId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (targetId) => {
    try {
      await cohortApi.removeTarget(cohortId, targetId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading)
    return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      {cohortStatus === "draft" && (
        <div className="flex justify-end">
          <button
            onClick={handleAutoPopulate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600
                       hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Zap className="h-4 w-4" />
            Auto-populate from Rules
          </button>
        </div>
      )}

      {targets.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <Target className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No targets added yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Target
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Type
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Coverage
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Status
                </th>
                {cohortStatus === "draft" && (
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {targets.map((t) => (
                <tr key={t.target_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {t.target_label || t.target_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.target_type}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-medium">
                      {t.current_evaluations}/{t.target_evaluations}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.is_compliant ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                    )}
                  </td>
                  {cohortStatus === "draft" && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleRemove(t.target_id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// EVALUATORS PANEL
// ============================================================
const EvaluatorsPanel = ({ cohortId, cohortStatus }) => {
  const [evaluators, setEvaluators] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cohortApi.getEvaluators(cohortId);
      setEvaluators(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAutoPopulate = async () => {
    try {
      await cohortApi.autoPopulateEvaluators(cohortId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (evaluatorId) => {
    try {
      await cohortApi.removeEvaluator(cohortId, evaluatorId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading)
    return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      {cohortStatus === "draft" && (
        <div className="flex justify-end">
          <button
            onClick={handleAutoPopulate}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600
                       hover:bg-blue-50 rounded-lg transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Auto-populate Evaluators
          </button>
        </div>
      )}

      {evaluators.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No evaluators added yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Evaluator
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Dept
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Role
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Load
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Method
                </th>
                {cohortStatus === "draft" && (
                  <th className="text-center px-4 py-3 text-gray-600 font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {evaluators.map((ev) => (
                <tr key={ev.evaluator_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {ev.display_name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {ev.department_code}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                      {ev.evaluator_role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-medium ${
                        ev.at_capacity ? "text-red-600" : "text-gray-700"
                      }`}
                    >
                      {ev.current_assignments}/{ev.max_assignments}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {ev.assignment_method}
                  </td>
                  {cohortStatus === "draft" && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleRemove(ev.evaluator_id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// ASSIGNMENTS PANEL
// ============================================================
const AssignmentsPanel = ({ cohortId, cohortStatus, onRefresh }) => {
  const [data, setData] = useState({ assignments: [], fairnessReport: null });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cohortApi.getAssignments(cohortId);
      setData({ assignments: result.data || [], fairnessReport: null });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await cohortApi.generateAssignments(cohortId);
      setData({
        assignments: result.data?.assignments || [],
        fairnessReport: result.data?.fairnessReport || null,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading)
    return <div className="text-center py-8 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {data.assignments.length} total assignments
        </div>
        {(cohortStatus === "draft" || cohortStatus === "scheduled") && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                       text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm
                       disabled:opacity-50"
          >
            <Shuffle
              className={`h-4 w-4 ${generating ? "animate-spin" : ""}`}
            />
            {generating ? "Generating..." : "Generate Fair Assignments"}
          </button>
        )}
      </div>

      {/* Fairness Report */}
      {data.fairnessReport && <FairnessReport report={data.fairnessReport} />}

      {/* Assignment list */}
      {data.assignments.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <Shuffle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No assignments generated yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Add targets and evaluators, then generate assignments
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Evaluator
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Target
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Method
                </th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">
                  Deadline
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.assignments.map((a) => (
                <tr key={a.assignment_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {a.evaluator_name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {a.evaluator_dept}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {a.target_id?.slice(0, 8)}...
                    <span className="text-xs text-gray-400 ml-1">
                      ({a.target_type})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        a.assignment_method === "auto"
                          ? "bg-blue-50 text-blue-700"
                          : a.assignment_method === "rebalanced"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-gray-50 text-gray-700"
                      }`}
                    >
                      {a.assignment_method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={a.assignment_status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {a.deadline
                      ? new Date(a.deadline).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// COVERAGE PANEL
// ============================================================
const CoveragePanel = ({ cohortId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await cohortApi.getCoverageDashboard(cohortId);
        setData(result.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [cohortId]);

  if (loading)
    return (
      <div className="text-center py-8 text-gray-500">
        Loading coverage data...
      </div>
    );
  if (!data) return null;

  const { summary, fairnessReport } = data;

  return (
    <div className="space-y-6">
      {/* SRS §8.1 Fairness Header */}
      <div
        className={`p-4 rounded-xl border ${
          fairnessReport?.isFair
            ? "bg-green-50 border-green-200"
            : "bg-amber-50 border-amber-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Shield
            className={`h-5 w-5 ${
              fairnessReport?.isFair ? "text-green-600" : "text-amber-600"
            }`}
          />
          <h3
            className={`font-medium ${
              fairnessReport?.isFair ? "text-green-800" : "text-amber-800"
            }`}
          >
            SRS §8.1 Fairness Status:{" "}
            {fairnessReport?.isFair ? "COMPLIANT" : "NEEDS ATTENTION"}
          </h3>
        </div>
        <p
          className={`text-sm ${
            fairnessReport?.isFair ? "text-green-700" : "text-amber-700"
          }`}
        >
          Coverage gap: {fairnessReport?.coverageGap || 0} | Compliance rate:{" "}
          {fairnessReport?.complianceRate || 0}% | Workload variance:{" "}
          {fairnessReport?.workloadVariance || 0}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Compliance Rate"
          value={`${summary.complianceRate}%`}
          color={
            summary.complianceRate >= 80
              ? "green"
              : summary.complianceRate >= 50
                ? "amber"
                : "red"
          }
        />
        <MetricCard
          label="Coverage Gap"
          value={summary.fairnessGap}
          color={summary.fairnessGap <= 1 ? "green" : "amber"}
        />
        <MetricCard
          label="Completed"
          value={`${summary.completedAssignments}/${summary.totalAssignments}`}
          color="blue"
        />
        <MetricCard
          label="Active Alerts"
          value={summary.activeAlerts}
          color={summary.activeAlerts > 0 ? "amber" : "green"}
        />
      </div>

      {/* Coverage Matrix (simple table) */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Target Coverage Matrix
        </h3>
        <div className="space-y-2">
          {data.targets.map((t) => {
            const pct =
              t.target_evaluations > 0
                ? Math.min(
                    100,
                    (t.current_evaluations / t.target_evaluations) * 100,
                  )
                : 0;
            return (
              <div key={t.target_id} className="flex items-center gap-3">
                <div className="w-48 text-sm text-gray-700 truncate">
                  {t.target_label || t.target_id.slice(0, 12)}
                </div>
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100
                        ? "bg-green-500"
                        : pct >= 50
                          ? "bg-amber-500"
                          : "bg-red-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="w-16 text-right text-sm font-medium text-gray-700">
                  {t.current_evaluations}/{t.target_evaluations}
                </div>
                {t.is_compliant ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ALERTS PANEL
// ============================================================
const AlertsPanel = ({ cohortId }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await cohortApi.getAlerts(cohortId, true);
      setAlerts(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDetect = async () => {
    try {
      await cohortApi.detectGaps(cohortId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      await cohortApi.acknowledgeAlert(alertId);
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (alertId) => {
    try {
      await cohortApi.resolveAlert(alertId, "Manually resolved by admin");
      load();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading)
    return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const severityColors = {
    critical: "border-red-200 bg-red-50",
    warning: "border-amber-200 bg-amber-50",
    info: "border-blue-200 bg-blue-50",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleDetect}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600
                     hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Zap className="h-4 w-4" />
          Run Gap Detection
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
          <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">
            No alerts — all SRS §8.1 requirements met
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.alert_id}
              className={`rounded-xl border p-4 ${
                severityColors[alert.severity] || "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        alert.severity === "critical"
                          ? "bg-red-100 text-red-800"
                          : alert.severity === "warning"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        alert.status === "active"
                          ? "bg-red-50 text-red-600"
                          : alert.status === "acknowledged"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-green-50 text-green-600"
                      }`}
                    >
                      {alert.status}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 text-sm">
                    {alert.title}
                  </h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {alert.description}
                  </p>

                  {alert.suggested_actions && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 font-medium">
                        Suggested:
                      </p>
                      <ul className="text-xs text-gray-600 list-disc list-inside">
                        {(typeof alert.suggested_actions === "string"
                          ? JSON.parse(alert.suggested_actions)
                          : alert.suggested_actions
                        ).map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {alert.status === "active" && (
                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={() => handleAcknowledge(alert.alert_id)}
                      className="px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 rounded"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => handleResolve(alert.alert_id)}
                      className="px-2 py-1 text-xs text-green-700 hover:bg-green-100 rounded"
                    >
                      Resolve
                    </button>
                  </div>
                )}
                {alert.status === "acknowledged" && (
                  <button
                    onClick={() => handleResolve(alert.alert_id)}
                    className="px-2 py-1 text-xs text-green-700 hover:bg-green-100 rounded ml-4"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// SHARED COMPONENTS
// ============================================================

const FairnessReport = ({ report }) => {
  if (!report) return null;

  return (
    <div
      className={`p-4 rounded-xl border ${
        report.isFair
          ? "bg-green-50 border-green-200"
          : "bg-amber-50 border-amber-200"
      }`}
    >
      <h3
        className={`text-sm font-medium mb-2 flex items-center gap-1.5 ${
          report.isFair ? "text-green-800" : "text-amber-800"
        }`}
      >
        <Shield className="h-4 w-4" />
        Fairness Report
      </h3>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Coverage Gap:</span>{" "}
          <span className="font-medium">{report.coverageGap}</span>
        </div>
        <div>
          <span className="text-gray-500">Compliance:</span>{" "}
          <span className="font-medium">{report.complianceRate}%</span>
        </div>
        <div>
          <span className="text-gray-500">Load Variance:</span>{" "}
          <span className="font-medium">{report.workloadVariance}</span>
        </div>
        <div>
          <span className="text-gray-500">Avg Load:</span>{" "}
          <span className="font-medium">{report.avgWorkload}</span>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, color }) => {
  const colorClasses = {
    green: "text-green-700 bg-green-50 border-green-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    red: "text-red-700 bg-red-50 border-red-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
  };

  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        colorClasses[color] || colorClasses.blue
      }`}
    >
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5">{label}</div>
    </div>
  );
};

const StatusBadge = ({ status }) => {
  const colors = {
    pending: "bg-gray-100 text-gray-600",
    session_created: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    skipped: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
        colors[status] || "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
};

export default CohortManagementTab;
