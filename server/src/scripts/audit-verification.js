#!/usr/bin/env node
// ============================================================
// AUDIT VERIFICATION — CLI Tool for Change Audit Trail Checks
// ============================================================
// Command-line utility that verifies the completeness and
// consistency of the entity_change_audit table.
//
// What it checks:
//   1. Orphaned audit entries — references to deleted entities
//   2. Missing audit entries — entities changed without audit trail
//   3. Audit chain continuity — gaps in sequential audit records
//   4. Actor validation — audit actors match existing users
//   5. Summary statistics — counts by entity type, action, actor
//
// Usage:
//   node src/scripts/audit-verification.js                   # Full report
//   node src/scripts/audit-verification.js --entity <type>   # Filter by type
//   node src/scripts/audit-verification.js --actor <userId>  # Filter by actor
//   node src/scripts/audit-verification.js --since <date>    # Filter by date
//   node src/scripts/audit-verification.js --json            # JSON output
//
// Exit codes:
//   0 — All audit checks passed
//   1 — One or more audit inconsistencies found
//   2 — Script error (DB connection, invalid args, etc.)
//
// IMPORTANT: This script is READ-ONLY. It never modifies data.
// ============================================================

// Load environment variables from .env file
require("dotenv").config();

// Import the database pool for queries
const { query, pool } = require("../config/database");

// Import the ChangeAuditService for trail queries
const {
  ChangeAuditService,
  AuditAction,
} = require("../services/ChangeAuditService");

// ============================================================
// ANSI color codes for terminal output
// ============================================================
const COLORS = {
  reset: "\x1b[0m", // Reset all formatting
  red: "\x1b[31m", // Red text for failures
  green: "\x1b[32m", // Green text for success
  yellow: "\x1b[33m", // Yellow text for warnings
  blue: "\x1b[34m", // Blue text for info
  cyan: "\x1b[36m", // Cyan text for section dividers
  bold: "\x1b[1m", // Bold text for headers
  dim: "\x1b[2m", // Dim text for secondary info
};

// ============================================================
// Parse command-line arguments
// ============================================================
function parseArgs() {
  // Get raw arguments after 'node' and script name
  const args = process.argv.slice(2);

  // Build an options object from CLI flags
  const options = {
    entityType: null, // Filter by entity type (--entity <type>)
    actorId: null, // Filter by actor UUID (--actor <id>)
    since: null, // Filter by date (--since <YYYY-MM-DD>)
    jsonOutput: false, // Output as JSON (--json)
    verbose: false, // Show detailed entries (--verbose)
    limit: 100, // Max entries to display (--limit <n>)
    help: false, // Show help (--help)
  };

  // Iterate through arguments and parse flags
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--entity": // Filter by entity type
        options.entityType = args[++i];
        break;
      case "--actor": // Filter by actor UUID
        options.actorId = args[++i];
        break;
      case "--since": // Filter by date
        options.since = args[++i];
        break;
      case "--json": // Machine-readable JSON output
        options.jsonOutput = true;
        break;
      case "--verbose": // Detailed output
      case "-v":
        options.verbose = true;
        break;
      case "--limit": // Max entries to display
        options.limit = parseInt(args[++i], 10) || 100;
        break;
      case "--help": // Show help text
      case "-h":
        options.help = true;
        break;
      default: // Unknown argument — warn and continue
        console.warn(
          `${COLORS.yellow}Warning: Unknown argument '${args[i]}'${COLORS.reset}`,
        );
    }
  }

  return options; // Return the parsed options
}

