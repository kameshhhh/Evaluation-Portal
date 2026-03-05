-- ============================================================
-- MIGRATION: Add batch_year to session_groups & sessions
-- ============================================================
-- batch_year = graduation year (permanent, never changes)
-- Replaces relative labels like "Final Year" which shift annually.
--
-- Backfill: old target_year → batch_year using academic_year offset
--   "Final Year" → academic_year + 1
--   "3rd Year"   → academic_year + 2
--   "2nd Year"   → academic_year + 3
--   "1st Year"   → academic_year + 4
-- ============================================================

-- 1. Add batch_year to session_groups
ALTER TABLE session_groups
  ADD COLUMN IF NOT EXISTS batch_year INTEGER;

-- 2. Add batch_year to faculty_evaluation_sessions
ALTER TABLE faculty_evaluation_sessions
  ADD COLUMN IF NOT EXISTS batch_year INTEGER;

-- 3. Backfill session_groups from target_year + academic_year
UPDATE session_groups
SET batch_year = CASE
  WHEN target_year = 'Final Year' THEN academic_year + 1
  WHEN target_year = '3rd Year'   THEN academic_year + 2
  WHEN target_year = '2nd Year'   THEN academic_year + 3
  WHEN target_year = '1st Year'   THEN academic_year + 4
  ELSE academic_year + 1
END
WHERE batch_year IS NULL AND academic_year IS NOT NULL;

-- 4. Backfill faculty_evaluation_sessions from parent group
UPDATE faculty_evaluation_sessions fes
SET batch_year = sg.batch_year
FROM session_groups sg
WHERE fes.group_id = sg.id
  AND fes.batch_year IS NULL
  AND sg.batch_year IS NOT NULL;

-- 5. Add a comment for documentation
COMMENT ON COLUMN session_groups.batch_year IS 'Graduation year of the targeted student batch (permanent, never changes). Replaces relative target_year label.';
COMMENT ON COLUMN faculty_evaluation_sessions.batch_year IS 'Graduation year of the targeted student batch. Inherited from parent session_group.';
