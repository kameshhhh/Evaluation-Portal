/**
 * CREDIBILITY DIVERGENCE SIMULATION
 * ==================================
 * Creates 3 sessions, seeds marks with 3 distinct faculty personas,
 * finalizes each, and shows how credibility diverges + how student
 * scores differ from plain average.
 *
 *   Faculty A (HARISH P)      = "Lenient"   — gives 4–5
 *   Faculty B (Kamesh D)      = "Strict"    — gives 1–3
 *   Faculty C (DR. MEENA IYER)= "Moderate"  — gives 2–4 (closest to consensus)
 *
 * Usage:  node scripts/simulate_credibility_divergence.js
 */

"use strict";
require("dotenv").config();
const { pool, query } = require("../src/config/database");
const crypto = require("crypto");

// ─── Faculty personas ──────────────────────────────────────────
const FACULTY = {
  HARISH:  { name: "HARISH P",       id: "9c1bc138-6785-487e-a799-bb0a65808982" },
  KAMESH:  { name: "Kamesh D",       id: "b4d5d9b3-54bf-491f-bfcf-31647b9d10d7" },
  MEENA:   { name: "DR. MEENA IYER", id: null }, // will be created
};

// ─── Students to evaluate (same 5 every session) ──────────────
const STUDENT_IDS = [
  "7bb581ee-6f0d-4f5a-9e25-1500fa04df07", // KAVIN
  "3e9e4427-0957-4849-8a34-64f88ef5c597", // DEVI
  "26caec64-4f95-4442-912a-43ea0a9a5da1", // KAMESH (student)
  "51e34fe2-b301-4eb1-985c-1de5fb10c655", // PRIYA
  "cdc9dc37-0f0d-4c13-9791-96a2d1b6bc58", // RAHUL
];

// ─── Marks matrix: [session][faculty][student] ─────────────────
// Lenient (HARISH), Strict (KAMESH-fac), Moderate (MEENA)
const MARKS = [
  // Session 1: "Week 1 Review"
  {
    title: "Week 1 Review — Credibility Sim",
    lenient:  [5, 4, 5, 4, 5],  // avg 4.6
    strict:   [2, 1, 2, 3, 2],  // avg 2.0
    moderate: [3, 3, 4, 3, 3],  // avg 3.2  ← closest to consensus ~3.27
  },
  // Session 2: "Week 2 Review"
  {
    title: "Week 2 Review — Credibility Sim",
    lenient:  [4, 5, 4, 5, 4],  // avg 4.4
    strict:   [1, 2, 1, 2, 1],  // avg 1.4
    moderate: [3, 3, 3, 4, 3],  // avg 3.2  ← closest to consensus ~3.0
  },
  // Session 3: "Week 3 Review"
  {
    title: "Week 3 Review — Credibility Sim",
    lenient:  [5, 5, 5, 5, 4],  // avg 4.8
    strict:   [2, 1, 1, 2, 1],  // avg 1.4
    moderate: [4, 3, 3, 3, 3],  // avg 3.2  ← closest to consensus ~3.13
  },
];

// ─── Helpers ───────────────────────────────────────────────────
const uid = () => crypto.randomUUID();

function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))
  );
  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const fmt = (row) =>
    row.map((c, i) => ` ${String(c ?? "").padEnd(widths[i])} `).join("│");

  console.log("┌" + sep.replace(/┼/g, "┬") + "┐");
  console.log("│" + fmt(headers) + "│");
  console.log("├" + sep + "┤");
  rows.forEach((r) => console.log("│" + fmt(r) + "│"));
  console.log("└" + sep.replace(/┼/g, "┴") + "┘");
}

// ────────────────────────────────────────────────────────────────
// PHASE 0 — RESET
// ────────────────────────────────────────────────────────────────
async function resetAll() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   PHASE 0: RESET TO CLEAN SLATE      ║");
  console.log("╚══════════════════════════════════════╝\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const del = async (t) => {
      const r = await client.query(`DELETE FROM ${t}`);
      console.log(`  🗑  ${t}: ${r.rowCount} rows deleted`);
    };

    await del("final_student_results");
    await del("assignment_score_events");
    await del("session_planner_assignments");
    await del("judge_credibility_metrics");

    // Reset ALL sessions to allow recreation
    const sesRes = await client.query(
      `UPDATE faculty_evaluation_sessions SET status='active', finalized_at=NULL, credibility_snapshot=NULL`
    );
    console.log(`  ↺  faculty_evaluation_sessions: ${sesRes.rowCount} rows reset`);

    // Delete existing simulation sessions (keep real sessions)
    const delSes = await client.query(
      `DELETE FROM faculty_evaluation_sessions WHERE title LIKE '%Credibility Sim%'`
    );
    console.log(`  🗑  Removed ${delSes.rowCount} old simulation sessions`);

    await client.query("COMMIT");
    console.log("  ✅ Reset complete\n");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────────
