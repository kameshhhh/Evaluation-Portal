const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { query } = require("../src/config/database");

async function checkCredibility() {
    try {
        console.log("--- Checking Table Columns ---");
        const tables = ['persons', 'judge_credibility_metrics', 'evaluator_credibility_profiles'];
        for (const table of tables) {
            const cols = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.log(`\nTable: ${table}`);
            console.log(cols.rows.map(r => r.column_name).join(", "));
        }

        console.log("\n--- Checking Persons ---");
        // We'll search by parts of the name
        const personSearch = await query("SELECT person_id, display_name FROM persons WHERE display_name ILIKE '%KAVIN%' LIMIT 5");
        console.table(personSearch.rows);

        if (personSearch.rows.length === 0) {
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

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
}

checkCredibility();
