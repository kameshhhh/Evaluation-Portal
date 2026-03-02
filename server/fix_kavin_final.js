
const { pool } = require('./src/config/database');
const { randomUUID } = require('crypto');

async function fixKavinFinal() {
    const client = await pool.connect();
    try {
        const email = "kavinkumared.mz23@bitsathy.ac.in";
        console.log(`Working on: ${email}`);

        // 1. SELECT User explicitly
        const userRes = await client.query(`SELECT internal_user_id, user_role FROM users WHERE normalized_email = $1`, [email]);

        if (userRes.rows.length === 0) {
            console.log("❌ User NOT FOUND!");
            process.exit(1);
        }

        const userId = userRes.rows[0].internal_user_id;
        console.log(`✅ Found User ID: ${userId}`);

        // 2. FORCE Update Role
        await client.query(`UPDATE users SET user_role = 'faculty' WHERE internal_user_id = $1`, [userId]);
        console.log("✅ Updated User Role to FACULTY");

        // 3. Find Person
        const personRes = await client.query(`SELECT person_id, person_type FROM persons WHERE identity_id = $1`, [userId]);

        if (personRes.rows.length === 0) {
            console.log("❌ Person profile NOT FOUND.");
            process.exit(1);
        }

        const personId = personRes.rows[0].person_id;
        console.log(`✅ Found Person ID: ${personId}`);

        // 4. FORCE Update Person Type
        await client.query(`UPDATE persons SET person_type = 'faculty' WHERE person_id = $1`, [personId]);
        console.log("✅ Updated Person Type to FACULTY");

        // 5. Clear Scope
        await client.query(`DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1`, [personId]);

        // 6. Insert Global Scope (All Tracks, NULL dept)
        const tracksRes = await client.query("SELECT id, name FROM tracks");
        const scopeVersion = randomUUID();

        for (const track of tracksRes.rows) {
            await client.query(`
                INSERT INTO faculty_evaluation_scope 
                (faculty_id, track_id, department_code, is_active, scope_version)
                VALUES ($1, $2, NULL, true, $3)
            `, [personId, track.id, scopeVersion]);
        }
        console.log(`✅ Assigned Global Scope for ${tracksRes.rows.length} tracks.`);

        console.log("--- SUCCESS ---");
        process.exit(0);

    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        client.release();
    }
}

fixKavinFinal();
