// ============================================================
// SESSION PROGRESS BAR COMPONENT
// ============================================================
// SRS §4.1.3: Visual feedback for scarcity pool allocation
//
// A polished, accessible progress bar component that provides
// instant visual feedback for point allocation status.
//
// FEATURES:
// - Smooth animated progress bar
// - 3 color states: blue (in progress), green (complete), yellow (warning)
// - Percentage display with optional detailed text
// - Full accessibility support (ARIA progressbar)
// - Multiple sizes: sm, md, lg, xl
// - Multiple variants: default, compact, dashboard
// - Optional celebration effect at 100%
// - Reduced motion support
//
// USAGE:
// <SessionProgressBar
//   allocated={12.5}
//   maxPool={15}
//   size="lg"
//   variant="default"
//   celebrate={true}
//   onComplete={() => console.log('Done!')}
// />
//
// DESIGN:
// - Height: 4px (sm), 8px (md), 12px (lg), 16px (xl)
// - Border radius: pill shape
// - Animation: 0.3s ease-out on width change
// - Colors match Tailwind palette
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import {
  useSessionProgress,
  PROGRESS_STATUS,
} from "../../hooks/useSessionProgress";

// ============================================================
// CELEBRATION EFFECT — Confetti animation at 100%
// ============================================================

/**
 * Lightweight confetti celebration using canvas.
 * Only renders when active, automatically stops after 2 seconds.
 */
const CelebrationEffect = ({ active }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Set canvas size to match container
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height + 40; // Extra height for falling particles

    // Create confetti particles
    const particles = [];
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        size: Math.random() * 6 + 3,
        speedY: Math.random() * 2 + 1.5,
        speedX: (Math.random() - 0.5) * 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        color: `hsl(${Math.random() * 60 + 100}, 75%, 55%)`, // Greens/yellows
      });
    }

    let animationFrame;
    let startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;

      // Stop after 2.5 seconds
      if (elapsed > 2500) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        // Update position
        p.y += p.speedY;
        p.x += p.speedX;
        p.rotation += p.rotationSpeed;

        // Fade out near the end
        const alpha = elapsed > 2000 ? (2500 - elapsed) / 500 : 1;

        // Draw particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
};

// ============================================================
// SIZE CONFIGURATIONS
// ============================================================

const SIZE_CONFIG = {
  sm: {
    barHeight: "h-1",
    text: "text-xs",
    badge: "text-xs",
    iconSize: "h-3.5 w-3.5",
    spacing: "mt-1",
  },
  md: {
    barHeight: "h-2",
    text: "text-sm",
    badge: "text-xs",
    iconSize: "h-4 w-4",
    spacing: "mt-2",
  },
  lg: {
    barHeight: "h-3",
    text: "text-base",
    badge: "text-sm",
    iconSize: "h-5 w-5",
    spacing: "mt-2",
  },
  xl: {
    barHeight: "h-4",
    text: "text-lg",
    badge: "text-base",
    iconSize: "h-5 w-5",
    spacing: "mt-3",
  },
};

// ============================================================
// SESSION PROGRESS BAR COMPONENT
// ============================================================

/**
 * Visual progress bar for scarcity pool allocation.
 *
 * @param {Object} props - Component props
 * @param {number} props.allocated - Current total allocated points
 * @param {number} props.maxPool - Maximum points available
 * @param {string} [props.size='md'] - Size variant: 'sm', 'md', 'lg', 'xl'
 * @param {string} [props.variant='default'] - Display variant: 'default', 'compact', 'dashboard'
 * @param {boolean} [props.showLabel=true] - Show text label below bar
 * @param {boolean} [props.showStatusIcon=true] - Show status icon
 * @param {boolean} [props.animate=true] - Enable smooth width transitions
 * @param {boolean} [props.celebrate=false] - Show confetti at 100%
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {Function} [props.onComplete] - Callback when allocation reaches 100%
 */
