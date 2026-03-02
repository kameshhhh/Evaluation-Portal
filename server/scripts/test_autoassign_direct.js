// Test auto-assign directly against the database
const { query, getClient } = require("../src/config/database");
const AutoAssignmentService = require("../src/services/autoAssignmentService");

(async () => {
  const sessionId = "a1b318aa-5654-4a31-90d8-3ebfec942820";

  // Check current state
  const session = await query(`SELECT id, title, auto_suggested, status FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]);
  console.log("Session:", JSON.stringify(session.rows[0]));

  const existing = await query(`SELECT COUNT(*) as cnt FROM session_planner_assignments WHERE session_id = $1 AND status != 'removed'`, [sessionId]);
  console.log("Existing assignments:", existing.rows[0].cnt);

  // If auto_suggested is true and there are assignments, clear them first
  if (parseInt(existing.rows[0].cnt) > 0) {
    console.log("Clearing existing assignments...");
    await query(`DELETE FROM session_planner_assignments WHERE session_id = $1`, [sessionId]);
    await query(`UPDATE faculty_evaluation_sessions SET auto_suggested = FALSE WHERE id = $1`, [sessionId]);
  } else if (session.rows[0].auto_suggested) {
    console.log("Resetting auto_suggested flag...");
    await query(`UPDATE faculty_evaluation_sessions SET auto_suggested = FALSE WHERE id = $1`, [sessionId]);
  }

  // Run auto-assign
  console.log("\nRunning assignBatch...");
  const actorId = "977c5000-c340-43d1-ba11-480a9b6dc16f"; // Kamesh admin
  const result = await AutoAssignmentService.assignBatch(sessionId, actorId, 'test_auto', 2);
  console.log("Result:", JSON.stringify(result));

  // Show created assignments
  const assignments = await query(
    `SELECT spa.faculty_id, p_f.display_name as faculty_name, spa.student_id, p_s.display_name as student_name, spa.status
     FROM session_planner_assignments spa
     JOIN persons p_f ON p_f.person_id = spa.faculty_id
     JOIN persons p_s ON p_s.person_id = spa.student_id
     WHERE spa.session_id = $1 AND spa.status != 'removed'
     ORDER BY p_s.display_name, p_f.display_name`,
    [sessionId]
  );
  console.log(`\n${assignments.rows.length} assignments created:`);
  assignments.rows.forEach(a => console.log(`  ${a.student_name} ← ${a.faculty_name} (${a.status})`));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
