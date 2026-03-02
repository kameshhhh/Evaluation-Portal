-- ============================================================
-- 026: Add marks, feedback, and submission timestamp to
--      session_planner_assignments
-- ============================================================
-- SRS §4.1.3 — Faculty assigns scarcity-based numeric marks
-- to each assigned student (pool = N × 5, one-time submission).
-- ============================================================

ALTER TABLE session_planner_assignments
  ADD COLUMN IF NOT EXISTS marks              INTEGER,
  ADD COLUMN IF NOT EXISTS feedback           TEXT,
  ADD COLUMN IF NOT EXISTS marks_submitted_at TIMESTAMPTZ;

-- Optional index for quick lookup of unsubmitted assignments
CREATE INDEX IF NOT EXISTS idx_spa_marks_pending
  ON session_planner_assignments (faculty_id, session_id)
  WHERE marks_submitted_at IS NULL;
