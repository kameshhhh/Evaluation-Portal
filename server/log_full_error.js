
const facultyScopeService = require('./src/services/facultyScopeService');
const { pool } = require('./src/config/database');
const fs = require('fs');

async function run() {
    try {
        const users = await pool.query("SELECT internal_user_id FROM users WHERE user_role = 'faculty' LIMIT 1");
        const facultyId = users.rows[0].internal_user_id;

        const testData = {
            tracks: ['core'],
            departments: ['AD']
        };

        const result = await facultyScopeService.setupScope(facultyId, testData);
        console.log('Setup result OK');

        fs.writeFileSync('debug_success.log', 'SETUP_OK');
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('debug_error.log', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        process.exit(1);
    }
}
run();
