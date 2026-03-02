-- ============================================================
-- FACULTY SCOPE GOVERNANCE HARDENING
-- ============================================================
-- Adds shared traceability (scope_version) and strict uniqueness.
-- ============================================================

-- 1. Add scope_version column for shared setup traceability
ALTER TABLE faculty_evaluation_scope 
ADD COLUMN IF NOT EXISTS scope_version UUID;

-- 2. Add description if missing (optional but good for metadata)
ALTER TABLE tracks 
ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Create strict unique constraint for active scope
-- Enforces that a faculty member cannot have duplicate active 
-- (Track, Dept) entries.
-- Note: Uses COALESCE for department_id to handle PREMIUM/Global tracks.
DROP INDEX IF EXISTS idx_faculty_scope_active_unique;
CREATE UNIQUE INDEX idx_faculty_scope_active_unique 
ON faculty_evaluation_scope (faculty_id, track_id, COALESCE(department_id, 'GLOBAL')) 
WHERE is_active = true;

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_scope_faculty ON faculty_evaluation_scope (faculty_id);
CREATE INDEX IF NOT EXISTS idx_scope_version ON faculty_evaluation_scope (scope_version);
