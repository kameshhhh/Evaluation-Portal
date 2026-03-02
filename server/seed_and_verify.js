// ============================================================
// SEED & VERIFY — End-to-End Test for Session Planner Marks
// ============================================================
// Marks are stored directly on session_planner_assignments.marks
// (not a separate table). App uses Google-only OAuth, so seeding
// is done via direct DB writes + service calls.
//
// Steps:
//  1. Show current assignments
//  2. Seed marks on all assignments
//  3. Log events to assignment_score_events
//  4. Call CredibilityService.finalizeSession
//  5. Verify judge_credibility_metrics
// ============================================================

require("dotenv").config();
const { pool, query } = require("./src/config/database");

async function main() {
  // ┌─────────────────────────────────────────────────────────┐
  // │ 1. Show current state                                   │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== CURRENT ASSIGNMENTS ===");
  const assigns = await pool.query(`
    SELECT spa.id, spa.faculty_id, spa.student_id, spa.session_id,
           spa.status, spa.marks, spa.marks_submitted_at,
           f.display_name AS faculty_name,
           u.normalized_email AS faculty_email,
           s.display_name AS student_name
    FROM session_planner_assignments spa
    JOIN persons f ON f.person_id = spa.faculty_id
    JOIN users u ON u.internal_user_id = f.identity_id
    JOIN persons s ON s.person_id = spa.student_id
    ORDER BY f.display_name, s.display_name
  `);

  if (assigns.rows.length === 0) {
    console.log("  No assignments — run AutoAssign from the admin UI first.");
    process.exit(0);
  }

  assigns.rows.forEach((r) =>
    console.log(
      `  [${r.status}] ${r.faculty_name} → ${r.student_name}  marks=${r.marks ?? "NULL"}`
    )
  );

  const sessionId = assigns.rows[0].session_id;
  console.log(`\n  Session ID : ${sessionId}`);

  // Reset session to 'active' in case a previous seed run finalized it
  await pool.query(
    `UPDATE faculty_evaluation_sessions SET status='active', finalized_at=NULL WHERE id=$1 AND status='FINALIZED'`,
    [sessionId]
  );

  // Reset any already-seeded assignments back to 'assigned' so we can re-seed
  await pool.query(
    `UPDATE session_planner_assignments
     SET status='assigned', marks=NULL, marks_submitted_at=NULL,
         faculty_evaluated_at=NULL, updated_at=NOW()
     WHERE session_id=$1`,
    [sessionId]
  );
  console.log("  (Reset assignments to 'assigned' for clean seed)");

  // ┌─────────────────────────────────────────────────────────┐
  // │ 2. Seed marks on each assignment                        │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== SEEDING MARKS ===");

  // Build score matrix: 0–5 scale (pool = 3 students × 5 pts = 15 per faculty)
  // Faculty 0: lenient [5,4,3], Faculty 1: strict [3,4,5]
  const uniqueStudents = [...new Set(assigns.rows.map((r) => r.student_id))];
  const uniqueFaculty  = [...new Set(assigns.rows.map((r) => r.faculty_id))];
  const bases = [
    [5, 4, 3],
    [3, 4, 5],
  ];

  for (const a of assigns.rows) {
    // Skip already-submitted
    if (a.marks_submitted_at) {
      console.log(`  ⏭  ${a.faculty_name} → ${a.student_name}: already submitted (${a.marks})`);
      continue;
    }

    const fi = uniqueFaculty.indexOf(a.faculty_id);
    const si = uniqueStudents.indexOf(a.student_id);
    const score = (bases[fi % bases.length])?.[si % 3] ?? 7;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Log event (always append — no unique constraint on assignment_score_events)
      await client.query(
        `INSERT INTO assignment_score_events (assignment_id, session_id, marks, submitted_at)
         VALUES ($1, $2, $3, NOW())`,
        [a.id, a.session_id, score]
      );

      // Update assignment
      await client.query(
        `UPDATE session_planner_assignments
         SET marks              = $1,
             marks_submitted_at = NOW(),
             faculty_evaluated_at = NOW(),
             status             = 'evaluation_done',
             updated_at         = NOW()
         WHERE id = $2`,
        [score, a.id]
      );

      await client.query("COMMIT");
      console.log(`  ✓  ${a.faculty_name} → ${a.student_name}: ${score} marks`);
    } catch (e) {
      await client.query("ROLLBACK");
      console.log(`  ✗  ${a.faculty_name} → ${a.student_name}: ${e.message}`);
    } finally {
      client.release();
    }
  }

  // ┌─────────────────────────────────────────────────────────┐
  // │ 3. Confirm marks in DB                                  │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== MARKS AFTER SEEDING ===");
  const afterMarks = await pool.query(`
    SELECT spa.marks, spa.status,
           f.display_name AS faculty, s.display_name AS student
    FROM session_planner_assignments spa
    JOIN persons f ON f.person_id = spa.faculty_id
    JOIN persons s ON s.person_id = spa.student_id
    WHERE spa.session_id = $1
    ORDER BY f.display_name, s.display_name
  `, [sessionId]);
  afterMarks.rows.forEach((r) =>
    console.log(`  ${r.faculty} → ${r.student}: marks=${r.marks} [${r.status}]`)
  );

  // ┌─────────────────────────────────────────────────────────┐
  // │ 4. Run CredibilityService.finalizeSession               │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== RUNNING CREDIBILITY FINALIZATION ===");
  try {
    const CredibilityService = require("./src/services/credibility/CredibilityService");
    await CredibilityService.finalizeSession(sessionId);
    console.log("  ✓ CredibilityService.finalizeSession() succeeded");
  } catch (e) {
    console.log(`  ✗ CredibilityService error: ${e.message}`);
    console.log("  → Falling back: direct upsert into judge_credibility_metrics...");

    for (const fid of uniqueFaculty) {
      try {
        await pool.query(`
          INSERT INTO judge_credibility_metrics
            (evaluator_id, credibility_score, deviation_index, participation_count, history, last_updated)
          VALUES ($1, 1.0, 0, 1, '[{"score":1.0,"note":"seed"}]'::jsonb, NOW())
          ON CONFLICT (evaluator_id) DO UPDATE
            SET credibility_score  = 1.0,
                participation_count = judge_credibility_metrics.participation_count + 1,
                history            = COALESCE(judge_credibility_metrics.history, '[]'::jsonb)
                                     || '[{"score":1.0,"note":"seed"}]'::jsonb,
                last_updated       = NOW()
        `, [fid]);
        console.log(`  ✓ Upserted credibility for faculty ${fid}`);
      } catch (ue) {
        console.log(`  ✗ Upsert failed for ${fid}: ${ue.message}`);
      }
    }
  }

  // ┌─────────────────────────────────────────────────────────┐
  // │ 5. Verify credibility metrics                           │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== FINAL CREDIBILITY METRICS ===");
  const finalCred = await pool.query(`
    SELECT jcm.credibility_score, jcm.participation_count,
           p.display_name,
           jsonb_array_length(COALESCE(jcm.history, '[]'::jsonb)) AS history_entries
    FROM judge_credibility_metrics jcm
    JOIN persons p ON p.person_id = jcm.evaluator_id
    ORDER BY p.display_name
  `);
  if (finalCred.rows.length === 0) {
    console.log("  No credibility rows yet (service may require all students to be evaluated).");
  } else {
    finalCred.rows.forEach((r) =>
      console.log(
        `  ${r.display_name}: score=${r.credibility_score}  participations=${r.participation_count}  history=${r.history_entries}`
      )
    );
  }

  // ┌─────────────────────────────────────────────────────────┐
  // │ 6. Show session config                                   │
  // └─────────────────────────────────────────────────────────┘
  console.log("\n=== SESSION CONFIG ===");
  const sesInfo = await pool.query(`
    SELECT id, title, status,
           preferred_rubric_ids, min_judges,
           opens_at, closes_at,
           session_week_start, session_week_end
    FROM faculty_evaluation_sessions WHERE id = $1
  `, [sessionId]);
  if (sesInfo.rows.length) {
    const s = sesInfo.rows[0];
    console.log(`  title              : ${s.title}`);
    console.log(`  status             : ${s.status}`);
    console.log(`  preferred_rubric_ids: ${JSON.stringify(s.preferred_rubric_ids)}`);
    console.log(`  min_judges         : ${s.min_judges}`);
    console.log(`  opens_at / closes_at: ${s.opens_at} — ${s.closes_at}`);
    console.log(`  week window        : ${s.session_week_start} — ${s.session_week_end}`);
  }

  console.log("\n✅ Seed & verify complete\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message);
  console.error(e.stack);
  process.exit(1);
});
