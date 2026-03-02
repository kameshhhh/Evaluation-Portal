const { query } = require('./src/config/database');
(async () => {
  try {
    const tables = await query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname='public' 
      AND tablename IN ('peer_ranking_surveys','peer_ranking_responses','peer_ranking_aggregates','peer_safeguard_flags','peer_groups','default_trait_questions')
      ORDER BY tablename
    `);
    console.log('=== PEER TABLES FOUND ===');
    tables.rows.forEach(r => console.log(' ', r.tablename));

    // Skip migrations table check

    const traits = await query(`SELECT trait_key, question_text FROM default_trait_questions WHERE is_active = true ORDER BY sort_order`);
    console.log('\n=== TRAIT QUESTIONS ===');
    traits.rows.forEach(r => console.log(' ', r.trait_key, '-', r.question_text));

    const cols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='peer_ranking_surveys' ORDER BY ordinal_position`);
    console.log('\n=== peer_ranking_surveys COLUMNS ===');
    cols.rows.forEach(r => console.log(' ', r.column_name, '-', r.data_type));

    const rcols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='peer_ranking_responses' ORDER BY ordinal_position`);
    console.log('\n=== peer_ranking_responses COLUMNS ===');
    rcols.rows.forEach(r => console.log(' ', r.column_name, '-', r.data_type));

    const statusCol = cols.rows.find(r => r.column_name === 'status');
    console.log('\n=== HAS STATUS COLUMN? ===', statusCol ? 'YES - ' + statusCol.data_type : 'NO');

    const gcols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='peer_groups' ORDER BY ordinal_position`);
    console.log('\n=== peer_groups COLUMNS ===');
    gcols.rows.forEach(r => console.log(' ', r.column_name, '-', r.data_type));

    const surveyCount = await query('SELECT COUNT(*) FROM peer_ranking_surveys');
    const respCount = await query('SELECT COUNT(*) FROM peer_ranking_responses');
    const groupCount = await query('SELECT COUNT(*) FROM peer_groups');
    console.log('\n=== EXISTING DATA ===');
    console.log('  Surveys:', surveyCount.rows[0].count);
    console.log('  Responses:', respCount.rows[0].count);
    console.log('  Groups:', groupCount.rows[0].count);

    // Check aggregate columns
    const acols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='peer_ranking_aggregates' ORDER BY ordinal_position`);
    console.log('\n=== peer_ranking_aggregates COLUMNS ===');
    acols.rows.forEach(r => console.log(' ', r.column_name, '-', r.data_type));

    // Check safeguard flags columns
    const fcols = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='peer_safeguard_flags' ORDER BY ordinal_position`);
    console.log('\n=== peer_safeguard_flags COLUMNS ===');
    fcols.rows.forEach(r => console.log(' ', r.column_name, '-', r.data_type));

    // Check persons for students
    const students = await query(`SELECT person_id, display_name, person_type FROM persons WHERE person_type='student' LIMIT 10`);
    console.log('\n=== STUDENTS ===');
    students.rows.forEach(r => console.log(' ', r.person_id, r.display_name));

    // Check constraints on peer_ranking_surveys
    const constraints = await query(`
      SELECT conname, pg_get_constraintdef(c.oid) as def 
      FROM pg_constraint c 
      JOIN pg_class t ON c.conrelid = t.oid 
      WHERE t.relname = 'peer_ranking_surveys'
    `);
    console.log('\n=== peer_ranking_surveys CONSTRAINTS ===');
    constraints.rows.forEach(r => console.log(' ', r.conname, '-', r.def));

    process.exit(0);
  } catch(e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
