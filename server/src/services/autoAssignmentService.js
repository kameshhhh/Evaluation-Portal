// ============================================================
// ADAPTIVE AUTO-ASSIGNMENT ENGINE
// ============================================================
// Suggests optimal faculty evaluators based on weighted signals:
// 1. Workload (40%) - Balanced distribution of assignments
// 2. Team Balance (40%) - Minimizing credibility variance (stdev)
// 3. Stability (20%) - Evaluator's historical credibility/reliability
// ============================================================

"use strict";

const { query, getClient } = require("../config/database");
const logger = require("../utils/logger");
const GovernanceService = require("./GovernanceService");
const facultyScopeService = require("./facultyScopeService");

class AutoAssignmentService {
    constructor() {
        // HARDCODED WEIGHTS (Per Architecture Decision)
        this.WEIGHTS = {
            WORKLOAD: 0.4,
            BALANCE: 0.4,
            STABILITY: 0.2
        };
        this.MAX_ASSIGNMENTS_PER_WEEK = 25;
        this.MIN_JUDGES_PER_TEAM = 2; // Default, overridable via assignBatch()
    }

    /**
     * Generates ranked suggestions for a specific student in a session.
     * 
     * @param {string} sessionId
     * @param {string} studentId
     * @param {number} limit - Number of suggestions to return
     * @param {Map} workloadOffsetMap - Optional in-memory workload increments
     * @returns {Promise<Array>} Ranked list of faculty candidates
     */
    async getSuggestions(sessionId, studentId, limit = 5, workloadOffsetMap = new Map()) {
        try {
            // 1. Fetch Student Info (Track, Dept)
            const studentRes = await query(
                `SELECT p.person_id, p.department_code, sts.track 
         FROM persons p
         LEFT JOIN student_track_selections sts ON sts.person_id = p.person_id
         WHERE p.person_id = $1`,
                [studentId]
            );
            if (studentRes.rows.length === 0) throw new Error("Student not found");
            const student = studentRes.rows[0];

            // Guard: if student has no track selection, no candidates can match
            if (!student.track) {
                logger.warn("AutoAssignment: Student has no track selection — skipping", { studentId });
                return [];
            }

            // 2. Fetch Current Assignments (for Balance Calculation)
            const currentTeamRes = await query(
                `SELECT spa.faculty_id, COALESCE(jcm.credibility_score, 1.0) as score
         FROM session_planner_assignments spa
         LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = spa.faculty_id
         WHERE spa.session_id = $1 AND spa.student_id = $2 AND spa.status != 'removed'`,
                [sessionId, studentId]
            );
            const currentTeamScores = currentTeamRes.rows.map(r => parseFloat(r.score));

            // 3. Find Candidate Faculty (Scoped)
            const candidateRes = await query(
                `SELECT 
            p.person_id, p.display_name, 
            COALESCE(jcm.credibility_score, 1.0) as credibility,
            (SELECT COUNT(*) FROM session_planner_assignments spa2 
             WHERE spa2.session_id = $1 AND spa2.faculty_id = p.person_id AND spa2.status != 'removed') as workload
         FROM persons p
         JOIN users u ON u.internal_user_id = p.identity_id
         LEFT JOIN judge_credibility_metrics jcm ON jcm.evaluator_id = p.person_id
         WHERE u.user_role IN ('faculty', 'admin')
           AND p.status = 'active'
           -- Scope Match:
           AND EXISTS (
             SELECT 1 FROM faculty_evaluation_scope fes
             JOIN tracks t ON fes.track_id = t.id
             WHERE fes.faculty_id = p.identity_id
               -- Checks:
               AND fes.is_active = true
               AND UPPER(t.name) = UPPER($2) -- Student Track
               AND (fes.department_code IS NULL OR fes.department_code = $3) -- Student Dept
           )
           -- Exclusion: Not already assigned
           AND p.person_id NOT IN (
             SELECT faculty_id FROM session_planner_assignments 
             WHERE session_id = $1 AND student_id = $4 AND status != 'removed'
           )`,
                [sessionId, student.track, student.department_code, studentId]
            );

            const candidates = candidateRes.rows.map(c => ({
                ...c,
                workload: parseInt(c.workload) + (workloadOffsetMap.get(c.person_id) || 0)
            })).filter(c => c.workload < this.MAX_ASSIGNMENTS_PER_WEEK);

            if (candidates.length === 0) return [];

            // 4. Calculate Max Workload (for normalization)
            const maxWorkload = Math.max(...candidates.map(c => c.workload), 1);

            // 5. Rank Candidates
            const ranked = candidates.map(candidate => {
                const workload = candidate.workload;
                const credibility = parseFloat(candidate.credibility);

                // --- A. WORKLOAD SCORE (Lower is better) ---
                const normWorkload = 1 - (workload / (this.MAX_ASSIGNMENTS_PER_WEEK + 1));

                // --- B. STABILITY SCORE (Higher Credibility is better) ---
                const normStability = Math.min(Math.max((credibility - 0.5), 0), 1);

                // --- C. BALANCE SCORE (Impact on Team Stdev) ---
                const newTeamScores = [...currentTeamScores, credibility];
                const newStdev = this._calculateStdev(newTeamScores);
                const normBalance = 1 - Math.min(newStdev / 0.40, 1);

                // --- FINAL WEIGHTED SUM ---
                const totalScore = (
                    (normWorkload * this.WEIGHTS.WORKLOAD) +
                    (normBalance * this.WEIGHTS.BALANCE) +
                    (normStability * this.WEIGHTS.STABILITY)
                );

                return {
                    facultyId: candidate.person_id,
                    displayName: candidate.display_name,
                    metrics: {
                        workload,
                        credibility,
                        projectedStdev: newStdev
                    },
                    scores: {
                        workload: normWorkload,
                        balance: normBalance,
                        stability: normStability,
                        total: totalScore
                    }
                };
            });

            ranked.sort((a, b) => b.scores.total - a.scores.total);
            return ranked.slice(0, limit);

        } catch (error) {
            logger.error("AutoAssignmentService: Failed to get suggestions", { error: error.message, sessionId, studentId });
            return [];
        }
    }

