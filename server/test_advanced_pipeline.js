require('dotenv').config();
const { query, pool } = require('./src/config/database');

(async () => {
  const sessionId = 'a1b318aa-5654-4a31-90d8-3ebfec942820';

  console.log('=== Step 1: Reset session to re-finalize ===');

  // Reset session status back to active
  await query(`UPDATE faculty_evaluation_sessions SET status = 'active', finalized_at = NULL, credibility_snapshot = NULL, snapshot_version = NULL WHERE id = $1`, [sessionId]);
  console.log('Session reset to active');

  // Clear final_student_results
  await query(`DELETE FROM final_student_results WHERE session_id = $1`, [sessionId]);
  console.log('Cleared final_student_results');

  // Reset judge_credibility_metrics (fresh start for the demo)
  await query(`DELETE FROM judge_credibility_metrics`);
  console.log('Cleared judge_credibility_metrics');

  console.log('\n=== Step 2: Re-finalize with advanced pipeline ===');

  const CredibilityService = require('./src/services/credibility/CredibilityService');

  try {
    const result = await CredibilityService.finalizeSession(sessionId);
    console.log('\n=== FINALIZATION RESULT ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Finalization failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  console.log('\n=== Step 3: Check results ===');

  // Check final scores
  const fsr = await query(`
    SELECT fsr.*, ps.display_name 
    FROM final_student_results fsr 
    JOIN persons ps ON ps.person_id = fsr.student_id 
    WHERE fsr.session_id = $1
    ORDER BY fsr.normalized_score DESC
  `, [sessionId]);

  console.log('\n--- STUDENT SCORES ---');
  fsr.rows.forEach(r => {
    console.log(r.display_name,
      '| raw_avg:', r.aggregated_score,
      '| weighted:', r.normalized_score,
      '| confidence:', parseFloat(r.confidence_score).toFixed(4),
      '| judges:', r.judge_count,
      '| DIFF:', (parseFloat(r.normalized_score) - parseFloat(r.aggregated_score)).toFixed(4));
    if (r.credibility_breakdown) {
      console.log('  Breakdown:', JSON.stringify(r.credibility_breakdown));
    }
  });

  // Check credibility metrics
  const jcm = await query('SELECT * FROM judge_credibility_metrics');
  console.log('\n--- JUDGE CREDIBILITY ---');
  jcm.rows.forEach(r => {
    console.log('  Judge:', r.evaluator_id.slice(0,8),
      '| cred:', parseFloat(r.credibility_score).toFixed(4),
      '| normdev:', parseFloat(r.deviation_index).toFixed(4),
      '| sessions:', r.participation_count);
    if (r.history) {
      const last = Array.isArray(r.history) ? r.history[r.history.length - 1] : null;
      if (last) {
        console.log('    Pipeline:', last.pipeline || 'legacy',
          '| alignment:', last.alignment_score?.toFixed(4),
          '| stability:', last.stability_score?.toFixed(4),
          '| discipline:', last.discipline_score?.toFixed(4),
          '| composite:', last.composite?.toFixed(4),
          '| band:', last.smoothed_band);
      }
    }
  });

  // Check snapshot
  const snap = await query(`SELECT credibility_snapshot FROM faculty_evaluation_sessions WHERE id = $1`, [sessionId]);
  console.log('\n--- FROZEN SNAPSHOT ---');
  console.log(JSON.stringify(snap.rows[0].credibility_snapshot));

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
