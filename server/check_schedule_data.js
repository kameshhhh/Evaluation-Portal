const { pool } = require('./src/config/database');

const sessionId = 'ce402f80-64d5-421a-a34f-9b5046ff0d34';
const facultyEmail = 'kavinkumared.mz23@bitsathy.ac.in';

async function checkData() {
    try {
        // 1. Get Faculty person_id
        const userRes = await pool.query('SELECT p.person_id FROM users u JOIN persons p ON u.internal_user_id = p.identity_id WHERE u.normalized_email = $1', [facultyEmail]);
        if (userRes.rows.length === 0) {
            console.log('Faculty not found');
            process.exit(1);
        }
        const facultyId = userRes.rows[0].person_id;
        console.log(`Faculty ID: ${facultyId}`);

        // 2. Check Session Window
        const sessionRes = await pool.query('SELECT title, session_week_start, session_week_end FROM faculty_evaluation_sessions WHERE id = $1', [sessionId]);
        console.log('Session Window:', sessionRes.rows[0]);

        // 3. Check Assignments for this faculty
        const assignmentsRes = await pool.query(`
            SELECT spa.student_id, p.display_name, spa.status, spa.assignment_source
            FROM session_planner_assignments spa
            JOIN persons p ON p.person_id = spa.student_id
            WHERE spa.session_id = $1 AND spa.faculty_id = $2 AND spa.status != 'removed'
        `, [sessionId, facultyId]);
        console.log('Assignments for Faculty:', assignmentsRes.rows);

        // 4. Check Students mentioned in screenshot
        const students = ['DEVI SUBRAMANI', 'KAMESH D', 'KARTHIK V'];
        const studentCheckRes = await pool.query(`
            SELECT p.person_id, p.display_name, spa.faculty_id, f.display_name as faculty_name
            FROM persons p
            LEFT JOIN session_planner_assignments spa ON spa.student_id = p.person_id AND spa.session_id = $1 AND spa.status != 'removed'
            LEFT JOIN persons f ON f.person_id = spa.faculty_id
            WHERE p.display_name = ANY($2)
        `, [sessionId, students]);
        console.log('Student Assignment Status:', studentCheckRes.rows);

        // 5. Check evaluation_schedules table existence and structure
        try {
            const tableCheck = await pool.query("SELECT * FROM information_schema.columns WHERE table_name = 'evaluation_schedules'");
            console.log('Table evaluation_schedules columns:', tableCheck.rows.map(c => c.column_name));
        } catch (e) {
            console.log('Table evaluation_schedules might not exist or error:', e.message);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkData();
