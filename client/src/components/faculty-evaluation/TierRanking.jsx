// ============================================================
// TIER RANKING — Core drag-and-drop tier-based faculty ranking
// ============================================================
// SRS §4.4.1 — Tier-based scarcity allocation UI.
// Desktop: HTML5 native drag & drop (no external deps).
// Mobile: Tap-to-select card → tap tier to place.
// WCAG: Keyboard navigation, ARIA, screen reader support.
// ============================================================

import React, { useState, useCallback } from "react";
import TierContainer from "./TierContainer";
import FacultyCard from "./FacultyCard";

/**
 * @param {Object} props
 * @param {Object} props.tiers - { tier1: [faculty], tier2: [...], ... }
 * @param {Array} props.tierConfig - [{ id, label, points, color }]
 * @param {Function} props.onMoveFaculty - (facultyId, targetTierId) => void
 * @param {boolean} props.disabled - If evaluation is submitted
 */
const TierRanking = React.memo(function TierRanking({
  tiers,
  tierConfig,
  onMoveFaculty,
  disabled,
}) {
  // Mobile: tap-to-select state
  const [selectedId, setSelectedId] = useState(null);
  const [dragOverTier, setDragOverTier] = useState(null);

  // ── Desktop DnD handlers ────────────────────────────────

  const handleDragOver = useCallback(
    (e) => {
      if (disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (tierId, facultyId) => {
      if (disabled) return;
      onMoveFaculty(facultyId, tierId);
      setDragOverTier(null);
      setSelectedId(null);
    },
    [disabled, onMoveFaculty],
  );

  const handleDragEnter = useCallback(
    (tierId) => {
      if (!disabled) setDragOverTier(tierId);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverTier(null);
  }, []);

  // ── Mobile tap handlers ─────────────────────────────────

  const handleCardClick = useCallback(
    (facultyId) => {
      if (disabled) return;
      setSelectedId((prev) => (prev === facultyId ? null : facultyId));
    },
    [disabled],
  );

  const handleTierClick = useCallback(
    (tierId) => {
      if (disabled || !selectedId) return;
      onMoveFaculty(selectedId, tierId);
      setSelectedId(null);
    },
    [disabled, selectedId, onMoveFaculty],
  );

  // ── Keyboard navigation ─────────────────────────────────

  const handleKeyMoveTier = useCallback(
    (e, tierId) => {
      if (disabled || !selectedId) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onMoveFaculty(selectedId, tierId);
        setSelectedId(null);
      }
    },
    [disabled, selectedId, onMoveFaculty],
  );

  return (
    <div
      className="space-y-0"
      role="application"
      aria-label="Faculty tier ranking. Drag faculty between tiers or tap to select and place."
      onDragLeave={handleDragLeave}
    >
      {/* Selection hint for mobile */}
      {selectedId && !disabled && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm text-center animate-pulse">
          Tap a tier to place the selected faculty member
        </div>
      )}

      {tierConfig.map((tier) => {
        const members = tiers[tier.id] || [];
        return (
          <div
            key={tier.id}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(tier.id)}
            onKeyDown={(e) => handleKeyMoveTier(e, tier.id)}
            tabIndex={selectedId ? 0 : -1}
          >
            <TierContainer
              tier={tier}
              count={members.length}
              onDrop={handleDrop}
              onTierClick={handleTierClick}
              isOver={dragOverTier === tier.id}
              disabled={disabled}
            >
              {members.map((faculty) => (
                <FacultyCard
                  key={faculty.person_id}
                  faculty={faculty}
                  selected={selectedId === faculty.person_id}
                  tierColor={tier.color}
                  onDragStart={() => {}}
                  onClick={handleCardClick}
                  disabled={disabled}
                />
              ))}
            </TierContainer>
          </div>
        );
      })}
    </div>
  );
});

export default TierRanking;
