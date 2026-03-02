const {pool} = require('./src/config/database');
(async () => {
  try {
    const SID = 'a1b318aa-5654-4a31-90d8-3ebfec942820';

    // Check final_student_results column names
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'final_student_results' ORDER BY ordinal_position
    `);
    console.log('=== FSR COLUMNS ===');
    console.log(cols.rows.map(r => r.column_name).join(', '));

    // Cap marks > 5 to 5
    const upd = await pool.query(`
      UPDATE session_planner_assignments SET marks = 5
      WHERE session_id = $1 AND marks > 5
      RETURNING id, marks
    `, [SID]);
    console.log(`\n=== CAPPED ${upd.rowCount} assignments to marks=5 ===`);
    if (upd.rowCount > 0) console.table(upd.rows);

    // Delete existing final results so we can re-finalize cleanly
    const del = await pool.query(`
      DELETE FROM final_student_results WHERE session_id = $1
    `, [SID]);
    console.log(`\nDeleted ${del.rowCount} final_student_results for re-finalization`);

    // Delete existing credibility metrics so they recalculate with scale_max=5
    const del2 = await pool.query(`DELETE FROM judge_credibility_metrics`);
    console.log(`Deleted ${del2.rowCount} judge_credibility_metrics for fresh recalc`);

    // Reset session status to allow re-finalization
    await pool.query(`
      UPDATE faculty_evaluation_sessions SET status = 'evaluation_done' WHERE id = $1
    `, [SID]);
    console.log('Reset session status to evaluation_done');

    // Verify
    const verify = await pool.query(`
      SELECT spa.id, sp.display_name as student, fp.display_name as faculty, spa.marks
      FROM session_planner_assignments spa
      JOIN persons sp ON sp.person_id = spa.student_id
      JOIN persons fp ON fp.person_id = spa.faculty_id
      WHERE spa.session_id = $1
      ORDER BY sp.display_name, fp.display_name
    `, [SID]);
    console.log('\n=== ASSIGNMENTS AFTER CLEANUP ===');
    console.table(verify.rows);

  } catch(e) { console.error(e); }
  finally { pool.end(); }
})();
