// ============================================================
// SESSION GRID — Mobile-First Violet Glassmorphism
// ============================================================
// Responsive: Stacked cards on mobile, 2-column on desktop.
// Touch-optimized with 44px minimum targets.
// SRS §4.2: Multi-Judge Status Indicator integration
// ============================================================

import React, { useState, useMemo } from "react";
import { ChevronRight, Calendar, Users, Search, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MultiJudgeBadge from "../../scarcity/MultiJudgeBadge";
import useMultiJudgeStatus from "../../../hooks/useMultiJudgeStatus";

// SRS §4.1.3, §4.2: Session completion progress bar
import SessionProgressBar from "../../scarcity/SessionProgressBar";

/**
 * Status configuration — violet for pending, grey for completed
 */
const STATUS_CONFIG = {
  active: {
    dot: "#7C3AED",
    label: "Active",
    textColor: "#7C3AED",
    borderColor: "#7C3AED",
  },
  pending: {
    dot: "#7C3AED",
    label: "Pending",
    textColor: "#7C3AED",
    borderColor: "#7C3AED",
  },
  completed: {
    dot: "#9CA3AF",
    label: "Completed",
    textColor: "#9CA3AF",
    borderColor: "#E0E7FF",
  },
  drafting: {
    dot: "#9CA3AF",
    label: "Draft",
    textColor: "#9CA3AF",
    borderColor: "#E5E7EB",
  },
  closed: {
    dot: "#9CA3AF",
    label: "Closed",
    textColor: "#9CA3AF",
    borderColor: "#E5E7EB",
  },
};

/**
 * Session Card — Mobile-First Touch-Optimized
 * SRS §4.2: Includes Multi-Judge Badge for multi-evaluator sessions
 */
const SessionCard = ({ session, projects }) => {
  const navigate = useNavigate();

  // SRS §4.2: Fetch multi-judge status for this session
  const {
    totalEvaluators,
    isSubmitted,
    allSubmitted,
    isLoading: statusLoading,
  } = useMultiJudgeStatus(session.id, {
    autoFetch: true,
    refreshInterval: 0, // Don't auto-refresh on dashboard to save bandwidth
  });

  const statusKey = session.status?.toLowerCase() || "pending";
  const status = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;

  const totalPool = projects.reduce(
    (sum, p) => sum + (p.member_count || 2) * 5,
    0,
  );
  const teamCount = projects.length;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const endDate = formatDate(session.end_date || session.window_end);
  const isClickable = statusKey === "active" || statusKey === "pending";

  const handleClick = () => {
    console.log("SessionCard clicked:", {
      sessionId: session.id,
      status: session.status,
      statusKey,
      isClickable,
    });
    if (isClickable && session.id) {
      navigate(`/scarcity/evaluate/${session.id}`);
    } else {
      console.warn("Click blocked:", { isClickable, hasId: !!session.id });
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        relative rounded-2xl p-4 sm:p-5
        bg-white/70 backdrop-blur-sm
        overflow-hidden
        min-h-[88px]
        active:scale-[0.98] sm:hover:translate-y-[-2px]
        transition-all duration-300
        ${isClickable ? "cursor-pointer" : ""}
      `}
      style={{
        border: "0.5px solid #E0D9FF",
        boxShadow: "0 8px 20px rgba(139, 92, 246, 0.04)",
        borderLeft: `2px solid ${status.borderColor}`,
      }}
    >
      {/* Corner accent */}
      <div
        className="absolute top-3 right-3 w-[6px] h-[6px] rounded-full"
        style={{ backgroundColor: "rgba(124, 58, 237, 0.2)" }}
      />

      {/* Content */}
      <div className="relative">
        {/* Top Row — Title + Date */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3
              className="font-medium text-[15px] sm:text-base leading-tight"
              style={{ color: "#1E1E1E" }}
            >
              {session.cohort_name ||
                session.title ||
                session.name ||
                "Evaluation Session"}
            </h3>
          </div>

          {/* Date chip — top right on mobile */}
          {endDate && (
            <span
              className="
                inline-flex items-center gap-1 px-2 py-1
                rounded text-[11px] sm:text-xs font-medium
                flex-shrink-0
              "
              style={{
                backgroundColor: "#EDE9FE",
                color: "#5B21B6",
              }}
            >
              <Calendar className="h-3 w-3" />
              {endDate}
            </span>
          )}
        </div>

        {/* Bottom Row — Status + Team badge + Arrow */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: status.dot }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: status.textColor }}
            >
              {status.label}
            </span>
          </div>

          {/* Team count badge */}
          <span
            className="
              inline-flex items-center gap-1 px-2 py-1 sm:px-2.5
              text-xs font-medium rounded-full
            "
            style={{
              backgroundColor: "white",
              color: "#7C3AED",
              border: "0.5px solid #E0D9FF",
            }}
          >
            <Users className="h-3 w-3" />
            {teamCount} {teamCount === 1 ? "Team" : "Teams"}
          </span>

          {/* SRS §4.2: Multi-Judge Badge - only show if session has multiple evaluators */}
          {!statusLoading && totalEvaluators > 1 && (
            <MultiJudgeBadge
              totalEvaluators={totalEvaluators}
              myStatus={isSubmitted ? "submitted" : "pending"}
              allSubmitted={allSubmitted}
              size="sm"
            />
          )}

          {/* Spacer + Pool + Arrow */}
          <div className="flex items-center gap-2 ml-auto">
            {totalPool > 0 && (
              <span
                className="text-xs font-medium"
                style={{ color: "#9CA3AF" }}
              >
                {totalPool} pts
              </span>
            )}

            {isClickable && (
              <ChevronRight
                className="h-5 w-5 flex-shrink-0"
                style={{ color: "#7C3AED" }}
              />
            )}
          </div>
        </div>

        {/* SRS §4.2: Multi-judge session completion progress */}
        {!statusLoading && totalEvaluators > 1 && (
          <div className="mt-3 pt-3 border-t border-gray-100/60">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-gray-400 font-medium">
                Session Completion
              </span>
              <span
                className={`text-[11px] font-medium ${
                  allSubmitted ? "text-green-600" : "text-gray-500"
                }`}
              >
                {isSubmitted ? totalEvaluators : 0}/{totalEvaluators}
              </span>
            </div>
            <SessionProgressBar
              allocated={isSubmitted ? totalEvaluators : 0}
              maxPool={totalEvaluators}
              size="sm"
              variant="compact"
              showLabel={false}
              animate={true}
            />
            {allSubmitted && (
              <p className="text-[10px] text-green-600 mt-1 font-medium">
                ✓ All evaluators submitted
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Search Bar — Mobile-First with rounded-full
 */
const SearchBar = ({ value, onChange }) => {
  return (
    <div className="relative">
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4"
        style={{ color: "#6B7280" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search sessions..."
        className="
          w-full pl-11 pr-4 py-3
          bg-white/70 backdrop-blur-sm rounded-full
          text-[15px] sm:text-sm
          placeholder:text-gray-400
          transition-all duration-200
          focus:outline-none
        "
        style={{
          color: "#1E1E1E",
          border: "0.5px solid #E0D9FF",
          boxShadow: "0 2px 12px rgba(139, 92, 246, 0.03)",
        }}
        onFocus={(e) => {
          e.target.style.border = "2px solid #7C3AED";
          e.target.style.boxShadow = "0 4px 20px rgba(124, 58, 237, 0.1)";
        }}
        onBlur={(e) => {
          e.target.style.border = "0.5px solid #E0D9FF";
          e.target.style.boxShadow = "0 2px 12px rgba(139, 92, 246, 0.03)";
        }}
      />
    </div>
  );
};

/**
 * Filter Chip — Touch-optimized (44px min height)
 */
const FilterChip = ({ label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        px-4 py-2.5 sm:py-2 rounded-full 
        text-[13px] sm:text-sm font-medium
        min-h-[44px] sm:min-h-0
        transition-all duration-200
        active:scale-95
      "
      style={{
        backgroundColor: active ? "#7C3AED" : "#F9F7FF",
        color: active ? "white" : "#6B7280",
        border: active ? "1px solid #7C3AED" : "1px solid #E0D9FF",
      }}
    >
      {label}
    </button>
  );
};

/**
 * Session Grid Container — Mobile-First Layout
 */
const SessionGrid = ({ sessions, projectsBySession, loading = false }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  // Filter sessions
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    let filtered = sessions;

    if (activeFilter !== "all") {
      filtered = filtered.filter(
        (s) => (s.status?.toLowerCase() || "pending") === activeFilter,
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) => {
        const name = (s.cohort_name || s.title || s.name || "").toLowerCase();
        return name.includes(query);
      });
    }

    return filtered;
  }, [sessions, searchQuery, activeFilter]);

  // Sort: active/pending first
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const statusOrder = {
        active: 0,
        pending: 1,
        drafting: 2,
        completed: 3,
        closed: 4,
      };
      const aStatus = a.status?.toLowerCase() || "pending";
      const bStatus = b.status?.toLowerCase() || "pending";
      return (statusOrder[aStatus] ?? 2) - (statusOrder[bStatus] ?? 2);
    });
  }, [filteredSessions]);

  // Loading State — Mobile optimized
  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div
          className="h-12 rounded-full animate-pulse"
          style={{ backgroundColor: "#F5F3FF" }}
        />

        <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-4"
              style={{
                backgroundColor: "rgba(255,255,255,0.7)",
                border: "0.5px solid #E0D9FF",
              }}
            >
              <div className="space-y-3">
                <div
                  className="h-4 w-3/4 rounded animate-pulse"
                  style={{ backgroundColor: "#EDE9FE" }}
                />
                <div className="flex gap-2">
                  <div
                    className="h-6 w-16 rounded-full animate-pulse"
                    style={{ backgroundColor: "#F5F3FF" }}
                  />
                  <div
                    className="h-6 w-20 rounded-full animate-pulse"
                    style={{ backgroundColor: "#F5F3FF" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty State
  if (!sessions || sessions.length === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <div
          className="
            text-center py-16 sm:py-20 px-6
            rounded-2xl
            bg-white/70 backdrop-blur-sm
          "
          style={{
            border: "0.5px solid #E0D9FF",
            boxShadow: "0 8px 20px rgba(139, 92, 246, 0.04)",
          }}
        >
          <div
            className="
              w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-5 rounded-2xl
              flex items-center justify-center
            "
            style={{ backgroundColor: "#F5F3FF" }}
          >
            <Calendar
              className="h-5 w-5 sm:h-6 sm:w-6"
              style={{ color: "#7C3AED" }}
            />
          </div>
          <h3
            className="text-[15px] sm:text-base font-medium mb-1"
            style={{ color: "#1E1E1E" }}
          >
            No Sessions Yet
          </h3>
          <p className="text-[13px] sm:text-sm" style={{ color: "#6B7280" }}>
            Evaluation sessions will appear here when assigned.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Search + Filters — Stack on mobile, row on desktop */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="flex-1">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Filter chips — horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
          <FilterChip
            label="All"
            active={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
          />
          <FilterChip
            label="This Week"
            active={activeFilter === "pending"}
            onClick={() => setActiveFilter("pending")}
          />
        </div>
      </div>

      {/* Cards — Stack on mobile, 2-col grid on desktop */}
      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
        {sortedSessions.map((session, idx) => (
          <div
            key={session.id}
            style={{
              animation: `fadeSlideIn 0.3s ease-out ${idx * 0.03}s both`,
            }}
          >
            <SessionCard
              session={session}
              projects={projectsBySession?.[session.id] || []}
            />
          </div>
        ))}
      </div>

      {/* No results */}
      {sortedSessions.length === 0 &&
        (searchQuery || activeFilter !== "all") && (
          <div className="text-center py-10 sm:py-12">
            <p className="text-[13px] sm:text-sm" style={{ color: "#6B7280" }}>
              No sessions match your filters
            </p>
          </div>
        )}
    </div>
  );
};

export default SessionGrid;
