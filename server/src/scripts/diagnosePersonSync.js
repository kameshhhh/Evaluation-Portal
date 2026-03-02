// ============================================================
// DATA SYNC DIAGNOSTIC — Verify Person Records & Data Integrity
// ============================================================
// Run this script to check the current state of the data sync
// between the users table and the persons table.
//
// USAGE:
//   node server/src/scripts/diagnosePesonSync.js
//
// WHAT IT CHECKS:
//   1. Total users vs total persons (should match for active users)
//   2. Users without person records (the core data gap)
//   3. Orphan project_members (referencing non-existent persons)
//   4. Person type distribution (student/faculty/admin)
//   5. Department coverage (which departments have students)
//   6. Whether last_login_at column exists on users table
//
// This script is READ-ONLY — it does NOT modify any data.
// ============================================================

// Load environment variables for database connection
require("dotenv").config();

// Import database connection pool
const { query } = require("../config/database");

// ============================================================
// Main diagnostic function
// ============================================================
async function runDiagnostics() {
  console.log("\n============================================");
  console.log("  DATA SYNC DIAGNOSTIC REPORT");
  console.log("============================================\n");

  try {
    // ---------------------------------------------------------
    // CHECK 1: Total users vs total persons
    // ---------------------------------------------------------
    const usersResult = await query(
      "SELECT COUNT(*) as total, COUNT(CASE WHEN is_active THEN 1 END) as active FROM users",
    );
    const personsResult = await query(
      "SELECT COUNT(*) as total, COUNT(CASE WHEN NOT is_deleted THEN 1 END) as active FROM persons",
    );

    const userCount = parseInt(usersResult.rows[0].total, 10);
    const activeUsers = parseInt(usersResult.rows[0].active, 10);
    const personCount = parseInt(personsResult.rows[0].total, 10);
    const activePersons = parseInt(personsResult.rows[0].active, 10);

    console.log("1. USER vs PERSON COUNT:");
    console.log(`   Total users:    ${userCount} (active: ${activeUsers})`);
    console.log(`   Total persons:  ${personCount} (active: ${activePersons})`);
    console.log(
      `   Status:         ${activeUsers === activePersons ? "✅ MATCH" : "❌ MISMATCH — run migration 011"}`,
    );
    console.log();

    // ---------------------------------------------------------
    // CHECK 2: Users without person records
    // ---------------------------------------------------------
    const unlinkedResult = await query(`
      SELECT u.internal_user_id, u.normalized_email, u.user_role, u.is_active
      FROM users u
      LEFT JOIN persons p ON p.identity_id = u.internal_user_id
      WHERE p.person_id IS NULL AND u.is_active = true
      ORDER BY u.created_at DESC
      LIMIT 20
    `);

    const unlinkedCount = unlinkedResult.rows.length;
    console.log("2. USERS WITHOUT PERSON RECORDS:");
    console.log(`   Count: ${unlinkedCount}`);
    if (unlinkedCount > 0) {
      console.log(
        "   ❌ These users are INVISIBLE to Faculty/Admin dashboards:",
      );
      unlinkedResult.rows.forEach((u) => {
        console.log(`      - ${u.normalized_email} (role: ${u.user_role})`);
      });
    } else {
      console.log("   ✅ All active users have person records");
    }
    console.log();

    // ---------------------------------------------------------
    // CHECK 3: Orphan project_members
    // ---------------------------------------------------------
    const orphanResult = await query(`
      SELECT COUNT(*) as count
      FROM project_members pm
      LEFT JOIN persons p ON pm.person_id = p.person_id
      WHERE p.person_id IS NULL
    `);

    const orphanCount = parseInt(orphanResult.rows[0].count, 10);
    console.log("3. ORPHAN PROJECT MEMBERS:");
    console.log(`   Count: ${orphanCount}`);
    console.log(
      `   Status: ${orphanCount === 0 ? "✅ All references valid" : "❌ Broken FK references found"}`,
    );
    console.log();

    // ---------------------------------------------------------
    // CHECK 4: Person type distribution
    // ---------------------------------------------------------
    const typeResult = await query(`
      SELECT person_type, COUNT(*) as count
      FROM persons
      WHERE is_deleted = false
      GROUP BY person_type
      ORDER BY count DESC
    `);

    console.log("4. PERSON TYPE DISTRIBUTION:");
    if (typeResult.rows.length === 0) {
      console.log("   ❌ No person records found — the persons table is EMPTY");
    } else {
      typeResult.rows.forEach((r) => {
        console.log(`   ${r.person_type}: ${r.count}`);
      });
    }
    console.log();

    // ---------------------------------------------------------
    // CHECK 5: Department coverage
    // ---------------------------------------------------------
    const deptResult = await query(`
      SELECT department_code, COUNT(*) as student_count
      FROM persons
      WHERE person_type = 'student' AND is_deleted = false AND department_code IS NOT NULL
      GROUP BY department_code
      ORDER BY student_count DESC
    `);

    console.log("5. DEPARTMENT STUDENT COUNTS:");
    if (deptResult.rows.length === 0) {
      console.log("   ❌ No students with department codes found");
    } else {
      deptResult.rows.forEach((r) => {
        console.log(
          `   ${r.department_code || "(null)"}: ${r.student_count} students`,
        );
      });
    }
    console.log();

    // ---------------------------------------------------------
    // CHECK 6: last_login_at column existence
    // ---------------------------------------------------------
    const colResult = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'last_login_at'
    `);

    const hasColumn = colResult.rows.length > 0;
    console.log("6. LAST_LOGIN_AT COLUMN:");
    console.log(
      `   Status: ${hasColumn ? "✅ EXISTS — Faculty students query will work" : "❌ MISSING — run migration 011 to add it"}`,
    );
    console.log();

    // ---------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------
    const issues = [];
    if (unlinkedCount > 0)
      issues.push(`${unlinkedCount} users without person records`);
    if (orphanCount > 0) issues.push(`${orphanCount} orphan project_members`);
    if (!hasColumn) issues.push("last_login_at column missing");

    console.log("============================================");
    if (issues.length === 0) {
      console.log("  ✅ ALL CHECKS PASSED — Data is synced correctly");
    } else {
      console.log("  ❌ ISSUES FOUND:");
      issues.forEach((i) => console.log(`     - ${i}`));
      console.log("\n  FIX: Run migration 011_fix_person_data_sync.sql");
    }
    console.log("============================================\n");
  } catch (error) {
    console.error("Diagnostic failed:", error.message);
  } finally {
    // Close the database pool
    process.exit(0);
  }
}

// Run the diagnostics
runDiagnostics();
