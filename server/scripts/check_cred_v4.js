const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { query } = require("../src/config/database");

async function checkPerson() {
    try {
        console.log("--- Finding Person ---");
        const personSearch = await query("SELECT person_id, display_name FROM persons WHERE display_name ILIKE '%KAVIN%'");
        console.table(personSearch.rows);

        if (personSearch.rows.length === 0) {
            console.log("No person found.");
            process.exit();
        }

        const personId = personSearch.rows[0].person_id;
        console.log("Using Person ID:", personId);

        console.log("\n--- Checking judge_credibility_metrics ---");
        const jcm = await query("SELECT * FROM judge_credibility_metrics WHERE evaluator_id = $1", [personId]);
        console.table(jcm.rows);

        console.log("\n--- Checking evaluator_credibility_profiles ---");
        const ecp = await query("SELECT * FROM evaluator_credibility_profiles WHERE evaluator_id = $1", [personId]);
        console.table(ecp.rows);

        console.log("\n--- Checking any finalized sessions for this judge ---");
        const sessions = await query(`
            SELECT DISTINCT session_id 
            FROM session_planner_assignments 
            WHERE faculty_id = $1 AND marks IS NOT NULL
        `, [personId]);
        console.log("Sessions with marks from this judge:", sessions.rows.length);
        console.table(sessions.rows);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

checkPerson();
