require('dotenv').config();
const { query } = require('./src/config/database');

(async () => {
  // Find all assignments with marks
  const all = await query(`
    SELECT spa.session_id, spa.student_id, spa.faculty_id, spa.marks, spa.feedback, spa.status,
           p.display_name as faculty_name, ps.display_name as student_name,
           fes.title as session_title
    FROM session_planner_assignments spa
    JOIN persons p ON p.person_id = spa.faculty_id
    LEFT JOIN persons ps ON ps.person_id = spa.student_id
    LEFT JOIN faculty_evaluation_sessions fes ON fes.id = spa.session_id
    ORDER BY spa.session_id, spa.student_id
  `);
  console.log('=== ALL ASSIGNMENTS ===', all.rows.length);
  all.rows.forEach(r => console.log(
    r.session_title, '|', r.student_name, '|', r.faculty_name, '| marks:', r.marks, '| status:', r.status
  ));

  // Check score events
  const events = await query(`SELECT * FROM assignment_score_events ORDER BY created_at DESC LIMIT 20`);
  console.log('\n=== SCORE EVENTS ===', events.rows.length);
  events.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check final student results
  const results = await query(`SELECT * FROM final_student_results ORDER BY created_at DESC LIMIT 10`);
  console.log('\n=== FINAL RESULTS ===', results.rows.length);
  results.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check credibility scores table
  try {
    const cred = await query(`SELECT * FROM faculty_credibility_scores ORDER BY updated_at DESC LIMIT 10`);
    console.log('\n=== CREDIBILITY SCORES ===', cred.rows.length);
    cred.rows.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) { console.log('\nNo faculty_credibility_scores table:', e.message); }

  // Check session status
  const sess = await query(`SELECT id, title, status, finalized_at, credibility_snapshot FROM faculty_evaluation_sessions`);
  console.log('\n=== SESSIONS STATUS ===');
  sess.rows.forEach(r => console.log(r.id.slice(0,8), r.title, '| status:', r.status, '| finalized:', r.finalized_at ? 'YES' : 'NO', '| snapshot:', r.credibility_snapshot ? 'YES' : 'NO'));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
