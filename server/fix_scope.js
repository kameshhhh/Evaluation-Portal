
const { pool } = require('./src/config/database');

async function run() {
    try {
        const facultyName = "KAVIN KUMAR E D";
        console.log(`Fixing scope for ${facultyName}...`);

        // 1. Get Faculty ID
        const fRes = await pool.query("SELECT person_id FROM persons WHERE display_name = $1", [facultyName]);
        if (fRes.rows.length === 0) { console.log("Faculty not found!"); process.exit(1); }
        const facultyId = fRes.rows[0].person_id;

        // 2. Get Track ID for 'core'
        const tRes = await pool.query("SELECT id FROM tracks WHERE name = 'core'");
        if (tRes.rows.length === 0) { console.log("Track 'core' not found!"); process.exit(1); }
        const trackId = tRes.rows[0].id; // 37 based on debug output

        // 3. Clear existing scope (just in case)
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);

        // 4. Insert Scope (MZ and BT)
        const depts = ['MZ', 'BT', 'IT'];
        for (const dept of depts) {
            await pool.query(`
                INSERT INTO faculty_evaluation_scope 
                (faculty_id, track_id, department_code, is_active)
                VALUES ($1, $2, $3, true)
            `, [facultyId, trackId, dept]);
            console.log(`Added scope: core + ${dept}`);
        }

        console.log("Scope fixed!");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
