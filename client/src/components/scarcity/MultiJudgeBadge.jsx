// ============================================================
// MULTI-JUDGE BADGE COMPONENT
// ============================================================
// SRS §4.2: Visual indicator for multi-judge sessions
//
// Used in SessionCard to show:
// - Number of evaluators assigned
// - Submission status (for current evaluator)
// - Visual differentiation from single-judge sessions
//
// DOES NOT show:
// - Other evaluators' names
// - Other evaluators' scores
// ============================================================

import React from "react";
import PropTypes from "prop-types";
import { Users, CheckCircle } from "lucide-react";

// ============================================================
// MultiJudgeBadge — Compact badge for dashboard cards
// ============================================================
/**
 * @param {Object} props
 * @param {number} props.totalEvaluators - Total number of evaluators assigned
 * @param {string} props.myStatus - Current evaluator's submission status
 * @param {boolean} props.allSubmitted - Whether all evaluators have submitted
 * @param {string} props.size - 'sm', 'md', 'lg' (default: 'md')
 */
const MultiJudgeBadge = ({
  totalEvaluators = 0,
  myStatus = "pending",
  allSubmitted = false,
  size = "md",
}) => {
  // Size mappings
  const sizeClasses = {
    sm: {
      badge: "px-1.5 py-0.5 text-xs",
      icon: "h-3 w-3 mr-1",
    },
    md: {
      badge: "px-2 py-1 text-xs",
      icon: "h-3.5 w-3.5 mr-1.5",
    },
    lg: {
      badge: "px-2.5 py-1.5 text-sm",
      icon: "h-4 w-4 mr-1.5",
    },
  };

  const selectedSize = sizeClasses[size] || sizeClasses.md;

  // Don't render if single judge
  if (totalEvaluators <= 1) {
    return null;
  }

  // ============================================================
  // BADGE STYLE BASED ON STATUS
  // ============================================================
  const getBadgeClasses = () => {
    if (allSubmitted) {
      return "bg-green-100 text-green-800 border-green-200";
    }

    if (myStatus === "submitted" || myStatus === "late") {
      return "bg-blue-100 text-blue-800 border-blue-200";
    }

    return "bg-purple-100 text-purple-800 border-purple-200";
  };

  // ============================================================
  // ICON BASED ON STATUS
  // ============================================================
  const getIcon = () => {
    if (allSubmitted) {
      return <CheckCircle className={selectedSize.icon} />;
    }

    if (myStatus === "submitted" || myStatus === "late") {
      return <CheckCircle className={selectedSize.icon} />;
    }

    return <Users className={selectedSize.icon} />;
  };

  // ============================================================
  // TEXT BASED ON STATUS
  // ============================================================
  const getText = () => {
    if (allSubmitted) {
      return `${totalEvaluators} Judges • All Submitted`;
    }

    if (myStatus === "submitted" || myStatus === "late") {
      return `${totalEvaluators} Judges • You're Done`;
    }

    return `${totalEvaluators} Judges • Multi-Judge`;
  };

  return (
    <span
      className={`inline-flex items-center ${selectedSize.badge} rounded-full border ${getBadgeClasses()}`}
    >
      {getIcon()}
      {getText()}
    </span>
  );
};

MultiJudgeBadge.propTypes = {
  totalEvaluators: PropTypes.number,
  myStatus: PropTypes.oneOf(["pending", "submitted", "late"]),
  allSubmitted: PropTypes.bool,
  size: PropTypes.oneOf(["sm", "md", "lg"]),
};

export default MultiJudgeBadge;
