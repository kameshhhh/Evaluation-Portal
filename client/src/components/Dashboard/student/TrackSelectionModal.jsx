// ============================================================
// TRACK SELECTION MODAL — One-Time Student Track Choice
// ============================================================
// Shown once to students who haven't selected a track yet.
// Three options: Core Project, IT/IT-Core, Premium Project.
// Selection is permanent — cannot be changed after submission.
// ============================================================

import React, { useState } from "react";
import { Users, User, Star, AlertTriangle, Check, Loader2 } from "lucide-react";

const TRACKS = [
  {
    id: "core",
    label: "Core Project",
    icon: Users,
    color: "#7C3AED",
    bgColor: "rgba(124, 58, 237, 0.08)",
    borderColor: "rgba(124, 58, 237, 0.2)",
    description: "Team of 3-4 members",
    details: [
      "Form a team with 3-4 members",
      "One person becomes Team Leader",
      "Leader picks team members",
      "Members must accept the invitation",
      "Admin approves the final team",
    ],
  },
  {
    id: "it_core",
    label: "IT / IT & Core",
    icon: User,
    color: "#059669",
    bgColor: "rgba(5, 150, 105, 0.08)",
    borderColor: "rgba(5, 150, 105, 0.2)",
    description: "Individual (solo)",
    details: [
      "You work individually",
      "Team size is 1 (yourself only)",
      "Auto-registered — no team formation needed",
      "Start working immediately",
    ],
  },
  {
    id: "premium",
    label: "Premium Project",
    icon: Star,
    color: "#D97706",
    bgColor: "rgba(217, 119, 6, 0.08)",
    borderColor: "rgba(217, 119, 6, 0.2)",
    description: "Team of 1-2 members",
    details: [
      "Work solo or with one partner",
      "Strict team size: 1 or 2 only",
      "Higher standards and expectations",
      "Admin approval required",
    ],
  },
];

const TrackSelectionModal = ({ onSelect, isLoading }) => {
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    onSelect(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ border: "1px solid rgba(124, 58, 237, 0.15)" }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 border-b"
          style={{
            borderColor: "rgba(124, 58, 237, 0.1)",
            background:
              "linear-gradient(135deg, rgba(124, 58, 237, 0.04) 0%, transparent 100%)",
          }}
        >
          <h2 className="text-xl font-bold text-gray-900">
            Select Your Project Track
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            This is a one-time selection and{" "}
            <span className="font-semibold text-red-500">
              cannot be changed
            </span>{" "}
            after confirmation.
          </p>
        </div>

        {/* Track Cards */}
        <div className="p-6 space-y-3">
          {TRACKS.map((track) => {
            const Icon = track.icon;
            const isSelected = selected === track.id;
            return (
              <button
                key={track.id}
                onClick={() => {
                  setSelected(track.id);
                  setConfirmed(false);
                }}
                disabled={isLoading}
                className="w-full text-left rounded-xl p-4 transition-all duration-200 outline-none"
                style={{
                  background: isSelected ? track.bgColor : "#FAFAFA",
                  border: `2px solid ${isSelected ? track.color : "#E5E7EB"}`,
                  boxShadow: isSelected ? `0 0 0 3px ${track.bgColor}` : "none",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: isSelected ? track.color : "#E5E7EB",
                    }}
                  >
                    <Icon size={20} color={isSelected ? "white" : "#6B7280"} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-semibold text-base"
                        style={{ color: isSelected ? track.color : "#374151" }}
                      >
                        {track.label}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: isSelected
                            ? track.bgColor
                            : "rgba(0,0,0,0.05)",
                          color: isSelected ? track.color : "#6B7280",
                        }}
                      >
                        {track.description}
                      </span>
                      {isSelected && (
                        <Check
                          size={16}
                          color={track.color}
                          className="ml-auto"
                        />
                      )}
                    </div>
                    {isSelected && (
                      <ul className="mt-2 space-y-1">
                        {track.details.map((d, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-sm text-gray-600"
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: track.color }}
                            />
                            {d}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Confirmation Warning + Button */}
        <div className="px-6 pb-6">
          {confirmed && selected && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg mb-4"
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
              }}
            >
              <AlertTriangle
                size={18}
                className="text-red-500 shrink-0 mt-0.5"
              />
              <div className="text-sm text-red-700">
                <span className="font-semibold">Final confirmation:</span> You
                selected{" "}
                <strong>{TRACKS.find((t) => t.id === selected)?.label}</strong>.
                This cannot be undone. Click <strong>Confirm Selection</strong>{" "}
                to proceed.
              </div>
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={!selected || isLoading}
            className="w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
            style={{
              background: confirmed
                ? "#DC2626"
                : selected
                  ? TRACKS.find((t) => t.id === selected)?.color || "#7C3AED"
                  : "#D1D5DB",
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Saving...
              </>
            ) : confirmed ? (
              "Confirm Selection — Cannot Be Changed"
            ) : selected ? (
              `Select ${TRACKS.find((t) => t.id === selected)?.label}`
            ) : (
              "Choose a track above"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackSelectionModal;
