
const { pool } = require('../src/config/database');
const facultyScopeService = require('../src/services/facultyScopeService');
const sessionPlannerService = require('../src/services/sessionPlannerService');
const { randomUUID } = require('crypto');
const fs = require('fs');

const LOG_FILE = 'verify_output.log';
// Clear log
fs.writeFileSync(LOG_FILE, '');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function verifyGovernance() {
    const client = await pool.connect();

    try {
        log("Starting Governance Verification V3...");

        // Cleanup first
        log("Cleaning up old test data...");
        try {
            await client.query("DELETE FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com')");
            await client.query("DELETE FROM users WHERE normalized_email LIKE '%@test.com'");
        } catch (e) { log("Cleanup warning: " + e.message); }

        // 1. Setup Test Data (COMMITTED)
        log("Seeding tracks...");
        await client.query(`INSERT INTO tracks (name, description) VALUES ('core', 'Standard'), ('it_core', 'IT Track'), ('premium', 'Premium Track') ON CONFLICT (name) DO NOTHING`);

        const facultyId = randomUUID();
        const facultyPersonId = randomUUID();
        const studentA = randomUUID(); // Valid (core + ECE)
        const studentB = randomUUID(); // Valid (it_core + CSE)
        const studentC = randomUUID(); // Leak Case (core + CSE)
        const studentD = randomUUID(); // Premium Case (premium + ANY)

        log("Creating Faculty...");
        await client.query(`INSERT INTO users (internal_user_id, normalized_email, email_hash, user_role, is_active) VALUES ($1, 'test_fac@test.com', 'hash', 'faculty', true)`, [facultyId]);
        await client.query(`INSERT INTO persons (person_id, identity_id, display_name, status, department_code, person_type) VALUES ($1, $2, 'Test Faculty', 'active', 'ECE', 'faculty')`, [facultyPersonId, facultyId]);

        const createStudent = async (id, name, dept, track) => {
            log(`Creating Student ${name}...`);
            await client.query(`INSERT INTO users (internal_user_id, normalized_email, email_hash, user_role, is_active) VALUES ($1, $2, 'hash', 'student', true)`, [id, `${name}@test.com`]);
            await client.query(`INSERT INTO persons (person_id, identity_id, display_name, status, department_code, person_type, admission_year, graduation_year) VALUES ($1, $1, $2, 'active', $3, 'student', 2025, 2029)`, [id, name, dept]);
            await client.query(`INSERT INTO student_track_selections (person_id, track, academic_year, semester) VALUES ($1, $2, 2025, 1)`, [id, track]);
        };

        await createStudent(studentA, 'Student A', 'ECE', 'core');
        await createStudent(studentB, 'Student B', 'CSE', 'it_core');
        await createStudent(studentC, 'Student C', 'CSE', 'core');
        await createStudent(studentD, 'Student D', 'MECH', 'premium');

        log("Setup complete. Committing...");

        // 2. Setup Scope: core+ECE
        log("\n--- Test 1: Scope core+ECE ---");
        await facultyScopeService.setupScope(facultyId, { tracks: ['core'], departments: ['ECE'] });

        const dummySessionId = randomUUID();
        const results1 = await sessionPlannerService.getScopedStudents(dummySessionId, facultyId);
        const map1 = results1.map(r => r.person_id);

        log(`Found ${results1.length} students.`);
        if (!map1.includes(studentA)) log("FAILED: Student A missing");
        if (map1.includes(studentB)) log("FAILED: Student B leaked");
        if (map1.includes(studentC)) log("FAILED: Student C leaked");
        if (map1.includes(studentD)) log("FAILED: Student D leaked");

        if (results1.length > 0 && !results1[0].track_id) log("FAILED: Payload missing track_id");

        // 3. Disjoint Scope
        log("\n--- Test 2: Disjoint Scope ---");
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        const trackRes = await pool.query("SELECT id, name FROM tracks");
        const tracks = Object.fromEntries(trackRes.rows.map(t => [t.name, t.id]));

        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'ECE', true, gen_random_uuid())", [facultyId, tracks['core']]);
        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'CSE', true, gen_random_uuid())", [facultyId, tracks['it_core']]);

        const results2 = await sessionPlannerService.getScopedStudents(dummySessionId, facultyId);
        const map2 = results2.map(r => r.person_id);

        log(`Found ${results2.length} students.`);
        if (!map2.includes(studentA)) log("FAILED: Student A missing");
        if (!map2.includes(studentB)) log("FAILED: Student B missing");
        if (map2.includes(studentC)) log("FAILED: LEAK DETECTED! Student C (CORE+CSE) matched.");
        else log("SUCCESS: Student C excluded.");

        // 4. Premium
        log("\n--- Test 3: Premium ---");
        await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        await pool.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, NULL, true, gen_random_uuid())", [facultyId, tracks['premium']]);

        const results3 = await sessionPlannerService.getScopedStudents(dummySessionId, facultyId);
        const map3 = results3.map(r => r.person_id);

        log(`Found ${results3.length} students.`);
        if (map3.includes(studentD)) log("SUCCESS: Student D found.");
        else log("FAILED: Student D missing.");
        if (map3.includes(studentA)) log("FAILED: Student A leaked.");

        log("Verification Complete!");

    } catch (err) {
        log("ERROR: " + err.message);
        if (err.detail) log("Detail: " + err.detail);
        if (err.table) log("Table: " + err.table);
        log(err.stack);
    } finally {
        log("Cleaning up...");
        try {
            await pool.query("DELETE FROM student_track_selections WHERE person_id IN (SELECT person_id FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com'))");
            await pool.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com')");
            await pool.query("DELETE FROM persons WHERE identity_id IN (SELECT internal_user_id FROM users WHERE normalized_email LIKE '%@test.com')");
            await pool.query("DELETE FROM users WHERE normalized_email LIKE '%@test.com'");
        } catch (cleanupErr) {
            log("Cleanup Error: " + cleanupErr.message);
        }

        if (client) client.release();
        await pool.end();
    }
}

verifyGovernance();
