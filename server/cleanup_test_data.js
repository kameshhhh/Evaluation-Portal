require('dotenv').config();
const { query } = require('./src/config/database');

(async () => {
  console.log('=== CLEAN DB RESET (Keep structure, wipe eval data) ===\n');

  // 1. Delete all evaluation results & events
  const ev = await query('DELETE FROM assignment_score_events');
  console.log(`Deleted ${ev.rowCount} assignment_score_events`);

  const fsr = await query('DELETE FROM final_student_results');
  console.log(`Deleted ${fsr.rowCount} final_student_results`);

  // 2. Clear marks from assignments but keep assignment structure
  const spa = await query(`UPDATE session_planner_assignments SET 
    marks = NULL, 
    rubric_marks = NULL, 
    zero_feedback = NULL,
    marks_submitted_at = NULL,
    faculty_evaluated_at = NULL,
    status = 'assigned'
    WHERE marks IS NOT NULL`);
  console.log(`Reset ${spa.rowCount} assignment marks (structure preserved)`);

  // 3. Reset all sessions to active
  const ses = await query(`UPDATE faculty_evaluation_sessions SET 
    status = 'active', 
    finalized_at = NULL, 
    credibility_snapshot = NULL
    WHERE status != 'active'`);
  console.log(`Reset ${ses.rowCount} sessions to active`);

  // 4. Clear credibility metrics
  const jcm = await query('DELETE FROM judge_credibility_metrics');
  console.log(`Deleted ${jcm.rowCount} judge_credibility_metrics`);

  // 5. Verify
  const sessions = await query(`SELECT id, title, status FROM faculty_evaluation_sessions ORDER BY created_at`);
  console.log('\nSessions after reset:');
  sessions.rows.forEach(s => {
    console.log(`  ${s.title || s.id.slice(0,8)}: ${s.status}`);
  });

  const assignmentCount = await query('SELECT COUNT(*) as count FROM session_planner_assignments');
  console.log(`\nAssignments preserved: ${assignmentCount.rows[0].count}`);

  const resultCount = await query('SELECT COUNT(*) as count FROM final_student_results');
  console.log(`Results: ${resultCount.rows[0].count} (should be 0)`);

  console.log('\nDatabase cleaned. Ready for fresh evaluation cycle.');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
