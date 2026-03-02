const { query } = require('./src/config/database');
(async () => {
  const checks = [
    'evaluation_schedules',
    'assignment_score_events',
    'final_student_results',
    'judge_credibility_metrics',
    'faculty_evaluation_scope',
  ];

  for (const t of checks) {
    console.log(`\n=== ${t} columns ===`);
    const r = await query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name=$1 
       ORDER BY ordinal_position`, [t]
    ).catch(e => ({ rows: [{ column_name: 'ERR', data_type: e.message }] }));
    r.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    const cnt = await query(`SELECT COUNT(*) AS n FROM ${t}`).catch(e => ({ rows: [{ n: 'ERR:' + e.message }] }));
    console.log(`  [count: ${cnt.rows[0].n}]`);
  }

  console.log('\n=== unique_constraint on evaluation_schedules ===');
  const uc = await query(`
    SELECT conname, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'evaluation_schedules'::regclass
  `).catch(e => ({ rows: [{ conname: 'ERR', def: e.message }] }));
  uc.rows.forEach(r => console.log(`  ${r.conname}: ${r.def}`));

  console.log('\n=== faculty_evaluation_scope data ===');
  const scope = await query(`SELECT * FROM faculty_evaluation_scope LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  scope.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  console.log('\n=== tracks ===');
  const tracks = await query(`SELECT * FROM tracks LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  tracks.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  console.log('\n=== persons full ===');
  const persons = await query(`SELECT person_id, identity_id, display_name, person_type, status FROM persons`).catch(e => ({ rows: [{ err: e.message }] }));
  persons.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  console.log('\n=== users full ===');
  const users = await query(`SELECT internal_user_id, normalized_email, user_role FROM users`).catch(e => ({ rows: [{ err: e.message }] }));
  users.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  console.log('\n=== judge_credibility_metrics full ===');
  const jcm = await query(`SELECT * FROM judge_credibility_metrics LIMIT 10`).catch(e => ({ rows: [{ err: e.message }] }));
  jcm.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  console.log('\n=== session_planner_assignments with faculty check ===');
  const spa = await query(`
    SELECT spa.*, p.display_name as faculty_name, u.user_role, u.normalized_email
    FROM session_planner_assignments spa
    JOIN persons p ON p.person_id = spa.faculty_id
    JOIN users u ON u.internal_user_id = p.identity_id
    WHERE spa.status != 'removed'
  `).catch(e => ({ rows: [{ err: e.message }] }));
  spa.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
