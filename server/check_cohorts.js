const { pool } = require('./src/config/database');

async function check() {
    try {
        console.log('--- COHORTS columns ---');
        const s1 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'cohorts'");
        console.log(s1.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
check();
