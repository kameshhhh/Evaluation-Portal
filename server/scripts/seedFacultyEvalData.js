/**
 * Seed Script — Faculty Evaluation Test Data
 * Creates a closed session with assignments, scores, and normalization data
 * so all B-01 and B-02 frontend pages have visible data.
 *
 * Usage: node scripts/seedFacultyEvalData.js
 */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get faculty & admin persons
    const persons = await client.query(
      `SELECT person_id, display_name, person_type, department_code
       FROM persons WHERE person_type IN ('faculty', 'admin') LIMIT 10`
    );
    
    const faculty = persons.rows.filter(p => p.person_type === 'faculty');
    const admin = persons.rows.find(p => p.person_type === 'admin');
    
    if (faculty.length === 0) {
      console.log("No faculty found. Creating mock faculty persons...");
      const mockFaculty = [
        { name: "Dr. Priya Sharma", dept: "CSE" },
        { name: "Prof. Rajesh Kumar", dept: "CSE" },
        { name: "Dr. Anitha R", dept: "ECE" },
      ];
      for (const f of mockFaculty) {
        const r = await client.query(
          `INSERT INTO persons (person_type, display_name, department_code, status)
           VALUES ('faculty', $1, $2, 'active')
           ON CONFLICT DO NOTHING
           RETURNING person_id, display_name, department_code`,
          [f.name, f.dept]
        );
        if (r.rows[0]) faculty.push({ ...r.rows[0], person_type: 'faculty' });
      }
    }

    console.log(`Found ${faculty.length} faculty members`);

    const createdBy = admin ? admin.person_id : faculty[0].person_id;

    // 1. Create a completed faculty evaluation session
    const sessionResult = await client.query(
      `INSERT INTO faculty_evaluation_sessions
         (title, academic_year, semester, status, evaluation_mode,
          opens_at, closes_at, pool_size, normalize_by_sessions, normalize_by_hours, normalize_by_role,
          created_by)
       VALUES
         ('Mid-Semester Faculty Review', 2025, 1, 'closed', 'full_pool',
          NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days', 25, true, true, true,
          $1)
       RETURNING id`,
      [createdBy]
    );
    const sessionId = sessionResult.rows[0].id;
    console.log(`Created session: ${sessionId}`);

    // 2. Create faculty assignments with exposure data
    const assignments = [
      { sessions: 12, hours: 48, role: "lecture", dept: "CSE", enrolled: 60 },
      { sessions: 8, hours: 32, role: "lab", dept: "CSE", enrolled: 30 },
      { sessions: 15, hours: 60, role: "lecture", dept: "ECE", enrolled: 45 },
    ];

    for (let i = 0; i < Math.min(faculty.length, assignments.length); i++) {
      const f = faculty[i];
      const a = assignments[i];
      await client.query(
        `INSERT INTO faculty_evaluation_assignments
           (session_id, faculty_id, sessions_conducted, contact_hours, role_type,
            department, is_active, enrolled_students)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
        [sessionId, f.person_id, a.sessions, a.hours, a.role, a.dept || f.department_code, a.enrolled]
      );
      console.log(`  Assigned: ${f.display_name} — ${a.sessions} sessions, ${a.hours}hr, ${a.role}`);
    }

    // 3. Get active normalization weights
    const weightsResult = await client.query(
      `SELECT * FROM faculty_normalization_weights WHERE is_active = true LIMIT 1`
    );
    const weights = weightsResult.rows[0];
    console.log(`Using weights: sessions=${weights.sessions_weight}, hours=${weights.hours_weight}, role=${weights.role_weight}`);

    // 4. Calculate and insert normalized scores
    // Get max values for ratio calculation
    const maxResult = await client.query(
      `SELECT MAX(sessions_conducted) as max_sessions, MAX(contact_hours) as max_hours
       FROM faculty_evaluation_assignments WHERE session_id = $1`,
      [sessionId]
    );
    const maxSessions = parseInt(maxResult.rows[0].max_sessions) || 1;
    const maxHours = parseFloat(maxResult.rows[0].max_hours) || 1;

    const roleMultipliers = {
      lecture: parseFloat(weights.lecture_weight) || 1.0,
      lab: parseFloat(weights.lab_weight) || 0.8,
      tutorial: parseFloat(weights.tutorial_weight) || 0.7,
      seminar: parseFloat(weights.seminar_weight) || 0.9,
    };

    const sw = parseFloat(weights.sessions_weight);
    const hw = parseFloat(weights.hours_weight);
    const rw = parseFloat(weights.role_weight);

    const rawScores = [3.8, 4.2, 3.5]; // Simulated raw average scores
    const studentCounts = [45, 28, 38];
    const responseCounts = [42, 25, 35];

    for (let i = 0; i < Math.min(faculty.length, assignments.length); i++) {
      const f = faculty[i];
      const a = assignments[i];
      const rawScore = rawScores[i];
      const studentCount = studentCounts[i];
      const responseRate = (responseCounts[i] / studentCount) * 100;

      // Log-scaled ratios
      const sessionRatio = Math.log10(1 + a.sessions) / Math.log10(1 + maxSessions);
      const hoursRatio = Math.log10(1 + a.hours) / Math.log10(1 + maxHours);
      const roleMult = roleMultipliers[a.role] || 1.0;

      // Weighted exposure factor
      let exposureFactor = (sessionRatio * sw + hoursRatio * hw + roleMult * rw) / (sw + hw + rw);
      exposureFactor = Math.max(exposureFactor, 0.3); // floor
      exposureFactor = Math.min(exposureFactor, 1.2); // ceiling

      // Response rate adjustment
      const rrAdj = Math.pow(Math.min(responseRate / 100, 1), 0.5);

      // Final normalized score
      const normalizedScore = rawScore * exposureFactor * rrAdj;

      await client.query(
        `INSERT INTO faculty_normalized_scores
           (session_id, faculty_id, raw_total_points, raw_average_score,
            student_count, response_rate, normalized_score, exposure_factor,
            role_weight, department_percentile)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionId, f.person_id,
          rawScore * studentCount, rawScore,
          studentCount, responseRate.toFixed(2),
          normalizedScore.toFixed(2), exposureFactor.toFixed(4),
          roleMult, (i === 0 ? 75 : i === 1 ? 90 : 60),
        ]
      );

      // Also insert audit log entry
      await client.query(
        `INSERT INTO normalization_audit_log
           (session_id, faculty_id, weight_config_id, raw_score,
            sessions_conducted, contact_hours, role_type, response_rate,
            session_ratio, hours_ratio, role_multiplier,
            exposure_factor, response_adjustment, normalized_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          sessionId, f.person_id, weights.id,
          rawScore, a.sessions, a.hours, a.role, responseRate.toFixed(2),
          sessionRatio.toFixed(4), hoursRatio.toFixed(4), roleMult,
          exposureFactor.toFixed(4), rrAdj.toFixed(4), normalizedScore.toFixed(2),
        ]
      );

      console.log(`  Score: ${f.display_name} — raw=${rawScore}, exposure=${exposureFactor.toFixed(3)}, normalized=${normalizedScore.toFixed(2)}`);
    }

    // 5. Insert department benchmarks
    await client.query(
      `INSERT INTO department_normalization_benchmarks
         (session_id, department, avg_sessions_per_faculty, avg_hours_per_faculty,
          max_sessions, max_hours, faculty_count, dept_avg_raw_score, dept_avg_normalized_score,
          dept_std_deviation)
       VALUES ($1, 'CSE', 10, 40, $2, $3, 2, 4.0, 3.5, 0.35),
              ($1, 'ECE', 15, 60, 15, 60, 1, 3.5, 3.1, 0.0)`,
      [sessionId, maxSessions, maxHours]
    );

    await client.query("COMMIT");
    console.log("\n✅ Seed data created successfully!");
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Status: closed`);
    console.log(`   Faculty scored: ${Math.min(faculty.length, assignments.length)}`);
    console.log("\n   Now reload the frontend pages to see data.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
