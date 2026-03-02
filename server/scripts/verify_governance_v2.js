
const { pool } = require('../src/config/database');
const facultyScopeService = require('../src/services/facultyScopeService');
const sessionPlannerService = require('../src/services/sessionPlannerService');
const { randomUUID } = require('crypto');

async function verifyGovernance() {
    const client = await pool.connect();

    try {
        console.log("Starting Governance Verification V2...");

        // Cleanup first
        // Delete persons via identity_id linked to test users
        await client.query("DELETE FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com')");
        await client.query("DELETE FROM users WHERE normalized_email LIKE '%@test.com'");

        // 1. Setup Test Data (COMMITTED)
        console.log("Seeding tracks...");
        await client.query(`INSERT INTO tracks (name, description) VALUES ('CORE', 'Standard'), ('IT', 'IT Track'), ('PREMIUM', 'Premium Track') ON CONFLICT (name) DO NOTHING`);

        const facultyId = randomUUID();
        const facultyPersonId = randomUUID();
        const studentA = randomUUID(); // Valid (CORE + ECE)
        const studentB = randomUUID(); // Valid (IT + CSE)
        const studentC = randomUUID(); // Leak Case (CORE + CSE)
        const studentD = randomUUID(); // Premium Case (PREMIUM + ANY)

        console.log("Creating Users...");
        await client.query(`INSERT INTO users (user_id, internal_user_id, normalized_email, password_hash, user_role, is_active) VALUES ($1, $1, 'test_fac@test.com', 'hash', 'faculty', true)`, [facultyId]);
        await client.query(`INSERT INTO persons (person_id, identity_id, display_name, status, department_code) VALUES ($1, $1, 'Test Faculty', 'active', 'ECE')`, [facultyPersonId, facultyId]);

        const createStudent = async (id, name, dept, track) => {
            await client.query(`INSERT INTO users (user_id, internal_user_id, normalized_email, password_hash, user_role, is_active) VALUES ($1, $1, $2, 'hash', 'student', true)`, [id, `${name}@test.com`]);
            await client.query(`INSERT INTO persons (person_id, identity_id, display_name, status, department_code) VALUES ($1, $1, $2, 'active', $4)`, [id, name, `${name}@test.com`, dept]);
            await client.query(`INSERT INTO student_track_selections (person_id, track, academic_year, semester) VALUES ($1, $2, 2025, 1)`, [id, track]);
        };

        await createStudent(studentA, 'Student A', 'ECE', 'CORE');
        await createStudent(studentB, 'Student B', 'CSE', 'IT');
        await createStudent(studentC, 'Student C', 'CSE', 'CORE');
        await createStudent(studentD, 'Student D', 'MECH', 'PREMIUM');

        console.log("Setup complete. Committing...");

        // 2. Setup Scope: CORE+ECE
        console.log("\n--- Test 1: Scope CORE+ECE ---");
        // Using pool for setupScope so it commits implicitly (since we passed client=pool usually, or simpler: just use client and commit manually?)
        // setupScope uses transaction internally if not passed client.
        // If passed client, it uses it.
        // Let's use `setupScope` with `pool` (no client arg) to let it manage transaction.
        // But we need to ensure users/students are visible. So we must have committed them.

        // Since we are not in a transaction on `client` (didn't call BEGIN on it explicitly here outside of a try block maybe? No wait.)
        // I haven't called BEGIN yet. So each query is autocommitted?
        // `pg` client: "In PostgreSQL, every statement executes in a transaction..."
        // But from Node driver, if I don't call BEGIN, each query is its own transaction.
        // So they are committed immediately.

        // So `SessionPlannerService` *should* see them if I didn't use BEGIN.
        // In previous script I used BEGIN. That was the problem.

        await facultyScopeService.setupScope(facultyId, { tracks: ['CORE'], departments: ['ECE'] });

        const results1 = await sessionPlannerService.getScopedStudents('dummy', facultyId);
        const map1 = results1.map(r => r.person_id);

        console.log("Expect A. Found:", results1.length);
        if (!map1.includes(studentA)) console.error("FAILED: Student A missing");
        if (map1.includes(studentB)) console.error("FAILED: Student B leaked");
        if (map1.includes(studentC)) console.error("FAILED: Student C leaked");
        if (map1.includes(studentD)) console.error("FAILED: Student D leaked");

        if (results1.length > 0 && !results1[0].track_id) console.error("FAILED: Payload missing track_id");

        // 3. Disjoint Scope
        console.log("\n--- Test 2: Disjoint Scope ---");
        // Manually setup disjoint scope
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        const trackRes = await pool.query("SELECT id, name FROM tracks");
        const tracks = Object.fromEntries(trackRes.rows.map(t => [t.name, t.id]));

        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'ECE', true, gen_random_uuid())", [facultyId, tracks['CORE']]);
        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'CSE', true, gen_random_uuid())", [facultyId, tracks['IT']]);

        const results2 = await sessionPlannerService.getScopedStudents('dummy', facultyId);
        const map2 = results2.map(r => r.person_id);

        console.log("Expect A & B. Found:", results2.length);
        if (!map2.includes(studentA)) console.error("FAILED: Student A missing");
        if (!map2.includes(studentB)) console.error("FAILED: Student B missing");
        if (map2.includes(studentC)) console.error("FAILED: LEAK DETECTED! Student C (CORE+CSE) matched.");

        // 4. Premium
        console.log("\n--- Test 3: Premium ---");
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, NULL, true, gen_random_uuid())", [facultyId, tracks['PREMIUM']]);

        const results3 = await sessionPlannerService.getScopedStudents('dummy', facultyId);
        const map3 = results3.map(r => r.person_id);

        console.log("Expect D. Found:", results3.length);
        if (map3.includes(studentD)) console.log("SUCCESS: Student D found.");
        else console.error("FAILED: Student D missing.");
        if (map3.includes(studentA)) console.error("FAILED: Student A leaked.");

    } catch (err) {
        console.error("ERROR:", err.message);
    } finally {
        console.log("Cleaning up...");
        await pool.query("DELETE FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com')");
        await pool.query("DELETE FROM users WHERE normalized_email LIKE '%@test.com'");
        // cascading updates/deletes might not handle FKs perfectly if not defined with CASCADE.
        // STS references person_id. Users/Persons FKs.
        // faculty_evaluation_scope references user_id.
        await pool.query("DELETE FROM student_track_selections WHERE person_id IN (SELECT person_id FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com'))");
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id IN (SELECT user_id FROM users WHERE normalized_email LIKE '%@test.com')");

        if (client) client.release();
        await pool.end();
    }
}

verifyGovernance();