    /**
     * TEAM-AWARE BATCH ASSIGNMENT
     * ===========================
     * Groups students by team_formation_id, then assigns ENTIRE TEAMS
     * as units to the same faculty set. Solo students (no team) are
     * assigned individually.
     *
     * @param {string} sessionId
     * @param {string} actorId
     * @param {string} [source]
     * @param {number} [minJudges=2] - 2 or 3 judges per student/team
     */
    async assignBatch(sessionId, actorId, source = 'auto_suggested', minJudges = 2) {
        const client = await getClient();
        try {
            await client.query("BEGIN");

            // Concurrency guard: row-level lock on session
            const sessionCheck = await client.query(
                `SELECT auto_suggested, status, track FROM faculty_evaluation_sessions WHERE id = $1 FOR UPDATE`,
                [sessionId]
            );
            if (!sessionCheck.rows[0]) throw new Error("Session not found");
            if (sessionCheck.rows[0].status === 'FINALIZED') {
                throw new Error("Cannot assign in a finalized session.");
            }

            // Track filter: when session has a track, only assign students of that track
            const sessionTrack = sessionCheck.rows[0].track || null;

            // 1. Guard: reject if assignments already exist and evaluation started
            if (sessionCheck.rows[0]?.auto_suggested) {
                const marksCheck = await client.query(
                    `SELECT 1 FROM session_planner_assignments 
                     WHERE session_id = $1 AND marks_submitted_at IS NOT NULL LIMIT 1`,
                    [sessionId]
                );
                if (marksCheck.rows.length > 0) {
                    throw new Error("Cannot re-run auto-assignment after evaluation has started.");
                }
                // No marks submitted yet — allow re-run (idempotent via ON CONFLICT DO NOTHING)
            }

            // 2. Load Students with team_formation_id (filtered by session track + batch_year if set)
            const studentRes = await client.query(
                `SELECT p.person_id, p.display_name, sts.track, p.department_code,
                        p.graduation_year AS batch_year,
                        tfr.id AS team_formation_id
                 FROM persons p
                 JOIN student_track_selections sts ON sts.person_id = p.person_id
                 JOIN users u ON u.internal_user_id = p.identity_id
                 JOIN faculty_evaluation_sessions fes ON fes.id = $1
                 LEFT JOIN team_formation_requests tfr
                      ON tfr.leader_id = p.person_id AND tfr.status = 'admin_approved'
                 WHERE u.user_role = 'student'
                   AND p.status = 'active' AND p.is_deleted = false
                   AND (
                     (fes.batch_year IS NOT NULL AND p.graduation_year = fes.batch_year)
                     OR
                     (fes.batch_year IS NULL AND sts.academic_year = fes.academic_year)
                   )
                   AND ($2::varchar IS NULL OR sts.track = $2)`,
                [sessionId, sessionTrack]
            );

            // Also get students who are team members (not leaders)
            const memberRes = await client.query(
                `SELECT ti.invitee_id AS person_id, p.display_name, sts.track, p.department_code,
                        p.graduation_year AS batch_year,
                        ti.formation_id AS team_formation_id
                 FROM team_invitations ti
                 JOIN persons p ON p.person_id = ti.invitee_id
                 JOIN student_track_selections sts ON sts.person_id = ti.invitee_id
                 JOIN users u ON u.internal_user_id = p.identity_id
                 JOIN faculty_evaluation_sessions fes ON fes.id = $1
                 JOIN team_formation_requests tfr ON tfr.id = ti.formation_id AND tfr.status = 'admin_approved'
                 WHERE ti.status = 'accepted'
                   AND u.user_role = 'student'
                   AND p.status = 'active' AND p.is_deleted = false
                   AND (
                     (fes.batch_year IS NOT NULL AND p.graduation_year = fes.batch_year)
                     OR
                     (fes.batch_year IS NULL AND sts.academic_year = fes.academic_year)
                   )
                   AND ($2::varchar IS NULL OR sts.track = $2)`,
                [sessionId, sessionTrack]
            );

            // Merge and deduplicate — prefer rows WITH team_formation_id over null
            const studentMap = new Map();
            for (const row of [...studentRes.rows, ...memberRes.rows]) {
                const existing = studentMap.get(row.person_id);
                if (!existing || (!existing.team_formation_id && row.team_formation_id)) {
                    studentMap.set(row.person_id, row);
                }
            }
            const allStudents = Array.from(studentMap.values());

            if (allStudents.length === 0) return { success: true, count: 0, teams: 0, track: sessionTrack };

            // 3. Group by team_formation_id (teams as units)
            const teamMap = new Map(); // team_formation_id → [student]
            const soloStudents = [];

            for (const s of allStudents) {
                if (s.team_formation_id) {
                    if (!teamMap.has(s.team_formation_id)) teamMap.set(s.team_formation_id, []);
                    teamMap.get(s.team_formation_id).push(s);
                } else {
                    soloStudents.push(s);
                }
            }

            // ── Warning: unteamed Core students (core track requires team of 3-4) ──
            const unteamedCoreStudents = soloStudents
                .filter(s => s.track === 'core')
                .map(s => ({ personId: s.person_id, displayName: s.display_name }));

            // Shuffle teams and solos for fairness
            const teamGroups = Array.from(teamMap.values()).sort(() => Math.random() - 0.5);
            const shuffledSolos = soloStudents.sort(() => Math.random() - 0.5);

            // 4. Assign entire teams as one unit
            const workloadOffsetMap = new Map();
            const assignments = [];
            const targetJudges = Math.min(Math.max(parseInt(minJudges) || 2, 2), 3);

            for (const teamStudents of teamGroups) {
                // Use the first student (leader) to determine how many judges needed
                const representative = teamStudents[0];
                const countRes = await client.query(
                    `SELECT COUNT(*) as count FROM session_planner_assignments 
                     WHERE session_id = $1 AND student_id = $2 AND status != 'removed'`,
                    [sessionId, representative.person_id]
                );
                let currentCount = parseInt(countRes.rows[0].count);

                while (currentCount < targetJudges) {
                    // Get suggestion based on representative student
                    const suggestions = await this.getSuggestions(sessionId, representative.person_id, 1, workloadOffsetMap);
                    if (suggestions.length === 0) break;

                    const best = suggestions[0];
                    // Assign ALL team members to this faculty
                    for (const student of teamStudents) {
                        assignments.push({
                            sessionId,
                            studentId: student.person_id,
                            facultyId: best.facultyId,
                            teamFormationId: student.team_formation_id,
                        });
                    }

                    // Workload offset = entire team size
                    workloadOffsetMap.set(best.facultyId, 
                        (workloadOffsetMap.get(best.facultyId) || 0) + teamStudents.length);
                    currentCount++;
                }
            }

            // 5. Assign solo students individually (same as before)
            for (const student of shuffledSolos) {
                const countRes = await client.query(
                    `SELECT COUNT(*) as count FROM session_planner_assignments 
                     WHERE session_id = $1 AND student_id = $2 AND status != 'removed'`,
                    [sessionId, student.person_id]
                );
                let currentCount = parseInt(countRes.rows[0].count);

                while (currentCount < targetJudges) {
                    const suggestions = await this.getSuggestions(sessionId, student.person_id, 1, workloadOffsetMap);
                    if (suggestions.length === 0) break;

                    const best = suggestions[0];
                    assignments.push({
                        sessionId,
                        studentId: student.person_id,
                        facultyId: best.facultyId,
                        teamFormationId: null,
                    });

                    workloadOffsetMap.set(best.facultyId, (workloadOffsetMap.get(best.facultyId) || 0) + 1);
                    currentCount++;
                }
            }

            // 6. Batch Insert (with team_formation_id)
            for (const a of assignments) {
                await client.query(
                    `INSERT INTO session_planner_assignments 
                     (session_id, faculty_id, student_id, assigned_by, status, assignment_source, team_formation_id)
                     VALUES ($1, $2, $3, $4, 'assigned', $5, $6)
                     ON CONFLICT (session_id, faculty_id, student_id) DO NOTHING`,
                    [sessionId, a.facultyId, a.studentId, actorId, source, a.teamFormationId]
                );
            }

            // 7. Update Session State
            await client.query(
                `UPDATE faculty_evaluation_sessions SET auto_suggested = TRUE, updated_at = NOW() WHERE id = $1`,
                [sessionId]
            );

            await client.query("COMMIT");
            return { 
                success: true, 
                count: assignments.length,
                teams: teamGroups.length,
                solos: shuffledSolos.length,
                track: sessionTrack,
                warnings: unteamedCoreStudents.length > 0
                    ? [{ type: 'unteamed_core', count: unteamedCoreStudents.length, students: unteamedCoreStudents }]
                    : [],
            };

        } catch (error) {
            await client.query("ROLLBACK");
            logger.error("AutoAssignmentService: Batch Assignment Failed", { error: error.message, sessionId });
            throw error;
        } finally {
            client.release();
        }
    }

    _calculateStdev(numbers) {
        if (numbers.length === 0) return 0;
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numbers.length;
        return Math.sqrt(variance);
    }
}

module.exports = new AutoAssignmentService();
