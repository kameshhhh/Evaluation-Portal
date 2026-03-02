const { pool } = require('./src/config/database');

async function dump() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'session_planner_assignments'
            ORDER BY ordinal_position
        `);
        console.log('TABLE: session_planner_assignments');
        res.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
dump();
