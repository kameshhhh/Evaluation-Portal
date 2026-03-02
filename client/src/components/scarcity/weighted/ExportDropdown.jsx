// ============================================================
// EXPORT DROPDOWN — CSV / JSON Download for Weighted Results
// ============================================================
// Provides a dropdown menu with export options:
//   • CSV — Tabular format for Excel / Google Sheets
//   • JSON — Machine-readable format for programmatic use
//
// BUSINESS CONTEXT:
//   Faculty need to download weighted results for external
//   reporting, grade books, or further analysis offline.
//
// ARCHITECTURE:
//   This component only handles the UI trigger. The actual
//   data transformation is delegated to `exportUtils.js`.
//
// PERFORMANCE: Clickaway listener is cleaned up on unmount.
// ACCESSIBILITY: Keyboard-navigable dropdown.
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Download, FileText, FileJson, ChevronDown } from "lucide-react";
import {
  exportWeightedResultsToCSV,
  exportWeightedResultsToJSON,
} from "../../../utils/exportUtils";

// ============================================================
// MAIN COMPONENT: ExportDropdown
// ============================================================
/**
 * Dropdown button that exports weighted results data.
 *
 * @param {Object} props
 * @param {Object} props.data — Full API response from weighted-results endpoint
 * @param {string} props.sessionId — Session identifier (used in filename)
 */
const ExportDropdown = ({ data, sessionId }) => {
  // ── State ───────────────────────────────────
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null); // "csv" | "json" | null
  const dropdownRef = useRef(null);

  // ── Click-away handler ──────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Export handlers (must be before early return) ──
  const handleExportCSV = useCallback(async () => {
    try {
      setExporting("csv");
      exportWeightedResultsToCSV(data, sessionId);
    } catch (err) {
      console.error("[ExportDropdown] CSV export failed:", err.message);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }, [data, sessionId]);

  const handleExportJSON = useCallback(async () => {
    try {
      setExporting("json");
      exportWeightedResultsToJSON(data, sessionId);
    } catch (err) {
      console.error("[ExportDropdown] JSON export failed:", err.message);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }, [data, sessionId]);

  // ── Keyboard support ────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Escape") setOpen(false);
  };

  // ── Guard: no data → don't render ──────────
  if (!data || !data.person_results || data.person_results.length === 0) {
    return null;
  }
  // ── Render ──────────────────────────────────
  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium
                   text-gray-700 bg-white border border-gray-300 rounded-lg
                   hover:bg-gray-50 transition-colors shadow-sm"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg
                     border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1"
          role="menu"
        >
          {/* CSV option */}
          <button
            onClick={handleExportCSV}
            disabled={exporting === "csv"}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left
                       text-gray-700 hover:bg-purple-50 hover:text-purple-700
                       disabled:opacity-50 transition-colors"
            role="menuitem"
          >
            <FileText className="h-3.5 w-3.5" />
            <div>
              <p className="font-medium">
                {exporting === "csv" ? "Exporting…" : "Export as CSV"}
              </p>
              <p className="text-[10px] text-gray-400">
                Spreadsheet-compatible
              </p>
            </div>
          </button>

          {/* JSON option */}
          <button
            onClick={handleExportJSON}
            disabled={exporting === "json"}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left
                       text-gray-700 hover:bg-purple-50 hover:text-purple-700
                       disabled:opacity-50 transition-colors"
            role="menuitem"
          >
            <FileJson className="h-3.5 w-3.5" />
            <div>
              <p className="font-medium">
                {exporting === "json" ? "Exporting…" : "Export as JSON"}
              </p>
              <p className="text-[10px] text-gray-400">
                Machine-readable format
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportDropdown;
