// ============================================================
// TEAM FORMATION PAGE — Leader creates team, invites members
// ============================================================
// Core track: teams of 3-4
// IT/IT-Core: auto-solo (1)
// Premium: teams of 1-2
// 3-step flow: Leader picks → Members accept → Admin approves
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  Check,
  X,
  Loader2,
  ArrowLeft,
  Crown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  RefreshCw,
  Send,
} from "lucide-react";
import { useDataChange } from "../../../hooks/useSocketEvent";
import {
  getMyTrack,
  getMyTeam,
  getAvailableStudents,
  createTeamFormation,
  getPendingInvitations,
  respondToInvitation,
  getTrackConfig,
} from "../../../services/sessionPlannerApi";

const TRACK_LABELS = {
  core: "Core Project",
  it_core: "IT / IT-Core",
  premium: "Premium Project",
};

// Year label from admission_year (22→Final, 23→3rd, 24→2nd, 25→1st)
const getYearLabel = (admissionYear) => {
  if (!admissionYear) return null;
  const yr = new Date().getFullYear() - admissionYear;
  if (yr >= 4) return "Final year";
  if (yr === 3) return "3rd year";
  if (yr === 2) return "2nd year";
  if (yr === 1) return "1st year";
  return null;
};

const YEAR_COLORS = {
  "Final year": { color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
  "3rd year":   { color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
  "2nd year":   { color: "#2563EB", bg: "rgba(37,99,235,0.08)" },
  "1st year":   { color: "#059669", bg: "rgba(5,150,105,0.08)" },
};

const STATUS_BADGES = {
  pending: { color: "#D97706", bg: "rgba(217,119,6,0.08)", label: "Pending" },
  members_accepted: {
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    label: "Awaiting Admin",
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
  expired: {
    color: "#6B7280",
    bg: "rgba(107,114,128,0.08)",
    label: "Expired",
  },
};

const TeamFormationPage = () => {
  const navigate = useNavigate();

  const [trackInfo, setTrackInfo] = useState(null);
  const [trackConfig, setTrackConfig] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [respondingTo, setRespondingTo] = useState(null);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Refresh on socket events
  useDataChange("team_formation", () => refresh());
  useDataChange("team_invitation", () => refresh());

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [trackRes, configRes, teamRes, invitesRes] = await Promise.all([
        getMyTrack(),
        getTrackConfig(),
        getMyTeam().catch(() => ({ data: null })),
        getPendingInvitations().catch(() => ({ data: [] })),
      ]);

      setTrackInfo(trackRes.data || null);
      setTrackConfig(configRes.data || null);
      setMyTeam(teamRes.data || null);
      setPendingInvites(invitesRes.data || []);

      // Load available students if no team yet and track is set
      if (
        trackRes.data?.track &&
        !teamRes.data
      ) {
        try {
          const avRes = await getAvailableStudents();
          setAvailableStudents(avRes.data || []);
        } catch {
          setAvailableStudents([]);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreateTeam = async () => {
    if (!projectName.trim()) return setError("Project name is required");
    const minSize = trackConfig?.[trackInfo.track]?.minSize || 1;
    const maxSize = trackConfig?.[trackInfo.track]?.maxSize || 4;
    const totalSize = selectedMembers.length + 1; // +1 for leader

    if (totalSize < minSize || totalSize > maxSize) {
      return setError(
        `Team size must be ${minSize}-${maxSize} (including you). Current: ${totalSize}`
      );
    }

    try {
      setSubmitting(true);
      setError(null);
      await createTeamFormation(
        selectedMembers,
        projectName.trim(),
      );
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (invitationId, response) => {
    try {
      setRespondingTo(invitationId);
      await respondToInvitation(invitationId, response);
      await refresh();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to respond");
    } finally {
      setRespondingTo(null);
    }
  };

  const toggleMember = (personId) => {
    setSelectedMembers((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId]
    );
  };

  const filteredStudents = availableStudents.filter((s) =>
    s.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const minSize = trackConfig?.[trackInfo?.track]?.minSize || 1;
  const maxSize = trackConfig?.[trackInfo?.track]?.maxSize || 4;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  // No track selected — redirect shouldn't normally happen, but handle it
  if (!trackInfo?.track) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          No Track Selected
        </h2>
        <p className="text-gray-500 mb-4">
          Please select your project track first from the dashboard.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-lg hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Team Formation</h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(124,58,237,0.08)",
                color: "#7C3AED",
              }}
            >
              {TRACK_LABELS[trackInfo.track]}
            </span>
            <span className="text-xs text-gray-400">
              Team size: {minSize}–{maxSize}
            </span>
          </div>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm"
          style={{
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.15)",
            color: "#991B1B",
          }}
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── PENDING INVITATIONS RECEIVED ── */}
      {pendingInvites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Send size={16} className="text-violet-500" />
            Invitations Received
          </h3>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div
                key={inv.invitation_id}
                className="p-4 rounded-xl bg-white border border-gray-200 flex items-center gap-3"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                  style={{ background: "#7C3AED" }}
                >
                  {inv.leader_name?.[0] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {inv.project_title || inv.project_name || "Team Invitation"}
                  </p>
                  <p className="text-xs text-gray-500">
                    From <span className="font-medium">{inv.leader_name}</span>{" "}
                    • {TRACK_LABELS[inv.track] || inv.track}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() =>
                      handleRespond(inv.invitation_id, "accept")
                    }
                    disabled={respondingTo === inv.invitation_id}
                    className="p-2 rounded-lg text-white transition-colors"
                    style={{ background: "#059669" }}
                    title="Accept"
                  >
                    {respondingTo === inv.invitation_id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                  </button>
                  <button
                    onClick={() =>
                      handleRespond(inv.invitation_id, "reject")
                    }
                    disabled={respondingTo === inv.invitation_id}
                    className="p-2 rounded-lg text-white transition-colors"
                    style={{ background: "#DC2626" }}
                    title="Reject"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EXISTING TEAM STATUS ── */}
      {myTeam && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Users size={16} className="text-violet-500" />
            Your Team
          </h3>
          <div
            className="p-5 rounded-xl bg-white"
            style={{ border: "1px solid rgba(124,58,237,0.15)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-gray-900">
                {myTeam.project_title || myTeam.project_name || "Your Team"}
              </h4>
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background:
                    STATUS_BADGES[myTeam.status]?.bg || "rgba(0,0,0,0.05)",
                  color: STATUS_BADGES[myTeam.status]?.color || "#6B7280",
                }}
              >
                {STATUS_BADGES[myTeam.status]?.label || myTeam.status}
              </span>
            </div>

            {/* Members list */}
            <div className="space-y-2">
              {(myTeam.members || []).map((m) => {
                const isLeader = m.role === "Team Leader" || m.invitation_status === "leader";
                return (
                <div
                  key={m.person_id || m.invitee_id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-50"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: isLeader ? "#7C3AED" : "#6B7280" }}
                  >
                    {m.display_name?.[0] || "?"}
                  </div>
                  <span className="text-sm text-gray-800 flex-1">
                    {m.display_name}
                    {isLeader && (
                      <Crown
                        size={14}
                        className="inline ml-1 text-amber-500"
                      />
                    )}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">
                    {m.invitation_status === "accepted" ? (
                      <CheckCircle2
                        size={14}
                        className="inline text-green-500"
                      />
                    ) : m.invitation_status === "rejected" ? (
                      <XCircle size={14} className="inline text-red-500" />
                    ) : isLeader ? (
                      <Shield size={14} className="inline text-violet-500" />
                    ) : (
                      <Clock size={14} className="inline text-amber-500" />
                    )}
                    <span className="ml-1">{m.invitation_status || "leader"}</span>
                  </span>
                </div>
                );
              })}
            </div>

            {myTeam.status === "admin_rejected" && myTeam.review_note && (
              <div
                className="mt-3 p-2 rounded-lg text-sm"
                style={{
                  background: "rgba(220,38,38,0.06)",
                  color: "#991B1B",
                }}
              >
                <strong>Rejection reason:</strong> {myTeam.review_note}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE NEW TEAM (only if no existing team) ── */}
      {!myTeam && trackInfo.track !== "it_core" && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <UserPlus size={16} className="text-violet-500" />
            Create a Team (You are the Leader)
          </h3>

          {/* Project Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Title
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter your project name..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Member Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Team Members ({selectedMembers.length}/{maxSize - 1} max)
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search students..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 mb-3"
            />

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedMembers.map((id) => {
                  const s = availableStudents.find((s) => s.person_id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ background: "#7C3AED" }}
                    >
                      {s?.display_name || id}
                      <button onClick={() => toggleMember(id)}>
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available list */}
            <div className="max-h-60 overflow-y-auto space-y-1 rounded-xl border border-gray-100 p-2">
              {filteredStudents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No available students for your track
                </p>
              ) : (
                filteredStudents.map((s) => {
                  const isChosen = selectedMembers.includes(s.person_id);
                  const canAddMore = selectedMembers.length < maxSize - 1;
                  return (
                    <button
                      key={s.person_id}
                      onClick={() =>
                        (isChosen || canAddMore) && toggleMember(s.person_id)
                      }
                      disabled={!isChosen && !canAddMore}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                        isChosen
                          ? "bg-violet-50 border border-violet-200"
                          : canAddMore
                            ? "hover:bg-gray-50 border border-transparent"
                            : "opacity-40 cursor-not-allowed border border-transparent"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{
                          background: isChosen ? "#7C3AED" : "#9CA3AF",
                        }}
                      >
                        {s.display_name?.[0] || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 truncate block">
                          {s.display_name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {getYearLabel(s.admission_year) && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: YEAR_COLORS[getYearLabel(s.admission_year)]?.bg || "rgba(107,114,128,0.08)",
                                color: YEAR_COLORS[getYearLabel(s.admission_year)]?.color || "#6B7280",
                              }}
                            >
                              {getYearLabel(s.admission_year)}
                            </span>
                          )}
                          {s.department_code && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(107,114,128,0.08)", color: "#6B7280" }}
                            >
                              {s.department_code.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      {isChosen && (
                        <CheckCircle2
                          size={18}
                          className="text-violet-500 shrink-0"
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreateTeam}
            disabled={submitting || !projectName.trim()}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: "#7C3AED" }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creating Team...
              </>
            ) : (
              <>
                <Users size={18} />
                Create Team & Send Invitations
              </>
            )}
          </button>
        </div>
      )}

      {/* IT-Core solo message */}
      {!myTeam && trackInfo.track === "it_core" && (
        <div className="text-center py-12">
          <CheckCircle2
            className="mx-auto text-green-500 mb-4"
            size={48}
          />
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            You're an Individual Contributor
          </h3>
          <p className="text-gray-500 text-sm">
            IT/IT-Core track students work solo. Your individual team was
            auto-created when you selected your track.
          </p>
        </div>
      )}
    </div>
  );
};

export default TeamFormationPage;
