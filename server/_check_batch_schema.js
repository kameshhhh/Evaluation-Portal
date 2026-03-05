const { query } = require('./src/config/database');
(async () => {
  try {
    const p = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'persons' ORDER BY ordinal_position`);
    console.log('=== PERSONS TABLE ===');
    p.rows.forEach(r => console.log(r.column_name, r.data_type));
    
    const f = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions' ORDER BY ordinal_position`);
    console.log('\n=== FACULTY_EVALUATION_SESSIONS TABLE ===');
    f.rows.forEach(r => console.log(r.column_name, r.data_type));
    
    const sg = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'session_groups' ORDER BY ordinal_position`);
    console.log('\n=== SESSION_GROUPS TABLE ===');
    sg.rows.forEach(r => console.log(r.column_name, r.data_type));
    
    const sts = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student_track_selections' ORDER BY ordinal_position`);
    console.log('\n=== STUDENT_TRACK_SELECTIONS TABLE ===');
    sts.rows.forEach(r => console.log(r.column_name, r.data_type));
    
    const pd = await query(`SELECT person_id, display_name, admission_year, graduation_year, person_type FROM persons WHERE is_deleted = false LIMIT 5`);
    console.log('\n=== SAMPLE PERSONS DATA ===');
    pd.rows.forEach(r => console.log(r));
    
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
