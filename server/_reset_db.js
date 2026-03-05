const db = require('./src/config/database');
async function reset() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const f = await client.query('DELETE FROM assignment_score_events');
    console.log('F: Deleted', f.rowCount, 'score events');

    const e = await client.query('DELETE FROM session_planner_assignments');
    console.log('E: Deleted', e.rowCount, 'assignments');

    const c = await client.query('DELETE FROM final_student_results');
    console.log('C: Deleted', c.rowCount, 'final results');

    const g1 = await client.query('DELETE FROM faculty_alerts');
    const g2 = await client.query('DELETE FROM score_appeals');
    console.log('G: Deleted', g1.rowCount, 'alerts,', g2.rowCount, 'appeals');

    // B: Delete credibility snapshots (table may not exist)
    try {
      await client.query('SAVEPOINT snap_check');
      const b = await client.query('DELETE FROM judge_credibility_snapshots');
      console.log('B: Deleted', b.rowCount, 'credibility snapshots');
    } catch(e) {
      await client.query('ROLLBACK TO SAVEPOINT snap_check');
      console.log('B: Skipped (table does not exist)');
    }

    const a = await client.query("UPDATE judge_credibility_metrics SET credibility_score = 1.0, alignment_score = NULL, discipline_score = NULL, stability_score = NULL, credibility_band = 'NEW', deviation_index = 0, participation_count = 0, last_updated = NOW()");
    console.log('A: Reset', a.rowCount, 'faculty credibility to 1.0');

    const d1 = await client.query('DELETE FROM faculty_evaluation_sessions');
    const d2 = await client.query('DELETE FROM session_groups');
    console.log('D: Deleted', d1.rowCount, 'sessions,', d2.rowCount, 'session groups');

    await client.query('COMMIT');
    console.log('\n=== ALL DONE ===');

    const verify = await client.query('SELECT evaluator_id, credibility_score, credibility_band FROM judge_credibility_metrics');
    console.log('\nCredibility after reset:');
    verify.rows.forEach(r => console.log('  ', r.evaluator_id.slice(0,8) + '...', 'score:', r.credibility_score, 'band:', r.credibility_band));

    process.exit(0);
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('ROLLBACK:', err.message);
    process.exit(1);
  }
}
reset();
