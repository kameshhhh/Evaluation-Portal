// ============================================================
// DEBUG SCRIPT — Check stored signals and raw scores
// ============================================================

const { query } = require("./src/config/database");

async function main() {
  try {
    const personId = "355ce028-6e19-4fe2-8b01-32110c8ad4d9";

    // Check session signals (raw data from evaluation)
    const signals = await query(
      `SELECT * FROM evaluator_session_signals 
       WHERE evaluator_id = $1
       ORDER BY computed_at DESC
       LIMIT 5`,
      [personId],
    );
    console.log("Session signals (raw scores):");
    signals.rows.forEach((s) => {
      console.log(`  Session: ${s.session_id}`);
      console.log(
        `    alignment_score: ${s.alignment_score} (deviation: ${s.alignment_deviation})`,
      );
      console.log(`    discipline_score: ${s.discipline_score}`);
      console.log(`    pool_usage_ratio: ${s.pool_usage_ratio}`);
    });

    // Check credibility profile (weighted)
    const profile = await query(
      `SELECT 
         credibility_score,
         credibility_band,
         alignment_component,
         stability_component,
         discipline_component,
         last_alignment_score
       FROM evaluator_credibility_profiles 
       WHERE evaluator_id = $1`,
      [personId],
    );
    console.log("\nCredibility profile:");
    console.log(JSON.stringify(profile.rows[0], null, 2));

    // Calculate what the display should be
    const p = profile.rows[0];
    const sig = signals.rows[0];
    console.log("\n--- DISPLAY VALUES ---");
    console.log(
      `Overall Score: ${Math.round(parseFloat(p.credibility_score) * 100)}%`,
    );
    console.log(`Band: ${p.credibility_band}`);
    console.log(
      `Alignment: ${Math.round(parseFloat(sig?.alignment_score || p.last_alignment_score) * 100)}%`,
    );
    console.log(
      `Discipline: ${Math.round(parseFloat(sig?.discipline_score || 0) * 100)}%`,
    );

    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
