
const { pool } = require('../src/config/database');

async function check() {
    try {
        console.log("Checking faculty_evaluation_scope columns...");
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'faculty_evaluation_scope'
        `);
        console.log("Columns:", res.rows.map(r => r.column_name));

        console.log("Checking indexes...");
        const indexes = await pool.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'faculty_evaluation_scope'
        `);
        console.log("Indexes:", indexes.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

check();