// ============================================================
// Print help text
// ============================================================
function printHelp() {
  console.log(`
${COLORS.bold}PEMM Audit Verification${COLORS.reset}
${COLORS.dim}Verifies the completeness and consistency of the change audit trail${COLORS.reset}

${COLORS.bold}USAGE:${COLORS.reset}
  node src/scripts/audit-verification.js [OPTIONS]

${COLORS.bold}OPTIONS:${COLORS.reset}
  --entity <type>    Filter by entity type (project, person, etc.)
  --actor <uuid>     Show audit trail for a specific actor
  --since <date>     Only show entries after this date (YYYY-MM-DD)
  --limit <n>        Max entries to display (default: 100)
  --json             Output results as JSON (for CI/CD integration)
  --verbose, -v      Show detailed audit entry data
  --help, -h         Show this help text

${COLORS.bold}EXAMPLES:${COLORS.reset}
  # Full audit verification report
  node src/scripts/audit-verification.js

  # Show all project changes since January 2025
  node src/scripts/audit-verification.js --entity project --since 2025-01-01

  # JSON output for a specific actor
  node src/scripts/audit-verification.js --actor 550e8400-... --json

${COLORS.bold}EXIT CODES:${COLORS.reset}
  0 — All audit checks passed
  1 — Audit inconsistencies found
  2 — Script error
`);
}

// ============================================================
// Print a section header line
// ============================================================
function printHeader(title) {
  // Print a separator line with the title
  const line = "═".repeat(60);
  console.log(`\n${COLORS.bold}${COLORS.cyan}${line}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}${line}${COLORS.reset}\n`);
}

