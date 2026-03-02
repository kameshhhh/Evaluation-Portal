/**
 * RECALCULATE SCORES SCRIPT
 * Bypasses the project config to avoid initialization issues.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually parse .env
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values) {
        env[key.trim()] = values.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

const pool = new Pool({ connectionString: env.DATABASE_URL });

async function run() {
    try {
        console.log("Starting score recalculation (Direct Mode)...");

        // 1. Find all student-session pairs where all judges have submitted but fsr is missing/stale
        const studentsRes = await pool.query(`
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
            console.log(`Processing Session: ${session__id}, Student: ${student_id}...`);

            // Calculate score manually here to avoid CredibilityService dependencies
            const submissionsRes = await pool.query(
                `SELECT 
            spa.faculty_id,
            spa.marks,
            COALESCE(jcm.credibility_score, 1.0) as credibility_score
         FROM session_planner_assignments spa
         LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = spa.faculty_id
         WHERE spa.session_id = $1 
           AND spa.student_id = $2 
           AND spa.status = 'evaluation_done'`,
                [session_id, student_id]
            );

            const submissions = submissionsRes.rows;
            let weightedSum = 0;
            let totalWeight = 0;
            let rawSum = 0;

            submissions.forEach(sub => {
                const weight = parseFloat(sub.credibility_score);
                const marks = parseFloat(sub.marks);
                weightedSum += marks * weight;
                totalWeight += weight;
                rawSum += marks;
            });

            const normalizedScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
            const aggregatedScore = rawSum / submissions.length;

            await pool.query(
                `INSERT INTO final_student_results (
            session_id, student_id, aggregated_score, normalized_score, confidence_score, judge_count, finalized_at
         ) VALUES ($1, $2, $3, $4, 1.0, $5, NOW())
         ON CONFLICT (session_id, student_id) 
         DO UPDATE SET 
            aggregated_score = EXCLUDED.aggregated_score,
            normalized_score = EXCLUDED.normalized_score,
            judge_count = EXCLUDED.judge_count,
            finalized_at = NOW()`,
                [session_id, student_id, aggregatedScore, normalizedScore, submissions.length]
            );
            console.log(`  - Finalized: ${normalizedScore.toFixed(2)}`);
        }

        console.log("Recalculation complete.");
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error("FAILED:", err);
        await pool.end();
        process.exit(1);
    }
}

run();
