// ============================================================
// SCARCITY POOL BADGE — Visual Pool Indicator (Gold Badge)
// ============================================================
// Displays the scarcity pool limit prominently as a gold badge.
// Reminds faculty that points are LIMITED — this is the core
// visual anchor of the scarcity philosophy.
//
// SRS 4.1.3: "Each judge is assigned a fixed total score pool"
// ============================================================

import React from "react";
import { Gauge } from "lucide-react";

/**
 * Modern badge showing the scarcity pool for a team.
 *
 * @param {Object} props
 * @param {number} props.poolSize - Total pool size (e.g., 20)
 * @param {number} [props.remaining] - Points remaining (optional)
 * @param {string} [props.size="md"] - Badge size: "sm" | "md" | "lg"
 * @param {boolean} [props.showRemaining=false] - Show remaining vs total
 */
const ScarcityPoolBadge = ({
  poolSize,
  remaining,
  size = "md",
  showRemaining = false,
}) => {
  // Size variants - modern rounded style
  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1",
    md: "px-3 py-1.5 text-sm gap-1.5",
    lg: "px-4 py-2 text-base gap-2",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  // Determine display text
  const displayText =
    showRemaining && remaining !== undefined
      ? `${remaining}/${poolSize}`
      : `${poolSize}`;

  // Color based on remaining (if showing)
  const isLow =
    showRemaining && remaining !== undefined && remaining <= poolSize * 0.25;
  const isExceeded = showRemaining && remaining !== undefined && remaining < 0;

  // Modern gradient + glassmorphism styling
  let bgClass, textClass, shadowClass;
  if (isExceeded) {
    bgClass = "bg-gradient-to-br from-red-50 to-white border-red-100/50";
    textClass = "text-red-500";
    shadowClass = "shadow-[0_2px_8px_rgba(239,68,68,0.1)]";
  } else if (isLow) {
    bgClass = "bg-gradient-to-br from-amber-50 to-white border-amber-100/50";
    textClass = "text-amber-500";
    shadowClass = "shadow-[0_2px_8px_rgba(245,158,11,0.1)]";
  } else {
    bgClass = "bg-gradient-to-br from-violet-50 to-white border-violet-100/50";
    textClass = "text-violet-600";
    shadowClass = "shadow-[0_2px_8px_rgba(139,92,246,0.1)]";
  }

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-xl 
        backdrop-blur-sm border
        transition-all duration-200
        hover:scale-105
        ${sizeClasses[size]}
        ${bgClass}
        ${textClass}
        ${shadowClass}
      `}
      title={`Scarcity Pool: ${poolSize} points total (SRS §4.1.3)`}
    >
      <Gauge className={iconSizes[size]} />
      <span>{displayText}</span>
      <span className="text-xs opacity-60 font-medium">pts</span>
    </span>
  );
};

export default ScarcityPoolBadge;
