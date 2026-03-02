/**
 * DELETE SELECTED DATA — per user choices
 * Removes: test users, all sessions, all eval data, all peer data + trait questions
 */
require("dotenv").config();
const { pool } = require("../src/config/database");

const TEST_PERSONS = [
  { id: "4e520064-77af-424d-841e-fea43269ae54", name: "DR. MEENA IYER" },
  { id: "51e34fe2-b301-4eb1-985c-1de5fb10c655", name: "PRIYA SHARMA" },
  { id: "cdc9dc37-0f0d-4c13-9791-96a2d1b6bc58", name: "RAHUL KUMAR" },
  { id: "09865c4c-39c3-4a18-b690-2f01f681cec0", name: "ANITHA RAJ" },
  { id: "048513f4-16fd-40bb-8f5a-d4c393c54392", name: "VIJAY KRISHNAN" },
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const del = async (table, where = "") => {
      const r = await client.query(`DELETE FROM ${table} ${where}`);
      console.log(`  🗑  ${table}: ${r.rowCount} rows deleted`);
      return r.rowCount;
    };

    // ════════════════════════════════════════════
    // 1. EVALUATION DATA (delete first — FK deps)
    // ════════════════════════════════════════════
    console.log("\n=== DELETING EVALUATION DATA ===");
    await del("final_student_results");
    await del("assignment_score_events");
    await del("session_planner_assignments");
    await del("judge_credibility_metrics");

    // ════════════════════════════════════════════
    // 2. ALL SESSIONS
    // ════════════════════════════════════════════
    console.log("\n=== DELETING ALL SESSIONS ===");
    await del("faculty_evaluation_sessions");

    // ════════════════════════════════════════════
    // 3. PEER RANKING DATA + TRAIT QUESTIONS
    // ════════════════════════════════════════════
    console.log("\n=== DELETING PEER RANKING DATA ===");
    await del("peer_safeguard_flags");
    await del("peer_ranking_aggregates");
    await del("peer_ranking_responses");
    await del("peer_ranking_surveys");
    await del("peer_groups");
    await del("default_trait_questions");

    // ════════════════════════════════════════════
    // 4. TEST USERS (persons + users)
    // ════════════════════════════════════════════
    console.log("\n=== DELETING TEST USERS ===");
    for (const p of TEST_PERSONS) {
      // Get identity_id to delete from users table
      const personRow = await client.query(
        `SELECT identity_id FROM persons WHERE person_id = $1`,
        [p.id]
      );
      const identityId = personRow.rows[0]?.identity_id;

      // Delete person first (FK on identity_id)
      const pr = await client.query(`DELETE FROM persons WHERE person_id = $1`, [p.id]);
      console.log(`  🗑  person: ${p.name} — ${pr.rowCount} deleted`);

      // Delete linked user
      if (identityId) {
        const ur = await client.query(
          `DELETE FROM users WHERE internal_user_id = $1`, [identityId]
        );
        console.log(`  🗑  user: ${identityId.slice(0, 8)}... — ${ur.rowCount} deleted`);
      }
    }

    await client.query("COMMIT");
    console.log("\n✅ ALL SELECTED DATA DELETED SUCCESSFULLY\n");

    // ════════════════════════════════════════════
    // VERIFY — show what remains
    // ════════════════════════════════════════════
    console.log("=== REMAINING DATA ===");
    const q = async (s) => (await pool.query(s)).rows;

    const users = await q(`
      SELECT p.display_name, p.person_type, p.department_code, u.normalized_email
      FROM users u LEFT JOIN persons p ON p.identity_id = u.internal_user_id
      ORDER BY p.person_type, p.display_name
    `);
    console.log(`\nUsers/Persons: ${users.length}`);
    users.forEach((r) =>
      console.log(`  ${r.display_name || "—"} | ${r.person_type || "—"} | ${r.department_code || "—"} | ${r.normalized_email}`)
    );

    const tables = [
      "faculty_evaluation_sessions", "session_planner_assignments",
      "assignment_score_events", "final_student_results", "judge_credibility_metrics",
      "peer_ranking_surveys", "peer_ranking_responses", "peer_ranking_aggregates",
      "peer_safeguard_flags", "peer_groups", "default_trait_questions"
    ];
    console.log("\nTable row counts:");
    for (const t of tables) {
      const r = await q(`SELECT COUNT(*) as count FROM ${t}`);
      console.log(`  ${t}: ${r[0].count}`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ ROLLBACK —", e.message);
    console.error(e.stack);
  } finally {
    client.release();
    pool.end();
  }
})();
