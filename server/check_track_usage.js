const { pool } = require('./src/config/database');

async function checkUsage() {
    try {
        console.log('--- SESSIONS track_id usage ---');
        const sessRes = await pool.query("SELECT track_id, COUNT(*) FROM faculty_evaluation_sessions GROUP BY track_id");
        console.log(JSON.stringify(sessRes.rows, null, 2));

        console.log('--- SCOPE track_id usage ---');
        const scopeRes = await pool.query("SELECT track_id, COUNT(*) FROM faculty_evaluation_scope GROUP BY track_id");
        console.log(JSON.stringify(scopeRes.rows, null, 2));

        console.log('--- STUDENT selections track name usage ---');
        const studRes = await pool.query("SELECT track, COUNT(*) FROM student_track_selections GROUP BY track");
        console.log(JSON.stringify(studRes.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
checkUsage();
