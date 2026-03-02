// ============================================================
// PROJECT INTELLIGENCE CARD — Team Card with Scarcity Display
// ============================================================
// High-density card representing a single project team.
// Emphasizes the scarcity pool (Gold Badge) and trajectory.
//
// SRS REFERENCES:
//   §4.1.1 — Project definition (team members, photos, names)
//   §4.1.3 — Scarcity pool calculation (TeamSize × 5)
//   §6.1   — Trajectory analysis (trend indicators)
//
// VISUAL HIERARCHY:
//   Top:    Team Name + Scarcity Pool Badge (Gold)
//   Middle: Member Avatars (Circle images with initials fallback)
//   Bottom: Trajectory Indicator + "Evaluate Team" Button
// ============================================================

import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, ArrowRight, Clock } from "lucide-react";

import ScarcityPoolBadge from "./ScarcityPoolBadge";
import useScarcityLogic from "../../../hooks/useScarcityLogic";
import { getInitials } from "../../../utils/helpers";

// SRS §4.1.2, §6.1: Project Improvement Delta Visualization
import ProjectDeltaBadge from "../../analytics/ProjectDeltaBadge";
import ProjectTrajectoryMini from "../../analytics/ProjectTrajectoryMini";

/**
 * Project Intelligence Card — Team evaluation entry point.
 *
 * @param {Object} props
 * @param {Object} props.team - Project team data
 * @param {string} props.team.id - Team/Project UUID
 * @param {string} props.team.name - Team name
 * @param {string} [props.team.description] - Team description
 * @param {number} props.team.member_count - Number of members (2-4)
 * @param {Array} [props.team.members] - Member list with {id, name, photo}
 * @param {number} [props.team.previous_score_avg] - Last month's avg score
 * @param {'UP'|'DOWN'|'STABLE'} [props.team.trend_indicator] - Trajectory
 * @param {string} props.sessionId - Parent session UUID for navigation
 * @param {boolean} [props.canEvaluate=true] - Whether evaluation is allowed
 */
const ProjectIntelligenceCard = ({ team, sessionId, canEvaluate = true }) => {
  const navigate = useNavigate();

  // SRS 4.1.3: Calculate scarcity pool
  const { totalPool, poolDisplay } = useScarcityLogic(team.member_count);

  // Handle evaluate button click
  const handleEvaluate = () => {
    if (canEvaluate && sessionId) {
      navigate(`/scarcity/evaluate/${sessionId}`);
    }
  };

  return (
    <div
      className="
        relative rounded-2xl overflow-hidden
        bg-white/70 backdrop-blur-xl
        border border-gray-100/50
        shadow-[0_4px_20px_rgba(0,0,0,0.03)]
        hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]
        hover:translate-y-[-4px]
        transition-all duration-300 cursor-pointer
        group
      "
      onClick={handleEvaluate}
    >
      {/* Subtle top accent line on hover */}
      <div
        className="
          absolute top-0 left-0 right-0 h-0.5
          bg-gradient-to-r from-transparent via-violet-400 to-transparent
          opacity-0 group-hover:opacity-100
          transition-opacity duration-300
        "
      />

      {/* ====================================================== */}
      {/* HEADER — Team Name + Scarcity Pool Badge */}
      {/* ====================================================== */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          {/* Team Name */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate tracking-tight">
              {team.name || "Unnamed Team"}
            </h3>
            {team.description && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-1">
                {team.description}
              </p>
            )}
          </div>

          {/* Scarcity Pool Badge — PROMINENT (SRS 4.1.3) */}
          <ScarcityPoolBadge poolSize={totalPool} size="md" />
        </div>
      </div>

      {/* ====================================================== */}
      {/* MIDDLE — Member Avatars */}
      {/* ====================================================== */}
      <div className="px-5 py-4 border-t border-gray-100/50">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-400 font-medium">
            {team.member_count} Members
          </span>
        </div>

        {/* Avatar Stack */}
        <div className="flex items-center -space-x-2">
          {team.members && team.members.length > 0 ? (
            team.members.slice(0, 5).map((member, idx) => (
              <div
                key={member.id || idx}
                className="
                  h-9 w-9 rounded-xl border-2 border-white
                  bg-gradient-to-br from-gray-50 to-white
                  flex items-center justify-center
                  text-xs font-medium text-gray-500
                  overflow-hidden
                  shadow-[0_2px_8px_rgba(0,0,0,0.04)]
                  transition-transform duration-200
                  hover:scale-110 hover:z-10
                "
                title={member.name}
              >
                {member.photo ? (
                  <img
                    src={member.photo}
                    alt={member.name}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  getInitials(member.name || "?")
                )}
              </div>
            ))
          ) : (
            // Show member count when no individual member data
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-gray-50 to-white flex items-center justify-center border border-gray-100/50">
                <Users className="h-4 w-4 text-gray-400" />
              </div>
              <span>{team.member_count || 0} team members</span>
            </div>
          )}

          {/* Overflow indicator */}
          {team.members && team.members.length > 5 && (
            <div
              className="
                h-9 w-9 rounded-xl border-2 border-white
                bg-gradient-to-br from-gray-100 to-gray-50
                flex items-center justify-center
                text-xs font-medium text-gray-500
              "
            >
              +{team.members.length - 5}
            </div>
          )}
        </div>
      </div>

      {/* ====================================================== */}
      {/* FOOTER — Project Delta + Trajectory + Action Button */}
      {/* SRS §4.1.2, §6.1: Enhanced with real-time delta visualization */}
      {/* ====================================================== */}
      <div className="px-5 py-4 border-t border-gray-100/50 bg-gray-50/30">
        <div className="flex items-center justify-between">
          {/* Project Delta Badge (SRS §4.1.2) — Primary improvement indicator */}
          <div className="flex items-center gap-3">
            <ProjectDeltaBadge
              projectId={team.id}
              size="md"
              showDistribution={true}
            />

            {/* Mini Trajectory Chart (SRS §6.1) */}
            <ProjectTrajectoryMini
              projectId={team.id}
              height={28}
              width={60}
              showTrendIndicator={false}
            />
          </div>

          {/* Evaluate Button */}
          {canEvaluate ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEvaluate();
              }}
              className="
                inline-flex items-center gap-2 px-4 py-2
                bg-gray-900 text-white text-xs font-medium
                rounded-xl
                shadow-[0_4px_12px_rgba(0,0,0,0.15)]
                hover:shadow-[0_8px_20px_rgba(0,0,0,0.2)]
                hover:scale-[1.02]
                active:scale-[0.98]
                transition-all duration-200
              "
            >
              Evaluate
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Not Available
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectIntelligenceCard;
