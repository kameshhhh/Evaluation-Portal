/**
 * CREDIBILITY SERVICE — Per-Rubric Weighted Evaluation Pipeline
 * ============================================================
 * Rebuilt for rubric-based evaluation system. Each faculty marks
 * per rubric (0-5), and credibility is computed per-rubric.
 *
 * SCORING:
 *   Per rubric: weighted_avg = Σ(mark × cred_weight) / Σ(cred_weight)
 *   Display score = Σ(rubric_weighted_avg) / rubric_count  (always 0-5)
 *
 * CREDIBILITY PIPELINE:
 *   ① AlignmentAnalyzer — exp(-5·d) per rubric, averaged
 *   ② StabilityAnalyzer — cross-session variance of alignment
 *   ③ DisciplineAnalyzer — Gini + utilization + differentiation
 *   ④ CredibilityCompositor — 0.5/0.3/0.2 weighted fusion
 *   ⑤ TemporalSmoother — EMA with dynamic alpha + clamping
 *
 * FLOW:
 *   Per-student (real-time):  calculateStudentScore(sessionId, studentId)
 *   Per-session (finalize):   finalizeSession(sessionId)
 * ============================================================
 */

"use strict";

const { query } = require("../../config/database");
const logger = require("../../utils/logger");
const crypto = require("crypto");
const AlignmentAnalyzer = require("./analyzers/AlignmentAnalyzer");
const CredibilityCompositor = require("./compositors/CredibilityCompositor");
const TemporalSmoother = require("./compositors/TemporalSmoother");

class CredibilityService {

    // ─── SNAPSHOT BUILDER ────────────────────────────────────
    async _buildAndStoreSnapshot(client, sessionId) {
        const judgesRes = await client.query(
            `SELECT DISTINCT spa.faculty_id,
                    COALESCE(jcm.credibility_score, 1.0) AS credibility_score
             FROM session_planner_assignments spa
             LEFT JOIN judge_credibility_metrics jcm
                    ON jcm.evaluator_id = spa.faculty_id
             WHERE spa.session_id = $1
               AND spa.status != 'removed'`,
            [sessionId]
        );

        const snapshot = {};
        judgesRes.rows.forEach(row => {
            snapshot[row.faculty_id] = parseFloat(row.credibility_score);
        });

        const snapshotVersion = crypto.randomUUID();

        await client.query(
            `UPDATE faculty_evaluation_sessions
                SET credibility_snapshot = $2,
                    snapshot_version     = $3
              WHERE id = $1`,
            [sessionId, JSON.stringify(snapshot), snapshotVersion]
        );

        logger.info("CredibilityService: Snapshot frozen", {
            sessionId, snapshotVersion,
            judgeCount: Object.keys(snapshot).length,
        });

        return snapshot;
    }

    // ─── CONFIDENCE CALCULATOR ───────────────────────────────
    _calculateConfidence(values) {
        if (values.length <= 1) return 1.0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (mean === 0) return 0.0;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdev = Math.sqrt(variance);
        const cv = stdev / Math.abs(mean);
        return Math.max(0, Math.min(1 - cv, 1.0));
    }

