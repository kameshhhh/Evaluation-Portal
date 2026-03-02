/**
 * RECALCULATE SCORES SCRIPT
 */

const path = require('path');
// Explicitly load dotenv from root
require("dotenv").config({ path: path.resolve(__dirname, '../../.env') });

const { query } = require(path.resolve(__dirname, '../src/config/database'));
const CredibilityService = require(path.resolve(__dirname, '../src/services/credibility/CredibilityService'));
const logger = require(path.resolve(__dirname, '../src/utils/logger'));

async function run() {
    try {
        console.log("Starting score recalculation...");

        // Test query
        const testResult = await query("SELECT NOW()");
        console.log("Database connected at:", testResult.rows[0].now);

        const studentsRes = await query(`
      WITH assignment_stats AS (
        SELECT 
          session_id, 
          student_id,
          COUNT(*) as total_judges,
          COUNT(CASE WHEN status = 'evaluation_done' THEN 1 END) as submitted_judges,
          MAX(marks_submitted_at) as last_submission
        FROM session_planner_assignments
        WHERE status != 'removed'
        GROUP BY session_id, student_id
      )
      SELECT 
        ast.session_id, 
        ast.student_id
      FROM assignment_stats ast
      LEFT JOIN final_student_results fsr ON fsr.session_id = ast.session_id AND fsr.student_id = ast.student_id
      WHERE ast.total_judges > 0 
        AND ast.submitted_judges = ast.total_judges
        AND (fsr.id IS NULL OR ast.last_submission > fsr.finalized_at)
    `);

        console.log(`Found ${studentsRes.rows.length} student-sessions to process.`);

        for (const row of studentsRes.rows) {
            const { session_id, student_id } = row;
            console.log(`Processing Session: ${session_id}, Student: ${student_id}...`);

            try {
                await CredibilityService.calculateStudentScore(session_id, student_id);
                console.log(`  - Success`);
            } catch (err) {
                console.error(`  - Failed: ${err.message}`);
            }
        }

        console.log("Recalculation complete.");
        process.exit(0);
    } catch (err) {
        console.error("CRITICAL ERROR during recalculation:", err);
        process.exit(1);
    }
}

run();
