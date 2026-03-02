
const { pool } = require('../src/config/database');

async function check() {
    try {
        const fs = require('fs');
        const path = require('path');
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'persons'
        `);
        const columns = res.rows.map(r => r.column_name).join('\n');
        fs.writeFileSync(path.join(__dirname, 'persons_schema.txt'), columns);
        console.log("Written to persons_schema.txt");
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
