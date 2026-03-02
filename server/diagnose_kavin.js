
const { pool } = require('./src/config/database');
const fs = require('fs');

async function diagnose() {
    try {
        let output = "";
        const email = 'kavinkumar.ed23@bitsathy.ac.in';
        output += `--- DIAGNOSIS FOR: ${email} ---\n`;

        // 1. Check User & Person
        const userRes = await pool.query(`
            SELECT u.internal_user_id, u.user_role, p.person_id, p.person_type, p.department_code
            FROM users u
            LEFT JOIN persons p ON u.internal_user_id = p.identity_id
            WHERE u.normalized_email = $1
        `, [email]);

        if (userRes.rows.length === 0) {
            output += "❌ User not found.\n";
        } else {
            output += JSON.stringify(userRes.rows, null, 2) + "\n";

            if (userRes.rows[0].person_id) {
                const personId = userRes.rows[0].person_id;

                // 2. Check Scope
                output += "\n--- FACULTY SCOPE ---\n";
                const scopeRes = await pool.query(`
                    SELECT fes.*, t.name as track_name
                    FROM faculty_evaluation_scope fes
                    JOIN tracks t ON fes.track_id = t.id
                    WHERE fes.faculty_id = $1
                `, [personId]);
                output += JSON.stringify(scopeRes.rows, null, 2) + "\n";
            }
        }

        // 3. Check Students availablity
        output += "\n--- AVAILABLE STUDENTS (Sample) ---\n";
        const studRes = await pool.query(`
            SELECT p.display_name, p.person_type, p.department_code, p.admission_year, sts.track
            FROM persons p
            LEFT JOIN student_track_selections sts ON p.person_id = sts.person_id
            WHERE p.person_type = 'student'
            LIMIT 10
        `);
        output += JSON.stringify(studRes.rows, null, 2) + "\n";

        fs.writeFileSync('kavin_dump.txt', output);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

diagnose();
