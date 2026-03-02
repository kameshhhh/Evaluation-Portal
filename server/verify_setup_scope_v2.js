
const facultyScopeService = require('./src/services/facultyScopeService');
const { pool } = require('./src/config/database');

async function run() {
    try {
        const users = await pool.query("SELECT user_id FROM users WHERE user_role = 'faculty' LIMIT 1");
        const facultyId = users.rows[0].user_id;

        const testData = {
            tracks: ['core'],
            departments: ['AD']
        };

        // This calls both setupScope AND potentially other things if there are triggers?
        console.log('Testing setupScope...');
        const result = await facultyScopeService.setupScope(facultyId, testData);
        console.log('Setup result:', result);

        // NOW TEST THE QUERY THAT I SUSPECT IS BROKEN
        console.log('Testing isStudentAllowed logic...');
        // Need a student ID
        const students = await pool.query("SELECT person_id FROM persons WHERE user_role = 'student' LIMIT 1");
        if (students.rows.length > 0) {
            const studentId = students.rows[0].person_id;
            await facultyScopeService.isStudentAllowed(facultyId, studentId);
            console.log('isStudentAllowed logic OK');
        }

        process.exit(0);
    } catch (err) {
        console.error('ERROR_DETAILED:');
        console.error('Message:', err.message);
        console.error('Column:', err.column);
        console.error('Table:', err.table);
        console.error('Query:', err.query);
        process.exit(1);
    }
}
run();
