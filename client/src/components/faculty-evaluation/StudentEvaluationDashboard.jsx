// ============================================================
// STUDENT EVALUATION DASHBOARD — Session listing for students
// ============================================================
// SRS §4.4 — Entry point for students to see all faculty
// evaluation sessions: active, upcoming, completed.
// Links to FacultyEvaluationPage for each active session.
// Shows submission status, deadline, and session details.
// ============================================================

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Calendar,
  Users,
  Lock,
  ArrowRight,
} from "lucide-react";
import { getActiveFacultySessions } from "../../services/facultyEvaluationApi";
import { ROUTES } from "../../utils/constants";

const StudentEvaluationDashboard = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSessions = async () => {
      try {
        const result = await getActiveFacultySessions();
        if (!cancelled && result.success) {
          setSessions(result.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || "Failed to load sessions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  const getSessionStatus = (session) => {
    if (session.has_submitted) return "submitted";
    const now = new Date();
    const opens = new Date(session.opens_at);
    const closes = new Date(session.closes_at);
    if (now < opens) return "upcoming";
    if (now > closes) return "closed";
    return "active";
  };

  const getTimeRemaining = (closesAt) => {
    const now = new Date();
    const closes = new Date(closesAt);
    const diff = closes - now;
    if (diff <= 0) return "Closed";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${mins}m remaining`;
  };

  const statusConfig = {
    active: {
      label: "Active",
      icon: Clock,
      badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
      cardClass: "border-blue-200 hover:border-blue-400 hover:shadow-lg",
    },
    upcoming: {
      label: "Upcoming",
      icon: Calendar,
      badgeClass: "bg-gray-100 text-gray-600 border-gray-200",
      cardClass: "border-gray-200 opacity-70",
    },
    submitted: {
      label: "Submitted",
      icon: CheckCircle,
      badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
      cardClass: "border-emerald-200",
    },
    closed: {
      label: "Closed",
      icon: Lock,
      badgeClass: "bg-gray-100 text-gray-500 border-gray-200",
      cardClass: "border-gray-200 opacity-60",
    },
  };

  const modeLabels = {
    binary: "Binary (0/1)",
    small_pool: "Small Pool",
    full_pool: "Full Pool",
  };

  // Group sessions by status
  const grouped = sessions.reduce(
    (acc, s) => {
      const status = getSessionStatus(s);
      acc[status] = acc[status] || [];
      acc[status].push({ ...s, _status: status });
      return acc;
    },
    { active: [], upcoming: [], submitted: [], closed: [] },
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">
            Loading evaluation sessions...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-100 rounded-xl">
          <ClipboardList className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Faculty Evaluations
          </h1>
          <p className="text-sm text-gray-500">
            Evaluate faculty members who have supervised your work
          </p>
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Users className="h-16 w-16 text-gray-300 mx-auto" />
          <p className="text-lg text-gray-500">No evaluation sessions yet</p>
          <p className="text-sm text-gray-400">
            Sessions will appear here when created by your department
          </p>
        </div>
      )}

      {/* Active sessions — highlighted */}
      {grouped.active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3">
            Active — Awaiting Your Evaluation
          </h2>
          <div className="space-y-3">
            {grouped.active.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                config={statusConfig.active}
                modeLabel={modeLabels[s.evaluation_mode]}
                timeRemaining={getTimeRemaining(s.closes_at)}
                onClick={() =>
                  navigate(
                    (ROUTES?.FACULTY_EVALUATION || "/faculty-evaluation") +
                      `/${s.id}`,
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Submitted */}
      {grouped.submitted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider mb-3">
            Completed
          </h2>
          <div className="space-y-3">
            {grouped.submitted.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                config={statusConfig.submitted}
                modeLabel={modeLabels[s.evaluation_mode]}
                timeRemaining={null}
                onClick={null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {grouped.upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Upcoming
          </h2>
          <div className="space-y-3">
            {grouped.upcoming.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                config={statusConfig.upcoming}
                modeLabel={modeLabels[s.evaluation_mode]}
                timeRemaining={`Opens ${new Date(s.opens_at).toLocaleDateString()}`}
                onClick={null}
              />
            ))}
          </div>
        </section>
      )}

      {/* Closed */}
      {grouped.closed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Closed
          </h2>
          <div className="space-y-3">
            {grouped.closed.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                config={statusConfig.closed}
                modeLabel={modeLabels[s.evaluation_mode]}
                timeRemaining="Closed"
                onClick={null}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ── Session Card ───────────────────────────────────────────

const SessionCard = React.memo(function SessionCard({
  session,
  config,
  modeLabel,
  timeRemaining,
  onClick,
}) {
  const StatusIcon = config.icon;
  const isClickable = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl border-2 p-4 transition-all duration-200
        ${config.cardClass}
        ${isClickable ? "cursor-pointer" : "cursor-default"}
      `}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <StatusIcon
            className={`h-5 w-5 flex-shrink-0 ${
              config.badgeClass.includes("blue")
                ? "text-blue-600"
                : config.badgeClass.includes("emerald")
                  ? "text-emerald-600"
                  : "text-gray-400"
            }`}
          />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate flex items-center gap-2">
              {session.title}
              {session.track && (() => {
                const TB = {
                  core: "bg-green-100 text-green-700",
                  it_core: "bg-indigo-100 text-indigo-700",
                  premium: "bg-amber-100 text-amber-700",
                };
                const TL = { core: "Core", it_core: "IT & Core", premium: "Premium" };
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TB[session.track] || TB.core}`}>
                    {TL[session.track] || session.track}
                  </span>
                );
              })()}
            </h3>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              <span>
                {session.academic_year} {session.semester}
              </span>
              {modeLabel && (
                <>
                  <span className="text-gray-300">•</span>
                  <span>{modeLabel}</span>
                </>
              )}
              {session.description && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="truncate max-w-[200px]">
                    {session.description}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {timeRemaining && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full border ${config.badgeClass}`}
            >
              {timeRemaining}
            </span>
          )}
          {isClickable && <ArrowRight className="h-5 w-5 text-gray-400" />}
        </div>
      </div>
    </div>
  );
});

export default StudentEvaluationDashboard;
