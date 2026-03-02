const { pool } = require('./src/config/database');

async function checkScopes() {
    try {
        const res = await pool.query("SELECT fes.*, t.name as track_name FROM faculty_evaluation_scope fes JOIN tracks t ON t.id = fes.track_id WHERE fes.is_active = true");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
checkScopes();
