const { pool } = require('./src/config/database');

(async () => {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'student_track_selections' 
            AND column_name = 'academic_year'
        `);
        console.log('Column Type:', JSON.stringify(res.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
