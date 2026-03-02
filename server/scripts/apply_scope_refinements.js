
const { pool } = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    const filePath = path.join(__dirname, '../src/db/migrations/045_faculty_scope_refinements.sql');
    console.log(`Reading migration file: ${filePath}`);

    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log("Applying migration...");

        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('COMMIT');

        console.log("Migration 045 applied successfully.");
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Migration failed:", err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
