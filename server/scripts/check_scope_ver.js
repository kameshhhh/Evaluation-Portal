
const { pool } = require('../src/config/database');
const fs = require('fs');

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'faculty_evaluation_scope' 
            AND column_name = 'scope_version'
        `);
        fs.writeFileSync('scope_ver_result.txt', res.rows.length > 0 ? 'Exists' : 'Missing');
    } catch (err) {
        fs.writeFileSync('scope_ver_result.txt', err.message);
    } finally {
        pool.end();
    }
}
check();
