
const { pool } = require('./src/config/database');
async function run() {
    try {
        const columns = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'faculty_evaluation_scope'");
        console.log('--- COLUMNS START ---');
        columns.rows.forEach(c => console.log(`${c.column_name} (${c.data_type})`));
        console.log('--- COLUMNS END ---');

        const indexes = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'faculty_evaluation_scope'");
        console.log('--- INDEXES START ---');
        indexes.rows.forEach(i => console.log(`${i.indexname}: ${i.indexdef}`));
        console.log('--- INDEXES END ---');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
