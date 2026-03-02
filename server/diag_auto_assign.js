const {query} = require('./src/config/database');
(async () => {
  try {
    const sessions = await query(`SELECT id, title, academic_year, semester, status, auto_suggested, min_judges, preferred_rubric_ids FROM faculty_evaluation_sessions ORDER BY created_at`);
    console.log('=== SESSIONS ===');
    sessions.rows.forEach(s => console.log(JSON.stringify(s)));

    const sts = await query(`SELECT sts.person_id, p.display_name, sts.academic_year, sts.semester, sts.track, p.department_code FROM student_track_selections sts JOIN persons p ON p.person_id = sts.person_id`);
    console.log('\n=== STUDENT TRACK SELECTIONS ===');
    sts.rows.forEach(s => console.log(JSON.stringify(s)));

    const asgn = await query(`SELECT session_id, COUNT(*) as count FROM session_planner_assignments WHERE status != 'removed' GROUP BY session_id`);
    console.log('\n=== EXISTING ASSIGNMENTS ===');
    asgn.rows.forEach(a => console.log(JSON.stringify(a)));

    const scope = await query(`SELECT fes.faculty_id, p.display_name, t.name as track, fes.department_code, fes.is_active FROM faculty_evaluation_scope fes JOIN persons p ON p.identity_id = fes.faculty_id JOIN tracks t ON t.id = fes.track_id WHERE fes.is_active = true LIMIT 10`);
    console.log('\n=== FACULTY SCOPE (first 10) ===');
    scope.rows.forEach(s => console.log(JSON.stringify(s)));

    // Check the specific session from the screenshot
    const s4 = await query(`SELECT * FROM faculty_evaluation_sessions WHERE id LIKE 'a1b318aa%'`);
    console.log('\n=== SESSION S4 DETAIL ===');
    s4.rows.forEach(s => console.log(JSON.stringify(s)));

    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
