
const { pool } = require('./src/config/database');
const fs = require('fs');

async function listUsers() {
    try {
        const res = await pool.query(`
            SELECT normalized_email, length(normalized_email) as len, user_role, internal_user_id 
            FROM users
        `);
        fs.writeFileSync('users_dump.txt', JSON.stringify(res.rows, null, 2));
        console.log("Dumped users to users_dump.txt");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listUsers();
