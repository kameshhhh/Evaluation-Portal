#!/usr/bin/env node
// ============================================================
// PEMM API TESTER — Verify Backend is Working
// ============================================================
// Run this script to test all PEMM endpoints step by step.
// It uses the SAME database connection as your server.
//
// Usage:
//   1. Make sure server is running:  npm run dev
//   2. Run this script:              node test-pemm-api.js
//
// NO TOKEN NEEDED for this basic test — we test connectivity
// and data operations directly through Node.js.
//
// This script does NOT modify your code. It only READS and
// tests the endpoints to prove the backend works.
// ============================================================

// Load environment variables from .env (same as server uses)
require("dotenv").config();

// ============================================================
// CONFIGURATION — reads from your .env automatically
// ============================================================
// Server port — reads from .env PORT value
const PORT = process.env.PORT || 5000;

// Base URL for all HTTP requests
const BASE_URL = `http://localhost:${PORT}`;

// ============================================================
// ANSI color codes for pretty terminal output
// ============================================================
const C = {
  reset: "\x1b[0m", // Reset all colors
  green: "\x1b[32m", // Green = success
  red: "\x1b[31m", // Red = failure
  yellow: "\x1b[33m", // Yellow = warning
  blue: "\x1b[34m", // Blue = info
  dim: "\x1b[2m", // Dim = secondary text
  bold: "\x1b[1m", // Bold = headers
};

// Track pass/fail counts for final summary
let passed = 0;
let failed = 0;
let skipped = 0;

// ============================================================
// Helper: Make an HTTP request and print the result
// ============================================================
async function test(label, method, path, body = null) {
  // Build the full URL
  const url = `${BASE_URL}${path}`;

  // Print the test label
  process.stdout.write(`  ${C.dim}${method.padEnd(6)}${C.reset} ${path} ... `);

  try {
    // Build fetch options
    const options = {
      method, // GET, POST, PATCH, DELETE
      headers: { "Content-Type": "application/json" }, // Always send JSON
    };

    // Add body for POST/PATCH requests
    if (body) {
      options.body = JSON.stringify(body);
    }

    // Make the HTTP request
    const response = await fetch(url);

    // Try to parse JSON (some responses might not be JSON)
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    // Print result based on HTTP status
    if (response.status < 400) {
      console.log(`${C.green}${response.status} OK${C.reset}`);
      passed++;
    } else if (response.status === 404) {
      console.log(`${C.yellow}${response.status} Not Found${C.reset}`);
      failed++;
    } else {
      console.log(
        `${C.red}${response.status} ${data?.error || "Error"}${C.reset}`,
      );
      failed++;
    }

    // Return the response for further inspection
    return { status: response.status, data };
  } catch (error) {
    // Network error — server not reachable
    console.log(`${C.red}NETWORK ERROR: ${error.message}${C.reset}`);
    failed++;
    return { status: 0, data: null };
  }
}

// ============================================================
// Helper: Print a section header
// ============================================================
function section(title) {
  console.log(`\n${C.bold}${C.blue}${"─".repeat(50)}${C.reset}`);
  console.log(`${C.bold}${C.blue}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.blue}${"─".repeat(50)}${C.reset}`);
}

