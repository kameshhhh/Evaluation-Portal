
const { pool } = require('./src/config/database');
async function run() {
    try {
        const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'persons'");
        console.log('PERSONS_COLS:' + JSON.stringify(columns.rows.map(c => c.column_name)));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
