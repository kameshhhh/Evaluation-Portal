// ================================================================
// MONTHLY PLAN CREATOR — SRS 4.1.1 Monthly Planning
// ================================================================
// Full CRUD for monthly plans with status transitions:
//   draft → submitted → approved → completed
// Lists existing plans and allows creating new ones.
// DOES NOT modify any existing components.
// ================================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  Plus,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle2,
  Clock,
  FileText,
  Target,
  Loader2,
} from "lucide-react";
import {
  getMonthlyPlans,
  createMonthlyPlan,
  updateMonthlyPlan,
  transitionPlanStatus,
} from "../../../services/projectEnhancementApi";

const STATUS_CONFIG = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700", icon: FileText },
  submitted: {
    label: "Submitted",
    color: "bg-yellow-100 text-yellow-700",
    icon: Send,
  },
  approved: {
    label: "Approved",
    color: "bg-blue-100 text-blue-700",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-700",
    icon: CheckCircle2,
  },
};

const MonthlyPlanCreator = ({ projectId, personId, isFaculty = false }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [saving, setSaving] = useState(false);

  // New plan form
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [form, setForm] = useState({
    plan_month: currentMonth,
    goals: "",
    planned_tasks: "",
    expected_deliverables: "",
  });

  const fetchPlans = useCallback(async () => {
    try {
      const res = await getMonthlyPlans(projectId, { person_id: personId });
      setPlans(res.data || []);
    } catch (err) {
      console.error("Failed to load plans:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, personId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createMonthlyPlan(projectId, {
        ...form,
        person_id: personId,
      });
      setShowForm(false);
      setForm({
        plan_month: currentMonth,
        goals: "",
        planned_tasks: "",
        expected_deliverables: "",
      });
      fetchPlans();
    } catch (err) {
      console.error("Failed to create plan:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (planId, newStatus) => {
    try {
      await transitionPlanStatus(projectId, planId, newStatus);
      fetchPlans();
    } catch (err) {
      console.error("Transition failed:", err);
    }
  };

  const handleUpdateActual = async (planId, field, value) => {
    try {
      await updateMonthlyPlan(projectId, planId, { [field]: value });
      fetchPlans();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const nextAction = (status) => {
    if (status === "draft") return { label: "Submit", next: "submitted" };
    if (status === "submitted" && isFaculty)
      return { label: "Approve", next: "approved" };
    if (status === "approved") return { label: "Complete", next: "completed" };
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading plans...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">Monthly Plans</h3>
          <span className="text-xs text-gray-500">({plans.length})</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          New Plan
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Month
            </label>
            <input
              type="month"
              value={form.plan_month}
              onChange={(e) => setForm({ ...form, plan_month: e.target.value })}
              className="border rounded-lg px-3 py-1.5 text-sm w-48 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Goals
            </label>
            <textarea
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              rows={2}
              placeholder="What do you aim to achieve this month?"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Planned Tasks
            </label>
            <textarea
              value={form.planned_tasks}
              onChange={(e) =>
                setForm({ ...form, planned_tasks: e.target.value })
              }
              rows={2}
              placeholder="List specific tasks..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Expected Deliverables
            </label>
            <textarea
              value={form.expected_deliverables}
              onChange={(e) =>
                setForm({ ...form, expected_deliverables: e.target.value })
              }
              rows={2}
              placeholder="What will be delivered?"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !form.goals.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Plan"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-white text-gray-700 text-sm rounded-lg border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Plans List */}
      {plans.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">
          No monthly plans yet. Create one to start tracking!
        </p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => {
            const cfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.draft;
            const StatusIcon = cfg.icon;
            const action = nextAction(plan.status);
            const isExpanded = expandedId === plan.plan_id;

            return (
              <div
                key={plan.plan_id}
                className="bg-white border rounded-lg overflow-hidden"
              >
                {/* Summary Row */}
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : plan.plan_id)
                  }
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Clock size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {plan.plan_month}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.color}`}
                    >
                      <StatusIcon size={10} />
                      {cfg.label}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t">
                    <div className="pt-3">
                      <h5 className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                        <Target size={12} /> Goals
                      </h5>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {plan.goals || "—"}
                      </p>
                    </div>
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-1">
                        Planned Tasks
                      </h5>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {plan.planned_tasks || "—"}
                      </p>
                    </div>
                    <div>
                      <h5 className="text-xs font-medium text-gray-500 mb-1">
                        Expected Deliverables
                      </h5>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {plan.expected_deliverables || "—"}
                      </p>
                    </div>

                    {/* Actual outcome — editable when approved/completed */}
                    {(plan.status === "approved" ||
                      plan.status === "completed") && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-500 mb-1">
                          Actual Outcome
                        </h5>
                        <textarea
                          defaultValue={plan.actual_outcome || ""}
                          onBlur={(e) =>
                            handleUpdateActual(
                              plan.plan_id,
                              "actual_outcome",
                              e.target.value,
                            )
                          }
                          rows={2}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                          placeholder="Describe what was actually achieved..."
                        />
                      </div>
                    )}

                    {/* Action Button */}
                    {action && (
                      <button
                        onClick={() =>
                          handleTransition(plan.plan_id, action.next)
                        }
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                      >
                        {action.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MonthlyPlanCreator;
