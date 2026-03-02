/**
 * CREDIBILITY SERVICE — Orchestrator for Session Planner Aggregation
 * ============================================================
 * This service bridges the Session Planner controller and the
 * Credibility Engine.  It implements the full credibility-weighted
 * evaluation pipeline:
 *
 * 1. SNAPSHOT — Freeze judge credibility scores at finalization time
 *    so that future credibility changes never retroactively alter
 *    already-finalized session results.
 *
 * 2. WEIGHTED AGGREGATION — Student final scores are computed as
 *    Σ(mark × credibility) / Σ(credibility) using the frozen
 *    snapshot, NOT live judge_credibility_metrics.
 *
 * 3. CONFIDENCE — A real confidence score is derived from judge
 *    agreement: 1 − CV(marks), where CV = σ/μ. High agreement
 *    → confidence ≈ 1.0; high disagreement → confidence drops.
 *
 * 4. NORMDEV LEARNING — After consensus is established, each
 *    judge's credibility is updated based on their deviation
 *    from consensus: NewCred = clamp(old × 1/(1 + 0.1 × NormDev), 0.5, 1.5)
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

    // ============================================================
    // SNAPSHOT BUILDER — Freeze judge credibility for a session
    // ============================================================
    /**
     * Captures every judge's credibility_score at this moment and
     * stores it as JSONB in faculty_evaluation_sessions.credibility_snapshot.
     *
     * Returns the snapshot map { facultyId: credibilityScore }.
     *
     * @param {object} client  - Pg client (inside a transaction)
     * @param {string} sessionId
     * @returns {Promise<Object>} snapshot map
     */
    async _buildAndStoreSnapshot(client, sessionId) {
        // Get all distinct judges for this session
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

        // Build snapshot object: { "uuid": score, ... }
        const snapshot = {};
        judgesRes.rows.forEach(row => {
            snapshot[row.faculty_id] = parseFloat(row.credibility_score);
        });

        const snapshotVersion = crypto.randomUUID();

        // Persist into the reserved JSONB column
        await client.query(
            `UPDATE faculty_evaluation_sessions
                SET credibility_snapshot = $2,
                    snapshot_version     = $3
              WHERE id = $1`,
            [sessionId, JSON.stringify(snapshot), snapshotVersion]
        );

        logger.info("CredibilityService: Snapshot frozen", {
            sessionId,
            snapshotVersion,
            judgeCount: Object.keys(snapshot).length,
            sample: Object.entries(snapshot).slice(0, 3)
        });

        return snapshot;
    }

    // ============================================================
    // CONFIDENCE CALCULATOR
    // ============================================================
    /**
     * Computes a [0..1] confidence score from judge agreement.
     * Uses 1 − min(CV, 1) where CV = σ / μ.
     *   All judges agree perfectly → confidence = 1.0
     *   Judges wildly disagree    → confidence → 0.0
     *
     * @param {number[]} marks - Array of raw mark values
     * @returns {number} confidence between 0 and 1
     */
    _calculateConfidence(marks) {
        if (marks.length <= 1) return 1.0;  // Single judge → max confidence
        const mean = marks.reduce((a, b) => a + b, 0) / marks.length;
        if (mean === 0) return 0.0;
        const variance = marks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / marks.length;
        const stdev = Math.sqrt(variance);
        const cv = stdev / Math.abs(mean);
        return Math.max(0, Math.min(1 - cv, 1.0));
    }

    // ============================================================
    // CALCULATE STUDENT SCORE — Credibility-Weighted Aggregation
    // ============================================================
    /**
     * Calculates a single student's final score using the
     * credibility-weighted formula:
     *
     *   normalized_score = Σ(marks × credibility) / Σ(credibility)
     *   aggregated_score = Σ(marks) / count          (raw average)
     *   confidence_score = 1 − CV(marks)             (judge agreement)
     *
     * When a snapshot is provided (finalization flow), credibility
     * weights are read from the frozen snapshot. When called in
     * real-time (per-student auto-complete), it falls back to live
     * judge_credibility_metrics.
     *
     * @param {string} sessionId
     * @param {string} studentId
     * @param {Object|null} snapshot - Optional frozen snapshot map { facultyId: score }
     * @param {object|null} client   - Optional Pg client for transactional use
     */
    async calculateStudentScore(sessionId, studentId, snapshot = null, client = null) {
        const q = client
            ? (text, params) => client.query(text, params)
            : query;

        try {
            logger.info("CredibilityService: Calculating score for student", { sessionId, studentId, usingSnapshot: !!snapshot });

            // 1. Fetch all submitted marks for this student
            let submissions;

            if (snapshot) {
                // FINALIZATION PATH — use frozen snapshot for weights
                const submissionsRes = await q(
                    `SELECT spa.faculty_id, spa.marks
                     FROM session_planner_assignments spa
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'`,
                    [sessionId, studentId]
                );
                submissions = submissionsRes.rows.map(row => ({
                    ...row,
                    credibility_score: snapshot[row.faculty_id] ?? 1.0
                }));
            } else {
                // REAL-TIME PATH — read live credibility (pre-finalization)
                const submissionsRes = await q(
                    `SELECT
                        spa.faculty_id,
                        spa.marks,
                        COALESCE(jcm.credibility_score, 1.0) AS credibility_score
                     FROM session_planner_assignments spa
                     LEFT JOIN judge_credibility_metrics jcm
                            ON jcm.evaluator_id = spa.faculty_id
                     WHERE spa.session_id = $1
                       AND spa.student_id = $2
                       AND spa.status = 'evaluation_done'`,
                    [sessionId, studentId]
                );
                submissions = submissionsRes.rows;
            }

            if (submissions.length === 0) {
                logger.warn("CredibilityService: No submitted marks found", { sessionId, studentId });
                return { status: "NO_DATA" };
            }

            // 2. Weighted Aggregation: Σ(marks × credibility) / Σ(credibility)
            let weightedSum = 0;
            let totalWeight = 0;
            let rawSum = 0;
            const rawMarks = [];
            const breakdown = {};

            submissions.forEach(sub => {
                const weight = parseFloat(sub.credibility_score);
                const marks = parseFloat(sub.marks);
                weightedSum += marks * weight;
                totalWeight += weight;
                rawSum += marks;
                rawMarks.push(marks);
                // Store per-judge breakdown for transparency
                breakdown[sub.faculty_id] = {
                    marks,
                    credibility_weight: +weight.toFixed(4),
                    weighted_contribution: +(marks * weight).toFixed(4),
                    weight_share: 0,  // filled below
                };
            });

            // Calculate weight share percentages
            Object.values(breakdown).forEach(b => {
                b.weight_share = totalWeight > 0 ? +((b.credibility_weight / totalWeight) * 100).toFixed(1) : 0;
            });

            const normalizedScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
            const aggregatedScore = rawSum / submissions.length;
            const confidenceScore = this._calculateConfidence(rawMarks);
            const weightingEffect = normalizedScore - aggregatedScore;

            // 3. Upsert into final_student_results (now with credibility_breakdown)
            await q(
                `INSERT INTO final_student_results (
                    session_id,
                    student_id,
                    aggregated_score,
                    normalized_score,
                    confidence_score,
                    judge_count,
                    credibility_breakdown,
                    finalized_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                 ON CONFLICT (session_id, student_id)
                 DO UPDATE SET
                    aggregated_score       = EXCLUDED.aggregated_score,
                    normalized_score       = EXCLUDED.normalized_score,
                    confidence_score       = EXCLUDED.confidence_score,
                    judge_count            = EXCLUDED.judge_count,
                    credibility_breakdown  = EXCLUDED.credibility_breakdown,
                    finalized_at           = NOW()`,
                [
                    sessionId,
                    studentId,
                    aggregatedScore,
                    normalizedScore,
                    confidenceScore,
                    submissions.length,
                    JSON.stringify(breakdown),
                ]
            );

            logger.info("CredibilityService: Student score finalized", {
                sessionId,
                studentId,
                normalizedScore: +normalizedScore.toFixed(4),
                rawMean: +aggregatedScore.toFixed(4),
                weightingEffect: +weightingEffect.toFixed(4),
                confidence: +confidenceScore.toFixed(4),
                judges: submissions.length,
                usingSnapshot: !!snapshot
            });

            return { status: "SUCCESS", normalizedScore, aggregatedScore, confidenceScore, weightingEffect };
        } catch (error) {
            logger.error("CredibilityService: Failed to calculate student score", {
                sessionId, studentId, error: error.message
            });
            throw error;
        }
    }

    // ============================================================
    // FINALIZE SESSION — Full Credibility-Weighted Pipeline
    // ============================================================
    /**
     * Finalizes the session in a single atomic transaction:
     *
     * 1. SNAPSHOT — Freeze all judge credibility scores into
     *    faculty_evaluation_sessions.credibility_snapshot JSONB
     *
     * 2. AGGREGATE — For every student, compute final scores using
     *    the frozen snapshot weights (not live credibility)
     *
     * 3. NORMDEV UPDATE — Calculate each judge's deviation from
     *    consensus and update judge_credibility_metrics for future
     *    sessions (does NOT retroactively change this session)
     *
     * 4. SEAL — Mark session as FINALIZED
     */
    async finalizeSession(sessionId) {
        const client = await require("../../config/database").pool.connect();
        try {
            logger.info("CredibilityService: Starting session finalization", { sessionId });
            await client.query("BEGIN");

            // ── Step 1: Freeze Credibility Snapshot ──────────────
            const snapshot = await this._buildAndStoreSnapshot(client, sessionId);

            // ── Resolve scale_max ──────────────
            // Per SRS: max 5 marks per student (strict cap across all rubrics)
            const scaleMax = 5;

            // ── Step 2: Calculate All Student Scores (using snapshot) ──
            const studentsRes = await client.query(
                `SELECT DISTINCT student_id FROM session_planner_assignments
                 WHERE session_id = $1 AND status = 'evaluation_done'`,
                [sessionId]
            );

            const studentResults = [];
            for (const row of studentsRes.rows) {
                const result = await this.calculateStudentScore(
                    sessionId,
                    row.student_id,
                    snapshot,  // ← frozen snapshot, NOT live credibility
                    client     // ← transactional client
                );
                studentResults.push({ studentId: row.student_id, ...result });
            }

            // ── Stamp scale_max on all results for this session ──
            if (studentResults.length > 0) {
                await client.query(
                    `UPDATE final_student_results SET scale_max = $1 WHERE session_id = $2`,
                    [scaleMax, sessionId]
                );
            }

            // ── Step 3: Advanced Credibility Pipeline ─────────────
            // Uses the full analyzer → compositor → EMA pipeline:
            //   ① AlignmentAnalyzer  → exp(-5·d) consensus deviation
            //   ② StabilityAnalyzer  → 1 - tanh(3·σ) cross-session
            //   ③ DisciplineAnalyzer → Gini + distribution analysis
            //   ④ CredibilityCompositor → weighted fusion + penalties
            //   ⑤ TemporalSmoother  → EMA with dynamic α + clamping
            // ──────────────────────────────────────────────────────

            // Read back consensus scores + marks for the pipeline
            const dataRes = await client.query(
                `SELECT
                    spa.faculty_id,
                    spa.student_id,
                    spa.marks,
                    fsr.normalized_score AS consensus
                 FROM session_planner_assignments spa
                 JOIN final_student_results fsr
                      ON fsr.session_id = spa.session_id
                     AND fsr.student_id = spa.student_id
                 WHERE spa.session_id = $1
                   AND spa.status = 'evaluation_done'`,
                [sessionId]
            );

            // Build per-faculty data structures for all 3 analyzers
            const facultyData = {};
            dataRes.rows.forEach(row => {
                if (!facultyData[row.faculty_id]) {
                    facultyData[row.faculty_id] = {
                        allocations: [],          // for AlignmentAnalyzer
                        marks: [],                // raw marks array
                        consensusMeans: {},       // aggregated means by student
                    };
                }
                const fd = facultyData[row.faculty_id];
                fd.allocations.push({
                    target_id: row.student_id,
                    points: parseFloat(row.marks),
                });
                fd.marks.push(parseFloat(row.marks));
                fd.consensusMeans[row.student_id] = {
                    mean: parseFloat(row.consensus),
                };
            });

            // Process each faculty through the full pipeline
            const judgesUpdated = {};


            for (const [facultyId, fd] of Object.entries(facultyData)) {
                if (fd.allocations.length === 0) continue;

                // ── ① ALIGNMENT — exp(-5d) consensus deviation ──
                const alignment = AlignmentAnalyzer.analyze({
                    evaluatorAllocations: fd.allocations,
                    aggregatedMeans: fd.consensusMeans,
                    poolSize: scaleMax,           // scale_max as normalization denominator
                    targetCount: studentResults.length,
                });

                // ── ② STABILITY — cross-session variance ─────────
                // Read existing history from judge_credibility_metrics
                const existingRes = await client.query(
                    `SELECT credibility_score, deviation_index, participation_count, history
                     FROM judge_credibility_metrics WHERE evaluator_id = $1`,
                    [facultyId]
                );

                let stabilityScore = 0.5;  // default for first session
                let participationCount = 0;
                let oldProfileScore = null;  // null = no prior data

                if (existingRes.rows.length > 0) {
                    const existing = existingRes.rows[0];
                    participationCount = existing.participation_count || 0;
                    oldProfileScore = parseFloat(existing.credibility_score);

                    // Extract historical alignment scores for stability
                    const history = existing.history || [];
                    const pastAlignments = history
                        .map(h => h.alignment_score)
                        .filter(a => a != null && !isNaN(a));

                    if (pastAlignments.length >= 1) {
                        // Include current alignment to compute cross-session stability
                        const allAlignments = [...pastAlignments, alignment.score];
                        const mean = allAlignments.reduce((a, b) => a + b, 0) / allAlignments.length;
                        const variance = allAlignments.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / allAlignments.length;
                        const stdev = Math.sqrt(variance);
                        // tanh-based stability: low variance → high stability (≈1), high variance → low (→0.1)
                        stabilityScore = Math.max(0.1, 1 - Math.tanh(3 * stdev));
                    }
                }

                // ── ③ DISCIPLINE — marks distribution quality ────
                // Adapted from DisciplineAnalyzer for marks-based eval:
                //   - Utilization: how much of the scale range is used?
                //   - Spread: Gini coefficient of marks distribution
                //   - Differentiation: are they giving everyone the same score?
                let disciplineScore = 0.5;  // neutral default
                if (fd.marks.length >= 2) {
                    // Gini coefficient of marks distribution
                    const sorted = [...fd.marks].sort((a, b) => a - b);
                    const n = sorted.length;
                    let giniNum = 0;
                    for (let i = 0; i < n; i++) {
                        giniNum += (2 * (i + 1) - n - 1) * sorted[i];
                    }
                    const giniDenom = n * sorted.reduce((a, b) => a + b, 0);
                    const gini = giniDenom > 0 ? giniNum / giniDenom : 0;

                    // Scale utilization: range of marks vs scale_max
                    const markRange = Math.max(...fd.marks) - Math.min(...fd.marks);
                    const utilization = Math.min(1, markRange / (scaleMax * 0.5));

                    // Differentiation: coefficient of variation of marks
                    const markMean = fd.marks.reduce((a, b) => a + b, 0) / n;
                    const markVar = fd.marks.reduce((s, v) => s + Math.pow(v - markMean, 2), 0) / n;
                    const markCV = markMean > 0 ? Math.sqrt(markVar) / markMean : 0;
                    const differentiation = Math.min(1, markCV);

                    // Composite discipline: rewards judges who use the full scale
                    // and differentiate between students (not rubber-stamping)
                    disciplineScore = 0.3 * utilization + 0.3 * gini + 0.4 * differentiation;
                    disciplineScore = Math.max(0.1, Math.min(0.95, disciplineScore));
                }

                // ── ④ COMPOSITOR — weighted fusion + penalties ───
                const composited = CredibilityCompositor.compose({
                    signals: {
                        alignment_score: alignment.score,
                        stability_score: stabilityScore,
                        discipline_score: disciplineScore,
                    },
                    // Alignment dominant (50%), stability important (30%), discipline complementary (20%)
                });

                // ── ⑤ TEMPORAL SMOOTHER — EMA with dynamic α ────
                // For credibility weighting, we use a neutral start of 1.0
                // (equal weight) so the smoother transitions from equal → differentiated.
                // The smoothed_score is in [0.1, 0.95]. We map it directly
                // to a weight where 1.0 = neutral, >1 = high credibility, <1 = low.
                // Mapping: smoothed → weight = smoothed × 2 (0.1→0.2, 0.5→1.0, 0.95→1.9)
                const smoothedProfileInput = oldProfileScore != null
                    ? Math.max(0.1, Math.min(0.95, oldProfileScore / 2.0))  // reverse-map stored score
                    : 0.5;  // neutral starting point (maps to weight 1.0)

                const smoothed = TemporalSmoother.smooth({
                    currentProfile: smoothedProfileInput,
                    newComposite: composited.composite_score,
                    sessionCount: participationCount + 1,
                });

                // Direct mapping: smoothed_score (0.1-0.95) → weight (0.2-1.9)
                // 0.5 → 1.0 (neutral), 0.1 → 0.2 (low trust), 0.95 → 1.9 (high trust)
                const newCred = Math.max(0.1, Math.min(2.0, smoothed.smoothed_score * 2.0));

                // Display score: composite mapped to 0-100 for UI
                // [0.1, 0.95] → [0, 100]. New evaluators get null → shown as 100 in UI.
                const displayScore = Math.max(0, Math.min(100,
                    Math.round((composited.composite_score - 0.1) / 0.85 * 100)
                ));

                // Build rich history entry with full pipeline breakdown
                const historyEntry = {
                    sessionId,
                    timestamp: new Date().toISOString(),
                    oldCred: oldProfileScore ?? 1.0,
                    newCred,
                    displayScore,
                    pipeline: "advanced",
                    alignment_score: alignment.score,
                    alignment_deviation: alignment.deviation,
                    alignment_consistent: alignment.is_consistent,
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
                };

                await client.query(
                    `INSERT INTO judge_credibility_metrics
                        (evaluator_id, credibility_score, deviation_index, participation_count,
                         last_updated, history, display_score, alignment_score,
                         stability_score, discipline_score, credibility_band)
                     VALUES ($1, $2, $3, 1, NOW(), $4::jsonb, $5, $6, $7, $8, $9)
                     ON CONFLICT (evaluator_id)
                     DO UPDATE SET
                        credibility_score   = $2,
                        deviation_index     = $3,
                        participation_count = judge_credibility_metrics.participation_count + 1,
                        last_updated        = NOW(),
                        history             = COALESCE(judge_credibility_metrics.history, '[]'::jsonb) || $4::jsonb,
                        display_score       = $5,
                        alignment_score     = $6,
                        stability_score     = $7,
                        discipline_score    = $8,
                        credibility_band    = $9`,
                    [
                        facultyId,
                        newCred,
                        alignment.deviation,
                        JSON.stringify([historyEntry]),
                        displayScore / 100,  // store as 0-1 in DB
                        alignment.score,
                        stabilityScore,
                        disciplineScore,
                        smoothed.band,
                    ]
                );

                judgesUpdated[facultyId] = {
                    alignment: +alignment.score.toFixed(4),
                    stability: +stabilityScore.toFixed(4),
                    discipline: +disciplineScore.toFixed(4),
                    composite: +composited.composite_score.toFixed(4),
                    smoothed: +smoothed.smoothed_score.toFixed(4),
                    band: smoothed.band,
                    mapped: +newCred.toFixed(4),
                    displayScore,
                    flags: composited.flags,
                };

                logger.info(`CredibilityService: Advanced pipeline — Judge ${facultyId.slice(0,8)}`, {
                    alignment: judgesUpdated[facultyId].alignment,
                    stability: judgesUpdated[facultyId].stability,
                    discipline: judgesUpdated[facultyId].discipline,
                    composite: judgesUpdated[facultyId].composite,
                    smoothed: judgesUpdated[facultyId].smoothed,
                    finalCred: judgesUpdated[facultyId].mapped,
                    band: smoothed.band,
                    flags: composited.flags.join(", ") || "none",
                });
            }

            // ── Step 4: Seal Session ─────────────────────────────
            await client.query(
                `UPDATE faculty_evaluation_sessions
                    SET status       = 'FINALIZED',
                        finalized_at = NOW()
                  WHERE id = $1`,
                [sessionId]
            );

            await client.query("COMMIT");

            logger.info("CredibilityService: Session finalized successfully", {
                sessionId,
                studentsScored: studentResults.length,
                judgesUpdated: Object.keys(judgesUpdated).length,
                snapshotJudges: Object.keys(snapshot).length,
                pipeline: "advanced",
                judgeBreakdown: judgesUpdated,
            });

            return {
                status: "SUCCESS",
                studentsScored: studentResults.length,
                pipeline: "advanced",
                judges: judgesUpdated,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            logger.error("CredibilityService: Session finalization failed", {
                sessionId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = new CredibilityService();
