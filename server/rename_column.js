
const { pool } = require('./src/config/database');
async function run() {
    try {
        console.log('Renaming department_id to department_code...');
        await pool.query("ALTER TABLE faculty_evaluation_scope RENAME COLUMN department_id TO department_code");
        console.log('RENAME_SUCCESS');
        process.exit(0);
    } catch (err) {
        console.error('RENAME_FAIL:', err.message);
        process.exit(1);
    }
}
run();
