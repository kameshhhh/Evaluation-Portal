require('dotenv').config();
const { query, pool } = require('../src/config/database');

(async () => {
  try {
    const sid = 'dac68db2-e8ee-413f-9d4c-6b9980f286f4';

    // 1. Session status
    const sess = await query('SELECT id, status, credibility_snapshot, snapshot_version, finalized_at FROM faculty_evaluation_sessions WHERE id = $1', [sid]);
    console.log('\n=== SESSION ===');
    console.log('Status:', sess.rows[0]?.status);
    console.log('Finalized:', sess.rows[0]?.finalized_at);
    console.log('Snapshot:', sess.rows[0]?.credibility_snapshot ? 'EXISTS' : 'NULL');

    // 2. Assignments with evaluation_done
    const assigns = await query("SELECT faculty_id, student_id, status, marks FROM session_planner_assignments WHERE session_id = $1 AND status = 'evaluation_done'", [sid]);
    console.log('\n=== ASSIGNMENTS (evaluation_done) ===');
    console.log('Count:', assigns.rows.length);
    assigns.rows.slice(0, 3).forEach(r => console.log(`  Faculty: ${r.faculty_id.slice(0,8)}... Student: ${r.student_id.slice(0,8)}... Marks: ${r.marks}`));

    // 3. All assignment statuses
    const allAssigns = await query("SELECT status, COUNT(*)::int as cnt FROM session_planner_assignments WHERE session_id = $1 GROUP BY status", [sid]);
    console.log('\n=== ALL ASSIGNMENT STATUSES ===');
    allAssigns.rows.forEach(r => console.log(`  ${r.status}: ${r.cnt}`));

    // 4. Check judge_credibility_metrics
    const jcm = await query('SELECT evaluator_id, credibility_score FROM judge_credibility_metrics LIMIT 5');
    console.log('\n=== JUDGE CREDIBILITY METRICS ===');
    console.log('Total rows:', jcm.rows.length);
    jcm.rows.forEach(r => console.log(`  ${r.evaluator_id.slice(0,8)}... score: ${r.credibility_score}`));

    // 5. final_student_results
    const fsr = await query('SELECT * FROM final_student_results WHERE session_id = $1', [sid]);
    console.log('\n=== FINAL STUDENT RESULTS ===');
    console.log('Count:', fsr.rows.length);

    // 6. Test pool.connect()
    console.log('\n=== POOL TEST ===');
    const client = await pool.connect();
    console.log('pool.connect() WORKS');
    client.release();

    // 7. Try manually calling CredibilityService
    console.log('\n=== CREDIBILITY SERVICE TEST ===');
    const CredibilityService = require('../src/services/credibility/CredibilityService');
    console.log('Module loaded:', typeof CredibilityService);
    console.log('finalizeSession fn:', typeof CredibilityService.finalizeSession);

    // 8. Attempt the actual finalization
    console.log('\n=== ATTEMPTING FINALIZATION ===');
    const result = await CredibilityService.finalizeSession(sid);
    console.log('SUCCESS:', JSON.stringify(result));

    process.exit(0);
  } catch (e) {
    console.error('\n=== FINALIZATION ERROR ===');
    console.error('Message:', e.message);
    console.error('Code:', e.code);
    console.error('Detail:', e.detail);
    console.error('Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
})();
