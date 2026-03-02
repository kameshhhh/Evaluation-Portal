
const { pool } = require('./src/config/database');
async function run() {
    try {
        const res = await pool.query("SELECT * FROM faculty_evaluation_scope LIMIT 1");
        if (res.rows.length === 0) {
            // If empty, check information_schema again but print it clearly
            const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'faculty_evaluation_scope'");
            console.log('SCHEMA_COLS:' + JSON.stringify(columns.rows.map(c => c.column_name)));
        } else {
            console.log('DATA_COLS:' + JSON.stringify(Object.keys(res.rows[0])));
        }
        process.exit(0);
    } catch (err) {
        console.error('FAIL:' + err.message);
        process.exit(1);
    }
}
run();