// PHASE 1 — CREATE 3RD FACULTY
// ────────────────────────────────────────────────────────────────
async function ensureThirdFaculty() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   PHASE 1: ENSURE 3RD FACULTY        ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Check if MEENA already exists
  const existing = await query(
    `SELECT person_id FROM persons WHERE display_name = 'DR. MEENA IYER' AND person_type = 'faculty'`
  );

  if (existing.rows.length > 0) {
    FACULTY.MEENA.id = existing.rows[0].person_id;
    console.log(`  ✓ DR. MEENA IYER already exists: ${FACULTY.MEENA.id}`);
    return;
  }

  // Create user first (identity)
  const userId = uid();
  const personId = uid();
  const email = "meena.iyer@bitsathy.ac.in";
  const emailHash = crypto.createHash("sha256").update(email).digest("hex");

  await query(
    `INSERT INTO users (internal_user_id, normalized_email, email_hash, user_role, created_at, last_login_at)
     VALUES ($1, $2, $3, 'faculty', NOW(), NOW())`,
    [userId, email, emailHash]
  );

  await query(
    `INSERT INTO persons (person_id, identity_id, display_name, person_type, department_code, status, created_at, updated_at)
     VALUES ($1, $2, 'DR. MEENA IYER', 'faculty', 'CSE', 'active', NOW(), NOW())`,
    [personId, userId]
  );

  FACULTY.MEENA.id = personId;
  console.log(`  ✓ Created DR. MEENA IYER`);
  console.log(`    userId:   ${userId}`);
  console.log(`    personId: ${personId}\n`);
}

