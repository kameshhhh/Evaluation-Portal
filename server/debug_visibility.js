
const { pool } = require('./src/config/database');
const fs = require('fs');
const util = require('util');
const logFile = fs.createWriteStream('debug_output.txt', { flags: 'w' });
const log = (d) => {
    console.log(d);
    logFile.write(util.format(d) + '\n');
};

async function run() {
    try {
        log("--- DUMP ALL SCOPES ---");
        const allScopes = await pool.query(`
            SELECT fes.*, p.display_name, t.name as track_name
            FROM faculty_evaluation_scope fes
            JOIN persons p ON p.person_id = fes.faculty_id
            JOIN tracks t ON fes.track_id = t.id
        `);
        log(JSON.stringify(allScopes.rows, null, 2));

        // 3. Get Student Tracks
        log("\n--- STUDENT TRACKS ---");
        const stsRes = await pool.query(`
            SELECT p.display_name, sts.track
            FROM student_track_selections sts
            JOIN persons p ON p.person_id = sts.person_id
            limit 20
        `);
        log(JSON.stringify(stsRes.rows, null, 2));

        setTimeout(() => {
            logFile.end();
            process.exit(0);
        }, 1000);

    } catch (e) {
        log(e);
        process.exit(1);
    }
}

run();
