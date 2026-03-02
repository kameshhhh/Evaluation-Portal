-- ============================================================
-- MIGRATION: 031_faculty_scope_governance
-- SRS §4.4: Faculty Evaluation Scope Governance
-- ============================================================

/*
-- ALREADY APPLIED MANUALLY DUE TO MIGRATION RUNNER ISSUES
-- KEPT FOR REFERENCE

-- 1. Create Lookup Table for Tracks
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Initial Data (Idempotent)
INSERT INTO tracks (name, description) VALUES
('CORE', 'Standard evaluation track with team size 3-4'),
('IT', 'IT-specific evaluation track for individual assessments'),
('PREMIUM', 'High-stakes evaluation track with team size 1-2')
ON CONFLICT (name) DO NOTHING;

-- 2. Create Faculty Evaluation Scope Table
CREATE TABLE IF NOT EXISTS faculty_evaluation_scope (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
    department_id VARCHAR(50) REFERENCES departments(department_code) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT TRUE,
    scope_version UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- 3. Constraints & Indexes

-- Note: 'CREATE INDEX IF NOT EXISTS' requires Postgres 9.5+

-- Partial Unique Index
DROP INDEX IF EXISTS idx_faculty_scope_unique;
CREATE UNIQUE INDEX idx_faculty_scope_unique 
ON faculty_evaluation_scope(faculty_id, track_id, COALESCE(department_id, 'GLOBAL')) 
WHERE is_active = true;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_scope_faculty ON faculty_evaluation_scope(faculty_id);
CREATE INDEX IF NOT EXISTS idx_scope_track ON faculty_evaluation_scope(track_id);
CREATE INDEX IF NOT EXISTS idx_scope_dept ON faculty_evaluation_scope(department_id);

-- 4. Optimizing Assignment Filtering

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'student_track_selections') THEN
        CREATE INDEX IF NOT EXISTS idx_sts_track ON student_track_selections(track);
    END IF;
END $$;

-- Index on persons department_code
CREATE INDEX IF NOT EXISTS idx_persons_dept ON persons(department_code);
*/