    // ─── CALCULATE STUDENT SCORE (PER-RUBRIC) ──────────────
    /**
     * Computes credibility-weighted scores per rubric, then averages
     * to produce display_score (always 0-5).
     *
     * display_score = Σ(rubric_weighted_avg) / rubric_count
     */
    async calculateStudentScore(sessionId, studentId, snapshot = null, client = null) {
        const q = client ? (text, params) => client.query(text, params) : query;

        try {
            let submissions;
            if (snapshot) {
                const res = await q(
                    `SELECT spa.faculty_id, spa.marks, spa.rubric_marks, spa.team_formation_id
                     FROM session_planner_assignments spa
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'`,
                    [sessionId, studentId]
                );
                submissions = res.rows.map(row => ({
                    ...row,
                    credibility_score: snapshot[row.faculty_id] ?? 1.0
                }));
            } else {
                const res = await q(
                    `SELECT spa.faculty_id, spa.marks, spa.rubric_marks, spa.team_formation_id,
                            COALESCE(jcm.credibility_score, 1.0) AS credibility_score
                     FROM session_planner_assignments spa
                     LEFT JOIN judge_credibility_metrics jcm
                            ON jcm.evaluator_id = spa.faculty_id
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'`,
                    [sessionId, studentId]
                );
                submissions = res.rows;
            }

            if (submissions.length === 0) {
                return { status: "NO_DATA" };
            }

            // Collect all rubric IDs from submissions
            const allRubricIds = new Set();
            submissions.forEach(sub => {
                const rm = typeof sub.rubric_marks === 'string'
                    ? JSON.parse(sub.rubric_marks)
                    : (sub.rubric_marks || {});
                Object.keys(rm).forEach(id => allRubricIds.add(id));
            });

            const rubricIds = Array.from(allRubricIds);
            const rubricCount = rubricIds.length || 1;

            // Lookup rubric names for human-readable breakdown
            let rubricNameMap = {};
            if (rubricIds.length > 0) {
                const nameRes = await q(
                    `SELECT head_id, head_name FROM evaluation_heads WHERE head_id = ANY($1::uuid[]) ORDER BY head_name ASC`,
                    [rubricIds]
                );
                nameRes.rows.forEach(r => { rubricNameMap[r.head_id] = r.head_name; });
            }

            // Determine team size for pool normalization
            // Solo student: teamSize = 1, pool = 5
            // Team: count distinct students sharing the team_formation_id
            const teamFormationId = submissions[0]?.team_formation_id;
            let teamSize = 1;
            if (teamFormationId) {
                const teamRes = await q(
                    `SELECT COUNT(DISTINCT student_id) AS cnt
                     FROM session_planner_assignments
                     WHERE session_id = $1 AND team_formation_id = $2 AND status != 'removed'`,
                    [sessionId, teamFormationId]
                );
                teamSize = parseInt(teamRes.rows[0]?.cnt) || 1;
            }
            const teamPool = teamSize * 5;

            // Compute per-rubric pools (floor + alphabetical remainder)
            const sortedRubricIds = Object.entries(rubricNameMap)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(e => e[0]);
            const orderedIds = sortedRubricIds.length > 0 ? sortedRubricIds : [...rubricIds].sort();
            const basePool = Math.floor(teamPool / rubricCount);
            const poolRemainder = teamPool % rubricCount;
            const perRubricPool = {};
            orderedIds.forEach((rid, idx) => {
                perRubricPool[rid] = basePool + (idx < poolRemainder ? 1 : 0);
            });

            // Compute per-rubric weighted averages
            const rubricBreakdown = {};
            let totalNormalizedSum = 0;

            for (const rubricId of rubricIds) {
                let weightedSum = 0, totalWeight = 0, rawSum = 0, count = 0;

                for (const sub of submissions) {
                    const rm = typeof sub.rubric_marks === 'string'
                        ? JSON.parse(sub.rubric_marks)
                        : (sub.rubric_marks || {});
                    const mark = Number(rm[rubricId] ?? 0);
                    const weight = parseFloat(sub.credibility_score);

                    weightedSum += mark * weight;
                    totalWeight += weight;
                    rawSum += mark;
                    count++;
                }

                const weightedAvg = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
                const rawAvg = count > 0 ? (rawSum / count) : 0;

                // Normalize per-rubric: (weightedAvg / rubricPool) × 5 → always 0-5 scale
                const rubricPool = perRubricPool[rubricId] || basePool || 1;
                const normalizedScore = Math.min(5, (weightedAvg / rubricPool) * 5);
                const normalizedRaw = Math.min(5, (rawAvg / rubricPool) * 5);

                const rubricName = rubricNameMap[rubricId] || rubricId;
                rubricBreakdown[rubricName] = {
                    weighted_avg: +normalizedScore.toFixed(4),
                    raw_avg: +normalizedRaw.toFixed(4),
                    judge_count: count,
                };

                totalNormalizedSum += normalizedScore;
            }

            // display_score = avg of normalized per-rubric scores → always 0-5
            const displayScore = rubricCount > 0 ? (totalNormalizedSum / rubricCount) : 0;

            // Legacy: compute total-based scores for backward compat
            let legacyWeightedSum = 0, legacyTotalWeight = 0, rawTotal = 0;
            const rawTotalMarks = [];
            const breakdown = {};

            submissions.forEach(sub => {
                const weight = parseFloat(sub.credibility_score);
                const marks = parseFloat(sub.marks || 0);
                legacyWeightedSum += marks * weight;
                legacyTotalWeight += weight;
                rawTotal += marks;
                rawTotalMarks.push(marks);
                breakdown[sub.faculty_id] = {
                    marks, credibility_weight: +weight.toFixed(4),
                    weighted_contribution: +(marks * weight).toFixed(4),
                    weight_share: 0,
                };
            });

            Object.values(breakdown).forEach(b => {
                b.weight_share = legacyTotalWeight > 0
                    ? +((b.credibility_weight / legacyTotalWeight) * 100).toFixed(1) : 0;
            });

            const normalizedScore = legacyTotalWeight > 0 ? (legacyWeightedSum / legacyTotalWeight) : 0;
            const aggregatedScore = rawTotal / submissions.length;
            const confidenceScore = this._calculateConfidence(rawTotalMarks);
            const weightingEffect = normalizedScore - aggregatedScore;

            // Upsert with new columns
            await q(
                `INSERT INTO final_student_results (
                    session_id, student_id, aggregated_score, normalized_score,
                    confidence_score, judge_count, credibility_breakdown,
                    display_score, rubric_breakdown, finalized_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                 ON CONFLICT (session_id, student_id) DO UPDATE SET
                    aggregated_score = EXCLUDED.aggregated_score,
                    normalized_score = EXCLUDED.normalized_score,
                    confidence_score = EXCLUDED.confidence_score,
                    judge_count = EXCLUDED.judge_count,
                    credibility_breakdown = EXCLUDED.credibility_breakdown,
                    display_score = EXCLUDED.display_score,
                    rubric_breakdown = EXCLUDED.rubric_breakdown,
                    finalized_at = NOW()`,
                [sessionId, studentId, aggregatedScore, normalizedScore,
                 confidenceScore, submissions.length, JSON.stringify(breakdown),
                 +displayScore.toFixed(2), JSON.stringify(rubricBreakdown)]
            );

            return {
                status: "SUCCESS",
                displayScore: +displayScore.toFixed(2),
                normalizedScore,
                aggregatedScore,
                confidenceScore,
                weightingEffect,
                rubricBreakdown,
            };
        } catch (error) {
            logger.error("CredibilityService: Failed to calculate student score", {
                sessionId, studentId, error: error.message
            });
            throw error;
        }
    }

