// Re-finalize all sessions that have final_student_results
// This corrects scores after the pool normalization fix
const { query, pool } = require('./src/config/database');
const CredibilityService = require('./src/services/credibility/CredibilityService');

(async () => {
  try {
    // Find all sessions that were previously finalized
    const sessions = await query(`
      SELECT DISTINCT fsr.session_id, fes.title, fes.status,
             COUNT(fsr.student_id)::int AS student_count
      FROM final_student_results fsr
      JOIN faculty_evaluation_sessions fes ON fes.id = fsr.session_id
      GROUP BY fsr.session_id, fes.title, fes.status
      ORDER BY fes.title
    `);

    console.log(`Found ${sessions.rows.length} sessions to re-finalize:\n`);
    sessions.rows.forEach(s => {
      console.log(`  ${s.session_id.slice(0,8)} | ${s.title} | status=${s.status} | ${s.student_count} students`);
    });

    for (const session of sessions.rows) {
      console.log(`\n--- Re-finalizing: ${session.title} (${session.session_id.slice(0,8)}) ---`);

      // Step 1: Reset status so FOR UPDATE lock allows re-finalization
      await query(
        `UPDATE faculty_evaluation_sessions SET status = 'closed' WHERE id = $1`,
        [session.session_id]
      );

      // Step 2: Clear old final_student_results (they'll be recomputed)
      await query(
        `DELETE FROM final_student_results WHERE session_id = $1`,
        [session.session_id]
      );

      // Step 3: Re-finalize with corrected pool calculation
      try {
        const result = await CredibilityService.finalizeSession(session.session_id);
        console.log(`  ✓ ${result.studentsScored} students scored`);

        // Show sample scores
        const sample = await query(
          `SELECT fsr.student_id, p.display_name, fsr.display_score, fsr.rubric_breakdown
           FROM final_student_results fsr
           JOIN persons p ON p.person_id = fsr.student_id
           WHERE fsr.session_id = $1
           ORDER BY fsr.display_score DESC LIMIT 3`,
          [session.session_id]
        );
        sample.rows.forEach(r => {
          const rb = typeof r.rubric_breakdown === 'string' ? JSON.parse(r.rubric_breakdown) : r.rubric_breakdown;
          const rubrics = Object.values(rb || {}).map(v => `${v.name}:W${v.weighted_avg}/R${v.raw_avg}`).join(', ');
          console.log(`    ${r.display_name}: score=${r.display_score} | ${rubrics}`);
        });
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
      }
    }

    console.log('\n=== Re-finalization complete ===');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
