const path = require("path");
// Ensure env is loaded from the right place
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { query } = require("../src/config/database");

async function checkCredibility() {
    try {
        console.log("--- Checking Persons ---");
        const persons = await query("SELECT person_id, display_name, role FROM persons WHERE display_name ILIKE '%KAVIN KUMAR%'");
        console.table(persons.rows);

        if (persons.rows.length === 0) {
            console.log("No person found with name KAVIN KUMAR");
            return;
        }

        const personId = persons.rows[0].person_id;
        console.log("Person ID:", personId);

        console.log("\n--- Checking judge_credibility_metrics (New Model) ---");
        const jcm = await query("SELECT * FROM judge_credibility_metrics WHERE evaluator_id = $1", [personId]);
        console.table(jcm.rows);

        console.log("\n--- Checking evaluator_credibility_profiles (Dashboard Model) ---");
        const ecp = await query("SELECT * FROM evaluator_credibility_profiles WHERE evaluator_id = $1", [personId]);
        console.table(ecp.rows);

        console.log("\n--- Checking evaluator_session_signals ---");
        const signals = await query("SELECT count(*) FROM evaluator_session_signals WHERE evaluator_id = $1", [personId]);
        console.table(signals.rows);

    } catch (err) {
        console.error("Error in checkCredibility:", err);
    } finally {
        process.exit();
    }
}

checkCredibility();
