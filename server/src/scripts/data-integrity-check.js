#!/usr/bin/env node
// ============================================================
// DATA INTEGRITY CHECK — CLI Tool for Hash Chain Verification
// ============================================================
// Command-line utility that verifies the cryptographic integrity
// of all hash chains stored in the PEMM database.
//
// What it checks:
//   1. Person history chains — detect tampered person records
//   2. Freeze snapshot chains — detect modified frozen states
//   3. Overall statistics — summary report
//
// Usage:
//   node src/scripts/data-integrity-check.js              # Full check
//   node src/scripts/data-integrity-check.js --person <id> # Single person
//   node src/scripts/data-integrity-check.js --project <id> # Single project
//   node src/scripts/data-integrity-check.js --json         # JSON output
//
// Exit codes:
//   0 — All integrity checks passed
//   1 — One or more integrity checks failed (TAMPERING DETECTED)
//   2 — Script error (DB connection, invalid args, etc.)
//
// IMPORTANT: This script connects to the production database.
// Always run with read-only intent. It does NOT modify data.
// ============================================================

// Load environment variables from .env file
require("dotenv").config();

// Import the database pool for raw queries
const { query, pool } = require("../config/database");

// Import the EntityIntegrityService for hash chain verification
const EntityIntegrityService = require("../services/EntityIntegrityService");

// Import the HashChainService for low-level hash operations
const HashChainService = require("../lib/immutable/HashChainService");

// ============================================================
// ANSI color codes for terminal output
// ============================================================
const COLORS = {
  reset: "\x1b[0m", // Reset all formatting
  red: "\x1b[31m", // Red text for failures
  green: "\x1b[32m", // Green text for success
  yellow: "\x1b[33m", // Yellow text for warnings
  blue: "\x1b[34m", // Blue text for info
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
    personId: null, // Specific person to check (--person <id>)
    projectId: null, // Specific project to check (--project <id>)
    jsonOutput: false, // Output as JSON instead of human-readable (--json)
    verbose: false, // Show detailed chain data (--verbose)
    help: false, // Show help text (--help)
  };

  // Iterate through arguments and parse flags
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--person": // Check specific person by UUID
        options.personId = args[++i];
        break;
      case "--project": // Check specific project by UUID
        options.projectId = args[++i];
        break;
      case "--json": // Machine-readable JSON output
        options.jsonOutput = true;
        break;
      case "--verbose": // Detailed output with chain data
      case "-v":
        options.verbose = true;
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
${COLORS.bold}PEMM Data Integrity Check${COLORS.reset}
${COLORS.dim}Verifies cryptographic hash chains for all PEMM entities${COLORS.reset}

${COLORS.bold}USAGE:${COLORS.reset}
  node src/scripts/data-integrity-check.js [OPTIONS]

${COLORS.bold}OPTIONS:${COLORS.reset}
  --person <uuid>    Check only a specific person's history chain
  --project <uuid>   Check only a specific project's freeze snapshots
  --json             Output results as JSON (for CI/CD integration)
  --verbose, -v      Show detailed chain verification data
  --help, -h         Show this help text

${COLORS.bold}EXAMPLES:${COLORS.reset}
  # Full integrity check across all entities
  node src/scripts/data-integrity-check.js

  # Check one person with verbose output
  node src/scripts/data-integrity-check.js --person 550e8400-e29b-41d4-a716-446655440001 -v

  # JSON output for CI pipeline
  node src/scripts/data-integrity-check.js --json

${COLORS.bold}EXIT CODES:${COLORS.reset}
  0 — All checks passed (integrity intact)
  1 — Integrity violation(s) detected (TAMPERING)
  2 — Script error (connection failure, bad args)
`);
}

// ============================================================
// Print a section header line
// ============================================================
function printHeader(title) {
  // Print a separator line with the title centered
  const line = "═".repeat(60);
  console.log(`\n${COLORS.bold}${COLORS.blue}${line}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.blue}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.blue}${line}${COLORS.reset}\n`);
}

// ============================================================
// Format a check result for console output
// ============================================================
function printResult(label, result) {
  // Determine the status icon and color
  const icon = result.valid ? "✓" : "✗"; // Checkmark or X
  const color = result.valid ? COLORS.green : COLORS.red; // Green or red

  // Print the result line
  console.log(`  ${color}${icon}${COLORS.reset} ${label}`);
  console.log(
    `    ${COLORS.dim}Checks run: ${result.checksRun}${COLORS.reset}`,
  );

  // If failed, show failure details
  if (!result.valid) {
    console.log(
      `    ${COLORS.red}BROKEN AT: entry #${result.brokenAt}${COLORS.reset}`,
    );
    console.log(`    ${COLORS.red}Details: ${result.details}${COLORS.reset}`);
  }
}

