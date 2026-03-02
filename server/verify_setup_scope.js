
const facultyScopeService = require('./src/services/facultyScopeService');
const { pool } = require('./src/config/database');

async function run() {
    try {
        const users = await pool.query("SELECT user_id FROM users WHERE user_role = 'faculty' LIMIT 1");
        if (users.rows.length === 0) {
            console.error('No faculty found');
            process.exit(1);
        }
        const facultyId = users.rows[0].user_id;
        console.log('Testing with faculty ID:', facultyId);

        const testData = {
            tracks: ['core', 'premium'],
            departments: ['AD', 'CS']
        };

        console.log('Calling setupScope...');
        const result = await facultyScopeService.setupScope(facultyId, testData);
        console.log('SUCCESS:', JSON.stringify(result));
        process.exit(0);
    } catch (err) {
        console.error('FAILED:' + err.message);
        console.log(JSON.stringify(err, null, 2));
        process.exit(1);
    }
}
run();
