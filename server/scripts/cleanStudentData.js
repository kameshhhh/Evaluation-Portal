const { pool } = require("../src/config/database");

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get student person_ids first
    const students = await client.query(
      "SELECT person_id, identity_id, display_name FROM persons WHERE person_type = 'student'",
    );
    console.log("Students found:", students.rows.length);
    students.rows.forEach((s) =>
      console.log("  -", s.display_name, s.person_id),
    );

    if (students.rows.length > 0) {
      const ids = students.rows.map((s) => s.person_id);

      // Delete scarcity_allocations referencing students
      const r1 = await client.query(
        "DELETE FROM scarcity_allocations WHERE evaluator_id = ANY($1) OR target_id = ANY($1)",
        [ids],
      );
      console.log("Deleted scarcity_allocations:", r1.rowCount);

      // Delete session_evaluators referencing students
      const r2 = await client.query(
        "DELETE FROM session_evaluators WHERE evaluator_id = ANY($1)",
        [ids],
      );
      console.log("Deleted session_evaluators:", r2.rowCount);

      // Delete project_members referencing students
      const r3 = await client.query(
        "DELETE FROM project_members WHERE person_id = ANY($1)",
        [ids],
      );
      console.log("Deleted project_members:", r3.rowCount);

      // Delete projects created by students (along with ALL their dependent records)
      const projIds = await client.query(
        "SELECT project_id FROM projects WHERE created_by = ANY($1)",
        [ids],
      );
      if (projIds.rows.length > 0) {
        const pids = projIds.rows.map((r) => r.project_id);
        // Delete all dependent records in correct FK order
        const depTables = ["project_state_transitions", "project_members"];
        for (const table of depTables) {
          try {
            await client.query(`SAVEPOINT sp_${table}`);
            const dr = await client.query(
              `DELETE FROM ${table} WHERE project_id = ANY($1)`,
              [pids],
            );
            if (dr.rowCount > 0)
              console.log(`  Deleted ${table}: ${dr.rowCount}`);
          } catch (e) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_${table}`);
          }
        }
        await client.query("DELETE FROM projects WHERE project_id = ANY($1)", [
          pids,
        ]);
        console.log("Deleted student-created projects:", pids.length);
      }

      // Nullify project references to students (frozen_by)
      await client.query(
        "UPDATE projects SET frozen_by = NULL WHERE frozen_by = ANY($1)",
        [ids],
      );
      console.log("Nullified project FK references to students");

      // Nullify person self-references (created_by, updated_by)
      await client.query(
        "UPDATE persons SET created_by = NULL WHERE created_by = ANY($1)",
        [ids],
      );
      await client.query(
        "UPDATE persons SET updated_by = NULL WHERE updated_by = ANY($1)",
        [ids],
      );
      console.log("Nullified person self-references");

      // Delete person_history referencing students
      const r4a = await client.query(
        "DELETE FROM person_history WHERE person_id = ANY($1)",
        [ids],
      );
      console.log("Deleted person_history:", r4a.rowCount);

      // Delete evaluation_sessions created by students and their dependents
      const evalSessions = await client.query(
        "SELECT session_id FROM evaluation_sessions WHERE created_by = ANY($1)",
        [ids],
      );
      if (evalSessions.rows.length > 0) {
        const sids = evalSessions.rows.map((r) => r.session_id);
        // session_evaluators and scarcity_allocations have CASCADE on session delete
        // but also aggregated_results, zero_score_interpretations, etc.
        const evalDepTables = [
          "entity_freeze_snapshots",
          "aggregated_results",
          "zero_score_interpretations",
          "scarcity_allocations",
          "session_evaluators",
        ];
        for (const table of evalDepTables) {
          try {
            await client.query(`SAVEPOINT sp_eval_${table}`);
            await client.query(
              `DELETE FROM ${table} WHERE session_id = ANY($1)`,
              [sids],
            );
          } catch (e) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_eval_${table}`);
          }
        }
        await client.query(
          "DELETE FROM evaluation_sessions WHERE session_id = ANY($1)",
          [sids],
        );
        console.log("Deleted student-created eval sessions:", sids.length);
      }

      // Also nullify evaluation_sessions locked_by references
      try {
        await client.query(`SAVEPOINT sp_locked_by`);
        await client.query(
          "UPDATE evaluation_sessions SET locked_by = NULL WHERE locked_by = ANY($1)",
          [ids],
        );
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_locked_by`);
      }

      // Clean entity_change_audit references
      try {
        await client.query(`SAVEPOINT sp_eca`);
        await client.query(
          "DELETE FROM entity_change_audit WHERE changed_by = ANY($1) OR entity_id::text = ANY($1::text[])",
          [ids],
        );
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_eca`);
      }

      // Clean identity_snapshots referencing students
      try {
        await client.query(`SAVEPOINT sp_isnapshots`);
        await client.query(
          "DELETE FROM identity_snapshots WHERE person_id = ANY($1)",
          [ids],
        );
      } catch (e) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_isnapshots`);
      }

      // Delete change_audit_log entries if they reference students
      const tableCheck = await client.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'change_audit_log')",
      );
      if (tableCheck.rows[0].exists) {
        const r4b = await client.query(
          "DELETE FROM change_audit_log WHERE entity_id = ANY($1)",
          [ids.map(String)],
        );
        console.log("Deleted change_audit_log:", r4b.rowCount);
      }

      // Delete the student person records
      const r4 = await client.query(
        "DELETE FROM persons WHERE person_type = 'student'",
      );
      console.log("Deleted student persons:", r4.rowCount);
    }

    // Also clean evaluation sessions that were created for those students
    const r5 = await client.query(
      "DELETE FROM evaluation_sessions WHERE frozen_entities != '[]'::jsonb",
    );
    console.log(
      "Deleted evaluation_sessions with student assignments:",
      r5.rowCount,
    );

    await client.query("COMMIT");
    console.log(
      "\nStudent data cleaned successfully! Students will be re-registered on next login.",
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
