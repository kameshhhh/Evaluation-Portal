const path = require('path');
// script is in server/scripts, .env is in server/
// __dirname = .../server/scripts
// .env = .../server/.env
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
require('dotenv').config({ path: envPath });

const { Pool } = require('pg');

console.log('DB Config:', {
    connectionString: process.env.DATABASE_URL ? '***' : '(missing)'
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

async function cleanup() {
    console.log('Attempting to connect to DB...');
    let client;
    try {
        client = await pool.connect();
        console.log('Connected.');

        await client.query('BEGIN');
        console.log('Transaction started.');

        // Option 4: Student/Team Data
        console.log('Cleaning up Team Data...');
        await client.query('DELETE FROM team_invitations');
        await client.query('DELETE FROM team_formation_requests');

        console.log('Cleaning up Student Track Selections...');
        await client.query('DELETE FROM student_track_selections');


        // Option 3: Sessions (and dependencies)
        console.log('Cleaning up Session Dependencies...');
        // Delete children of evaluation_sessions first
        await client.query('DELETE FROM final_student_results');
        await client.query('DELETE FROM aggregated_results'); // Legacy support
        await client.query('DELETE FROM assignment_score_events');
        await client.query('DELETE FROM session_planner_assignments');
        await client.query('DELETE FROM scarcity_allocations');
        await client.query('DELETE FROM session_evaluators');
        await client.query('DELETE FROM evaluation_schedules');
        await client.query('DELETE FROM session_state_transitions');

        console.log('Cleaning up Sessions...');
        await client.query('DELETE FROM evaluation_sessions');

        await client.query('COMMIT');
        console.log('Cleanup completed successfully.');
    } catch (err) {
        console.error('Error during cleanup:', err);
        if (client) {
            try {
                await client.query('ROLLBACK');
                console.log('Rolled back.');
            } catch (rollbackErr) {
                console.error('Error rolling back:', rollbackErr);
            }
        }
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

cleanup().catch(err => console.error('Top level error:', err));
