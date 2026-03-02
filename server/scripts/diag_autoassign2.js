const { query } = require("../src/config/database");

(async () => {
  // Full scope entries count per faculty
  const scopeCount = await query(`
    SELECT fes.faculty_id, COUNT(*) as scope_count
    FROM faculty_evaluation_scope fes
    WHERE fes.is_active = true
    GROUP BY fes.faculty_id
  `);
  console.log("SCOPE COUNTS:", JSON.stringify(scopeCount.rows, null, 2));

  // Check auto_suggested flag
  const sessions = await query(`SELECT id, title, auto_suggested, status FROM faculty_evaluation_sessions`);
  console.log("SESSIONS:", JSON.stringify(sessions.rows, null, 2));

  // Check existing assignments
  const assignments = await query(`SELECT session_id, COUNT(*) as count FROM session_planner_assignments WHERE status != 'removed' GROUP BY session_id`);
  console.log("ASSIGNMENTS BY SESSION:", JSON.stringify(assignments.rows, null, 2));

  // Test the student loading query (from assignBatch)
  const sessionId = 'a1b318aa-5654-4a31-90d8-3ebfec942820';
  const students = await query(`
    SELECT p.person_id, p.display_name, sts.track, p.department_code
    FROM persons p
    JOIN student_track_selections sts ON sts.person_id = p.person_id
    JOIN users u ON u.internal_user_id = p.identity_id
    JOIN faculty_evaluation_sessions fes ON fes.id = $1
    WHERE u.user_role = 'student'
      AND p.status = 'active' AND p.is_deleted = false
      AND sts.academic_year = fes.academic_year
  `, [sessionId]);
  console.log("STUDENTS FOR SESSION (year-only filter):", students.rows.length, JSON.stringify(students.rows, null, 2));

  // Test getSuggestions scope check for first student
  if (students.rows.length > 0) {
    const st = students.rows[0];
    const candidates = await query(`
      SELECT p.person_id, p.display_name, p.identity_id
      FROM persons p
      JOIN users u ON u.internal_user_id = p.identity_id
      WHERE u.user_role IN ('faculty', 'admin')
        AND p.status = 'active'
        AND EXISTS (
          SELECT 1 FROM faculty_evaluation_scope fes
          JOIN tracks t ON fes.track_id = t.id
          WHERE fes.faculty_id = p.identity_id
            AND fes.is_active = true
            AND UPPER(t.name) = UPPER($1)
            AND (fes.department_code IS NULL OR fes.department_code = $2)
        )
    `, [st.track, st.department_code]);
    console.log(`CANDIDATES for ${st.display_name} (track=${st.track}, dept=${st.department_code}):`, JSON.stringify(candidates.rows, null, 2));
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
