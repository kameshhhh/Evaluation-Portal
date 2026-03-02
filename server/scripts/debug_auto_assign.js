require('dotenv').config();
const { pool } = require('../src/config/database');

(async () => {
  try {
    // Users columns
    const c = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`);
    console.log('USERS columns:', c.rows.map(r => r.column_name).join(', '));
    
    // Users data
    const u = await pool.query('SELECT * FROM users');
    u.rows.forEach(r => console.log(JSON.stringify(r)));
    
    // Persons with identity mapping
    console.log('\n=== PERSONS ===');
    const p = await pool.query('SELECT person_id, identity_id, person_type, display_name, department_code, status FROM persons ORDER BY display_name');
    p.rows.forEach(r => console.log(JSON.stringify(r)));
    
    // Check autoAssign prereqs: Does faculty identity_id map correctly?
    console.log('\n=== FACULTY SCOPE JOIN CHECK ===');
    const fcheck = await pool.query(`
      SELECT p.person_id, p.display_name, p.identity_id, u.user_role,
             COUNT(fes.id) as scope_count
      FROM persons p
      JOIN users u ON u.internal_user_id = p.identity_id
      LEFT JOIN faculty_evaluation_scope fes ON fes.faculty_id = p.identity_id AND fes.is_active = true
      WHERE u.user_role IN ('faculty', 'admin')
      GROUP BY p.person_id, p.display_name, p.identity_id, u.user_role
    `);
    fcheck.rows.forEach(r => console.log(JSON.stringify(r)));
    
    // Session columns
    console.log('\n=== SESSION COLUMNS ===');
    const sc = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' ORDER BY ordinal_position`);
    console.log(sc.rows.map(r => r.column_name).join(', '));
    
    // Auto-assign column check
    console.log('\n=== SESSION auto_suggested ===');
    const sess = await pool.query('SELECT id, title, auto_suggested, academic_year, semester FROM faculty_evaluation_sessions');
    sess.rows.forEach(r => console.log(JSON.stringify(r)));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
})();
