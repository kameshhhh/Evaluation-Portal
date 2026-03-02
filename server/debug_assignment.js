const { pool } = require('./src/config/database');

(async () => {
    try {
        const sessionId = 'f30bc9b2-f10c-41a1-9cd2-e703421fd2d4';

        console.log('--- SESSION CONFIG ---');
        const sessionRes = await pool.query(
            `SELECT id, academic_year, semester, auto_suggested 
             FROM faculty_evaluation_sessions 
             WHERE id = $1`,
            [sessionId]
        );

        if (!sessionRes.rows[0]) {
            console.error('CRITICAL: Session ID unmatched');
            process.exit(1);
        }

        const sess = sessionRes.rows[0];
        console.log('SESSION:', JSON.stringify(sess, null, 2));

        console.log('\n--- STUDENT POOL (Global) ---');
        const poolRes = await pool.query(
            `SELECT academic_year, semester, count(*) as count 
             FROM student_track_selections 
             GROUP BY academic_year, semester`
        );
        console.log('GLOBAL POOL:', JSON.stringify(poolRes.rows, null, 2));

        console.log('\n--- MATCHING STUDENTS ---');
        const matchRes = await pool.query(
            `SELECT p.person_id, p.display_name, sts.track, sts.academic_year, sts.semester
             FROM persons p
             JOIN student_track_selections sts ON sts.person_id = p.person_id
             WHERE sts.academic_year = $1 AND sts.semester = $2
               AND p.status = 'active'`,
            [sess.academic_year, sess.semester]
        );
        console.log(`Found ${matchRes.rows.length} students matching Year: ${sess.academic_year}, Sem: ${sess.semester}`);

        if (matchRes.rows.length === 0) {
            console.log('Wait! Let me check partial matches...');
            const yearMatch = await pool.query(`SELECT count(*) FROM student_track_selections WHERE academic_year = $1`, [sess.academic_year]);
            console.log(`Students in Year ${sess.academic_year}: ${yearMatch.rows[0].count}`);
            const semMatch = await pool.query(`SELECT count(*) FROM student_track_selections WHERE semester = $1`, [sess.semester]);
            console.log(`Students in Sem ${sess.semester}: ${semMatch.rows[0].count}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
