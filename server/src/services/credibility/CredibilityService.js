/**
 * CREDIBILITY SERVICE — Per-Rubric Weighted Evaluation Pipeline
 * ============================================================
 * Rebuilt for rubric-based evaluation system. Each faculty marks
 * per rubric (0-5), and credibility is computed per-rubric.
 *
 * SCORING:
 *   Per rubric: weighted_avg = Σ(mark × cred_weight) / Σ(cred_weight)
 *   Display score = Σ(rubric_weighted_avg)  (always 0-5, rubrics are parts of a 5-point pool)
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

    // ─── SAFE JSON PARSE HELPER ───────────────────────────────
    _safeParseRubricMarks(data) {
        try {
            return typeof data === 'string' ? JSON.parse(data) : (data || {});
        } catch {
            logger.warn("CredibilityService: Malformed rubric_marks JSON, skipping", { data: String(data).slice(0, 100) });
            return {};
        }
    }

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
     * Computes credibility-weighted scores per rubric, then sums them
     * to produce display_score (always 0-5).
     *
     * display_score = Σ(rubric_weighted_avg)  — rubrics are parts of a 5-point pool
     */
    async calculateStudentScore(sessionId, studentId, snapshot = null, client = null) {
        const q = client ? (text, params) => client.query(text, params) : query;

        try {
            let submissions;
            if (snapshot) {
                const res = await q(
                    `SELECT DISTINCT ON (spa.faculty_id)
                            spa.faculty_id, spa.marks, spa.rubric_marks, spa.team_formation_id
                     FROM session_planner_assignments spa
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'
                     ORDER BY spa.faculty_id, spa.marks_submitted_at DESC NULLS LAST`,
                    [sessionId, studentId]
                );
                submissions = res.rows.map(row => ({
                    ...row,
                    credibility_score: snapshot[row.faculty_id] ?? 1.0
                }));
            } else {
                const res = await q(
                    `SELECT DISTINCT ON (spa.faculty_id)
                            spa.faculty_id, spa.marks, spa.rubric_marks, spa.team_formation_id,
                            COALESCE(jcm.credibility_score, 1.0) AS credibility_score
                     FROM session_planner_assignments spa
                     LEFT JOIN judge_credibility_metrics jcm
                            ON jcm.evaluator_id = spa.faculty_id
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'
                     ORDER BY spa.faculty_id, spa.marks_submitted_at DESC NULLS LAST`,
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
                const rm = this._safeParseRubricMarks(sub.rubric_marks);
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

            // Compute per-rubric weighted averages
            // Each rubric mark is already 0-5 scale; no pool normalization needed.
            // Pool constraints apply at SUBMISSION time only (scarcity), not at aggregation.
            const rubricBreakdown = {};
            let totalWeightedSum = 0;

            for (const rubricId of rubricIds) {
                let weightedSum = 0, totalWeight = 0, rawSum = 0, count = 0;
                const judges = [];

                for (const sub of submissions) {
                    const rm = this._safeParseRubricMarks(sub.rubric_marks);
                    const mark = Number(rm[rubricId] ?? 0);
                    const weight = parseFloat(sub.credibility_score);

                    weightedSum += mark * weight;
                    totalWeight += weight;
                    rawSum += mark;
                    count++;
                    judges.push({ faculty_id: sub.faculty_id, mark, weight: +weight.toFixed(4) });
                }

                const weightedAvg = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
                const rawAvg = count > 0 ? (rawSum / count) : 0;

                const rubricName = rubricNameMap[rubricId] || rubricId;
                // Key by UUID so downstream (session report, dashboard) can look up directly
                rubricBreakdown[rubricId] = {
                    name: rubricName,
                    weighted_avg: +weightedAvg.toFixed(4),
                    raw_avg: +rawAvg.toFixed(4),
                    judge_count: count,
                    judges,
                };

                totalWeightedSum += weightedAvg;
            }

            // display_score = sum of per-rubric weighted averages (rubrics are parts of a 5-point pool)
            const displayScore = totalWeightedSum;

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

    // ─── BATCH STUDENT SCORING (Performance Fix #1) ─────────
    /**
     * Computes credibility-weighted scores for ALL students in one pass.
     * Replaces the per-student loop (3 queries × N) with:
     *   1 query  → fetch ALL assignments
     *   1 query  → fetch ALL rubric names
     *   ceil(N/500) → batch UPSERT chunks
     * Total: ~4 queries for 4000 students instead of 12,000.
     *
     * Math is IDENTICAL to calculateStudentScore — same weighted avg formula.
     */
    async _batchCalculateStudentScores(sessionId, snapshot, client) {
        // 1. Fetch ALL evaluated assignments in one query (DISTINCT per faculty+student)
        const allAssignRes = await client.query(
            `SELECT DISTINCT ON (spa.faculty_id, spa.student_id)
                    spa.faculty_id, spa.student_id, spa.marks,
                    spa.rubric_marks, spa.team_formation_id
             FROM session_planner_assignments spa
             WHERE spa.session_id = $1
               AND spa.status = 'evaluation_done'
             ORDER BY spa.faculty_id, spa.student_id, spa.marks_submitted_at DESC NULLS LAST`,
            [sessionId]
        );

        if (allAssignRes.rows.length === 0) return [];

        // 2. Collect ALL rubric IDs and fetch names in one query
        const allRubricIdSet = new Set();
        for (const row of allAssignRes.rows) {
            const rm = this._safeParseRubricMarks(row.rubric_marks);
            for (const id of Object.keys(rm)) allRubricIdSet.add(id);
        }
        const allRubricIds = Array.from(allRubricIdSet);

        let rubricNameMap = {};
        if (allRubricIds.length > 0) {
            const nameRes = await client.query(
                `SELECT head_id, head_name FROM evaluation_heads
                 WHERE head_id = ANY($1::uuid[]) ORDER BY head_name ASC`,
                [allRubricIds]
            );
            nameRes.rows.forEach(r => { rubricNameMap[r.head_id] = r.head_name; });
        }

        // 3. Group by student_id in memory
        const studentMap = {};
        for (const row of allAssignRes.rows) {
            if (!studentMap[row.student_id]) studentMap[row.student_id] = [];
            studentMap[row.student_id].push({
                ...row,
                credibility_score: snapshot[row.faculty_id] ?? 1.0,
            });
        }

        // 4. Compute scores per student in memory (SAME MATH as calculateStudentScore)
        const studentResults = [];
        const upsertRows = [];

        for (const [studentId, submissions] of Object.entries(studentMap)) {
            // Collect rubric IDs for this student
            const studentRubricIds = new Set();
            for (const sub of submissions) {
                const rm = this._safeParseRubricMarks(sub.rubric_marks);
                for (const id of Object.keys(rm)) studentRubricIds.add(id);
            }
            const rubricIdsArr = Array.from(studentRubricIds);
            const rubricCount = rubricIdsArr.length || 1;

            // Per-rubric weighted averages
            const rubricBreakdown = {};
            let totalWeightedSum = 0;

            for (const rubricId of rubricIdsArr) {
                let weightedSum = 0, totalWeight = 0, rawSum = 0, count = 0;
                const judges = [];

                for (const sub of submissions) {
                    const rm = this._safeParseRubricMarks(sub.rubric_marks);
                    const mark = Number(rm[rubricId] ?? 0);
                    const weight = parseFloat(sub.credibility_score);

                    weightedSum += mark * weight;
                    totalWeight += weight;
                    rawSum += mark;
                    count++;
                    judges.push({ faculty_id: sub.faculty_id, mark, weight: +weight.toFixed(4) });
                }

                const weightedAvg = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
                const rawAvg = count > 0 ? (rawSum / count) : 0;
                const rubricName = rubricNameMap[rubricId] || rubricId;

                rubricBreakdown[rubricId] = {
                    name: rubricName,
                    weighted_avg: +weightedAvg.toFixed(4),
                    raw_avg: +rawAvg.toFixed(4),
                    judge_count: count,
                    judges,
                };
                totalWeightedSum += weightedAvg;
            }

            // display_score = sum of per-rubric weighted averages (rubrics are parts of a 5-point pool)
            const displayScore = totalWeightedSum;

            // Legacy total-based scores (backward compat)
            let legacyWeightedSum = 0, legacyTotalWeight = 0, rawTotal = 0;
            const rawTotalMarks = [];
            const breakdown = {};

            for (const sub of submissions) {
                const weight = parseFloat(sub.credibility_score);
                const marks = parseFloat(sub.marks || 0);
                legacyWeightedSum += marks * weight;
                legacyTotalWeight += weight;
                rawTotal += marks;
                rawTotalMarks.push(marks);
                breakdown[sub.faculty_id] = {
                    marks,
                    credibility_weight: +weight.toFixed(4),
                    weighted_contribution: +(marks * weight).toFixed(4),
                    weight_share: 0,
                };
            }

            Object.values(breakdown).forEach(b => {
                b.weight_share = legacyTotalWeight > 0
                    ? +((b.credibility_weight / legacyTotalWeight) * 100).toFixed(1) : 0;
            });

            const normalizedScore = legacyTotalWeight > 0 ? (legacyWeightedSum / legacyTotalWeight) : 0;
            const aggregatedScore = rawTotal / submissions.length;
            const confidenceScore = this._calculateConfidence(rawTotalMarks);

            upsertRows.push({
                studentId, aggregatedScore, normalizedScore, confidenceScore,
                judgeCount: submissions.length,
                breakdown: JSON.stringify(breakdown),
                displayScore: +displayScore.toFixed(2),
                rubricBreakdown: JSON.stringify(rubricBreakdown),
            });

            studentResults.push({
                studentId,
                status: "SUCCESS",
                displayScore: +displayScore.toFixed(2),
                normalizedScore,
                aggregatedScore,
                confidenceScore,
            });
        }

        // 5. Batch UPSERT: chunks of 500 rows
        const CHUNK_SIZE = 500;
        for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
            const chunk = upsertRows.slice(i, i + CHUNK_SIZE);
            const values = [];
            const params = [];
            let idx = 1;

            for (const row of chunk) {
                values.push(
                    `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, NOW())`
                );
                params.push(
                    sessionId, row.studentId, row.aggregatedScore, row.normalizedScore,
                    row.confidenceScore, row.judgeCount, row.breakdown,
                    row.displayScore, row.rubricBreakdown
                );
            }

            await client.query(
                `INSERT INTO final_student_results (
                    session_id, student_id, aggregated_score, normalized_score,
                    confidence_score, judge_count, credibility_breakdown,
                    display_score, rubric_breakdown, finalized_at
                 ) VALUES ${values.join(', ')}
                 ON CONFLICT (session_id, student_id) DO UPDATE SET
                    aggregated_score = EXCLUDED.aggregated_score,
                    normalized_score = EXCLUDED.normalized_score,
                    confidence_score = EXCLUDED.confidence_score,
                    judge_count = EXCLUDED.judge_count,
                    credibility_breakdown = EXCLUDED.credibility_breakdown,
                    display_score = EXCLUDED.display_score,
                    rubric_breakdown = EXCLUDED.rubric_breakdown,
                    finalized_at = NOW()`,
                params
            );
        }

        logger.info("CredibilityService: Batch scored students", {
            sessionId,
            studentsScored: studentResults.length,
            totalAssignments: allAssignRes.rows.length,
            upsertChunks: Math.ceil(upsertRows.length / CHUNK_SIZE),
        });

        return studentResults;
    }

    // ─── FINALIZE SESSION ────────────────────────────────────
    async finalizeSession(sessionId) {
        const client = await require("../../config/database").pool.connect();
        try {
            await client.query("BEGIN");

            // Concurrency guard: row-level lock prevents parallel finalization
            const lockRes = await client.query(
                `SELECT status FROM faculty_evaluation_sessions WHERE id = $1 FOR UPDATE`,
                [sessionId]
            );
            if (!lockRes.rows[0]) throw new Error("Session not found");
            const isRefinalize = lockRes.rows[0].status === 'FINALIZED';
            if (isRefinalize) {
                logger.info("CredibilityService: Re-finalizing already-finalized session", { sessionId });
            }

            // Step 1: Freeze Credibility Snapshot
            const snapshot = await this._buildAndStoreSnapshot(client, sessionId);

            // Get session's rubric config
            const sessionRes = await client.query(
                `SELECT preferred_rubric_ids FROM faculty_evaluation_sessions WHERE id = $1`,
                [sessionId]
            );
            let rubricIds = sessionRes.rows[0]?.preferred_rubric_ids || [];

            // Backfill: if preferred_rubric_ids is NULL, extract from first evaluated assignment
            if (rubricIds.length === 0) {
                const firstAssign = await client.query(
                    `SELECT rubric_marks FROM session_planner_assignments
                     WHERE session_id = $1 AND status = 'evaluation_done' AND rubric_marks IS NOT NULL
                     LIMIT 1`,
                    [sessionId]
                );
                if (firstAssign.rows.length > 0) {
                    const rm = this._safeParseRubricMarks(firstAssign.rows[0].rubric_marks);
                    rubricIds = Object.keys(rm || {});
                    // Validate UUIDs before casting to uuid[]
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    rubricIds = rubricIds.filter(id => uuidRegex.test(id));
                    if (rubricIds.length > 0) {
                        await client.query(
                            `UPDATE faculty_evaluation_sessions SET preferred_rubric_ids = $1::uuid[] WHERE id = $2`,
                            [rubricIds, sessionId]
                        );
                        logger.info("CredibilityService: Backfilled preferred_rubric_ids", {
                            sessionId, rubricIds
                        });
                    }
                }
            }

            const rubricCount = rubricIds.length || 1;
            const scaleMax = 5; // Each student's total pool is always 5

            // Compute per-rubric pools for alignment normalization
            // (matches submission pool logic: sorted by name, remainder to first rubrics)
            const rubricPoolMap = {};
            if (rubricIds.length > 0) {
                const rubricNamesRes = await client.query(
                    `SELECT head_id, head_name FROM evaluation_heads WHERE head_id = ANY($1::uuid[]) ORDER BY head_name ASC`,
                    [rubricIds]
                );
                const orderedIds = rubricNamesRes.rows.length > 0
                    ? rubricNamesRes.rows.map(r => r.head_id)
                    : rubricIds;
                const basePool = Math.floor(scaleMax / rubricCount);
                const poolRem = scaleMax % rubricCount;
                orderedIds.forEach((rid, idx) => {
                    rubricPoolMap[rid] = basePool + (idx < poolRem ? 1 : 0);
                });
            }

            // ── First-session detection (Fix #2: Fairness Protection) ──
            const isFirstSession = Object.values(snapshot).every(c => c === 1.0);
            if (isFirstSession) {
                logger.info("CredibilityService: First session detected — two-pass protection enabled", { sessionId });
            }

            // Step 2: Batch Calculate All Student Scores (Fix #1: Performance)
            // OLD: 3 queries × N students → 12,000 queries for 4000 students → 120s timeout
            // NEW: 2 queries + ceil(N/500) UPSERTs → ~10 queries for 4000 students → 2-5s
            let studentResults = await this._batchCalculateStudentScores(sessionId, snapshot, client);

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

                const rm = this._safeParseRubricMarks(row.rubric_marks);
                const cb = typeof row.consensus_breakdown === 'string' ? JSON.parse(row.consensus_breakdown) : (row.consensus_breakdown || {});

                for (const [rid, mark] of Object.entries(rm)) {
                    if (!fd.rubricAllocations[rid]) fd.rubricAllocations[rid] = [];
                    fd.rubricAllocations[rid].push({ target_id: row.student_id, points: Number(mark) });

                    if (!fd.rubricConsensusMeans[rid]) fd.rubricConsensusMeans[rid] = {};
                    // cb is now UUID-keyed (from Fix 1). Fallback: try name key for old data.
                    const cbEntry = cb[rid] || Object.values(cb).find(v => v && v.name && v.name === rid);
                    fd.rubricConsensusMeans[rid][row.student_id] = {
                        mean: cbEntry?.weighted_avg ?? Number(mark)
                    };
                }
            });

            // Pre-fetch ALL judge metrics in ONE query (batch optimization)
            const allFacultyIds = Object.keys(facultyData);
            let metricsMap = {};
            if (allFacultyIds.length > 0) {
                const metricsRes = await client.query(
                    `SELECT evaluator_id, credibility_score, deviation_index,
                            participation_count, history
                     FROM judge_credibility_metrics
                     WHERE evaluator_id = ANY($1::uuid[])`,
                    [allFacultyIds]
                );
                metricsRes.rows.forEach(r => { metricsMap[r.evaluator_id] = r; });
            }

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
                            poolSize: rubricPoolMap[rid] || Math.ceil(scaleMax / rubricCount),
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

                // ② STABILITY (uses pre-fetched metrics — batch optimization)
                const existingMetric = metricsMap[facultyId];

                let stabilityScore = 0.5, participationCount = 0, oldProfileScore = null;
                if (existingMetric) {
                    const existing = existingMetric;
                    participationCount = existing.participation_count || 0;
                    oldProfileScore = parseFloat(existing.credibility_score);
                    const history = existing.history || [];
                    // On re-finalize: exclude old entries for THIS session to avoid double-counting
                    const filteredHistory = isRefinalize
                        ? history.filter(h => h.sessionId !== sessionId)
                        : history;
                    const pastAlignments = filteredHistory.map(h => h.alignment_score).filter(a => a != null && !isNaN(a));
                    if (pastAlignments.length >= 1) {
                        const mean = pastAlignments.reduce((a, b) => a + b, 0) / pastAlignments.length;
                        const variance = pastAlignments.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / pastAlignments.length;
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
                    const utilization = Math.min(1, markRange / 5);
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
                    ? Math.max(0.1, Math.min(0.95, oldProfileScore))
                    : 0.5;
                const smoothed = TemporalSmoother.smooth({
                    currentProfile: smoothedProfileInput,
                    newComposite: composited.composite_score,
                    sessionCount: participationCount + 1,
                });

                // credibility_score is now 0-1 (same as smoothed_score)
                const newCred = smoothed.smoothed_score;
                const displayScoreDecimal = newCred;

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
                        participation_count = CASE
                          WHEN $10 THEN judge_credibility_metrics.participation_count
                          ELSE judge_credibility_metrics.participation_count + 1
                        END,
                        last_updated = NOW(),
                        history = CASE
                          WHEN $10 THEN (
                            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                            FROM jsonb_array_elements(
                              COALESCE(judge_credibility_metrics.history, '[]'::jsonb)
                            ) AS elem
                            WHERE elem->>'sessionId' != $11
                          ) || $4::jsonb
                          ELSE COALESCE(judge_credibility_metrics.history, '[]'::jsonb) || $4::jsonb
                        END,
                        display_score = $5, alignment_score = $6,
                        stability_score = $7, discipline_score = $8,
                        credibility_band = $9`,
                    [facultyId, newCred, finalDeviation,
                     JSON.stringify([historyEntry]),
                     displayScoreDecimal, alignmentScore,
                     stabilityScore, disciplineScore, smoothed.band,
                     isRefinalize, sessionId]
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

            // ── First-Session: Keep Raw Averages ──────────────────────
            // When all judges start at cred=1.0, student scores from Pass 1
            // are already raw averages (fair). We do NOT re-score with the
            // freshly computed credibility — those weights are saved in
            // judge_credibility_metrics for use in the NEXT session only.
            if (isFirstSession) {
                logger.info("CredibilityService: First session — keeping raw averages for students, judge credibility saved for next session", {
                    sessionId,
                    judgesUpdated: Object.keys(judgesUpdated).length,
                });
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
                firstSessionProtection: isFirstSession,
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
