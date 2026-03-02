const { query } = require('./src/config/database');
(async () => {
  // Check evaluation_sessions columns
  console.log('\n=== evaluation_sessions columns ===');
  const ev = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='evaluation_sessions' ORDER BY ordinal_position`).catch(e => ({ rows: [{ column_name: 'ERR', data_type: e.message }] }));
  ev.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // Check users columns
  console.log('\n=== users columns ===');
  const uc = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`).catch(e => ({ rows: [{ column_name: 'ERR', data_type: e.message }] }));
  uc.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // Check persons columns
  console.log('\n=== persons columns ===');
  const pc = await query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='persons' ORDER BY ordinal_position`).catch(e => ({ rows: [{ column_name: 'ERR', data_type: e.message }] }));
  pc.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // Check all tables in the db
  console.log('\n=== ALL TABLES ===');
  const allTables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`).catch(e => ({ rows: [] }));
  allTables.rows.forEach(r => console.log(`  ${r.table_name}`));

  // Check what users look like
  console.log('\n=== USERS SAMPLE ===');
  const users = await query(`SELECT * FROM users LIMIT 6`).catch(e => ({ rows: [{ err: e.message }] }));
  users.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  // Check roleService path
  console.log('\n=== role resolution check ===');
  const roleCheck = await query(`
    SELECT u.normalized_email, u.account_type, p.person_id, p.display_name
    FROM users u
    LEFT JOIN persons p ON p.identity_id = u.internal_user_id
    LIMIT 6
  `).catch(e => ({ rows: [{ err: e.message }] }));
  roleCheck.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  // Check for applied migrations
  console.log('\n=== migrations_applied ===');
  const mig = await query(`SELECT * FROM schema_migrations ORDER BY applied_at DESC`).catch(e => ({rows:[{err:e.message}]}));
  mig.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  // Check scarcity tables
  console.log('\n=== scarcity-related tables ===');
  const scar = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%eval%' ORDER BY table_name`).catch(e => ({rows:[]}));
  scar.rows.forEach(r => console.log(`  ${r.table_name}`));

  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
