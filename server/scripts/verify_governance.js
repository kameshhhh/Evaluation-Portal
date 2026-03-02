
const { pool } = require('../src/config/database');
const facultyScopeService = require('../src/services/facultyScopeService');
const sessionPlannerService = require('../src/services/sessionPlannerService');
const { randomUUID } = require('crypto');

async function verifyGovernance() {
    const client = await pool.connect();

    try {
        console.log("Starting Governance Verification...");
        await client.query("BEGIN");

        console.log("Seeding tracks...");
        await client.query(`INSERT INTO tracks (name, description) VALUES ('CORE', 'Standard'), ('IT', 'IT Track'), ('PREMIUM', 'Premium Track') ON CONFLICT (name) DO NOTHING`);

        // 1. Setup Test Data
        console.log("Creating Faculty...");
        const facultyId = randomUUID();
        const facultyPersonId = randomUUID();
        const studentA = randomUUID(); // Valid (CORE + ECE)
        const studentB = randomUUID(); // Valid (IT + CSE)
        const studentC = randomUUID(); // Leak Case (CORE + CSE)
        const studentD = randomUUID(); // Premium Case (PREMIUM + ANY)

        // Create Faculty User & Person
        await client.query(`INSERT INTO users (user_id, internal_user_id, email, password_hash, user_role, is_active) VALUES ($1, $1, 'test_fac@test.com', 'hash', 'faculty', true)`, [facultyId]);
        await client.query(`INSERT INTO persons (person_id, identity_id, display_name, email, status, department_code) VALUES ($1, $1, 'Test Faculty', 'test_fac@test.com', 'active', 'ECE')`, [facultyPersonId, facultyId]);


        // Create Students
        const createStudent = async (id, name, dept, track) => {
            console.log(`Creating Student ${name}...`);
            await client.query(`INSERT INTO users (user_id, internal_user_id, email, password_hash, user_role, is_active) VALUES ($1, $1, $2, 'hash', 'student', true)`, [id, `${name}@test.com`]);
            await client.query(`INSERT INTO persons (person_id, identity_id, display_name, email, status, department_code) VALUES ($1, $1, $2, $3, 'active', $4)`, [id, name, `${name}@test.com`, dept]);
            await client.query(`INSERT INTO student_track_selections (person_id, track, academic_year, semester) VALUES ($1, $2, 2025, 1)`, [id, track]);
        };

        await createStudent(studentA, 'Student A', 'ECE', 'CORE');
        await createStudent(studentB, 'Student B', 'CSE', 'IT');
        await createStudent(studentC, 'Student C', 'CSE', 'CORE'); // Cross leakage test
        await createStudent(studentD, 'Student D', 'MECH', 'PREMIUM');

        // 2. Setup Scope: CORE+ECE
        console.log("\n--- Test 1: Scope CORE+ECE ---");
        await facultyScopeService.setupScope(facultyId, { tracks: ['CORE'], departments: ['ECE'] }, client);

        // Verify Scope Version
        const scopeRes = await client.query("SELECT * FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        if (!scopeRes.rows[0].scope_version) throw new Error("Scope Version missing!");
        console.log("Scope Version verified:", scopeRes.rows[0].scope_version);

        // Verify Filtering
        // We need to commit the data setup relative to service calls if service uses its own pool, 
        // OR we need to inject client. But services usually use global pool.
        // Since services use `pool.query`, they won't see uncommitted data from this client if we are in transaction.
        // CATCH 22: Integration testing with services using global pool.
        // Solution: Temporarily mock/override pool.query? No, too hard properly.
        // Alternative: Don't use transaction for this script? But we want cleanup.
        // Alternative: Pass client to service methods? 
        // sessionPlannerService.getScopedStudents does NOT accept client.

        // Let's assume we can't test service logic EASILY without modifying it to accept client.
        // But wait, `SessionPlannerService` calls `facultyScopeService.getScope`.

        // HACK: We will check the logic by manually running the query that `SessionPlannerService` WOULD run.
        // Since we know the logic is strict OR grouping in the code.

        // Better: We rely on "unit test logic" here.
        // Actually, let's just commit the transaction for the test and then delete the data manually.
        await client.query("COMMIT");

        const results1 = await sessionPlannerService.getScopedStudents('dummy_session_id', facultyId);
        const map1 = results1.map(r => r.person_id);

        console.log("Results (Expect A):", results1.map(r => r.display_name));
        if (results1.length > 0 && !results1[0].track_id) console.error("FAILED: track_id missing in payload!");
        if (!map1.includes(studentA)) console.error("FAILED: Student A missing");
        if (map1.includes(studentB)) console.error("FAILED: Student B leaked");
        if (map1.includes(studentC)) console.error("FAILED: Student C leaked (Cross-Scope)");
        if (map1.includes(studentD)) console.error("FAILED: Student D leaked");

        // 3. Setup Scope: CORE+ECE AND IT+CSE (Multi-scope)
        console.log("\n--- Test 2: Scope CORE+ECE AND IT+CSE ---");
        await facultyScopeService.setupScope(facultyId, { tracks: ['CORE', 'IT'], departments: ['ECE', 'CSE'] }, client); // This setupScope might fail because setupScope uses `pool` if not passed client? 
        // Ah, default_api: `setupScope(..., client = pool)`. I passed client above! 
        // But `verifyGovernance` passed `client` to `setupScope`.
        // Wait, did I pass `client` in the first call? Yes.
        // Does `setupScope` logic handle multiple tracks correctly with departments?
        // My implementation: 
        /*
        for (const trackName of tracks) {
             if (PREMIUM) ...
             else {
                 for (const dept of departments) ...
             }
        }
        */
        // If I pass { tracks: ['CORE', 'IT'], departments: ['ECE', 'CSE'] },
        // it assigns ECE AND CSE to CORE, AND ECE AND CSE to IT.
        // It does FULL CROSS PRODUCT of tracks and departments (except Premium).
        // The UI might restrict this?
        // SetupScopePage.jsx: `departments` state is single list.
        // So yes, currently if you select CORE and IT, and ECE and CSE, you get:
        // CORE+ECE, CORE+CSE
        // IT+ECE, IT+CSE

        // The user verified "Cross-Scope Leak" test scenario:
        // "Faculty scope: CORE + ECE, IT + CSE"
        // "Student: CORE + CSE"
        // "Expected: NOT visible"

        // WAIT. If the Setup UI / Logic creates entries for ALL combinations, then CORE+CSE *IS* a valid scope!
        // If the faculty selects CORE and IT, and ECE and CSE.
        // Then they ARE allowed to evaluate CORE students in CSE.
        // So checking for leak of CORE+CSE is only valid if we CAN define scopes independently.
        // The current `SetupScopePage` and `setupScope` service creates a matrix.
        // "Select tracks... Select departments (Required for CORE/IT)".
        // It implies "I can do these tracks in these departments".
        // So CORE+CSE IS valid if ECE, CSE selected.

        // To properly test "Cross-Scope Leak" as defined by user ("CORE+ECE" and "IT+CSE"),
        // the faculty needs to have ONLY those 2 combinations.
        // But `setupScope` API doesn't support fine-grained combinations yet?
        // `setupScope` takes `{ tracks: [], departments: [] }`.

        // HOWEVER, I can manually insert the scopes to test the READER logic (SessionPlannerService).
        // The User's "Refinements" were about the READER logic preventing leaks *if* the data is disjoint.

        // So for Test 2, I will manually clear scopes and insert specific disjoint scopes.
        await client.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        const trackRes = await client.query("SELECT id, name FROM tracks");
        const tracks = Object.fromEntries(trackRes.rows.map(t => [t.name, t.id]));

        await client.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'ECE', true, gen_random_uuid())", [facultyId, tracks['CORE']]);
        await client.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, 'CSE', true, gen_random_uuid())", [facultyId, tracks['IT']]);

        // Now we have: CORE+ECE and IT+CSE.
        // Student C is CORE+CSE.
        // If query is `track IN (CORE, IT) AND dept IN (ECE, CSE)`, then Student C (CORE, CSE) matches! -> LEAK.
        // If query is `(track=CORE AND dept=ECE) OR (track=IT AND dept=CSE)`, then Student C does NOT match. -> CORRECT.

        const results2 = await sessionPlannerService.getScopedStudents('dummy_session_id', facultyId);
        const map2 = results2.map(r => r.person_id);

        console.log("Results (Expect A, B):", results2.map(r => r.display_name));
        if (!map2.includes(studentA)) console.error("FAILED: Student A missing");
        if (!map2.includes(studentB)) console.error("FAILED: Student B missing");
        if (map2.includes(studentC)) console.error("FAILED: LEAK DETECTED! Student C (CORE+CSE) matched disjoint scope.");
        else console.log("SUCCESS: Student C excluded (No leak).");

        // 4. Test PREMIUM
        console.log("\n--- Test 3: PREMIUM Logic ---");
        // Add Premium Scope
        await client.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id = $1", [facultyId]);
        await client.query("INSERT INTO faculty_evaluation_scope (id, faculty_id, track_id, department_id, is_active, scope_version) VALUES (gen_random_uuid(), $1, $2, NULL, true, gen_random_uuid())", [facultyId, tracks['PREMIUM']]);

        const results3 = await sessionPlannerService.getScopedStudents('dummy_session_id', facultyId);
        const map3 = results3.map(r => r.person_id);

        console.log("Results (Expect D):", results3.map(r => r.display_name));
        if (map3.includes(studentD)) console.log("SUCCESS: Student D (PREMIUM) found.");
        else console.error("FAILED: Student D missing.");

        if (map3.includes(studentA)) console.error("FAILED: Student A (CORE) leaked into PREMIUM scope.");

    } catch (err) {
        console.error("Verification Script Error:", err.message);
        if (err.detail) console.error("Detail:", err.detail);
        if (err.table) console.error("Table:", err.table);
    } finally {
        // Cleanup
        console.log("\nCleaning up...");
        await client.query("DELETE FROM persons WHERE email LIKE '%@test.com'");
        await client.query("DELETE FROM users WHERE email LIKE '%@test.com'");
        await client.query("DELETE FROM student_track_selections WHERE person_id IN (SELECT person_id FROM persons WHERE email LIKE '%@test.com')"); // cascading?
        await client.query("DELETE FROM faculty_evaluation_scope WHERE faculty_id IN (SELECT user_id FROM users WHERE email LIKE '%@test.com')");

        client.release();
        await pool.end();
    }
}

verifyGovernance();
