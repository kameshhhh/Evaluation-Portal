-- ============================================================
-- MIGRATION: 045_faculty_scope_refinements
-- Governance Hardening & Engineering Refinements
-- ============================================================

-- 1. Add scope_version for traceability (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_scope' AND column_name='scope_version') THEN
        ALTER TABLE faculty_evaluation_scope ADD COLUMN scope_version UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

-- 2. Hardening: Partial Unique Index
-- Ensure only ONE active scope per faculty per track+dept.
-- We use COALESCE to handle NULL department (Premium track) as a distinct value 'GLOBAL'.
-- This prevents multiple "PREMIUM + NULL" entries while is_active=true.

DROP INDEX IF EXISTS idx_faculty_scope_unique;
DROP INDEX IF EXISTS idx_faculty_scope_active_unique;

CREATE UNIQUE INDEX idx_faculty_scope_active_unique 
ON faculty_evaluation_scope(faculty_id, track_id, COALESCE(department_code, 'GLOBAL')) 
WHERE is_active = true;

-- 3. Performance Indexes
-- For student filtering joins
CREATE INDEX IF NOT EXISTS idx_persons_dept ON persons(department_code);
CREATE INDEX IF NOT EXISTS idx_sts_track ON student_track_selections(track);

-- 4. Scope Version Index (optional but good for lookups)
CREATE INDEX IF NOT EXISTS idx_scope_version ON faculty_evaluation_scope(scope_version);