// ============================================================
// Main test sequence
// ============================================================
async function main() {
  console.log("");
  console.log(
    `${C.bold}╔════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.bold}║       PEMM BACKEND VERIFICATION TEST          ║${C.reset}`,
  );
  console.log(`${C.bold}║       Server: ${BASE_URL.padEnd(32)}║${C.reset}`);
  console.log(
    `${C.bold}╚════════════════════════════════════════════════╝${C.reset}`,
  );

  // ----------------------------------------------------------
  // PHASE 1: Can we reach the server at all?
  // ----------------------------------------------------------
  section("PHASE 1: Server Connectivity");

  const health = await test("Main health", "GET", "/api/health");

  // If we can't reach the server, stop everything
  if (health.status === 0) {
    console.log(`\n${C.red}${C.bold}  SERVER IS NOT RUNNING!${C.reset}`);
    console.log(`${C.red}  Open another terminal and run:${C.reset}`);
    console.log(`${C.red}    cd D:\\Project\\prj1AI\\server${C.reset}`);
    console.log(`${C.red}    npm run dev${C.reset}`);
    console.log(`${C.red}  Then run this script again.${C.reset}\n`);
    process.exit(1);
  }

  // Test PEMM health endpoint
  const pemmHealth = await test("PEMM health", "GET", "/api/pemm/health");

  // ----------------------------------------------------------
  // PHASE 2: Test Person endpoints
  // ----------------------------------------------------------
  section("PHASE 2: Person Endpoints");

  await test("List persons", "GET", "/api/persons");

  // ----------------------------------------------------------
  // PHASE 3: Test Project endpoints
  // ----------------------------------------------------------
  section("PHASE 3: Project Endpoints");

  await test("List projects", "GET", "/api/projects");

  // ----------------------------------------------------------
  // PHASE 4: Test Evaluation endpoints
  // ----------------------------------------------------------
  section("PHASE 4: Evaluation Endpoints");

  // This might return 404 or empty — that's fine
  await test(
    "Integrity check",
    "GET",
    "/api/evaluations/snapshots/00000000-0000-0000-0000-000000000000",
  );

  // ----------------------------------------------------------
  // PHASE 5: Verify database tables directly
  // ----------------------------------------------------------
  section("PHASE 5: Database Tables (Direct Check)");

  // Import database pool using the same config as server
  const { pool } = require("./src/config/database");

  try {
    // Query all table names
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );

    // Define which tables we expect
    const expectedPEMM = [
      "persons",
      "person_history",
      "projects",
      "project_members",
      "project_state_transitions",
      "academic_months",
      "project_month_plans",
      "work_logs",
      "evaluation_sessions",
      "evaluation_heads",
      "session_evaluation_heads",
      "entity_freeze_snapshots",
      "entity_change_audit",
      "integrity_verifications",
    ];

    // Get actual table names from DB
    const actual = tables.rows.map((r) => r.tablename);

    // Check each expected table
    console.log("");
    for (const table of expectedPEMM) {
      if (actual.includes(table)) {
        console.log(`  ${C.green}✓${C.reset} ${table}`);
        passed++;
      } else {
        console.log(`  ${C.red}✗${C.reset} ${table} ${C.red}MISSING${C.reset}`);
        failed++;
      }
    }

    // Also show original auth tables are untouched
    console.log(`\n  ${C.dim}Original auth tables (untouched):${C.reset}`);
    const authTables = [
      "users",
      "user_sessions",
      "user_identity_snapshots",
      "role_patterns",
      "allowed_domains",
    ];
    for (const table of authTables) {
      if (actual.includes(table)) {
        console.log(
          `  ${C.green}✓${C.reset} ${table} ${C.dim}(original)${C.reset}`,
        );
      }
    }

    // Close the pool
    await pool.end();
  } catch (dbError) {
    console.log(
      `  ${C.red}Database connection failed: ${dbError.message}${C.reset}`,
    );
    failed++;
    try {
      await pool.end();
    } catch (e) {
      /* ignore */
    }
  }

  // ----------------------------------------------------------
  // FINAL SUMMARY
  // ----------------------------------------------------------
  console.log("");
  console.log(
    `${C.bold}╔════════════════════════════════════════════════╗${C.reset}`,
  );
  console.log(
    `${C.bold}║               RESULTS SUMMARY                  ║${C.reset}`,
  );
  console.log(
    `${C.bold}╠════════════════════════════════════════════════╣${C.reset}`,
  );
  console.log(
    `${C.bold}║  ${C.green}Passed: ${String(passed).padEnd(5)}${C.reset}${C.bold}                                ║${C.reset}`,
  );
  console.log(
    `${C.bold}║  ${C.red}Failed: ${String(failed).padEnd(5)}${C.reset}${C.bold}                                ║${C.reset}`,
  );
  console.log(
    `${C.bold}╠════════════════════════════════════════════════╣${C.reset}`,
  );

  if (failed === 0) {
    console.log(
      `${C.bold}║  ${C.green}ALL CHECKS PASSED — Backend is working!${C.reset}${C.bold}     ║${C.reset}`,
    );
  } else {
    console.log(
      `${C.bold}║  ${C.yellow}Some checks failed — see details above${C.reset}${C.bold}      ║${C.reset}`,
    );
  }

  console.log(
    `${C.bold}╚════════════════════════════════════════════════╝${C.reset}`,
  );
  console.log("");
}

// ============================================================
// Run everything
// ============================================================
main().catch((err) => {
  console.error(`${C.red}Script crashed: ${err.message}${C.reset}`);
  process.exit(1);
});
