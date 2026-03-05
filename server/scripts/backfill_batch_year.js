// ============================================================
// BACKFILL BATCH YEAR — Populate batch_year on existing data
// ============================================================
// Run: node server/scripts/backfill_batch_year.js
// Safe to run multiple times (idempotent).
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:kamesh123@localhost:5432/bitsathy_auth",
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("=== BATCH YEAR BACKFILL ===\n");

    // Step 1: Run the migration SQL
    console.log("1. Adding batch_year columns...");
    await client.query(`ALTER TABLE session_groups ADD COLUMN IF NOT EXISTS batch_year INTEGER`);
    await client.query(`ALTER TABLE faculty_evaluation_sessions ADD COLUMN IF NOT EXISTS batch_year INTEGER`);
    console.log("   ✓ Columns ensured.\n");

    // Step 2: Backfill session_groups
    console.log("2. Backfilling session_groups.batch_year from target_year...");
    const sgResult = await client.query(`
      UPDATE session_groups
      SET batch_year = CASE
        WHEN target_year = 'Final Year' THEN academic_year + 1
        WHEN target_year = '3rd Year'   THEN academic_year + 2
        WHEN target_year = '2nd Year'   THEN academic_year + 3
        WHEN target_year = '1st Year'   THEN academic_year + 4
        ELSE academic_year + 1
      END
      WHERE batch_year IS NULL AND academic_year IS NOT NULL
      RETURNING id, title, batch_year
    `);
    console.log(`   ✓ Updated ${sgResult.rowCount} session groups.`);
    sgResult.rows.forEach(r => console.log(`     - ${r.title} → batch ${r.batch_year}`));

    // Step 3: Backfill faculty_evaluation_sessions
    console.log("\n3. Backfilling faculty_evaluation_sessions.batch_year from parent group...");
    const fesResult = await client.query(`
      UPDATE faculty_evaluation_sessions fes
      SET batch_year = sg.batch_year
      FROM session_groups sg
      WHERE fes.group_id = sg.id
        AND fes.batch_year IS NULL
        AND sg.batch_year IS NOT NULL
      RETURNING fes.id, fes.title, fes.batch_year
    `);
    console.log(`   ✓ Updated ${fesResult.rowCount} evaluation sessions.`);
    fesResult.rows.forEach(r => console.log(`     - ${r.title} → batch ${r.batch_year}`));

    // Step 4: Verify persons.graduation_year (this IS batch_year)
    console.log("\n4. Verifying persons.graduation_year (= batch_year)...");
    const personsCheck = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE graduation_year IS NOT NULL AND person_type = 'student') as has_grad,
        COUNT(*) FILTER (WHERE graduation_year IS NULL AND person_type = 'student') as missing_grad,
        COUNT(*) FILTER (WHERE person_type = 'student') as total_students
      FROM persons WHERE is_deleted = false
    `);
    const pc = personsCheck.rows[0];
    console.log(`   Students: ${pc.total_students} total, ${pc.has_grad} have graduation_year, ${pc.missing_grad} missing.`);

    // Step 5: Backfill missing graduation_year from admission_year
    if (parseInt(pc.missing_grad) > 0) {
      console.log("   Backfilling missing graduation_year = admission_year + 4...");
      const fixResult = await client.query(`
        UPDATE persons
        SET graduation_year = admission_year + 4
        WHERE person_type = 'student'
          AND graduation_year IS NULL
          AND admission_year IS NOT NULL
          AND is_deleted = false
        RETURNING person_id, display_name, admission_year, graduation_year
      `);
      console.log(`   ✓ Fixed ${fixResult.rowCount} students.`);
      fixResult.rows.forEach(r => console.log(`     - ${r.display_name}: ${r.admission_year} → batch ${r.graduation_year}`));
    }

    // Step 6: Summary
    console.log("\n=== VERIFICATION ===");
    const verify = await client.query(`
      SELECT 
        sg.title, sg.batch_year, sg.target_year,
        COUNT(fes.id) as session_count
      FROM session_groups sg
      LEFT JOIN faculty_evaluation_sessions fes ON fes.group_id = sg.id
      GROUP BY sg.id
      ORDER BY sg.created_at DESC
    `);
    if (verify.rows.length > 0) {
      console.log("\nSession groups:");
      verify.rows.forEach(r => {
        console.log(`  ${r.title} | batch_year=${r.batch_year} | target_year=${r.target_year} | ${r.session_count} sessions`);
      });
    } else {
      console.log("\nNo session groups found (database was recently reset).");
    }

    console.log("\n✅ Backfill complete!");

  } catch (err) {
    console.error("❌ Backfill failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
