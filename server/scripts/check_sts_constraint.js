
const { pool } = require('../src/config/database');
const fs = require('fs');

async function check() {
    try {
        // Query to get check constraints for the table
        const res = await pool.query(`
            SELECT conname, pg_get_constraintdef(c.oid) as definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE conrelid = 'student_track_selections'::regclass
            AND contype = 'c'
        `);

        const output = res.rows.map(r => `${r.conname}: ${r.definition}`).join('\n');
        fs.writeFileSync('sts_constraints.txt', output || 'No check constraints found');
        console.log("Written to sts_constraints.txt");
    } catch (err) {
        fs.writeFileSync('sts_constraints.txt', "Error: " + err.message);
        console.error(err);
    } finally {
        pool.end();
    }
}

check();
