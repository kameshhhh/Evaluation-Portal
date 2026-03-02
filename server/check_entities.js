
const { pool } = require('./src/config/database');
async function run() {
    try {
        const res = await pool.query(`
            SELECT schemaname, tablename as name, 'table' as type FROM pg_tables
            UNION ALL
            SELECT schemaname, viewname as name, 'view' as type FROM pg_views
            UNION ALL
            SELECT schemaname, matviewname as name, 'matview' as type FROM pg_matviews
        `);
        console.log('ENTITIES:' + JSON.stringify(res.rows.filter(r => r.name === 'students')));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
