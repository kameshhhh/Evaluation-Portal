
const { pool } = require('./src/config/database');
async function run() {
    try {
        const res = await pool.query("SELECT definition FROM pg_views WHERE viewname = 'students'");
        if (res.rows.length > 0) {
            console.log('STUDENTS_VIEW_DEF:');
            console.log(res.rows[0].definition);
        } else {
            console.log('STUDENTS_VIEW_NOT_FOUND');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
