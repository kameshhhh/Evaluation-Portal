const { pool } = require('./src/config/database');

async function checkTracks() {
    try {
        const res = await pool.query("SELECT * FROM tracks");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
checkTracks();
