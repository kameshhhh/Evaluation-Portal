require('dotenv').config();
const { query } = require('./src/config/database');

(async () => {
  // 1. Check judge_credibility_metrics - was NormDev applied?
  try {
    const jcm = await query('SELECT * FROM judge_credibility_metrics');
    console.log('=== JUDGE CREDIBILITY METRICS ===', jcm.rows.length, 'rows');
    jcm.rows.forEach(r => {
      console.log('  evaluator:', r.evaluator_id.slice(0,8),
        '| cred:', r.credibility_score,
        '| normdev:', r.deviation_index,
        '| sessions:', r.participation_count,
        '| history:', JSON.stringify(r.history));
    });
  } catch(e) { console.log('judge_credibility_metrics ERROR:', e.message); }

  // 2. Check the frozen snapshot
  const snap = await query("SELECT credibility_snapshot, snapshot_version FROM faculty_evaluation_sessions WHERE id = 'a1b318aa-5654-4a31-90d8-3ebfec942820'");
  console.log('\n=== FROZEN SNAPSHOT ===');
  console.log(JSON.stringify(snap.rows[0], null, 2));

  // 3. Verify the math for KAMESH D (student) 
  // Marks: Kamesh D faculty = 8, HARISH P = 9
  // With cred 1.0 for both: weighted = (8*1 + 9*1) / (1+1) = 8.5
  // Confidence: CV = stdev([8,9])/mean([8,9]) = 0.5/8.5 = 0.0588, confidence = 1 - 0.0588 = 0.9412
  console.log('\n=== MANUAL VERIFICATION (KAMESH D student) ===');
  console.log('Marks: [8, 9]');
  console.log('Simple avg: (8+9)/2 =', (8+9)/2);
  console.log('Weighted avg (both cred 1.0): (8*1+9*1)/(1+1) =', (8*1+9*1)/(1+1));
  const mean = 8.5;
  const stdev = Math.sqrt(((8-mean)**2 + (9-mean)**2)/2);
  const cv = stdev / mean;
  console.log('CV:', cv.toFixed(4), '→ Confidence:', (1-cv).toFixed(4));

  // 4. Check final_student_results - what's stored
  const fsr = await query(`
    SELECT fsr.*, ps.display_name 
    FROM final_student_results fsr 
    JOIN persons ps ON ps.person_id = fsr.student_id 
    WHERE fsr.session_id = 'a1b318aa-5654-4a31-90d8-3ebfec942820'
    ORDER BY fsr.aggregated_score DESC
  `);
  console.log('\n=== FINAL RESULTS (ALL STUDENTS) ===');
  fsr.rows.forEach(r => {
    console.log(r.display_name, 
      '| raw_avg:', r.aggregated_score, 
      '| weighted:', r.normalized_score,
      '| confidence:', parseFloat(r.confidence_score).toFixed(4),
      '| judges:', r.judge_count,
      '| DIFF(weighted-raw):', (parseFloat(r.normalized_score) - parseFloat(r.aggregated_score)).toFixed(4));
  });

  // 5. Pool usage by faculty
  const pool = await query(`
    SELECT spa.faculty_id, p.display_name, 
           SUM(spa.marks) as total_given,
           COUNT(*) as students_graded
    FROM session_planner_assignments spa
    JOIN persons p ON p.person_id = spa.faculty_id
    WHERE spa.session_id = 'a1b318aa-5654-4a31-90d8-3ebfec942820'
      AND spa.status = 'evaluation_done'
    GROUP BY spa.faculty_id, p.display_name
  `);
  console.log('\n=== POOL USAGE ===');
  pool.rows.forEach(r => console.log(r.display_name, '| total_given:', r.total_given, '| students:', r.students_graded));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