// ============================================================
// Check a single person's integrity
// ============================================================
async function checkPerson(personId, verbose) {
  // Verify the person's history chain
  const result = await EntityIntegrityService.verifyPersonIntegrity(personId);

  // Print the result with person ID as label
  printResult(`Person ${personId}`, result);

  // If verbose, show the chain data
  if (verbose && result.checksRun > 0) {
    const historyResult = await query(
      `SELECT changed_at, current_hash, previous_hash
       FROM person_history
       WHERE person_id = $1
       ORDER BY changed_at ASC`,
      [personId],
    );

    // Print each chain entry
    for (const entry of historyResult.rows) {
      console.log(
        `    ${COLORS.dim}  ${entry.changed_at.toISOString()} hash=${entry.current_hash.substring(0, 12)}...${COLORS.reset}`,
      );
    }
  }

  return result; // Return the verification result
}

// ============================================================
// Check a single project's freeze snapshot integrity
// ============================================================
async function checkProject(projectId, verbose) {
  // Verify the project's freeze snapshot chain
  const result =
    await EntityIntegrityService.verifyFreezeSnapshotIntegrity(projectId);

  // Print the result with project ID as label
  printResult(`Project freeze snapshots ${projectId}`, result);

  // If verbose, show snapshot details
  if (verbose && result.checksRun > 0) {
    const snapshotResult = await query(
      `SELECT frozen_at, state_hash, session_id
       FROM entity_freeze_snapshots
       WHERE entity_type = 'project' AND entity_id = $1
       ORDER BY frozen_at ASC`,
      [projectId],
    );

    // Print each snapshot entry
    for (const snap of snapshotResult.rows) {
      console.log(
        `    ${COLORS.dim}  ${snap.frozen_at.toISOString()} session=${snap.session_id} hash=${snap.state_hash.substring(0, 12)}...${COLORS.reset}`,
      );
    }
  }

  return result; // Return the verification result
}

// ============================================================
// Run the full integrity check
// ============================================================
async function runFullCheck(options) {
  // Track the start time for performance measurement
  const startTime = Date.now();

  // Print the header
  printHeader("PEMM DATA INTEGRITY CHECK");

  // Show the timestamp and database info
  console.log(
    `  ${COLORS.dim}Timestamp: ${new Date().toISOString()}${COLORS.reset}`,
  );
  console.log(
    `  ${COLORS.dim}Database: ${process.env.DATABASE_URL ? "***connected***" : "using default"}${COLORS.reset}\n`,
  );

  // Call the full integrity check service
  const result =
    await EntityIntegrityService.runFullIntegrityCheck("cli-script");

  // Print results summary
  printHeader("RESULTS SUMMARY");

  // Total checks run
  console.log(
    `  Total entities checked: ${COLORS.bold}${result.totalChecks}${COLORS.reset}`,
  );

  // Passed count in green
  console.log(`  ${COLORS.green}Passed: ${result.passed}${COLORS.reset}`);

  // Failed count in red (or green if zero)
  if (result.failed > 0) {
    console.log(
      `  ${COLORS.red}${COLORS.bold}FAILED: ${result.failed}${COLORS.reset}`,
    );
  } else {
    console.log(`  ${COLORS.green}Failed: 0${COLORS.reset}`);
  }

  // Print failure details if any
  if (result.failures.length > 0) {
    printHeader("FAILURE DETAILS");
    for (const failure of result.failures) {
      console.log(
        `  ${COLORS.red}✗ ${failure.entityType} / ${failure.entityId}${COLORS.reset}`,
      );
      console.log(`    ${COLORS.dim}${failure.details}${COLORS.reset}`);
    }
  }

  // Calculate and print elapsed time
  const elapsed = Date.now() - startTime;
  console.log(`\n  ${COLORS.dim}Completed in ${elapsed}ms${COLORS.reset}\n`);

  // Return the aggregated result for exit code determination
  return result;
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
    let result; // Will hold the final result

    if (options.personId) {
      // Single person check mode
      printHeader("PERSON INTEGRITY CHECK");
      result = await checkPerson(options.personId, options.verbose);

      // Output JSON if requested
      if (options.jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Exit code based on validity
      process.exit(result.valid ? 0 : 1);
    } else if (options.projectId) {
      // Single project check mode
      printHeader("PROJECT FREEZE SNAPSHOT CHECK");
      result = await checkProject(options.projectId, options.verbose);

      // Output JSON if requested
      if (options.jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Exit code based on validity
      process.exit(result.valid ? 0 : 1);
    } else {
      // Full check mode — all entities
      result = await runFullCheck(options);

      // Output JSON if requested
      if (options.jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Exit code: 0 if all passed, 1 if any failed
      process.exit(result.failed > 0 ? 1 : 0);
    }
  } catch (error) {
    // Print the error message
    console.error(
      `\n${COLORS.red}${COLORS.bold}ERROR:${COLORS.reset} ${error.message}`,
    );

    // Show stack trace in verbose mode
    if (options.verbose) {
      console.error(`\n${COLORS.dim}${error.stack}${COLORS.reset}`);
    }

    // Exit with error code 2 (script failure, not integrity failure)
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
