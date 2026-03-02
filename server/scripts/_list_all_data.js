require("dotenv").config();
const { pool } = require("../src/config/database");

(async () => {
  const q = async (s) => (await pool.query(s)).rows;

  // 1. Users + Persons
  console.log("\n=== USERS & PERSONS ===");
  const users = await q(`
    SELECT u.internal_user_id, u.normalized_email, u.user_role,
           p.display_name, p.person_type, p.person_id, p.department_code
    FROM users u
    LEFT JOIN persons p ON p.identity_id = u.internal_user_id
    ORDER BY p.person_type, p.display_name
  `);
  console.log("ID | Email | Role | Name | Type | Dept");
  console.log("-".repeat(100));
  users.forEach((r) =>
    console.log(
      `${(r.person_id || "—").slice(0, 8)} | ${r.normalized_email || "—"} | ${r.user_role} | ${r.display_name || "—"} | ${r.person_type || "—"} | ${r.department_code || "—"}`
    )
  );

  // 2. Sessions
  console.log("\n=== FACULTY EVALUATION SESSIONS ===");
  const ses = await q(`SELECT id, title, status, evaluation_mode, finalized_at FROM faculty_evaluation_sessions ORDER BY title`);
  console.log("ID | Title | Status | Mode | Finalized");
  console.log("-".repeat(100));
  ses.forEach((r) =>
    console.log(`${r.id.slice(0, 8)} | ${r.title} | ${r.status} | ${r.evaluation_mode} | ${r.finalized_at || "—"}`)
  );

  // 3. Assignments
  console.log("\n=== SESSION PLANNER ASSIGNMENTS ===");
  const spa = await q(`
    SELECT spa.session_id, f.display_name as faculty, s.display_name as student, spa.marks, spa.status
    FROM session_planner_assignments spa
    JOIN persons f ON f.person_id = spa.faculty_id
    JOIN persons s ON s.person_id = spa.student_id
    ORDER BY spa.session_id, f.display_name
  `);
  console.log(`Count: ${spa.length}`);
  spa.forEach((r) =>
    console.log(`  ${r.session_id.slice(0, 8)} | ${r.faculty} → ${r.student} | marks=${r.marks ?? "NULL"} | ${r.status}`)
  );

  // 4. Score events
  const ase = await q(`SELECT COUNT(*) as count FROM assignment_score_events`);
  console.log(`\n=== ASSIGNMENT SCORE EVENTS: ${ase[0].count} rows ===`);

  // 5. Final results
  console.log("\n=== FINAL STUDENT RESULTS ===");
  const fsr = await q(`
    SELECT fsr.session_id, p.display_name, fsr.aggregated_score, fsr.normalized_score, fsr.confidence_score
    FROM final_student_results fsr JOIN persons p ON p.person_id = fsr.student_id
    ORDER BY fsr.session_id, p.display_name
  `);
  console.log(`Count: ${fsr.length}`);
  fsr.forEach((r) =>
    console.log(`  ${r.session_id.slice(0, 8)} | ${r.display_name} | avg=${r.aggregated_score} | weighted=${r.normalized_score} | conf=${r.confidence_score}`)
  );

  // 6. Judge credibility
  console.log("\n=== JUDGE CREDIBILITY METRICS ===");
  const jcm = await q(`
    SELECT jcm.evaluator_id, p.display_name, jcm.credibility_score, jcm.participation_count
    FROM judge_credibility_metrics jcm
    LEFT JOIN persons p ON p.person_id = jcm.evaluator_id
  `);
  jcm.forEach((r) =>
    console.log(`  ${r.display_name || r.evaluator_id.slice(0, 8)} | cred=${Number(r.credibility_score).toFixed(4)} | sessions=${r.participation_count}`)
  );

  // 7. Peer ranking tables
  console.log("\n=== PEER RANKING DATA ===");
  const tables = [
    "peer_ranking_surveys", "peer_ranking_responses", "peer_ranking_aggregates",
    "peer_safeguard_flags", "peer_groups"
  ];
  for (const t of tables) {
    const r = await q(`SELECT COUNT(*) as count FROM ${t}`);
    console.log(`  ${t}: ${r[0].count} rows`);
  }

  // 8. Peer surveys detail
  const ps = await q(`SELECT survey_id, title, status, created_at FROM peer_ranking_surveys ORDER BY created_at`);
  if (ps.length) {
    console.log("\n  Surveys:");
    ps.forEach((r) => console.log(`    ${r.survey_id.slice(0, 8)} | ${r.title} | ${r.status} | ${r.created_at}`));
  }

  // 9. Projects
  console.log("\n=== PROJECTS ===");
  const proj = await q(`SELECT project_id, title, status FROM projects ORDER BY title`);
  console.log(`Count: ${proj.length}`);
  proj.forEach((r) => console.log(`  ${r.project_id.slice(0, 8)} | ${r.title} | ${r.status}`));

  // 10. Trait questions
  console.log("\n=== DEFAULT TRAIT QUESTIONS ===");
  const dtq = await q(`SELECT COUNT(*) as count FROM default_trait_questions`);
  console.log(`  Count: ${dtq[0].count} (seeded reference data)`);

  process.exit();
})();
