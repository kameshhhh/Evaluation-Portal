const { pool, query, getClient } = require('./src/config/database');
const AutoAssignmentService = require('./src/services/autoAssignmentService');
const logger = require('./src/utils/logger');

// Mock req, res, user
const req = {
    user: {
        role: 'admin',
        userId: '22fb714d-441a-40c6-b89b-30851dc986ca',
        personId: '7acb25d1-440b-4adb-9bc2-c5535051fbee' // Kamesh's person_id found earlier
    },
    body: {
        sessionId: 'c1219b88-1d63-4a2e-a644-aafb4d8f01ca', // From screenshot
        academicYear: 2026,
        semester: 1
    }
};

const res = {
    status: function (s) { this.statusCode = s; return this; },
    json: function (j) { console.log('RESPONSE:', JSON.stringify(j, null, 2)); return this; }
};

const emitToRole = (evt, role, data) => console.log(`EMIT to ${role}: ${evt}`, data);

async function diagnostic() {
    console.log("Starting diagnostic for testAutoAssign...");
    const client = await pool.connect();
    try {
        const { sessionId, academicYear, semester } = req.body;
        const yr = academicYear || new Date().getFullYear();
        const sem = semester || 1;
        const adminId = req.user.userId;

        console.log(`Context: yr=${yr}, sem=${sem}, adminId=${adminId}, sessionId=${sessionId}`);

        await client.query("BEGIN");

        // 2. Get Students Visible to Admin (Scoped)
        const allStudents = await client.query(`
          SELECT p.person_id, p.display_name, sts.track, p.department_code
          FROM student_track_selections sts
          JOIN persons p ON p.person_id = sts.person_id
          WHERE sts.academic_year = $1 AND sts.semester = $2
        `, [yr, sem]);

        console.log(`Total students in year/sem: ${allStudents.rows.length}`);

        const detailedScopesRes = await client.query(`
            SELECT fes.*, t.name as track_name 
            FROM faculty_evaluation_scope fes
            JOIN tracks t ON fes.track_id = t.id
            WHERE fes.faculty_id = $1 AND fes.is_active = true
        `, [adminId]);
        const detailedScopes = detailedScopesRes.rows;
        console.log(`Admin scopes found: ${detailedScopes.length}`);

        const isAdminWithoutScope = detailedScopes.length === 0;
        const scopedStudents = [];

        for (const s of allStudents.rows) {
            const allowed = isAdminWithoutScope || detailedScopes.some(scope => {
                const trackMatch = scope.track_name.toUpperCase() === s.track.toUpperCase();
                const deptMatch = !scope.department_code || scope.department_code === s.department_code;
                return trackMatch && deptMatch;
            });
            if (allowed) scopedStudents.push(s);
        }
        console.log(`Scoped students: ${scopedStudents.length}`);

        let assignedCount = 0;

        for (const student of scopedStudents) {
            console.log(`Processing student: ${student.display_name} (${student.person_id})`);

            let studentSessionId = sessionId;

            if (!studentSessionId) {
                const sessionRes = await client.query(`
                    SELECT id FROM faculty_evaluation_sessions
                    WHERE track_id = (SELECT id FROM tracks WHERE UPPER(name) = UPPER($1))
                    AND $2 BETWEEN session_week_start AND session_week_end
                `, [student.track, new Date()]);
                studentSessionId = sessionRes.rows[0]?.id;

                if (!studentSessionId) {
                    const latestSession = await client.query(`
                        SELECT id FROM faculty_evaluation_sessions
                        WHERE track_id = (SELECT id FROM tracks WHERE UPPER(name) = UPPER($1))
                        ORDER BY created_at DESC LIMIT 1
                    `, [student.track]);
                    studentSessionId = latestSession.rows[0]?.id;
                }
            }

            if (!studentSessionId) {
                console.log(`  - No session found for track ${student.track}, skipping.`);
                continue;
            }

            console.log(`  - Using sessionId: ${studentSessionId}`);

            const suggestions = await AutoAssignmentService.getSuggestions(studentSessionId, student.person_id, 3);
            console.log(`  - Suggestions found: ${suggestions.length}`);

            if (suggestions.length > 0) {
                const bestFaculty = suggestions[0];
                console.log(`  - Assigning to best faculty: ${bestFaculty.displayName} (${bestFaculty.facultyId})`);

                const params = [studentSessionId, bestFaculty.facultyId, student.person_id, req.user.personId];
                params.forEach((p, i) => console.log(`    $${i + 1}: ${p} (${typeof p})`));

                await client.query(`
                    INSERT INTO session_planner_assignments 
                    (session_id, faculty_id, student_id, assigned_by, status, assignment_source)
                    VALUES ($1, $2, $3, $4, 'assigned', 'test_auto')
                    ON CONFLICT (session_id, faculty_id, student_id) DO NOTHING
                `, params);

                assignedCount++;
            }
        }

        await client.query("COMMIT");
        console.log(`SUCCESS: Assigned ${assignedCount} students.`);
        emitToRole('planner:update', 'admin', { count: assignedCount });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("DIAGNOSTIC ERROR:", error);
    } finally {
        client.release();
        process.exit(0);
    }
}

diagnostic();
