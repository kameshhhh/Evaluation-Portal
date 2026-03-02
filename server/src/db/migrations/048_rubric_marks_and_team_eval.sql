-- ============================================================
-- MIGRATION 048: PER-RUBRIC MARKS + TEAM EVALUATION SUPPORT
-- ============================================================
-- Adds per-rubric scoring columns to assignments and results.
-- Each faculty submits marks per rubric (JSONB), not a single int.
-- Zero marks require mandatory feedback (JSONB).
-- Final results store display_score (normalized to /5) and
-- rubric_breakdown (per-rubric weighted averages).
--
-- DESIGN:
--   rubric_marks = { "rubric_id_1": 3, "rubric_id_2": 0, "rubric_id_3": 5 }
--   zero_feedback = { "rubric_id_2": "Student did not attempt this section..." }
--   display_score = weighted_total / rubric_count  (always 0-5)
--   rubric_breakdown = { "rubric_id_1": { "weighted_avg": 3.2, "raw_avg": 3.0 }, ... }
-- ============================================================

-- STEP 1: Add rubric_marks JSONB to session_planner_assignments
-- Stores per-rubric marks: { rubricId: integer(0-5), ... }
ALTER TABLE session_planner_assignments
    ADD COLUMN IF NOT EXISTS rubric_marks JSONB DEFAULT NULL;

-- STEP 2: Add zero_feedback JSONB to session_planner_assignments
-- Stores mandatory feedback for any rubric where marks = 0
ALTER TABLE session_planner_assignments
    ADD COLUMN IF NOT EXISTS zero_feedback JSONB DEFAULT NULL;

-- STEP 3: Add display_score to final_student_results
-- Normalized score: weighted_total / rubric_count (always 0-5 range)
ALTER TABLE final_student_results
    ADD COLUMN IF NOT EXISTS display_score NUMERIC(5,2) DEFAULT NULL;

-- STEP 4: Add rubric_breakdown to final_student_results
-- Per-rubric weighted averages: { rubricId: { weighted_avg, raw_avg, judge_count }, ... }
ALTER TABLE final_student_results
    ADD COLUMN IF NOT EXISTS rubric_breakdown JSONB DEFAULT NULL;

-- STEP 5: Add team_formation_id to session_planner_assignments for fast team lookups
ALTER TABLE session_planner_assignments
    ADD COLUMN IF NOT EXISTS team_formation_id UUID DEFAULT NULL;

-- STEP 6: Index for fast per-team queries
CREATE INDEX IF NOT EXISTS idx_spa_team_formation
    ON session_planner_assignments(session_id, team_formation_id)
    WHERE team_formation_id IS NOT NULL;

-- STEP 7: Index for rubric_marks queries  
CREATE INDEX IF NOT EXISTS idx_spa_rubric_marks
    ON session_planner_assignments(session_id, faculty_id)
    WHERE rubric_marks IS NOT NULL;

-- STEP 8: Clean up stale data from previous broken system
-- Reset all marks and results so we start fresh with per-rubric system
UPDATE session_planner_assignments
    SET marks = NULL,
        feedback = NULL,
        marks_submitted_at = NULL,
        faculty_evaluated_at = NULL,
        rubric_marks = NULL,
        zero_feedback = NULL,
        status = 'assigned',
        updated_at = NOW()
    WHERE marks IS NOT NULL;

DELETE FROM final_student_results;
DELETE FROM assignment_score_events;

-- Reset session finalization flags
UPDATE faculty_evaluation_sessions
    SET status = 'active',
        finalized_at = NULL,
        credibility_snapshot = NULL,
        snapshot_version = NULL,
        auto_suggested = FALSE,
        updated_at = NOW()
    WHERE status = 'FINALIZED';

-- Reset credibility metrics to default (fresh start)
DELETE FROM judge_credibility_metrics;

COMMENT ON COLUMN session_planner_assignments.rubric_marks IS
    'Per-rubric marks: { rubricId: integer(0-5) }. Replaces single marks column for per-rubric evaluation.';

COMMENT ON COLUMN session_planner_assignments.zero_feedback IS
    'Mandatory feedback for rubrics with 0 marks: { rubricId: "feedback text (20+ chars)" }';

COMMENT ON COLUMN final_student_results.display_score IS
    'Normalized score: weighted_total / rubric_count. Always in 0-5 range.';

COMMENT ON COLUMN final_student_results.rubric_breakdown IS
    'Per-rubric averages: { rubricId: { weighted_avg, raw_avg, judge_count } }';
