require('dotenv').config();
const { query } = require('./src/config/database');

(async () => {
  // Check score events schema
  const evCols = await query("SELECT column_name FROM information_schema.columns WHERE table_name='assignment_score_events' ORDER BY ordinal_position");
  console.log('=== SCORE EVENT COLUMNS ===');
  evCols.rows.forEach(r => console.log(' ', r.column_name));

  const events = await query('SELECT * FROM assignment_score_events LIMIT 20');
  console.log('\n=== SCORE EVENTS ===', events.rows.length);
  events.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check final student results
  const results = await query('SELECT * FROM final_student_results LIMIT 10');
  console.log('\n=== FINAL RESULTS ===', results.rows.length);
  results.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check credibility scores
  try {
    const cred = await query('SELECT * FROM faculty_credibility_scores LIMIT 10');
    console.log('\n=== CREDIBILITY SCORES ===', cred.rows.length);
    cred.rows.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) { console.log('\nNo faculty_credibility_scores:', e.message); }

  // Session status
  const sess = await query('SELECT id, title, status, finalized_at, credibility_snapshot FROM faculty_evaluation_sessions');
  console.log('\n=== SESSIONS ===');
  sess.rows.forEach(r => console.log(r.id.slice(0,8), r.title, '| status:', r.status, '| finalized:', r.finalized_at, '| snapshot:', r.credibility_snapshot ? 'HAS_DATA' : 'null'));

  // Check if KAMESH D student has calculated score
  const kamesh = await query("SELECT * FROM session_planner_assignments WHERE student_id IN (SELECT person_id FROM persons WHERE display_name ILIKE '%KAMESH%') AND marks IS NOT NULL");
  console.log('\n=== KAMESH STUDENT ASSIGNMENTS ===');
  kamesh.rows.forEach(r => console.log('faculty:', r.faculty_id.slice(0,8), 'marks:', r.marks, 'student_score:', r.student_score, 'weighted_score:', r.weighted_score));

  // Check all student_score values
  const scores = await query("SELECT spa.student_id, ps.display_name, spa.student_score, spa.marks FROM session_planner_assignments spa LEFT JOIN persons ps ON ps.person_id = spa.student_id WHERE spa.marks IS NOT NULL ORDER BY spa.student_id");
  console.log('\n=== ALL STUDENT SCORES ===');
  scores.rows.forEach(r => console.log(r.display_name, '| marks:', r.marks, '| student_score:', r.student_score));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
