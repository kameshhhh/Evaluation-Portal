
const { pool } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'faculty_evaluation_scope'
        `);
        const columns = res.rows.map(r => `${r.column_name} (Null: ${r.is_nullable}, Def: ${r.column_default})`).join('\n');
        fs.writeFileSync(path.join(__dirname, 'scope_schema.txt'), columns);
        console.log("Written to scope_schema.txt");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
