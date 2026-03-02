
const { pool } = require('./src/config/database');
const { randomUUID } = require('crypto');

async function setupTestFaculty() {
    const client = await pool.connect();
    try {
        // Handle both correctly typed and typo emails to be "perfect"
        const emails = [
            "harishp.mz23@bitsathy.ac.in",
            "harisp.mz23@bitsathy.ac.in"
        ];

        console.log("--- SETTING UP FACULTY ACCOUNTS ---");

        for (const email of emails) {
            console.log(`\nProcessing: ${email}`);

            // 1. Update USER ROLE
            const userRes = await client.query(`
                UPDATE users 
                SET user_role = 'faculty' 
                WHERE normalized_email = $1 
                RETURNING internal_user_id
            `, [email]);

            if (userRes.rows.length === 0) {
                console.log(`   User not found (User table). Skipping.`);
                continue;
            }

            const userId = userRes.rows[0].internal_user_id;
            console.log(`   ✅ User Role set to FACULTY.`);

            // 2. Update PERSON TYPE
            const personRes = await client.query(`
                UPDATE persons 
                SET person_type = 'faculty' 
                WHERE identity_id = $1 
                RETURNING person_id
            `, [userId]);

            if (personRes.rows.length === 0) {
                console.log(`   User has no Person profile yet. Skipping scope setup.`);
                continue;
            }

            const personId = personRes.rows[0].person_id;
            console.log(`   ✅ Person Type set to FACULTY.`);

            // 3. Clear Existing Scopes
            await client.query(`DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1`, [personId]);

            // 4. Assign GLOBAL SCOPE for All Tracks
            // Fetch all tracks
            const tracksRes = await client.query("SELECT id, name FROM tracks");
            if (tracksRes.rows.length === 0) {
                console.log("   ⚠️ No tracks found in DB!");
                continue;
            }

            const scopeVersion = randomUUID();
            let scopeCount = 0;

            for (const track of tracksRes.rows) {
                await client.query(`
                    INSERT INTO faculty_evaluation_scope 
                    (faculty_id, track_id, department_code, is_active, scope_version)
                    VALUES ($1, $2, NULL, true, $3)
                `, [personId, track.id, scopeVersion]);
                scopeCount++;
            }
            console.log(`   ✅ Assigned GLOBAL SCOPE for ${scopeCount} tracks.`);
        }

        console.log("\n--- SETUP COMPLETE ---");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        client.release();
    }
}

setupTestFaculty();
