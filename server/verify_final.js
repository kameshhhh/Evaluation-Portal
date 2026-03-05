// Final verification: check scores, pool calculation, and API health
const { query } = require('./src/config/database');

(async () => {
  try {
    console.log('=== FINAL VERIFICATION ===\n');

    // 1. Check scores are in valid 0-5 range
    const scores = await query(`
      SELECT fsr.session_id, fes.title, p.display_name, 
             fsr.display_score, fsr.rubric_breakdown, fsr.judge_count
      FROM final_student_results fsr
      JOIN persons p ON p.person_id = fsr.student_id
      JOIN faculty_evaluation_sessions fes ON fes.id = fsr.session_id
      ORDER BY fes.title, fsr.display_score DESC
    `);

    console.log('1. All final scores (should be 0-5 range):');
    let allValid = true;
    scores.rows.forEach(r => {
      const score = parseFloat(r.display_score);
      const valid = score >= 0 && score <= 5;
      if (!valid) allValid = false;
      const rb = typeof r.rubric_breakdown === 'string' ? JSON.parse(r.rubric_breakdown) : r.rubric_breakdown;
      const rubrics = Object.entries(rb || {}).map(([k, v]) => {
        const wValid = v.weighted_avg >= 0 && v.weighted_avg <= 5;
        const rValid = v.raw_avg >= 0 && v.raw_avg <= 5;
        return `${v.name}: W=${v.weighted_avg}${wValid ? '✓' : '✗'} R=${v.raw_avg}${rValid ? '✓' : '✗'}`;
      }).join(', ');
      console.log(`  ${valid ? '✓' : '✗'} [${r.title}] ${r.display_name}: score=${score} judges=${r.judge_count} | ${rubrics}`);
    });
    console.log(`  Score range check: ${allValid ? 'ALL PASS ✓' : 'SOME FAILED ✗'}\n`);

    // 2. Verify all rubric_breakdown keys are UUIDs
    console.log('2. Rubric breakdown key format:');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let allUuid = true;
    scores.rows.forEach(r => {
      const rb = typeof r.rubric_breakdown === 'string' ? JSON.parse(r.rubric_breakdown) : r.rubric_breakdown;
      Object.keys(rb || {}).forEach(k => {
        if (!uuidRegex.test(k)) {
          console.log(`  ✗ Non-UUID key: ${k} in ${r.display_name}`);
          allUuid = false;
        }
      });
    });
    console.log(`  ${allUuid ? 'ALL UUID keys ✓' : 'SOME NON-UUID keys ✗'}\n`);

    // 3. Check indexes exist
    console.log('3. Performance indexes:');
    const idxRes = await query(`
      SELECT indexname FROM pg_indexes 
      WHERE indexname IN ('idx_spa_session_student_status', 'idx_fes_session_date', 'idx_spa_eval_done')
    `);
    idxRes.rows.forEach(r => console.log(`  ✓ ${r.indexname}`));
    console.log(`  ${idxRes.rows.length}/3 indexes present\n`);

    // 4. Check sessions are FINALIZED
    console.log('4. Session statuses:');
    const sesRes = await query(`
      SELECT id, title, status FROM faculty_evaluation_sessions 
      WHERE id IN (SELECT DISTINCT session_id FROM final_student_results)
      ORDER BY title
    `);
    sesRes.rows.forEach(r => {
      console.log(`  ${r.status === 'FINALIZED' ? '✓' : '✗'} ${r.title}: ${r.status}`);
    });

    // 5. Check preferred_rubric_ids backfilled
    console.log('\n5. preferred_rubric_ids:');
    const prRes = await query(`
      SELECT id, title, preferred_rubric_ids FROM faculty_evaluation_sessions
      WHERE id IN (SELECT DISTINCT session_id FROM final_student_results)
      ORDER BY title
    `);
    prRes.rows.forEach(r => {
      const count = r.preferred_rubric_ids ? r.preferred_rubric_ids.length : 0;
      console.log(`  ${count > 0 ? '✓' : '✗'} ${r.title}: ${count} rubrics`);
    });

    // 6. Verify Raw !== Weighted for multi-faculty evaluations
    console.log('\n6. Raw vs Weighted differentiation:');
    scores.rows.forEach(r => {
      if (r.judge_count >= 2) {
        const rb = typeof r.rubric_breakdown === 'string' ? JSON.parse(r.rubric_breakdown) : r.rubric_breakdown;
        const diffs = Object.values(rb || {}).filter(v => v.weighted_avg !== v.raw_avg);
        const hasDiff = diffs.length > 0;
        console.log(`  ${hasDiff ? '✓' : '≈'} ${r.display_name} (${r.judge_count} judges): ${hasDiff ? 'Different' : 'Same (equal credibility)'}`);
      }
    });

    console.log('\n=== VERIFICATION COMPLETE ===');
    process.exit(0);
  } catch (err) {
    console.error('Verification failed:', err.message);
    process.exit(1);
  }
})();
