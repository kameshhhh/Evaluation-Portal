const { query } = require("./src/config/database");

async function test() {
  try {
    // 1. persons table columns
    const cols = await query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'persons' AND column_name IN ('admission_year','department_code') ORDER BY column_name`,
    );
    console.log("1. persons columns:", cols.rows);

    // 2. session planner tables
    const tables = await query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('student_track_selections','team_formation_requests','team_invitations','session_planner_assignments') ORDER BY table_name`,
    );
    console.log(
      "2. planner tables:",
      tables.rows.map((r) => r.table_name),
    );

    // 3. views
    const views = await query(
      `SELECT table_name FROM information_schema.views WHERE table_schema='public' AND table_name IN ('v_team_details','v_student_planner_info') ORDER BY table_name`,
    );
    console.log(
      "3. planner views:",
      views.rows.map((r) => r.table_name),
    );

    // 4. sample persons with admission_year
    const sample = await query(
      `SELECT person_id, display_name, email, admission_year, department_code FROM persons WHERE admission_year IS NOT NULL LIMIT 5`,
    );
    console.log("4. sample persons:", sample.rows);

    // 5. track selections
    const tracks = await query(
      `SELECT COUNT(*) as cnt, track FROM student_track_selections GROUP BY track`,
    );
    console.log("5. track selections:", tracks.rows);

    // 6. test getAvailableStudents query (simulate)
    const testStudent = await query(
      `SELECT p.person_id, p.admission_year FROM persons p JOIN student_track_selections sts ON sts.person_id = p.person_id LIMIT 1`,
    );
    if (testStudent.rows.length > 0) {
      const { person_id, admission_year } = testStudent.rows[0];
      console.log("6. test student:", person_id, "year:", admission_year);

      // simulate getAvailableStudents query
      const available = await query(
        `SELECT p.person_id, p.display_name, p.admission_year, p.department_code,
                sts.track
         FROM persons p
         JOIN student_track_selections sts ON sts.person_id = p.person_id
         WHERE p.admission_year = $1
         LIMIT 5`,
        [admission_year],
      );
      console.log(
        "7. available students for year",
        admission_year,
        ":",
        available.rows.length,
        "found",
      );
      if (available.rows.length > 0)
        console.log("   sample:", available.rows[0]);
    } else {
      console.log("6. No students with track selections found");
    }

    // 8. test getAllStudents query (used by SessionPlannerPage)
    const allStudents = await query(
      `SELECT p.person_id, p.display_name, p.email, p.admission_year, p.department_code,
              sts.track
       FROM persons p
       LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
       WHERE p.role = 'student'
       LIMIT 5`,
    );
    console.log("8. getAllStudents sample:", allStudents.rows.length, "rows");
    if (allStudents.rows.length > 0)
      console.log("   fields:", Object.keys(allStudents.rows[0]));

    // 9. Test the session planner overview assignments query
    const sessions = await query(
      `SELECT DISTINCT session_id FROM session_planner_assignments LIMIT 1`,
    );
    if (sessions.rows.length > 0) {
      const sid = sessions.rows[0].session_id;
      const assignments = await query(
        `SELECT spa.id as assignment_id, spa.student_id, spa.faculty_id,
                sp.display_name as student_name, sp.admission_year as student_admission_year,
                fp.display_name as faculty_name, spa.status
         FROM session_planner_assignments spa
         JOIN persons sp ON sp.person_id = spa.student_id
         JOIN persons fp ON fp.person_id = spa.faculty_id
         WHERE spa.session_id = $1 LIMIT 3`,
        [sid],
      );
      console.log("9. assignments sample:", assignments.rows);
    } else {
      console.log("9. No assignments yet — OK for fresh system");
    }

    console.log("\n=== ALL TESTS PASSED ===");
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e.message);
    console.error("STACK:", e.stack?.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
  }
}

test();
