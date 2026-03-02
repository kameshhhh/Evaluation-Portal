
const { pool } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function check() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        const columns = res.rows.map(r => r.column_name).join('\n');
        fs.writeFileSync(path.join(__dirname, 'users_schema.txt'), columns);
        console.log("Written to users_schema.txt");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
