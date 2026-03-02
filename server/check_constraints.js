const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'bitsathy_auth',
    password: 'kamesh123',
    port: 5432,
});

async function checkConstraints() {
    const client = await pool.connect();
    try {
        console.log("Checking constraints for session_planner_assignments...");

        const res = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'session_planner_assignments'::regclass
      AND n.nspname = 'public';
    `);

        if (res.rows.length === 0) {
            console.log("No constraints found.");
        } else {
            res.rows.forEach(row => {
                console.log(JSON.stringify(row));
            });
        }

        console.log("\nChecking indexes...");
        const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'session_planner_assignments';
    `);

        indexes.rows.forEach(row => {
            console.log(JSON.stringify(row));
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.release();
        pool.end();
    }
}

checkConstraints();