// ────────────────────────────────────────────────────────────────
// PHASE 2 — RUN 3 SESSIONS
// ────────────────────────────────────────────────────────────────
async function runSession(sessionIndex) {
  const sess = MARKS[sessionIndex];
  const sessionId = uid();
  const facultyIds = [FACULTY.HARISH.id, FACULTY.KAMESH.id, FACULTY.MEENA.id];
  const markSets = [sess.lenient, sess.strict, sess.moderate];
  const labels = ["Lenient", "Strict ", "Moderate"];

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   SESSION ${sessionIndex + 1}: ${sess.title.padEnd(30)}  ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // 2a. Create session
  await query(
    `INSERT INTO faculty_evaluation_sessions (id, title, evaluation_mode, academic_year, semester, status, created_by, opens_at, closes_at)
     VALUES ($1, $2, 'small_pool', 2026, 1, 'active', $3, NOW(), NOW() + INTERVAL '7 days')`,
    [sessionId, sess.title, FACULTY.HARISH.id]
  );
  console.log(`  Session created: ${sessionId}`);

  // 2b. Create assignments: 3 faculty × 5 students = 15 assignments
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (let fi = 0; fi < facultyIds.length; fi++) {
      for (let si = 0; si < STUDENT_IDS.length; si++) {
        const assignId = uid();
        const marks = markSets[fi][si];

        // Create assignment (already with marks for efficiency)
        await client.query(
          `INSERT INTO session_planner_assignments
             (id, session_id, faculty_id, student_id, assigned_by, status, marks, marks_submitted_at, faculty_evaluated_at)
           VALUES ($1, $2, $3, $4, $5, 'evaluation_done', $6, NOW(), NOW())`,
          [assignId, sessionId, facultyIds[fi], STUDENT_IDS[si], FACULTY.HARISH.id, marks]
        );

        // Log event
        await client.query(
          `INSERT INTO assignment_score_events (assignment_id, session_id, marks, submitted_at)
           VALUES ($1, $2, $3, NOW())`,
          [assignId, sessionId, marks]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`  15 assignments created (3 faculty × 5 students)\n`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // 2c. Print marks table
  const studentNames = await query(
    `SELECT person_id, display_name FROM persons WHERE person_id = ANY($1) ORDER BY display_name`,
    [STUDENT_IDS]
  );
  const nameMap = {};
  studentNames.rows.forEach((r) => (nameMap[r.person_id] = r.display_name));

  const tableHeaders = ["Faculty (Persona)", ...STUDENT_IDS.map((id) => nameMap[id]?.split(" ")[0] || id.slice(0, 8))];
  const tableRows = facultyIds.map((fid, fi) => [
    `${FACULTY[Object.keys(FACULTY)[fi]].name} (${labels[fi]})`,
    ...markSets[fi],
  ]);

  // Add consensus row (plain average)
  const consensus = STUDENT_IDS.map((_, si) => {
    const avg = markSets.reduce((s, m) => s + m[si], 0) / markSets.length;
    return avg.toFixed(2);
  });
  tableRows.push(["── Plain Average ──", ...consensus]);

  printTable(tableHeaders, tableRows);

  // 2d. Finalize session
  console.log(`\n  ⏳ Finalizing session...`);
  const CredibilityService = require("../src/services/credibility/CredibilityService");
  await CredibilityService.finalizeSession(sessionId);
  console.log(`  ✅ Session finalized!\n`);

  // 2e. Print credibility after this session
  const creds = await query(
    `SELECT evaluator_id, credibility_score, deviation_index, participation_count
     FROM judge_credibility_metrics
     WHERE evaluator_id = ANY($1)
     ORDER BY credibility_score DESC`,
    [facultyIds]
  );

  const credHeaders = ["Faculty", "Credibility", "Deviation", "Sessions"];
  const credRows = creds.rows.map((r) => {
    const fKey = Object.keys(FACULTY).find((k) => FACULTY[k].id === r.evaluator_id);
    const label = fKey ? `${FACULTY[fKey].name}` : r.evaluator_id.slice(0, 8);
    return [label, r.credibility_score.toFixed(6), r.deviation_index.toFixed(4), r.participation_count];
  });
  printTable(credHeaders, credRows);

  // 2f. Print weighted scores
  const results = await query(
    `SELECT fsr.student_id, fsr.aggregated_score, fsr.normalized_score,
            fsr.confidence_score, fsr.judge_count,
            p.display_name
     FROM final_student_results fsr
     JOIN persons p ON p.person_id = fsr.student_id
     WHERE fsr.session_id = $1
     ORDER BY p.display_name`,
    [sessionId]
  );

  const scoreHeaders = ["Student", "Plain Avg", "Cred-Weighted", "Δ (diff)", "Confidence", "Judges"];
  const scoreRows = results.rows.map((r) => {
    const diff = (r.normalized_score - r.aggregated_score).toFixed(3);
    const sign = parseFloat(diff) >= 0 ? "+" : "";
    return [
      r.display_name,
      r.aggregated_score.toFixed(3),
      r.normalized_score.toFixed(3),
      `${sign}${diff}`,
      r.confidence_score.toFixed(3),
      r.judge_count,
    ];
  });
  printTable(scoreHeaders, scoreRows);

  return sessionId;
}

// ────────────────────────────────────────────────────────────────
// PHASE 3 — FINAL REPORT
// ────────────────────────────────────────────────────────────────
async function printFinalReport(sessionIds) {
  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║               FINAL CREDIBILITY DIVERGENCE REPORT            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const facultyIds = [FACULTY.HARISH.id, FACULTY.KAMESH.id, FACULTY.MEENA.id];

  // ─── 1. Credibility trajectory ───
  console.log("  ┌─────────────────────────────────────────────────────────┐");
  console.log("  │  CREDIBILITY TRAJECTORY (S0 → S1 → S2 → S3)           │");
  console.log("  └─────────────────────────────────────────────────────────┘\n");

  const creds = await query(
    `SELECT evaluator_id, credibility_score, history
     FROM judge_credibility_metrics
     WHERE evaluator_id = ANY($1)`,
    [facultyIds]
  );

  const trajHeaders = ["Faculty", "Persona", "Start", "After S1", "After S2", "After S3", "Total Δ"];
  const trajRows = creds.rows.map((r) => {
    const fKey = Object.keys(FACULTY).find((k) => FACULTY[k].id === r.evaluator_id);
    const persona = fKey === "HARISH" ? "Lenient" : fKey === "KAMESH" ? "Strict" : "Moderate";
    const history = Array.isArray(r.history) ? r.history : JSON.parse(r.history || "[]");

    const scores = [1.0]; // start
    history.forEach((h) => scores.push(h.newCred));
    while (scores.length < 4) scores.push(scores[scores.length - 1]);

    const totalDelta = (scores[scores.length - 1] - 1.0).toFixed(4);
    const sign = parseFloat(totalDelta) >= 0 ? "+" : "";

    return [
      FACULTY[fKey]?.name || r.evaluator_id.slice(0, 8),
      persona,
      "1.0000",
      scores[1]?.toFixed(4) || "—",
      scores[2]?.toFixed(4) || "—",
      scores[3]?.toFixed(4) || "—",
      `${sign}${totalDelta}`,
    ];
  });
  // Sort: Moderate first, then by total delta desc
  trajRows.sort((a, b) => {
    if (a[1] === "Moderate") return -1;
    if (b[1] === "Moderate") return 1;
    return parseFloat(b[6]) - parseFloat(a[6]);
  });
  printTable(trajHeaders, trajRows);

  // ─── 2. Score comparison across all sessions ───
  console.log("\n  ┌─────────────────────────────────────────────────────────┐");
  console.log("  │  PLAIN AVG vs CREDIBILITY-WEIGHTED (all sessions)      │");
  console.log("  └─────────────────────────────────────────────────────────┘\n");

  for (let i = 0; i < sessionIds.length; i++) {
    console.log(`  ── Session ${i + 1}: ${MARKS[i].title} ──`);
    const results = await query(
      `SELECT fsr.student_id, fsr.aggregated_score, fsr.normalized_score,
              fsr.confidence_score, p.display_name
       FROM final_student_results fsr
       JOIN persons p ON p.person_id = fsr.student_id
       WHERE fsr.session_id = $1
       ORDER BY fsr.normalized_score DESC`,
      [sessionIds[i]]
    );

    const headers = ["Student", "Plain Avg", "Weighted", "Δ", "Conf"];
    const rows = results.rows.map((r) => {
      const diff = r.normalized_score - r.aggregated_score;
      const sign = diff >= 0 ? "+" : "";
      return [
        r.display_name,
        r.aggregated_score.toFixed(2),
        r.normalized_score.toFixed(2),
        `${sign}${diff.toFixed(3)}`,
        r.confidence_score.toFixed(2),
      ];
    });
    printTable(headers, rows);
    console.log("");
  }

  // ─── 3. Visual bar chart ───
  console.log("  ┌─────────────────────────────────────────────────────────┐");
  console.log("  │  CREDIBILITY BAR CHART                                 │");
  console.log("  └─────────────────────────────────────────────────────────┘\n");

  creds.rows.forEach((r) => {
    const fKey = Object.keys(FACULTY).find((k) => FACULTY[k].id === r.evaluator_id);
    const name = (FACULTY[fKey]?.name || "?").padEnd(16);
    const score = r.credibility_score;
    const bars = Math.round(score * 40); // 40 chars = 1.0
    const bar = "█".repeat(Math.min(bars, 60)).padEnd(60);
    const label = score.toFixed(4);
    console.log(`  ${name} ${bar} ${label}`);
  });

  console.log("\n  Legend: Each █ ≈ 0.025 credibility units");
  console.log("  Range: 0.5 (minimum) ← 1.0 (default) → 1.5 (maximum)\n");

  // ─── 4. Key insight ───
  console.log("  ┌─────────────────────────────────────────────────────────┐");
  console.log("  │  KEY INSIGHT                                           │");
  console.log("  └─────────────────────────────────────────────────────────┘\n");

  const sorted = [...creds.rows].sort((a, b) => b.credibility_score - a.credibility_score);
  const best = Object.keys(FACULTY).find((k) => FACULTY[k].id === sorted[0].evaluator_id);
  const worst = Object.keys(FACULTY).find((k) => FACULTY[k].id === sorted[sorted.length - 1].evaluator_id);
  const spread = (sorted[0].credibility_score - sorted[sorted.length - 1].credibility_score).toFixed(4);

  console.log(`  • Highest credibility: ${FACULTY[best]?.name} (${sorted[0].credibility_score.toFixed(4)})`);
  console.log(`  • Lowest credibility:  ${FACULTY[worst]?.name} (${sorted[sorted.length - 1].credibility_score.toFixed(4)})`);
  console.log(`  • Spread:              ${spread}`);
  console.log(`  • This means ${FACULTY[best]?.name}'s marks carry more weight`);
  console.log(`    in future sessions, pulling student scores toward their ratings.`);
  console.log(`  • ${FACULTY[worst]?.name}'s influence is diminished, reducing the`);
  console.log(`    impact of their extreme marks on final student scores.\n`);
}

// ────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  CREDIBILITY DIVERGENCE SIMULATION                      ║");
  console.log("║  3 Sessions × 3 Faculty × 5 Students                   ║");
  console.log("║  Personas: Lenient / Strict / Moderate                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Phase 0: Reset
  await resetAll();

  // Phase 1: Ensure 3rd faculty exists
  await ensureThirdFaculty();

  // Phase 2: Run 3 sessions sequentially
  const sessionIds = [];
  for (let i = 0; i < 3; i++) {
    const sid = await runSession(i);
    sessionIds.push(sid);
  }

  // Phase 3: Final report
  await printFinalReport(sessionIds);

  console.log("══════════════════════════════════════════════════════════");
  console.log("  SIMULATION COMPLETE — All 3 sessions finalized");
  console.log("══════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error("\n[FATAL]", e.message);
    console.error(e.stack);
  })
  .finally(() => pool.end());
