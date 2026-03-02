
const { pool } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'student_track_selections'
        `);
        const columns = res.rows.map(r => r.column_name).join('\n');
        fs.writeFileSync(path.join(__dirname, 'sts_schema.txt'), columns);
        console.log("Written to sts_schema.txt");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
