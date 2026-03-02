const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkStatusColumn() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'faculty_evaluation_sessions'
    `);
        console.log(JSON.stringify(res.rows, null, 2));

        // Also check if there's a custom type for status if it exists
        const typeRes = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'session_status_enum' OR t.typname = 'status_enum'
    `);
        console.log("Enums:", JSON.stringify(typeRes.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

checkStatusColumn();
