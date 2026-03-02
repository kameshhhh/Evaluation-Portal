
const { pool } = require('./src/config/database');
async function run() {
    try {
        const columns = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'faculty_evaluation_scope'");
        console.log('SCOPE_COLS:' + JSON.stringify(columns.rows));

        const constraints = await pool.query(`
            SELECT
                tc.constraint_name, kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='faculty_evaluation_scope';
        `);
        console.log('SCOPE_FK:' + JSON.stringify(constraints.rows));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
