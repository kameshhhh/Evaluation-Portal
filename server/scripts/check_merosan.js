const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function checkStudent() {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT person_id, display_name, is_deleted, status FROM persons WHERE display_name ILIKE '%Merosan%'");
        console.log('--- STUDENT ---');
        console.log(JSON.stringify(res.rows, null, 2));

        if (res.rows.length > 0) {
            const sid = res.rows[0].person_id;
            const res2 = await client.query("SELECT id, session_id, faculty_id, status, marks FROM session_planner_assignments WHERE student_id = $1", [sid]);
            console.log('--- ASSIGNMENTS ---');
            console.log(JSON.stringify(res2.rows, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

checkStudent();