    // ─── FINALIZE SESSION ────────────────────────────────────
    async finalizeSession(sessionId) {
        const client = await require("../../config/database").pool.connect();
        try {
            await client.query("BEGIN");

            // Step 1: Freeze Credibility Snapshot
            const snapshot = await this._buildAndStoreSnapshot(client, sessionId);

            // Get session's rubric config
            const sessionRes = await client.query(
                `SELECT preferred_rubric_ids FROM faculty_evaluation_sessions WHERE id = $1`,
                [sessionId]
            );
            const rubricIds = sessionRes.rows[0]?.preferred_rubric_ids || [];
            const rubricCount = rubricIds.length || 1;
            const scaleMax = rubricCount * 5;

            // Step 2: Calculate All Student Scores (using snapshot)
            const studentsRes = await client.query(
                `SELECT DISTINCT student_id FROM session_planner_assignments
                 WHERE session_id = $1 AND status = 'evaluation_done'`,
                [sessionId]
            );

            const studentResults = [];
            for (const row of studentsRes.rows) {
                const result = await this.calculateStudentScore(
                    sessionId, row.student_id, snapshot, client
                );
                studentResults.push({ studentId: row.student_id, ...result });
            }

            if (studentResults.length > 0) {
                await client.query(
                    `UPDATE final_student_results SET scale_max = $1 WHERE session_id = $2`,
                    [scaleMax, sessionId]
                );
            }

            // Step 3: Advanced Credibility Pipeline
            const dataRes = await client.query(
                `SELECT spa.faculty_id, spa.student_id, spa.marks, spa.rubric_marks,
                        fsr.normalized_score AS consensus, fsr.rubric_breakdown AS consensus_breakdown
                 FROM session_planner_assignments spa
                 JOIN final_student_results fsr
                      ON fsr.session_id = spa.session_id AND fsr.student_id = spa.student_id
                 WHERE spa.session_id = $1 AND spa.status = 'evaluation_done'`,
                [sessionId]
            );

            const facultyData = {};
            dataRes.rows.forEach(row => {
                if (!facultyData[row.faculty_id]) {
                    facultyData[row.faculty_id] = {
                        allocations: [], marks: [], consensusMeans: {},
                        rubricAllocations: {},
                        rubricConsensusMeans: {},
                    };
                }
                const fd = facultyData[row.faculty_id];
                fd.allocations.push({ target_id: row.student_id, points: parseFloat(row.marks || 0) });
                fd.marks.push(parseFloat(row.marks || 0));
                fd.consensusMeans[row.student_id] = { mean: parseFloat(row.consensus || 0) };

                const rm = typeof row.rubric_marks === 'string' ? JSON.parse(row.rubric_marks) : (row.rubric_marks || {});
                const cb = typeof row.consensus_breakdown === 'string' ? JSON.parse(row.consensus_breakdown) : (row.consensus_breakdown || {});

                for (const [rid, mark] of Object.entries(rm)) {
                    if (!fd.rubricAllocations[rid]) fd.rubricAllocations[rid] = [];
                    fd.rubricAllocations[rid].push({ target_id: row.student_id, points: Number(mark) });

                    if (!fd.rubricConsensusMeans[rid]) fd.rubricConsensusMeans[rid] = {};
                    fd.rubricConsensusMeans[rid][row.student_id] = {
                        mean: cb[rid]?.weighted_avg ?? Number(mark)
                    };
                }
            });

            const judgesUpdated = {};

            for (const [facultyId, fd] of Object.entries(facultyData)) {
                if (fd.allocations.length === 0) continue;

                // ① ALIGNMENT — averaged across rubrics
                let alignmentScoreSum = 0;
                let alignmentCount = 0;
                let avgDeviation = 0;
                let isConsistent = true;

                for (const rid of rubricIds) {
                    const rubricAllocs = fd.rubricAllocations[rid] || [];
                    const rubricConsensus = fd.rubricConsensusMeans[rid] || {};

                    if (rubricAllocs.length > 0 && Object.keys(rubricConsensus).length > 0) {
                        const alignment = AlignmentAnalyzer.analyze({
                            evaluatorAllocations: rubricAllocs,
                            aggregatedMeans: rubricConsensus,
                            poolSize: 5,
                            targetCount: studentResults.length,
                        });
                        alignmentScoreSum += alignment.score;
                        avgDeviation += alignment.deviation;
                        if (!alignment.is_consistent) isConsistent = false;
                        alignmentCount++;
                    }
                }

                if (alignmentCount === 0) {
                    const alignment = AlignmentAnalyzer.analyze({
                        evaluatorAllocations: fd.allocations,
                        aggregatedMeans: fd.consensusMeans,
                        poolSize: scaleMax,
                        targetCount: studentResults.length,
                    });
                    alignmentScoreSum = alignment.score;
                    avgDeviation = alignment.deviation;
                    isConsistent = alignment.is_consistent;
                    alignmentCount = 1;
                }

                const alignmentScore = alignmentCount > 0 ? alignmentScoreSum / alignmentCount : 0.5;
                const finalDeviation = alignmentCount > 0 ? avgDeviation / alignmentCount : 0;

                // ② STABILITY
                const existingRes = await client.query(
                    `SELECT credibility_score, deviation_index, participation_count, history
                     FROM judge_credibility_metrics WHERE evaluator_id = $1`,
                    [facultyId]
                );

                let stabilityScore = 0.5, participationCount = 0, oldProfileScore = null;
                if (existingRes.rows.length > 0) {
                    const existing = existingRes.rows[0];
                    participationCount = existing.participation_count || 0;
                    oldProfileScore = parseFloat(existing.credibility_score);
                    const history = existing.history || [];
                    const pastAlignments = history.map(h => h.alignment_score).filter(a => a != null && !isNaN(a));
                    if (pastAlignments.length >= 1) {
                        const allAlignments = [...pastAlignments, alignmentScore];
                        const mean = allAlignments.reduce((a, b) => a + b, 0) / allAlignments.length;
                        const variance = allAlignments.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / allAlignments.length;
                        stabilityScore = Math.max(0.1, 1 - Math.tanh(3 * Math.sqrt(variance)));
                    }
                }

                // ③ DISCIPLINE
                let disciplineScore = 0.5;
                const allMarks = [];
                for (const rid of Object.keys(fd.rubricAllocations)) {
                    for (const a of fd.rubricAllocations[rid]) {
                        allMarks.push(a.points);
                    }
                }

                if (allMarks.length >= 2) {
                    const sorted = [...allMarks].sort((a, b) => a - b);
                    const n = sorted.length;
                    let giniNum = 0;
                    for (let i = 0; i < n; i++) giniNum += (2 * (i + 1) - n - 1) * sorted[i];
                    const giniDenom = n * sorted.reduce((a, b) => a + b, 0);
                    const gini = giniDenom > 0 ? giniNum / giniDenom : 0;
                    const markRange = Math.max(...allMarks) - Math.min(...allMarks);
                    const utilization = Math.min(1, markRange / 2.5);
                    const markMean = allMarks.reduce((a, b) => a + b, 0) / n;
                    const markVar = allMarks.reduce((s, v) => s + Math.pow(v - markMean, 2), 0) / n;
                    const markCV = markMean > 0 ? Math.sqrt(markVar) / markMean : 0;
                    const differentiation = Math.min(1, markCV);
                    disciplineScore = 0.3 * utilization + 0.3 * gini + 0.4 * differentiation;
                    disciplineScore = Math.max(0.1, Math.min(0.95, disciplineScore));
                }

                // ④ COMPOSITOR
                const composited = CredibilityCompositor.compose({
                    signals: {
                        alignment_score: alignmentScore,
                        stability_score: stabilityScore,
                        discipline_score: disciplineScore,
                    },
                });

                // ⑤ TEMPORAL SMOOTHER
                const smoothedProfileInput = oldProfileScore != null
                    ? Math.max(0.1, Math.min(0.95, oldProfileScore / 2.0))
                    : 0.5;
                const smoothed = TemporalSmoother.smooth({
                    currentProfile: smoothedProfileInput,
                    newComposite: composited.composite_score,
                    sessionCount: participationCount + 1,
                });

                const newCred = Math.max(0.1, Math.min(2.0, smoothed.smoothed_score * 2.0));

                // Display score: 0.00 - 1.00 (decimal, NOT percentage)
                const displayScoreDecimal = Math.max(0, Math.min(1.0,
                    (composited.composite_score - 0.1) / 0.85
                ));

                const historyEntry = {
                    sessionId, timestamp: new Date().toISOString(),
                    oldCred: oldProfileScore ?? 1.0, newCred,
                    displayScore: +displayScoreDecimal.toFixed(4),
                    pipeline: "advanced_rubric",
                    alignment_score: alignmentScore,
                    alignment_deviation: finalDeviation,
                    alignment_consistent: isConsistent,
                    stability_score: stabilityScore,
                    discipline_score: disciplineScore,
                    composite: composited.composite_score,
                    composite_raw: composited.raw_composite,
                    composite_flags: composited.flags,
                    smoothed_score: smoothed.smoothed_score,
                    smoothed_band: smoothed.band,
                    ema_alpha: smoothed.effective_alpha,
                    was_clamped: smoothed.was_clamped,
                    studentsEvaluated: fd.allocations.length,
                    rubricCount: Object.keys(fd.rubricAllocations).length,
                };

                await client.query(
                    `INSERT INTO judge_credibility_metrics
                        (evaluator_id, credibility_score, deviation_index, participation_count,
                         last_updated, history, display_score, alignment_score,
                         stability_score, discipline_score, credibility_band)
                     VALUES ($1, $2, $3, 1, NOW(), $4::jsonb, $5, $6, $7, $8, $9)
                     ON CONFLICT (evaluator_id) DO UPDATE SET
                        credibility_score = $2, deviation_index = $3,
                        participation_count = judge_credibility_metrics.participation_count + 1,
                        last_updated = NOW(),
                        history = COALESCE(judge_credibility_metrics.history, '[]'::jsonb) || $4::jsonb,
                        display_score = $5, alignment_score = $6,
                        stability_score = $7, discipline_score = $8,
                        credibility_band = $9`,
                    [facultyId, newCred, finalDeviation,
                     JSON.stringify([historyEntry]),
                     displayScoreDecimal, alignmentScore,
                     stabilityScore, disciplineScore, smoothed.band]
                );

                judgesUpdated[facultyId] = {
                    alignment: +alignmentScore.toFixed(4),
                    stability: +stabilityScore.toFixed(4),
                    discipline: +disciplineScore.toFixed(4),
                    composite: +composited.composite_score.toFixed(4),
                    smoothed: +smoothed.smoothed_score.toFixed(4),
                    band: smoothed.band,
                    mapped: +newCred.toFixed(4),
                    displayScore: +displayScoreDecimal.toFixed(4),
                    flags: composited.flags,
                };
            }

            // Step 4: Seal Session
            await client.query(
                `UPDATE faculty_evaluation_sessions
                    SET status = 'FINALIZED', finalized_at = NOW()
                  WHERE id = $1`,
                [sessionId]
            );

            await client.query("COMMIT");

            return {
                status: "SUCCESS",
                studentsScored: studentResults.length,
                pipeline: "advanced_rubric",
                judges: judgesUpdated,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            logger.error("CredibilityService: Session finalization failed", {
                sessionId, error: error.message, stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new CredibilityService();
