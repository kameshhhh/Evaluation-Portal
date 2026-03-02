-- ============================================================
-- CREDIBILITY ENGINE SCHEMA
-- ============================================================
-- Adds tables and columns for:
-- 1. Judge Credibility Metrics (Trust Score)
-- 2. Assignment Score Events (Audit Trail)
-- 3. Final Student Results (Frozen Results)
-- 4. Session Status & Snapshots
-- ============================================================

BEGIN;

-- 1. Judge Credibility Metrics
CREATE TABLE IF NOT EXISTS judge_credibility_metrics (
    evaluator_id UUID PRIMARY KEY REFERENCES persons(person_id),
    credibility_score FLOAT DEFAULT 1.0 CHECK (credibility_score BETWEEN 0.5 AND 1.5),
    deviation_index FLOAT DEFAULT 0.0,
    participation_count INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    history JSONB DEFAULT '[]'::jsonb
);

-- 2. Assignment Score Events (Hybrid Model Audit Trail)
CREATE TABLE IF NOT EXISTS assignment_score_events (
    id SERIAL PRIMARY KEY,
    assignment_id UUID REFERENCES session_planner_assignments(id),
    session_id UUID REFERENCES faculty_evaluation_sessions(id),
    marks INT NOT NULL CHECK (marks BETWEEN 0 AND 5),
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by session and snapshot version
CREATE INDEX IF NOT EXISTS idx_assignment_events_session ON assignment_score_events(session_id);

-- 3. Final Student Results (Frozen Results)
CREATE TABLE IF NOT EXISTS final_student_results (
    id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES faculty_evaluation_sessions(id),
    student_id UUID REFERENCES persons(person_id),
    project_id UUID REFERENCES projects(project_id),
    
    -- Calculated Scores
    aggregated_score FLOAT NOT NULL,
    normalized_score FLOAT NOT NULL,
    confidence_score FLOAT DEFAULT 0.0, -- 0..1 Reliability Metric
    
    -- Context Snapshot (Freezing Config)
    judge_count INT NOT NULL,
    scale_max INT DEFAULT 5,
    pool_total_per_judge INT DEFAULT 20,
    evaluation_cycle_id UUID, 
    
    -- Provenance
    snapshot_version UUID,
    finalized_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(session_id, student_id)
);

-- 4. Modifications to Faculty Evaluation Sessions
DO $$ 
BEGIN
    -- Add Status Column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='status') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN status VARCHAR DEFAULT 'OPEN';
    END IF;

    -- Add Finalized At
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='finalized_at') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN finalized_at TIMESTAMPTZ;
    END IF;

    -- Add Credibility Snapshot
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='credibility_snapshot') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN credibility_snapshot JSONB;
    END IF;

    -- Add Snapshot Version
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='snapshot_version') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN snapshot_version UUID;
    END IF;

    -- Add Pool Total Per Judge (Config Freeze)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='pool_total_per_judge') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN pool_total_per_judge INT DEFAULT 20;
    END IF;

    -- Add Evaluation Cycle ID (Longitudinal Grouping)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty_evaluation_sessions' AND column_name='evaluation_cycle_id') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN evaluation_cycle_id UUID;
    END IF;
END $$;

COMMIT;
