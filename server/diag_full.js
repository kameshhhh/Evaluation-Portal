// Full diagnostic script
const { query } = require('./src/config/database');

(async () => {
  console.log('\n=== TABLE COUNTS ===');
  const tables = [
    'faculty_evaluation_sessions',
    'session_planner_assignments',
    'evaluation_sessions',
    'evaluation_allocations',
    'evaluation_heads',
    'session_evaluation_heads',
    'credibility_scores',
    'evaluation_schedules',
    'persons',
    'users',
  ];
  for (const t of tables) {
    const r = await query(`SELECT COUNT(*) AS n FROM ${t}`).catch(e => ({ rows: [{ n: 'ERR:' + e.message }] }));
    console.log(`  ${t}: ${r.rows[0].n}`);
  }

  console.log('\n=== FACULTY EVALUATION SESSIONS ===');
  const sessions = await query(`SELECT id, title, status, preferred_rubric_ids, min_judges FROM faculty_evaluation_sessions ORDER BY created_at DESC LIMIT 5`).catch(e => ({ rows: [] }));
  sessions.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== EVALUATION_SESSIONS (scarcity) ===');
  const es = await query(`SELECT session_id, status, pool_size, rubric_count FROM evaluation_sessions ORDER BY created_at DESC LIMIT 5`).catch(e => ({ rows: [] }));
  es.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== EVALUATION_HEADS (rubrics) ===');
  const eh = await query(`SELECT head_id, head_name, is_active FROM evaluation_heads`).catch(e => ({ rows: [] }));
  eh.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== SESSION_EVALUATION_HEADS ===');
  const seh = await query(`SELECT * FROM session_evaluation_heads LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  seh.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== CREDIBILITY_SCORES (sample) ===');
  const cs = await query(`SELECT faculty_id, score, evaluation_count, last_updated FROM credibility_scores LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  cs.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== PERSONS (faculty/admin sample) ===');
  const persons = await query(`SELECT p.person_id, p.display_name, u.role, u.normalized_email FROM persons p JOIN users u ON u.internal_user_id=p.identity_id WHERE u.role IN ('faculty','admin') LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  persons.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== SESSION_PLANNER_ASSIGNMENTS (sample) ===');
  const spa = await query(`SELECT session_id, faculty_id, student_id, marks, marks_submitted_at FROM session_planner_assignments LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  spa.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== EVALUATION_SCHEDULES (sample) ===');
  const sched = await query(`SELECT * FROM evaluation_schedules LIMIT 5`).catch(e => ({ rows: [{ err: e.message }] }));
  sched.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  console.log('\n=== COLUMN CHECK: session_planner_assignments ===');
  const spa_cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='session_planner_assignments' ORDER BY ordinal_position`).catch(e => ({ rows: [{ err: e.message }] }));
  spa_cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  console.log('\n=== COLUMN CHECK: faculty_evaluation_sessions ===');
  const fes_cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' ORDER BY ordinal_position`).catch(e => ({ rows: [{ err: e.message }] }));
  fes_cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  console.log('\n=== COLUMN CHECK: evaluation_sessions ===');
  const evs_cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='evaluation_sessions' ORDER BY ordinal_position`).catch(e => ({ rows: [{ err: e.message }] }));
  evs_cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
