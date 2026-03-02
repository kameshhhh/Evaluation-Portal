const { pool } = require('./src/config/database');

(async () => {
    try {
        const res = await pool.query(`
            SELECT pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conname = 'student_track_selections_semester_check'
        `);
        console.log('Constraint Definition:', JSON.stringify(res.rows[0], null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