// ============================================================
// Get summary statistics from the audit table
// ============================================================
async function getAuditSummary(options) {
  // Base WHERE clause — always true, extended by filters
  const conditions = []; // Array of WHERE conditions
  const params = []; // Parameterized query values
  let paramIndex = 1; // Parameter counter for $1, $2, etc.

  // Apply entity type filter if specified
  if (options.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    params.push(options.entityType);
  }

  // Apply actor filter if specified
  if (options.actorId) {
    conditions.push(`changed_by = $${paramIndex++}`);
    params.push(options.actorId);
  }

  // Apply date filter if specified
  if (options.since) {
    conditions.push(`changed_at >= $${paramIndex++}`);
    params.push(new Date(options.since));
  }

  // Build the WHERE clause string
  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}` // Combine with AND
      : ""; // No filters

  // Query 1: Count by entity type
  const byTypeResult = await query(
    `SELECT entity_type, COUNT(*) as count
     FROM entity_change_audit ${whereClause}
     GROUP BY entity_type
     ORDER BY count DESC`,
    params,
  );

  // Query 2: Count by action type
  const byActionResult = await query(
    `SELECT action, COUNT(*) as count
     FROM entity_change_audit ${whereClause}
     GROUP BY action
     ORDER BY count DESC`,
    params,
  );

  // Query 3: Count by actor (top 10)
  const byActorResult = await query(
    `SELECT changed_by, COUNT(*) as count
     FROM entity_change_audit ${whereClause}
     GROUP BY changed_by
     ORDER BY count DESC
     LIMIT 10`,
    params,
  );

  // Query 4: Total count
  const totalResult = await query(
    `SELECT COUNT(*) as total FROM entity_change_audit ${whereClause}`,
    params,
  );

  // Query 5: Date range
  const rangeResult = await query(
    `SELECT MIN(changed_at) as earliest, MAX(changed_at) as latest
     FROM entity_change_audit ${whereClause}`,
    params,
  );

  // Build and return the summary object
  return {
    total: parseInt(totalResult.rows[0].total, 10), // Total audit entries
    byType: byTypeResult.rows, // Entries by entity type
    byAction: byActionResult.rows, // Entries by action
    topActors: byActorResult.rows, // Top 10 actors
    earliest: rangeResult.rows[0].earliest, // Earliest entry
    latest: rangeResult.rows[0].latest, // Latest entry
  };
}

// ============================================================
// Check for orphaned audit entries (entities that don't exist)
// ============================================================
async function checkOrphanedEntries() {
  // Find audit entries for persons that no longer exist
  const orphanedPersons = await query(
    `SELECT DISTINCT a.entity_id
     FROM entity_change_audit a
     WHERE a.entity_type = 'person'
       AND NOT EXISTS (
         SELECT 1 FROM persons p WHERE p.person_id = a.entity_id
       )`,
  );

  // Find audit entries for projects that no longer exist
  const orphanedProjects = await query(
    `SELECT DISTINCT a.entity_id
     FROM entity_change_audit a
     WHERE a.entity_type = 'project'
       AND NOT EXISTS (
         SELECT 1 FROM projects p WHERE p.project_id = a.entity_id
       )`,
  );

  // Return the orphaned entity IDs
  return {
    orphanedPersons: orphanedPersons.rows.map((r) => r.entity_id), // Person UUIDs
    orphanedProjects: orphanedProjects.rows.map((r) => r.entity_id), // Project UUIDs
    totalOrphaned: orphanedPersons.rows.length + orphanedProjects.rows.length,
  };
}

// ============================================================
// Check for entities missing audit trails
// ============================================================
async function checkMissingAuditTrails() {
  // Find persons with no CREATE audit entry
  const personsWithoutAudit = await query(
    `SELECT p.person_id, p.display_name
     FROM persons p
     WHERE NOT EXISTS (
       SELECT 1 FROM entity_change_audit a
       WHERE a.entity_type = 'person'
         AND a.entity_id = p.person_id
         AND a.action = 'CREATE'
     )
     AND p.is_deleted = false`,
  );

  // Find projects with no CREATE audit entry
  const projectsWithoutAudit = await query(
    `SELECT p.project_id, p.title
     FROM projects p
     WHERE NOT EXISTS (
       SELECT 1 FROM entity_change_audit a
       WHERE a.entity_type = 'project'
         AND a.entity_id = p.project_id
         AND a.action = 'CREATE'
     )
     AND p.is_deleted = false`,
  );

  // Return entities missing audit trails
  return {
    personsWithoutCreate: personsWithoutAudit.rows, // Persons missing CREATE
    projectsWithoutCreate: projectsWithoutAudit.rows, // Projects missing CREATE
    totalMissing:
      personsWithoutAudit.rows.length + projectsWithoutAudit.rows.length,
  };
}

// ============================================================
// Check audit actor validity
// ============================================================
async function checkActorValidity() {
  // Find audit entries with changed_by that doesn't match any user
  const invalidActors = await query(
    `SELECT DISTINCT a.changed_by, COUNT(*) as entry_count
     FROM entity_change_audit a
     WHERE a.changed_by IS NOT NULL
       AND a.changed_by != 'system'
       AND NOT EXISTS (
         SELECT 1 FROM users u WHERE u.internal_user_id = a.changed_by
       )
     GROUP BY a.changed_by`,
  );

  // Return invalid actors with their entry counts
  return {
    invalidActors: invalidActors.rows, // Actors not found in users table
    totalInvalid: invalidActors.rows.length,
  };
}

// ============================================================
// Get recent audit entries for display
// ============================================================
async function getRecentEntries(options) {
  // Build dynamic WHERE clause from filters
  const conditions = []; // Array of WHERE conditions
  const params = []; // Parameterized query values
  let paramIndex = 1; // Parameter counter

  // Apply entity type filter
  if (options.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    params.push(options.entityType);
  }

  // Apply actor filter
  if (options.actorId) {
    conditions.push(`changed_by = $${paramIndex++}`);
    params.push(options.actorId);
  }

  // Apply date filter
  if (options.since) {
    conditions.push(`changed_at >= $${paramIndex++}`);
    params.push(new Date(options.since));
  }

  // Build the WHERE clause
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Add limit parameter
  params.push(Math.min(options.limit, 500)); // Cap at 500

  // Execute the query
  const result = await query(
    `SELECT audit_id, entity_type, entity_id, action,
            changed_by, changed_at, request_id
     FROM entity_change_audit
     ${whereClause}
     ORDER BY changed_at DESC
     LIMIT $${paramIndex}`,
    params,
  );

  return result.rows; // Return the audit entries
}

// ============================================================
// Print the full report
// ============================================================
async function printReport(options) {
  // Track the start time for performance measurement
  const startTime = Date.now();

  // Print the header
  printHeader("PEMM AUDIT VERIFICATION REPORT");

  // Show the timestamp
  console.log(
    `  ${COLORS.dim}Timestamp: ${new Date().toISOString()}${COLORS.reset}`,
  );

  // Show applied filters
  if (options.entityType || options.actorId || options.since) {
    console.log(`  ${COLORS.dim}Filters:${COLORS.reset}`);
    if (options.entityType)
      console.log(`    Entity type: ${options.entityType}`);
    if (options.actorId) console.log(`    Actor: ${options.actorId}`);
    if (options.since) console.log(`    Since: ${options.since}`);
  }

  // ---- Section 1: Summary Statistics ----
  printHeader("SUMMARY STATISTICS");

  const summary = await getAuditSummary(options);

  // Total entries
  console.log(
    `  Total audit entries: ${COLORS.bold}${summary.total}${COLORS.reset}`,
  );

  // Date range
  if (summary.earliest && summary.latest) {
    console.log(
      `  Date range: ${summary.earliest.toISOString().split("T")[0]} — ${summary.latest.toISOString().split("T")[0]}`,
    );
  }

  // By entity type
  if (summary.byType.length > 0) {
    console.log(`\n  ${COLORS.bold}By Entity Type:${COLORS.reset}`);
    for (const row of summary.byType) {
      console.log(`    ${row.entity_type}: ${row.count}`);
    }
  }

  // By action
  if (summary.byAction.length > 0) {
    console.log(`\n  ${COLORS.bold}By Action:${COLORS.reset}`);
    for (const row of summary.byAction) {
      console.log(`    ${row.action}: ${row.count}`);
    }
  }

  // Top actors
  if (summary.topActors.length > 0) {
    console.log(`\n  ${COLORS.bold}Top 10 Actors:${COLORS.reset}`);
    for (const row of summary.topActors) {
      const label =
        row.changed_by === "system"
          ? "system"
          : row.changed_by.substring(0, 12) + "...";
      console.log(`    ${label}: ${row.count} changes`);
    }
  }

  // ---- Section 2: Consistency Checks ----
  let issuesFound = 0; // Track total issues for exit code

  printHeader("CONSISTENCY CHECKS");

  // Check orphaned entries
  console.log(`  ${COLORS.bold}Orphaned Audit Entries:${COLORS.reset}`);
  const orphaned = await checkOrphanedEntries();

  if (orphaned.totalOrphaned === 0) {
    console.log(
      `    ${COLORS.green}✓ No orphaned entries found${COLORS.reset}`,
    );
  } else {
    issuesFound += orphaned.totalOrphaned;
    console.log(
      `    ${COLORS.yellow}⚠ ${orphaned.totalOrphaned} orphaned entries found${COLORS.reset}`,
    );
    if (orphaned.orphanedPersons.length > 0) {
      console.log(`      Persons: ${orphaned.orphanedPersons.join(", ")}`);
    }
    if (orphaned.orphanedProjects.length > 0) {
      console.log(`      Projects: ${orphaned.orphanedProjects.join(", ")}`);
    }
  }

  // Check missing audit trails
  console.log(`\n  ${COLORS.bold}Missing Audit Trails:${COLORS.reset}`);
  const missing = await checkMissingAuditTrails();

  if (missing.totalMissing === 0) {
    console.log(
      `    ${COLORS.green}✓ All entities have CREATE audit entries${COLORS.reset}`,
    );
  } else {
    issuesFound += missing.totalMissing;
    console.log(
      `    ${COLORS.yellow}⚠ ${missing.totalMissing} entities missing CREATE audit entry${COLORS.reset}`,
    );
    if (missing.personsWithoutCreate.length > 0) {
      console.log(
        `      Persons without CREATE: ${missing.personsWithoutCreate.length}`,
      );
    }
    if (missing.projectsWithoutCreate.length > 0) {
      console.log(
        `      Projects without CREATE: ${missing.projectsWithoutCreate.length}`,
      );
    }
  }

  // Check actor validity
  console.log(`\n  ${COLORS.bold}Actor Validity:${COLORS.reset}`);
  const actors = await checkActorValidity();

  if (actors.totalInvalid === 0) {
    console.log(
      `    ${COLORS.green}✓ All actors are valid users or 'system'${COLORS.reset}`,
    );
  } else {
    issuesFound += actors.totalInvalid;
    console.log(
      `    ${COLORS.yellow}⚠ ${actors.totalInvalid} unknown actors found${COLORS.reset}`,
    );
    for (const actor of actors.invalidActors) {
      console.log(`      ${actor.changed_by}: ${actor.entry_count} entries`);
    }
  }

  // ---- Section 3: Recent Entries ----
  if (options.verbose) {
    printHeader("RECENT AUDIT ENTRIES");

    const entries = await getRecentEntries(options);

    if (entries.length === 0) {
      console.log(
        `  ${COLORS.dim}No entries found matching filters${COLORS.reset}`,
      );
    } else {
      for (const entry of entries) {
        const date = entry.changed_at.toISOString().split("T")[0]; // Date portion
        const time = entry.changed_at.toISOString().split("T")[1].split(".")[0]; // Time portion
        const actor =
          entry.changed_by === "system"
            ? "system"
            : entry.changed_by.substring(0, 8) + "...";

        console.log(
          `  ${COLORS.dim}${date} ${time}${COLORS.reset} ${COLORS.bold}${entry.action}${COLORS.reset} ${entry.entity_type}/${entry.entity_id.substring(0, 8)}... by ${actor}`,
        );
      }
    }
  }

  // ---- Final Summary ----
  printHeader("VERIFICATION RESULT");

  // Calculate elapsed time
  const elapsed = Date.now() - startTime;

  if (issuesFound === 0) {
    console.log(
      `  ${COLORS.green}${COLORS.bold}✓ ALL AUDIT CHECKS PASSED${COLORS.reset}`,
    );
  } else {
    console.log(
      `  ${COLORS.yellow}${COLORS.bold}⚠ ${issuesFound} ISSUE(S) FOUND${COLORS.reset}`,
    );
    console.log(
      `  ${COLORS.dim}Review the details above and investigate any anomalies${COLORS.reset}`,
    );
  }

  console.log(`\n  ${COLORS.dim}Completed in ${elapsed}ms${COLORS.reset}\n`);

  // Return the full report for JSON output and exit code
  return {
    summary, // Statistics
    orphaned, // Orphaned entries
    missing, // Missing audit trails
    actors, // Actor validity
    issuesFound, // Total issues
    elapsedMs: elapsed, // Runtime
    timestamp: new Date().toISOString(), // When the check ran
  };
}

// ============================================================
// Main entry point
// ============================================================
async function main() {
  // Parse the command-line arguments
  const options = parseArgs();

  // Show help and exit if requested
  if (options.help) {
    printHelp();
    process.exit(0); // Exit with success
  }

  try {
    // Run the full verification report
    const report = await printReport(options);

    // Output JSON if requested
    if (options.jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    }

    // Exit code: 0 if clean, 1 if issues found
    process.exit(report.issuesFound > 0 ? 1 : 0);
  } catch (error) {
    // Print the error message
    console.error(
      `\n${COLORS.red}${COLORS.bold}ERROR:${COLORS.reset} ${error.message}`,
    );

    // Show stack trace in verbose mode
    if (parseArgs().verbose) {
      console.error(`\n${COLORS.dim}${error.stack}${COLORS.reset}`);
    }

    // Exit with error code 2 (script failure)
    process.exit(2);
  } finally {
    // Always close the database pool when done
    try {
      await pool.end(); // Release all database connections
    } catch (e) {
      // Ignore pool close errors — we're exiting anyway
    }
  }
}

// ============================================================
// Run the main function
// ============================================================
main();
