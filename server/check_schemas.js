const { pool } = require('./src/config/database');

async function check() {
    try {
        console.log('--- SESSIONS columns ---');
        const s1 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions'");
        console.log(s1.rows.map(r => r.column_name).join(', '));

        console.log('\n--- SCOPE columns ---');
        const s2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'faculty_evaluation_scope'");
        console.log(s2.rows.map(r => r.column_name).join(', '));

        console.log('\n--- TRACK SELECTIONS columns ---');
        const s3 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'student_track_selections'");
        console.log(s3.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
check();
