// ============================================================
// TIER CONTAINER — Drop zone for a single ranking tier
// ============================================================
// SRS §4.4.1 — Visual tier with drag-and-drop receive zone.
// Gold/Silver/Bronze/Gray styling per tier rank.
// WCAG: aria-label, role=listbox, focus indicators.
// ============================================================

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * @param {Object} props
 * @param {Object} props.tier - { id, label, points, color }
 * @param {React.ReactNode} props.children - FacultyCard components inside this tier
 * @param {number} props.count - Number of faculty in this tier
 * @param {Function} props.onDrop - (tierId) => void — called when card dropped
 * @param {Function} props.onTierClick - (tierId) => void — mobile tap to place
 * @param {boolean} props.isOver - Is a card being dragged over this tier
 * @param {boolean} props.disabled - If evaluation is submitted
 * @param {boolean} props.isCollapsed - Collapse support for mobile
 */
const TierContainer = React.memo(function TierContainer({
  tier,
  children,
  count,
  onDrop,
  onTierClick,
  isOver,
  disabled,
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Visual styles per tier color
  const styles = {
    gold: {
      border: "border-amber-400",
      bg: "bg-amber-50/50",
      header: "bg-gradient-to-r from-amber-500 to-yellow-400 text-white",
      ring: "ring-amber-300",
    },
    silver: {
      border: "border-gray-400",
      bg: "bg-gray-50/50",
      header: "bg-gradient-to-r from-gray-500 to-gray-400 text-white",
      ring: "ring-gray-300",
    },
    bronze: {
      border: "border-orange-300",
      bg: "bg-orange-50/30",
      header: "bg-gradient-to-r from-orange-400 to-amber-300 text-white",
      ring: "ring-orange-200",
    },
    gray: {
      border: "border-gray-200",
      bg: "bg-gray-50/30",
      header: "bg-gray-200 text-gray-600",
      ring: "ring-gray-200",
    },
  };

  const s = styles[tier.color] || styles.gray;

  return (
    <div
      className={`
        rounded-2xl border-2 transition-all duration-300 mb-4
        ${s.border} ${s.bg}
        ${isOver ? `ring-2 ${s.ring} scale-[1.01] shadow-lg` : ""}
      `}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        const facultyId = e.dataTransfer.getData("text/plain");
        if (facultyId) onDrop(tier.id, facultyId);
      }}
      onClick={() => !disabled && onTierClick(tier.id)}
      role="listbox"
      aria-label={`${tier.label} tier — ${tier.points} points each — ${count} faculty placed`}
    >
      {/* Header */}
      <div
        className={`rounded-t-xl px-4 py-2.5 flex items-center justify-between ${s.header}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{tier.label}</span>
          {tier.points > 0 && (
            <span className="text-xs opacity-80 bg-white/20 px-2 py-0.5 rounded-full">
              {tier.points} pts each
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">
            {count} placed
          </span>
          {/* Collapse toggle for mobile */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="md:hidden p-0.5 rounded hover:bg-white/20"
            aria-label={collapsed ? "Expand tier" : "Collapse tier"}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Body — faculty cards */}
      {!collapsed && (
        <div className="p-3 min-h-[70px]">
          {count === 0 ? (
            <p className="text-gray-400 text-sm italic text-center py-4">
              {disabled
                ? "No faculty placed in this tier"
                : "Drag faculty here or tap to place"}
            </p>
          ) : (
            <div className="flex flex-col gap-2">{children}</div>
          )}
        </div>
      )}
    </div>
  );
});

export default TierContainer;
