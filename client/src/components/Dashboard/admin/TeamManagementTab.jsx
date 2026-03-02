// ============================================================
// ADMIN TEAM MANAGEMENT TAB — Approve/Reject team formations
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Check,
  X,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  Crown,
  MessageSquare,
} from "lucide-react";
import { useDataChange } from "../../../hooks/useSocketEvent";
import {
  listTeamFormations,
  approveTeamFormation,
  rejectTeamFormation,
} from "../../../services/sessionPlannerApi";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "members_accepted", label: "Ready for Review" },
  { id: "admin_approved", label: "Approved" },
  { id: "admin_rejected", label: "Rejected" },
];

const STATUS_CONFIG = {
  pending: {
    color: "#D97706",
    bg: "rgba(217,119,6,0.08)",
    label: "Pending Members",
  },
  members_accepted: {
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    label: "Ready for Review",
  },
  admin_approved: {
    color: "#059669",
    bg: "rgba(5,150,105,0.08)",
    label: "Approved",
  },
  admin_rejected: {
    color: "#DC2626",
    bg: "rgba(220,38,38,0.08)",
    label: "Rejected",
  },
  cancelled: {
    color: "#6B7280",
    bg: "rgba(107,114,128,0.08)",
    label: "Cancelled",
  },
  expired: { color: "#6B7280", bg: "rgba(107,114,128,0.08)", label: "Expired" },
};

const TRACK_LABELS = {
  core: "Core",
  it_core: "IT-Core",
  premium: "Premium",
};

const TeamManagementTab = () => {
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectNote, setRejectNote] = useState({});
  const [showRejectInput, setShowRejectInput] = useState(null);
  const [error, setError] = useState(null);

  useDataChange("team_formation", () => loadFormations());

  const loadFormations = useCallback(async () => {
    try {
      setError(null);
      const res = await listTeamFormations(
        statusFilter === "all" ? {} : { status: statusFilter },
      );
      setFormations(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load formations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    loadFormations();
  }, [loadFormations]);

  const handleApprove = async (formationId) => {
    try {
      setActionLoading(formationId);
      await approveTeamFormation(formationId);
      await loadFormations();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (formationId) => {
    try {
      setActionLoading(formationId);
      await rejectTeamFormation(formationId, rejectNote[formationId] || "");
      setShowRejectInput(null);
      await loadFormations();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  return (
    <div>
      {/* Header + filter */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users size={20} className="text-violet-600" />
          Team Formations
        </h3>
        <button
          onClick={loadFormations}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.id
                ? "bg-violet-100 text-violet-700"
                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.15)",
            color: "#991B1B",
          }}
        >
          {error}
        </div>
      )}

      {/* Formations list */}
      {formations.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No team formations found
          {statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}
        </div>
      ) : (
        <div className="space-y-3">
          {formations.map((f) => {
            const sc = STATUS_CONFIG[f.status] || STATUS_CONFIG.pending;
            const canAction = f.status === "members_accepted";
            return (
              <div
                key={f.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      {f.project_title || "Unnamed Project"}
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: sc.bg,
                          color: sc.color,
                        }}
                      >
                        {sc.label}
                      </span>
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Track: {TRACK_LABELS[f.track] || f.track} • Leader:{" "}
                      <span className="font-medium text-gray-600">
                        {f.leader_name}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Members */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {(f.members || []).map((m) => (
                    <div
                      key={m.personId || m.person_id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-xs"
                    >
                      {m.role === "Team Leader" ? (
                        <Crown size={12} className="text-amber-500" />
                      ) : m.status === "accepted" ? (
                        <CheckCircle2 size={12} className="text-green-500" />
                      ) : m.status === "rejected" ? (
                        <XCircle size={12} className="text-red-500" />
                      ) : (
                        <Clock size={12} className="text-amber-500" />
                      )}
                      <span className="text-gray-700">
                        {m.displayName || m.display_name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {canAction && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(f.id)}
                      disabled={actionLoading === f.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                      style={{ background: "#059669" }}
                    >
                      {actionLoading === f.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      Approve
                    </button>
                    {showRejectInput === f.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={rejectNote[f.id] || ""}
                          onChange={(e) =>
                            setRejectNote((prev) => ({
                              ...prev,
                              [f.id]: e.target.value,
                            }))
                          }
                          placeholder="Rejection reason (optional)..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-300"
                        />
                        <button
                          onClick={() => handleReject(f.id)}
                          disabled={actionLoading === f.id}
                          className="px-3 py-1.5 rounded-lg text-white text-sm font-medium bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => setShowRejectInput(null)}
                          className="px-2 py-1.5 text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRejectInput(f.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-600 text-sm font-medium hover:bg-red-50 border border-red-200"
                      >
                        <X size={14} />
                        Reject
                      </button>
                    )}
                  </div>
                )}

                {/* Rejection note */}
                {f.status === "admin_rejected" && f.review_note && (
                  <div
                    className="mt-2 p-2 rounded-lg flex items-start gap-2 text-xs"
                    style={{
                      background: "rgba(220,38,38,0.06)",
                      color: "#991B1B",
                    }}
                  >
                    <MessageSquare size={12} className="shrink-0 mt-0.5" />
                    {f.review_note}
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

export default TeamManagementTab;
