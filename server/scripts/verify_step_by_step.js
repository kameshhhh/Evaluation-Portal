
const { pool } = require('../src/config/database');
const { randomUUID } = require('crypto');

async function test() {
    console.log("1. Connecting...");
    const client = await pool.connect();
    try {
        console.log("2. BEGIN...");
        await client.query("BEGIN");

        console.log("3. Seeding Tracks...");
        await client.query(`INSERT INTO tracks (name, description) VALUES ('CORE', 'S'), ('IT', 'I'), ('PREMIUM', 'P') ON CONFLICT (name) DO NOTHING`);

        console.log("4. Creating Faculty...");
        const fid = randomUUID();
        await client.query(`INSERT INTO users (user_id, internal_user_id, email, password_hash, user_role, is_active) VALUES ($1, $1, 'f@t.com', 'h', 'faculty', true)`, [fid]);

        console.log("5. Creating Person...");
        await client.query(`INSERT INTO persons (person_id, identity_id, display_name, email, status, department_code) VALUES ($1, $1, 'F', 'f@t.com', 'active', 'ECE')`, [fid]);

        console.log("6. Setup Scope...");
        // Manual insert for simplicity
        const tidRes = await client.query("SELECT id FROM tracks WHERE name='CORE'");
        const tid = tidRes.rows[0].id;
        await client.query(`INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'ECE', true, gen_random_uuid())`, [fid, tid]);

        console.log("7. Verification Query...");
        // Just run the query
        await client.query("SELECT * FROM faculty_evaluation_scope WHERE faculty_id = $1", [fid]);

        console.log("SUCCESS");
        await client.query("ROLLBACK");
    } catch (err) {
        console.error("FAIL:", err.message);
    } finally {
        client.release();
        pool.end();
    }
}

test();
