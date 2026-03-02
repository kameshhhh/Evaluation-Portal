const { query } = require("../src/config/database");

(async () => {
  // 1. Session details for a1b318aa
  const s = await query(`SELECT id, title, academic_year, semester, status FROM faculty_evaluation_sessions WHERE id::text LIKE 'a1b318aa%'`);
  console.log("SESSION:", JSON.stringify(s.rows, null, 2));

  // 2. Student track selections
  const sts = await query(`SELECT sts.person_id, p.display_name, sts.academic_year, sts.semester, sts.track FROM student_track_selections sts JOIN persons p ON p.person_id = sts.person_id`);
  console.log("STUDENT TRACKS:", JSON.stringify(sts.rows, null, 2));

  // 3. Faculty scope (sample)
  const fs = await query(`SELECT fes.faculty_id, fes.track_id, t.name as track_name, fes.department_code, fes.is_active FROM faculty_evaluation_scope fes JOIN tracks t ON t.id = fes.track_id LIMIT 10`);
  console.log("FACULTY SCOPE (sample):", JSON.stringify(fs.rows, null, 2));

  // 4. Who is faculty 9c1bc138?
  const f = await query(`SELECT person_id, identity_id, display_name FROM persons WHERE person_id = '9c1bc138-6785-487e-a799-bb0a65808982' OR identity_id = '9c1bc138-6785-487e-a799-bb0a65808982'`);
  console.log("FACULTY 9c1bc:", JSON.stringify(f.rows, null, 2));

  // 5. Who is student 427eaa94?
  const st = await query(`SELECT person_id, identity_id, display_name FROM persons WHERE person_id = '427eaa94-077f-4386-b923-867b0d3a30ff' OR identity_id = '427eaa94-077f-4386-b923-867b0d3a30ff'`);
  console.log("STUDENT 427e:", JSON.stringify(st.rows, null, 2));

  // 6. All sessions
  const allS = await query(`SELECT id, title, academic_year, semester FROM faculty_evaluation_sessions`);
  console.log("ALL SESSIONS:", JSON.stringify(allS.rows, null, 2));

  // 7. All persons
  const allP = await query(`SELECT person_id, identity_id, display_name, person_type, department_code FROM persons WHERE is_deleted = false`);
  console.log("ALL PERSONS:", JSON.stringify(allP.rows, null, 2));

  // 8. Current assignments
  const ca = await query(`SELECT session_id, faculty_id, student_id, status FROM session_planner_assignments WHERE status != 'removed'`);
  console.log("CURRENT ASSIGNMENTS:", ca.rows.length, "rows");

  // 9. Check req.user structure from auth middleware
  const users = await query(`SELECT u.internal_user_id, u.user_role, u.email FROM users u LIMIT 5`);
  console.log("USERS:", JSON.stringify(users.rows, null, 2));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
