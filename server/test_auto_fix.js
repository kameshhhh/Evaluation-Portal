const {query, getClient} = require('./src/config/database');
const AutoAssignmentService = require('./src/services/autoAssignmentService');

const SESSION_ID = 'a1b318aa-5654-4a31-90d8-3ebfec942820';
const ADMIN_PERSON_ID = '26caec64-4f95-4442-912a-43ea0a9a5da1'; // Kamesh D

(async () => {
  try {
    // 1. Check session
    const sess = await query(`SELECT id, title, academic_year, semester, auto_suggested FROM faculty_evaluation_sessions WHERE id = $1`, [SESSION_ID]);
    console.log('Session:', JSON.stringify(sess.rows[0]));

    // 2. Check existing assignments
    const existing = await query(`SELECT COUNT(*) as cnt FROM session_planner_assignments WHERE session_id = $1 AND status != 'removed'`, [SESSION_ID]);
    console.log('Existing assignments:', existing.rows[0].cnt);

    // 3. Simulate student query (as fixed — no semester join)
    const students = await query(
      `SELECT p.person_id, p.display_name, sts.track, p.department_code
       FROM persons p
       JOIN student_track_selections sts ON sts.person_id = p.person_id
       JOIN users u ON u.internal_user_id = p.identity_id
       JOIN faculty_evaluation_sessions fes ON fes.id = $1
       WHERE u.user_role = 'student'
         AND p.status = 'active' AND p.is_deleted = false
         AND sts.academic_year = fes.academic_year`,
      [SESSION_ID]
    );
    console.log('Students found (fixed query):', students.rows.length);
    students.rows.forEach(s => console.log(' -', s.display_name, s.track, s.department_code));

    // 4. Test suggestions for first student
    if (students.rows.length > 0) {
      const st = students.rows[0];
      console.log('\nGetting suggestions for', st.display_name, '...');
      const suggestions = await AutoAssignmentService.getSuggestions(SESSION_ID, st.person_id, 5);
      console.log('Suggestions:', suggestions.length);
      suggestions.forEach(s => console.log(' -', s.displayName, 'score:', s.scores.total.toFixed(3)));
    }

    // 5. Reset auto_suggested flag if needed
    if (sess.rows[0]?.auto_suggested) {
      console.log('\nResetting auto_suggested flag...');
      await query(`UPDATE faculty_evaluation_sessions SET auto_suggested = FALSE WHERE id = $1`, [SESSION_ID]);
    }

    // 6. Clear existing test assignments for this session
    const cleared = await query(`DELETE FROM session_planner_assignments WHERE session_id = $1 RETURNING id`, [SESSION_ID]);
    console.log('Cleared', cleared.rows.length, 'old assignments');

    // 7. Run assignBatch
    console.log('\nRunning assignBatch...');
    const result = await AutoAssignmentService.assignBatch(SESSION_ID, ADMIN_PERSON_ID, 'test_auto', 2);
    console.log('Result:', JSON.stringify(result));

    // 8. Verify
    const verify = await query(
      `SELECT spa.student_id, p1.display_name as student, p2.display_name as faculty
       FROM session_planner_assignments spa
       JOIN persons p1 ON p1.person_id = spa.student_id
       JOIN persons p2 ON p2.person_id = spa.faculty_id
       WHERE spa.session_id = $1 AND spa.status != 'removed'
       ORDER BY p1.display_name`,
      [SESSION_ID]
    );
    console.log('\nAssignments:');
    verify.rows.forEach(r => console.log(' ', r.student, ' <-- ', r.faculty));

    process.exit(0);
  } catch(e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
