const { pool } = require('./src/config/database');

(async () => {
    try {
        const sessionId = 'f30bc9b2-f10c-41a1-9cd2-e703421fd2d4';

        const sessionRes = await pool.query(
            `SELECT id, academic_year, semester 
             FROM faculty_evaluation_sessions 
             WHERE id = $1`,
            [sessionId]
        );

        if (!sessionRes.rows[0]) {
            console.error('Session not found');
            process.exit(1);
        }

        const sess = sessionRes.rows[0];
        console.log('Found Session:', JSON.stringify(sess, null, 2));

        // Update all students in the same academic year to match the session's semester
        // This is a test environment fix
        const updateRes = await pool.query(
            `UPDATE student_track_selections 
             SET semester = $1 
             WHERE academic_year = $2`,
            [sess.semester, sess.academic_year]
        );

        console.log(`Updated ${updateRes.rowCount} students to Semester ${sess.semester} (Year ${sess.academic_year}).`);

    } catch (e) {
        console.error(e);
        const fs = require('fs');
        fs.writeFileSync('fix_error.log', e.stack || e.message);
    } finally {
        process.exit(0);
    }
})();
