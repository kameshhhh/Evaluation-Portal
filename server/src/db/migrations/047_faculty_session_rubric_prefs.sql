-- ============================================================
-- MIGRATION 047 — Faculty Session Rubric Preferences
-- ============================================================
-- Adds admin-chosen rubric + judge-count preferences to the
-- faculty_evaluation_sessions row so the planner always knows
-- which rubrics were selected and how many judges to assign.
-- ============================================================

-- 1. Chosen rubric IDs (admin picks exactly 3 per session)
ALTER TABLE faculty_evaluation_sessions
  ADD COLUMN IF NOT EXISTS preferred_rubric_ids UUID[] DEFAULT NULL;

-- 2. Preferred judge count (2 or 3 — chosen in AutoAssignModal)
ALTER TABLE faculty_evaluation_sessions
  ADD COLUMN IF NOT EXISTS min_judges INTEGER DEFAULT 2;

-- Add a check so only 2 or 3 is ever stored
ALTER TABLE faculty_evaluation_sessions
  DROP CONSTRAINT IF EXISTS chk_min_judges_range;

ALTER TABLE faculty_evaluation_sessions
  ADD CONSTRAINT chk_min_judges_range
    CHECK (min_judges IS NULL OR min_judges BETWEEN 2 AND 3);

DO $$ BEGIN
  RAISE NOTICE 'Migration 047 applied — preferred_rubric_ids + min_judges added to faculty_evaluation_sessions.';
END $$;
