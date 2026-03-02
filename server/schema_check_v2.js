
const { pool } = require('./src/config/database');
async function run() {
    try {
        const res = await pool.query("SELECT * FROM faculty_evaluation_scope LIMIT 1");
        console.log('Columns:', Object.keys(res.rows[0] || {}).join(', '));
        process.exit(0);
    } catch (err) {
        console.error('SCHEMA_CHECK_FAILED:', err.message);
        console.error(err);
        process.exit(1);
    }
}
run();