const SessionProgressBar = ({
  allocated,
  maxPool,
  size = "md",
  variant = "default",
  showLabel = true,
  showStatusIcon = true,
  animate = true,
  celebrate = false,
  className = "",
  onComplete,
}) => {
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCompleteRef = useRef(false);

  // Use the progress calculation hook
  const progress = useSessionProgress(allocated, maxPool, {
    trackCompletion: celebrate,
  });

  // Get size configuration
  const sizeConfig = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  // Detect completion and trigger celebration/callback
  useEffect(() => {
    const wasComplete = prevCompleteRef.current;
    const isNowComplete = progress.isComplete;

    // Just completed
    if (!wasComplete && isNowComplete) {
      // Trigger callback
      if (onComplete) {
        onComplete();
      }

      // Trigger celebration
      if (celebrate) {
        setShowCelebration(true);
        // Hide after animation
        const timeout = setTimeout(() => {
          setShowCelebration(false);
        }, 3000);
        return () => clearTimeout(timeout);
      }
    }

    prevCompleteRef.current = isNowComplete;
  }, [progress.isComplete, celebrate, onComplete]);

  // Status icon component
  const StatusIcon = useCallback(() => {
    if (!showStatusIcon) return null;

    const iconClass = `${sizeConfig.iconSize} mr-1.5 flex-shrink-0`;

    if (progress.isComplete) {
      return <CheckCircle className={`${iconClass} text-green-600`} />;
    }
    if (progress.isOverAllocated) {
      return <AlertTriangle className={`${iconClass} text-yellow-600`} />;
    }
    return <Info className={`${iconClass} text-blue-600`} />;
  }, [
    showStatusIcon,
    sizeConfig.iconSize,
    progress.isComplete,
    progress.isOverAllocated,
  ]);

  // ============================================================
  // VARIANT: COMPACT — Bar only, no label
  // ============================================================
  if (variant === "compact") {
    return (
      <div className={`w-full ${className}`} {...progress.ariaProps}>
        <div
          className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeConfig.barHeight}`}
        >
          <div
            className={`h-full rounded-full ${progress.color.bg}`}
            style={{
              width: `${progress.percentage}%`,
              transition: animate ? "width 0.3s ease-out" : "none",
            }}
          />
        </div>
      </div>
    );
  }

  // ============================================================
  // VARIANT: DASHBOARD — Bar with inline badge
  // ============================================================
  if (variant === "dashboard") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex-1" {...progress.ariaProps}>
          <div
            className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeConfig.barHeight}`}
          >
            <div
              className={`h-full rounded-full ${progress.color.bg}`}
              style={{
                width: `${progress.percentage}%`,
                transition: animate ? "width 0.3s ease-out" : "none",
              }}
            />
          </div>
        </div>
        <span
          className={`${progress.color.light} ${progress.color.text} px-2 py-0.5 rounded-full ${sizeConfig.badge} font-medium whitespace-nowrap`}
        >
          {progress.shortDisplayText}
        </span>
      </div>
    );
  }

  // ============================================================
  // VARIANT: DEFAULT — Full with label and icon
  // ============================================================
  return (
    <div className={`relative ${className}`}>
      {/* Celebration overlay */}
      {celebrate && <CelebrationEffect active={showCelebration} />}

      {/* Progress bar with optional icon */}
      <div className="flex items-center">
        <StatusIcon />
        <div className="flex-1" {...progress.ariaProps}>
          <div
            className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeConfig.barHeight}`}
          >
            <div
              className={`h-full rounded-full ${progress.color.bg}`}
              style={{
                width: `${progress.percentage}%`,
                transition: animate ? "width 0.3s ease-out" : "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Text label below bar */}
      {showLabel && (
        <div
          className={`flex items-center justify-between ${sizeConfig.spacing}`}
        >
          <span className={`${sizeConfig.text} text-gray-600`}>
            {progress.displayText}
          </span>
          {progress.isOverAllocated && (
            <span
              className={`${sizeConfig.badge} text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full`}
            >
              Adjust points
            </span>
          )}
        </div>
      )}

      {/* Screen reader live region */}
      <div className="sr-only" role="status" aria-live="polite">
        {progress.ariaLabel}
      </div>
    </div>
  );
};

// ============================================================
// PROP TYPES
// ============================================================

SessionProgressBar.propTypes = {
  /** Current total allocated points */
  allocated: PropTypes.number.isRequired,
  /** Maximum points available in pool */
  maxPool: PropTypes.number.isRequired,
  /** Size variant */
  size: PropTypes.oneOf(["sm", "md", "lg", "xl"]),
  /** Display variant */
  variant: PropTypes.oneOf(["default", "compact", "dashboard"]),
  /** Show text label below bar */
  showLabel: PropTypes.bool,
  /** Show status icon */
  showStatusIcon: PropTypes.bool,
  /** Enable smooth width transitions */
  animate: PropTypes.bool,
  /** Show confetti celebration at 100% */
  celebrate: PropTypes.bool,
  /** Additional CSS classes */
  className: PropTypes.string,
  /** Callback when allocation reaches 100% */
  onComplete: PropTypes.func,
};

// ============================================================
// EXPORT
// ============================================================

export default SessionProgressBar;
