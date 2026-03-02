
const { pool } = require('./src/config/database');
async function run() {
    try {
        console.log('Adding scope_version column...');
        await pool.query("ALTER TABLE faculty_evaluation_scope ADD COLUMN IF NOT EXISTS scope_version UUID");

        console.log('Adding description column to tracks...');
        await pool.query("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS description TEXT");

        console.log('Creating unique index...');
        await pool.query("DROP INDEX IF EXISTS idx_faculty_scope_active_unique");
        await pool.query("CREATE UNIQUE INDEX idx_faculty_scope_active_unique ON faculty_evaluation_scope (faculty_id, track_id, COALESCE(department_id, 'GLOBAL')) WHERE is_active = true");

        console.log('Adding extra indexes...');
        await pool.query("CREATE INDEX IF NOT EXISTS idx_scope_faculty ON faculty_evaluation_scope (faculty_id)");
        await pool.query("CREATE INDEX IF NOT EXISTS idx_scope_version ON faculty_evaluation_scope (scope_version)");

        console.log('MIGRATION_SUCCESS');
        process.exit(0);
    } catch (err) {
        console.error('MIGRATION_FAIL:', err.message);
        process.exit(1);
    }
}
run();
