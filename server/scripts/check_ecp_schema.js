const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const { query } = require("../src/config/database");

async function checkSchema() {
    try {
        const table = 'evaluator_credibility_profiles';
        const cols = await query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = $1
        `, [table]);
        console.table(cols.rows);
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkSchema();
