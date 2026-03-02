// ============================================================
// EXPORT UTILITIES — CSV & JSON Download for Weighted Results
// ============================================================
// Provides download functions for weighted results data.
// Creates a temporary <a> element and triggers a click to
// download the file — no external dependencies needed.
//
// BUSINESS CONTEXT:
//   Faculty need offline-ready exports for grade books,
//   departmental reports, and audit trails.
//
// SUPPORTED FORMATS:
//   • CSV — Compatible with Excel, Google Sheets, etc.
//   • JSON — For programmatic consumption or archiving.
//
// SECURITY:
//   Data never leaves the browser — all transformation is
//   done client-side using the already-fetched API response.
// ============================================================

// ============================================================
// INTERNAL: Trigger browser file download
// ============================================================
/**
 * Creates a temporary blob URL and triggers the download.
 *
 * @param {string} content — Raw file content
 * @param {string} filename — Suggested filename
 * @param {string} mimeType — MIME type for the blob
 */
const triggerDownload = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup — revoke blob URL and remove temporary element
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ============================================================
// INTERNAL: Escape a CSV field value
// ============================================================
/**
 * Wraps fields containing commas, quotes, or newlines in double quotes.
 * Doubles any existing double quotes per RFC 4180.
 *
 * @param {*} value — Field value (any type)
 * @returns {string} — CSV-safe string
 */
const escapeCSVField = (value) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// ============================================================
// PUBLIC: Export weighted results as CSV
// ============================================================
/**
 * Transforms the weighted-results API response into a CSV file
 * and triggers a browser download.
 *
 * CSV structure:
 *   Row 1: Session metadata header
 *   Row 2: Blank separator
 *   Row 3: Column headers
 *   Rows 4+: One row per person
 *
 * @param {Object} data — Full API response from weighted-results endpoint
 * @param {string} sessionId — Session identifier for filename
 */
export const exportWeightedResultsToCSV = (data, sessionId) => {
  if (!data || !data.person_results) {
    console.warn("[exportUtils] No data to export");
    return;
  }

  const lines = [];

  // ── Session metadata header ─────────────────
  const sessionName = data.session?.name || `Session ${sessionId}`;
  const timestamp = new Date().toISOString();
  lines.push(`# Weighted Results Export — ${escapeCSVField(sessionName)}`);
  lines.push(`# Exported: ${timestamp}`);
  lines.push(`# Persons: ${data.person_results.length}`);
  if (data.summary) {
    lines.push(
      `# Avg Credibility Impact: ${data.summary.avg_credibility_impact?.toFixed(2) || "N/A"}`,
    );
  }
  lines.push(""); // Blank separator

  // ── Column headers ──────────────────────────
  const headers = [
    "Person Name",
    "Weighted Mean",
    "Raw Mean",
    "Credibility Impact (%)",
    "Standard Deviation",
    "Evaluator Count",
    "Weighted Rank",
    "Raw Rank",
    "Rank Change",
  ];
  lines.push(headers.map(escapeCSVField).join(","));

  // ── Data rows ───────────────────────────────
  data.person_results.forEach((person) => {
    const row = [
      person.person_name || person.target_id || "Unknown",
      person.weighted_mean?.toFixed(4) || "",
      person.raw_mean?.toFixed(4) || "",
      person.credibility_impact != null
        ? (person.credibility_impact * 100).toFixed(2)
        : "",
      person.std_dev?.toFixed(4) || "",
      person.evaluator_count || "",
      person.weighted_rank || "",
      person.raw_rank || "",
      person.rank_change != null ? person.rank_change : "",
    ];
    lines.push(row.map(escapeCSVField).join(","));
  });

  // ── Trigger download ────────────────────────
  const filename = `weighted-results-${sessionId}-${Date.now()}.csv`;
  triggerDownload(lines.join("\n"), filename, "text/csv;charset=utf-8;");
};

// ============================================================
// PUBLIC: Export weighted results as JSON
// ============================================================
/**
 * Exports the weighted-results API response as a formatted JSON
 * file and triggers a browser download.
 *
 * Includes metadata wrapper with export timestamp and version.
 *
 * @param {Object} data — Full API response from weighted-results endpoint
 * @param {string} sessionId — Session identifier for filename
 */
export const exportWeightedResultsToJSON = (data, sessionId) => {
  if (!data || !data.person_results) {
    console.warn("[exportUtils] No data to export");
    return;
  }

  // ── Build export envelope ───────────────────
  const exportData = {
    _meta: {
      exportedAt: new Date().toISOString(),
      format: "weighted-results-v1",
      sessionId: sessionId,
      personCount: data.person_results.length,
    },
    session: data.session || null,
    summary: data.summary || null,
    person_results: data.person_results,
    evaluator_analysis: data.evaluator_analysis || null,
  };

  // ── Trigger download (pretty-printed) ───────
  const filename = `weighted-results-${sessionId}-${Date.now()}.json`;
  const content = JSON.stringify(exportData, null, 2);
  triggerDownload(content, filename, "application/json;charset=utf-8;");
};
