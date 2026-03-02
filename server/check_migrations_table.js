const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'bitsathy_auth',
    password: 'kamesh123',
    port: 5432,
});

async function checkMigrations() {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT * FROM migrations ORDER BY id`);
        console.log("Applied Migrations:");
        res.rows.forEach(row => {
            console.log(`${row.id}: ${row.name} (run at ${row.run_on})`);
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.release();
        pool.end();
    }
}

checkMigrations();
