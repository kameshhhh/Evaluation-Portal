const {query} = require('./src/config/database');
(async () => {
  const r = await query(`
    SELECT indexname, tablename, indexdef 
    FROM pg_indexes 
    WHERE tablename IN (
      'session_planner_assignments','final_student_results',
      'judge_credibility_metrics','faculty_evaluation_sessions',
      'student_track_selections','evaluation_heads'
    ) ORDER BY tablename, indexname
  `);
  r.rows.forEach(row => console.log(row.tablename + ' | ' + row.indexname + ' | ' + row.indexdef));
  process.exit(0);
})();
