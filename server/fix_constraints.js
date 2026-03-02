// Fix DB constraints and issues blocking submissions
require("dotenv").config();
const { pool } = require("./src/config/database");

(async () => {
  console.log("=== FIXING DB CONSTRAINTS ===\n");

  // 1. Drop old marks <= 5 constraint on assignment_score_events
  //    Rubric totals can exceed 5 (e.g. 3 rubrics × 5 pts = 15 max per student)
  try {
    await pool.query(`ALTER TABLE assignment_score_events DROP CONSTRAINT IF EXISTS assignment_score_events_marks_check`);
    console.log("✓ Dropped assignment_score_events_marks_check (was marks <= 5)");
  } catch (e) { console.log("✗", e.message); }

  try {
    await pool.query(`ALTER TABLE assignment_score_events ADD CONSTRAINT assignment_score_events_marks_valid CHECK (marks >= 0)`);
    console.log("✓ Added marks >= 0 constraint on assignment_score_events");
  } catch (e) {
    // Already exists
    console.log("  (marks >= 0 constraint already exists or skipped:", e.message, ")");
  }

  // 2. Verify final constraints
  const r = await pool.query(`
    SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'assignment_score_events' AND c.contype = 'c'
  `);
  console.log("\nFinal constraints on assignment_score_events:");
  r.rows.forEach(x => console.log(" ", x.name, ":", x.def));

  // 3. Check session_planner_assignments.marks for any constraints
  const r2 = await pool.query(`
    SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'session_planner_assignments' AND c.contype = 'c'
  `);
  console.log("\nConstraints on session_planner_assignments:");
  if (r2.rows.length === 0) console.log("  (none)");
  r2.rows.forEach(x => console.log(" ", x.name, ":", x.def));

  console.log("\n✅ Done");
  process.exit(0);
})().catch(e => { console.error("❌", e.message); process.exit(1); });
