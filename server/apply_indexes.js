// Migration: Add performance indexes for 10K-scale finalization
// Run once: node apply_indexes.js

const { query } = require('./src/config/database');

(async () => {
  try {
    console.log('Creating indexes...');

    // Composite index for the hot path: calculateStudentScore
    // Covers: WHERE session_id=$1 AND student_id=$2 AND status='evaluation_done'
    await query(`
      CREATE INDEX IF NOT EXISTS idx_spa_session_student_status
      ON session_planner_assignments (session_id, student_id, status)
    `);
    console.log('  ✓ idx_spa_session_student_status');

    // Index on session_date for year filter in sessionReportController
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fes_session_date
      ON faculty_evaluation_sessions (session_date)
    `);
    console.log('  ✓ idx_fes_session_date');

    // Partial index for evaluation_done rows (most common filter)
    await query(`
      CREATE INDEX IF NOT EXISTS idx_spa_eval_done
      ON session_planner_assignments (session_id, student_id)
      WHERE status = 'evaluation_done'
    `);
    console.log('  ✓ idx_spa_eval_done');

    console.log('All indexes created successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
