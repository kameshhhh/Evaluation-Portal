-- ============================================================
-- MIGRATION 027: Multi-Judge Support & Evaluator Profiles
-- ============================================================
-- 1. Enable multiple judges per student (session_planner_assignments)
-- 2. Add evaluator_profiles table for credibility scores
-- ============================================================

-- 1. Modify session_planner_assignments capabilities
-- Drop the old constraint that limited 1 judge per student per session
ALTER TABLE session_planner_assignments
  DROP CONSTRAINT IF EXISTS uq_student_faculty_session;
DROP INDEX IF EXISTS uq_student_faculty_session;

-- Add new constraint: 1 judge can only be assigned ONCE to a student per session
-- Add new constraint: 1 judge can only be assigned ONCE to a student per session
-- Use DO block to avoid error if constraint already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_faculty_session_assignment'
    ) THEN
        ALTER TABLE session_planner_assignments
        ADD CONSTRAINT uq_student_faculty_session_assignment 
        UNIQUE (session_id, student_id, faculty_id);
    END IF;
END $$;

-- 2. Create Evaluator Profiles (for Credibility)
CREATE TABLE IF NOT EXISTS evaluator_profiles (
    person_id       UUID PRIMARY KEY REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Dynamic credibility score (Starts at 1.0)
    credibility_score DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    
    -- Metrics for calculating credibility updates
    total_evaluations INTEGER DEFAULT 0,
    deviation_score   DECIMAL(5,2) DEFAULT 0.0,  -- Avg distance from consensus
    variance_score    DECIMAL(5,2) DEFAULT 0.0,  -- Consistency of their scoring range
    
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick credibility lookups during aggregation
CREATE INDEX IF NOT EXISTS idx_evaluator_credibility 
    ON evaluator_profiles(credibility_score);

-- Populate existing faculty into profiles with default 1.0
INSERT INTO evaluator_profiles (person_id, credibility_score)
SELECT person_id, 1.0
FROM persons 
WHERE person_type = 'faculty'
ON CONFLICT (person_id) DO NOTHING;
