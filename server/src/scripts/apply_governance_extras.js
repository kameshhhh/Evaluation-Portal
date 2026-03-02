require('dotenv').config();
const { pool } = require('../config/database');

async function applyExtras() {
    console.log('Starting governance extras application...');
    try {
        // 1. Seed Tracks
        console.log('Seeding tracks...');
        await pool.query(`
            INSERT INTO tracks (name, description) VALUES
            ('CORE', 'Standard evaluation track with team size 3-4'),
            ('IT', 'IT-specific evaluation track for individual assessments'),
            ('PREMIUM', 'High-stakes evaluation track with team size 1-2')
            ON CONFLICT (name) DO NOTHING;
        `);
        console.log('Tracks seeded.');

        // 2. Apply Partial Unique Index
        console.log('Applying partial unique index...');
        await pool.query(`
            DROP INDEX IF EXISTS idx_faculty_scope_unique;
            CREATE UNIQUE INDEX idx_faculty_scope_unique 
            ON faculty_evaluation_scope(faculty_id, track_id, COALESCE(department_id, 'GLOBAL')) 
            WHERE is_active = true;
        `);
        console.log('Partial index applied.');

        // 3. Apply Performance Indexes on Scope Table
        console.log('Applying scope table indexes...');
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_scope_faculty ON faculty_evaluation_scope(faculty_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_scope_track ON faculty_evaluation_scope(track_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_scope_dept ON faculty_evaluation_scope(department_id);`);
        console.log('Scope table indexes applied.');

        // 4. Apply Student/Person Indexes
        console.log('Applying student/person indexes...');
        // Check for student_track_selections
        const stsCheck = await pool.query("SELECT * FROM pg_tables WHERE schemaname = 'public' AND tablename = 'student_track_selections'");
        if (stsCheck.rows.length > 0) {
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_sts_track ON student_track_selections(track);`);
            console.log('Index on student_track_selections(track) created.');
        } else {
            console.log('student_track_selections table not found, skipping index.');
        }

        // Check for persons
        const personsCheck = await pool.query("SELECT * FROM pg_tables WHERE schemaname = 'public' AND tablename = 'persons'");
        if (personsCheck.rows.length > 0) {
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_persons_dept ON persons(department_code);`);
            console.log('Index on persons(department_code) created.');
        }

        // New Composite Index requested by user
        // CREATE INDEX idx_students_scope ON students(track_id, department_id);
        // Note: 'students' might be a View or Table. Let's check.
        // If 'students' is a view, we can't index it directly (unless materialized). 
        // Based on previous contexts, 'students' is likely a view joining persons + auth + etc.
        // If it's a VIEW, we should index the underlying tables (persons, track selections).
        // I will attempt to index 'students' IF it is a table.

        const studCheck = await pool.query("SELECT * FROM pg_tables WHERE schemaname = 'public' AND tablename = 'students'");
        if (studCheck.rows.length > 0) {
            // It is a real table
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_students_scope ON students(track_id, department_id);`);
            console.log('Index idx_students_scope created.');
        } else {
            console.log("'students' is likely a VIEW or does not exist as a base table. Skipping direct index.");
        }

    } catch (err) {
        console.error('Error applying extras:', err);
    } finally {
        await pool.end();
    }
}

applyExtras();
