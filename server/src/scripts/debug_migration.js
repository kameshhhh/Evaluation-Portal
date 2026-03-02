require('dotenv').config();
const { pool } = require('../config/database');

async function debug() {
    console.log('Starting debug...');
    try {
        const res = await pool.query("SELECT * FROM pg_tables WHERE tablename = 'tracks'");
        console.log('Tracks table check:', res.rows);

        if (res.rows.length > 0) {
            console.log('Tracks table ALREADY EXISTS.');
        } else {
            console.log('Tracks table DOES NOT exist.');
        }

        console.log('Attempting to create tracks table manually...');
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS tracks (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `);
            console.log('Create tracks table succeeded.');
        } catch (err) {
            console.error('Create tracks table FAILED:', err.message, err.code);
        }

        console.log('Attempting to create scope table manually...');
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS faculty_evaluation_scope (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    faculty_id UUID NOT NULL, -- references users(user_id) but let's be loose for debug
                    track_id INTEGER NOT NULL,
                    department_id VARCHAR(50), 
                    is_active BOOLEAN DEFAULT TRUE,
                    scope_version UUID DEFAULT gen_random_uuid(),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    created_by UUID
                );
            `);
            console.log('Create scope table succeeded.');
        } catch (err) {
            console.error('Create scope table FAILED:', err.message, err.code);
        }

    } catch (err) {
        console.error('General error:', err);
    } finally {
        await pool.end();
    }
}

debug();
