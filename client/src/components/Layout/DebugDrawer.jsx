// ============================================================
// DEBUG DRAWER — Collapsible Console/Error Panel
// ============================================================
// Hidden by default. Shows console logs, errors, and dev tools
// when pulled up. Mobile-only component for debugging.
// ============================================================

import React, { useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Copy, X, Bug } from "lucide-react";

/**
 * Debug Drawer Component — Hidden by Default
 */
const DebugDrawer = ({ logs = [], errors = [], onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("logs");

  // Don't render in production or if no debug content
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const hasContent = logs.length > 0 || errors.length > 0;

  const handleCopy = () => {
    const content = activeTab === "logs" ? logs.join("\n") : errors.join("\n");
    navigator.clipboard.writeText(content);
  };

  return (
    <>
      {/* Pull Tab — Always visible on mobile when there's content */}
      {hasContent && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="
            fixed bottom-[72px] left-1/2 -translate-x-1/2
            sm:hidden z-40
            flex items-center gap-1.5 px-3 py-1.5
            bg-white/90 backdrop-blur-sm
            rounded-full
            transition-all duration-200
            active:scale-95
          "
          style={{
            border: "0.5px solid #E0D9FF",
            boxShadow: "0 2px 12px rgba(139, 92, 246, 0.1)",
          }}
        >
          <Bug className="h-3.5 w-3.5" style={{ color: "#7C3AED" }} />
          <span className="text-xs font-medium" style={{ color: "#7C3AED" }}>
            {errors.length > 0 ? `${errors.length} errors` : "Debug"}
          </span>
          {isOpen ? (
            <ChevronDown className="h-3 w-3" style={{ color: "#7C3AED" }} />
          ) : (
            <ChevronUp className="h-3 w-3" style={{ color: "#7C3AED" }} />
          )}
        </button>
      )}

      {/* Drawer Panel */}
      <div
        className={`
          fixed bottom-[72px] left-0 right-0
          sm:hidden z-30
          bg-white/95 backdrop-blur-md
          rounded-t-[20px]
          transition-transform duration-300 ease-out
          ${isOpen ? "translate-y-0" : "translate-y-full"}
        `}
        style={{
          borderTop: "0.5px solid #E0D9FF",
          boxShadow: "0 -8px 30px rgba(139, 92, 246, 0.08)",
          maxHeight: "50vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "0.5px solid #F1F5F9" }}
        >
          <div className="flex items-center gap-2">
            {/* Tab buttons */}
            <button
              onClick={() => setActiveTab("logs")}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor:
                  activeTab === "logs" ? "#F5F3FF" : "transparent",
                color: activeTab === "logs" ? "#7C3AED" : "#6B7280",
              }}
            >
              Logs ({logs.length})
            </button>
            <button
              onClick={() => setActiveTab("errors")}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor:
                  activeTab === "errors" ? "#FEF2F2" : "transparent",
                color: activeTab === "errors" ? "#DC2626" : "#6B7280",
              }}
            >
              Errors ({errors.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
            >
              <Copy className="h-4 w-4" style={{ color: "#6B7280" }} />
            </button>
            <button
              onClick={onClear}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
            >
              <Trash2 className="h-4 w-4" style={{ color: "#6B7280" }} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-all"
            >
              <X className="h-4 w-4" style={{ color: "#6B7280" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className="overflow-y-auto p-4"
          style={{ maxHeight: "calc(50vh - 60px)" }}
        >
          {activeTab === "logs" && (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p
                  className="text-xs text-center py-4"
                  style={{ color: "#9CA3AF" }}
                >
                  No logs yet
                </p>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono p-2 rounded-lg"
                    style={{
                      backgroundColor: "#F9FAFB",
                      color: "#374151",
                    }}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "errors" && (
            <div className="space-y-2">
              {errors.length === 0 ? (
                <p
                  className="text-xs text-center py-4"
                  style={{ color: "#9CA3AF" }}
                >
                  No errors
                </p>
              ) : (
                errors.map((error, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono p-2 rounded-lg"
                    style={{
                      backgroundColor: "#FEF2F2",
                      color: "#DC2626",
                    }}
                  >
                    {error}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DebugDrawer;
