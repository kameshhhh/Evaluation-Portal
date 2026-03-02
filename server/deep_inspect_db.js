
const { pool } = require('./src/config/database');

const fs = require('fs');

async function inspect() {
    try {
        let output = "";

        output += "--- 1. Search for function 'check_faculty_scope_overlap' ---\n";
        const procRes = await pool.query(`
            SELECT proname, prosrc 
            FROM pg_proc 
            WHERE proname ILIKE '%check_faculty_scope_overlap%';
        `);
        output += JSON.stringify(procRes.rows, null, 2) + "\n";

        output += "\n--- 2. Triggers on faculty_evaluation_scope ---\n";
        const triggerRes = await pool.query(`
            SELECT tgname, proname 
            FROM pg_trigger t 
            JOIN pg_proc p ON t.tgfoid = p.oid 
            WHERE tgrelid = 'faculty_evaluation_scope'::regclass;
        `);
        output += JSON.stringify(triggerRes.rows, null, 2) + "\n";

        output += "\n--- 3. Constraints on faculty_evaluation_scope ---\n";
        const conRes = await pool.query(`
            SELECT conname, contype, pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conrelid = 'faculty_evaluation_scope'::regclass;
        `);
        output += JSON.stringify(conRes.rows, null, 2) + "\n";

        fs.writeFileSync('inspect_out.txt', output);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
