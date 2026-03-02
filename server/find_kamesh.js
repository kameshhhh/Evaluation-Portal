const { pool } = require('./src/config/database');

async function findKamesh() {
    try {
        const res = await pool.query("SELECT person_id, identity_id, display_name FROM persons WHERE display_name ILIKE '%Kamesh%'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
findKamesh();
