require('dotenv').config();
const { query, pool } = require('./src/config/database');

/**
 * MULTI-SESSION CREDIBILITY DEMO
 * ================================
 * Simulates 3 sessions with DIFFERENT grading patterns to show
 * the credibility engine differentiating judge weights.
 *
 * Session 1: Both judges agree (already done)
 * Session 2: HARISH P inflates marks, Kamesh D stays fair
 * Session 3: Pattern continues, credibility diverges more
 */

(async () => {
  const sessionIds = [
    '8539ed91-c567-4070-861c-e1fa4707b12b',  // Feb S1 - 3rd Year (sem=1)
    '4cebe809-10b2-4276-a419-b5a3ee4ac63d',  // Feb S3 - 3rd Year (sem=6)
  ];

  const HARISH_ID = '9c1bc138-6785-487e-a799-bb0a65808982';
  const KAMESH_FAC_ID = 'b4d5d9b3-54bf-491f-bfcf-31647b9d10d7';
  
  // Reset credibility metrics so we start fresh
  await query(`DELETE FROM judge_credibility_metrics WHERE evaluator_id IN ($1, $2)`, [HARISH_ID, KAMESH_FAC_ID]);
  console.log('Reset: judge_credibility_metrics cleared for both judges');

  // Also reset Session 1 (Feb S4) so it can be re-finalized as baseline
  const SESSION_1 = 'a1b318aa-5654-4a31-90d8-3ebfec942820';
  await query(`UPDATE faculty_evaluation_sessions SET status = 'active', finalized_at = NULL, credibility_snapshot = NULL WHERE id = $1`, [SESSION_1]);
  await query(`DELETE FROM final_student_results WHERE session_id = $1`, [SESSION_1]);
  console.log('Reset: Session 1 (Feb S4) ready for re-finalization');

  // Get student IDs
  const studentsRes = await query(`SELECT person_id, display_name FROM persons WHERE person_type = 'student' AND status = 'active' ORDER BY display_name`);
  const students = studentsRes.rows;
  console.log('Students:', students.map(s => s.display_name).join(', '));

  // ====== SESSION 1: Both agree (re-finalize baseline) ======
  console.log('\n========================================');
  console.log('SESSION 1: Both judges agree (baseline)');
  console.log('========================================');
  const CredibilityService = require('./src/services/credibility/CredibilityService');
  const result1 = await CredibilityService.finalizeSession(SESSION_1);
  console.log('Pipeline:', result1.pipeline);
  for (const [jid, data] of Object.entries(result1.judges)) {
    const name = jid === HARISH_ID ? 'HARISH P' : 'Kamesh D';
    console.log(`  ${name}: alignment=${data.alignment} stability=${data.stability} discipline=${data.discipline} composite=${data.composite} mapped_cred=${data.mapped} band=${data.band}`);
  }

  // ====== SESSION 2: HARISH inflates, KAMESH stays fair ======
  console.log('\n========================================');
  console.log('SESSION 2: HARISH inflates, KAMESH fair');
  console.log('========================================');

  const session2 = sessionIds[0];
  
  // Clean up any existing data (score events first due to FK)
  await query(`DELETE FROM assignment_score_events WHERE session_id = $1`, [session2]);
  await query(`DELETE FROM session_planner_assignments WHERE session_id = $1`, [session2]);
  await query(`DELETE FROM final_student_results WHERE session_id = $1`, [session2]);
  await query(`UPDATE faculty_evaluation_sessions SET status = 'active', finalized_at = NULL, credibility_snapshot = NULL WHERE id = $1`, [session2]);

  // Create assignments with marks
  // HARISH: inflated (gives HIGH marks to everyone - 12, 13, 11, 12, 13, 11)
  // KAMESH: fair/balanced (gives spread marks - 8, 5, 7, 9, 4, 6)
  const harishMarks2  = [12, 13, 11, 12, 13, 11];  // Inflation pattern
  const kameshMarks2  = [8, 5, 7, 9, 4, 6];       // Fair/balanced spread

  for (let i = 0; i < students.length; i++) {
    // HARISH assignment
    await query(`
      INSERT INTO session_planner_assignments (session_id, student_id, faculty_id, assigned_by, marks, status, marks_submitted_at)
      VALUES ($1, $2, $3, $3, $4, 'evaluation_done', NOW())
    `, [session2, students[i].person_id, HARISH_ID, harishMarks2[i]]);

    // KAMESH assignment  
    await query(`
      INSERT INTO session_planner_assignments (session_id, student_id, faculty_id, assigned_by, marks, status, marks_submitted_at)
      VALUES ($1, $2, $3, $3, $4, 'evaluation_done', NOW())
    `, [session2, students[i].person_id, KAMESH_FAC_ID, kameshMarks2[i]]);
  }
  console.log('Assignments created. HARISH:', harishMarks2, 'KAMESH:', kameshMarks2);

  // Also insert score events
  const assignsS2 = await query(`SELECT id, session_id, marks FROM session_planner_assignments WHERE session_id = $1`, [session2]);
  for (const a of assignsS2.rows) {
    await query(`INSERT INTO assignment_score_events (assignment_id, session_id, marks, submitted_at) VALUES ($1, $2, $3, NOW())`, [a.id, a.session_id, a.marks]);
  }

  // Finalize session 2
  const result2 = await CredibilityService.finalizeSession(session2);
  
  console.log('\n--- Session 2 Results ---');
  console.log('Pipeline:', result2.pipeline);
  for (const [jid, data] of Object.entries(result2.judges)) {
    const name = jid === HARISH_ID ? 'HARISH P' : 'Kamesh D';
    console.log(`  ${name}: alignment=${data.alignment} stability=${data.stability} discipline=${data.discipline} composite=${data.composite} mapped_cred=${data.mapped} band=${data.band} flags=${data.flags.join(',')}`);
  }

  // Show student scores for session 2
  const fsr2 = await query(`
    SELECT fsr.normalized_score, fsr.aggregated_score, fsr.confidence_score, fsr.credibility_breakdown, ps.display_name
    FROM final_student_results fsr JOIN persons ps ON ps.person_id = fsr.student_id
    WHERE fsr.session_id = $1 ORDER BY fsr.normalized_score DESC
  `, [session2]);
  console.log('\n--- Student Scores (Session 2) ---');
  fsr2.rows.forEach(r => {
    const diff = (parseFloat(r.normalized_score) - parseFloat(r.aggregated_score)).toFixed(4);
    console.log(`  ${r.display_name}: raw=${r.aggregated_score} weighted=${r.normalized_score} confidence=${parseFloat(r.confidence_score).toFixed(3)} DIFF=${diff}`);
  });

  // ====== SESSION 3: HARISH even more extreme ======
  console.log('\n========================================');
  console.log('SESSION 3: HARISH more extreme inflation');
  console.log('========================================');

  const session3 = sessionIds[1];

  await query(`DELETE FROM assignment_score_events WHERE session_id = $1`, [session3]);
  await query(`DELETE FROM session_planner_assignments WHERE session_id = $1`, [session3]);
  await query(`DELETE FROM final_student_results WHERE session_id = $1`, [session3]);
  await query(`UPDATE faculty_evaluation_sessions SET status = 'active', finalized_at = NULL, credibility_snapshot = NULL WHERE id = $1`, [session3]);

  // HARISH: extreme inflation (14, 14, 13, 15, 14, 13) - max everywhere
  // KAMESH: fair differentiation (7, 3, 9, 12, 5, 4) - clear spread
  const harishMarks3  = [14, 14, 13, 15, 14, 13];
  const kameshMarks3  = [7, 3, 9, 12, 5, 4];

  for (let i = 0; i < students.length; i++) {
    await query(`
      INSERT INTO session_planner_assignments (session_id, student_id, faculty_id, assigned_by, marks, status, marks_submitted_at)
      VALUES ($1, $2, $3, $3, $4, 'evaluation_done', NOW())
    `, [session3, students[i].person_id, HARISH_ID, harishMarks3[i]]);

    await query(`
      INSERT INTO session_planner_assignments (session_id, student_id, faculty_id, assigned_by, marks, status, marks_submitted_at)
      VALUES ($1, $2, $3, $3, $4, 'evaluation_done', NOW())
    `, [session3, students[i].person_id, KAMESH_FAC_ID, kameshMarks3[i]]);
  }
  console.log('Assignments created. HARISH:', harishMarks3, 'KAMESH:', kameshMarks3);

  const assignsS3 = await query(`SELECT id, session_id, marks FROM session_planner_assignments WHERE session_id = $1`, [session3]);
  for (const a of assignsS3.rows) {
    await query(`INSERT INTO assignment_score_events (assignment_id, session_id, marks, submitted_at) VALUES ($1, $2, $3, NOW())`, [a.id, a.session_id, a.marks]);
  }

  const result3 = await CredibilityService.finalizeSession(session3);

  console.log('\n--- Session 3 Results ---');
  console.log('Pipeline:', result3.pipeline);
  for (const [jid, data] of Object.entries(result3.judges)) {
    const name = jid === HARISH_ID ? 'HARISH P' : 'Kamesh D';
    console.log(`  ${name}: alignment=${data.alignment} stability=${data.stability} discipline=${data.discipline} composite=${data.composite} mapped_cred=${data.mapped} band=${data.band} flags=${data.flags.join(',')}`);
  }

  const fsr3 = await query(`
    SELECT fsr.normalized_score, fsr.aggregated_score, fsr.confidence_score, fsr.credibility_breakdown, ps.display_name
    FROM final_student_results fsr JOIN persons ps ON ps.person_id = fsr.student_id
    WHERE fsr.session_id = $1 ORDER BY fsr.normalized_score DESC
  `, [session3]);
  console.log('\n--- Student Scores (Session 3) ---');
  fsr3.rows.forEach(r => {
    const diff = (parseFloat(r.normalized_score) - parseFloat(r.aggregated_score)).toFixed(4);
    console.log(`  ${r.display_name}: raw=${r.aggregated_score} weighted=${r.normalized_score} confidence=${parseFloat(r.confidence_score).toFixed(3)} DIFF=${diff}`);
  });

  // ====== FINAL CREDIBILITY STATE ======
  console.log('\n========================================');
  console.log('FINAL JUDGE CREDIBILITY (after 3 sessions)');
  console.log('========================================');
  const jcm = await query('SELECT * FROM judge_credibility_metrics ORDER BY credibility_score DESC');
  jcm.rows.forEach(r => {
    const name = r.evaluator_id === HARISH_ID ? 'HARISH P' : 'Kamesh D';
    const history = r.history || [];
    console.log(`  ${name}: credibility_score=${parseFloat(r.credibility_score).toFixed(4)} sessions=${r.participation_count}`);
    history.forEach((h, i) => {
      console.log(`    Session ${i+1}: alignment=${h.alignment_score?.toFixed(3)} stability=${h.stability_score?.toFixed(3)} discipline=${h.discipline_score?.toFixed(3)} composite=${h.composite?.toFixed(3)} band=${h.smoothed_band}`);
    });
  });

  console.log('\n✅ Demo complete. The credibility engine differentiates judges based on:');
  console.log('   ① Alignment (consensus deviation, exp decay)');
  console.log('   ② Stability (cross-session consistency)');
  console.log('   ③ Discipline (marks distribution quality, Gini)');
  console.log('   ④ Compositor (weighted fusion + penalties)');
  console.log('   ⑤ EMA Smoother (dynamic alpha + clamping)');

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
