-- ============================================================
-- MIGRATION 021: CREATE MONTHLY WORK LOGS TABLE
-- ============================================================
-- Creates the monthly_work_logs table for tracking work completed
-- by each team member in each evaluation period.
--
-- SRS §4.1.2: "Monthly work logs (per member)"
-- SRS §4.1.2: "Last month's work vs current work"
--
-- This enables:
-- 1. Tracking work completed each month
-- 2. Comparing previous work vs current work
-- 3. Growth assessment based on actual output
--
-- Note: This table is OPTIONAL — historical scores work without it.
-- Work logs provide additional context for evaluators.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Create monthly_work_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_work_logs (
    -- Primary key
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who did the work (team member)
    member_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    
    -- Which project the work belongs to
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    
    -- Which session/evaluation period this log is for
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,
    
    -- Which academic period (for querying without session)
    period_id UUID REFERENCES academic_months(period_id),
    
    -- ========================================
    -- WORK CONTENT FIELDS
    -- ========================================
    
    -- Description of work completed this month
    -- Supports markdown formatting for rich content
    content TEXT NOT NULL,
    
    -- Hours spent on project this month
    -- Optional — teams may or may not track hours
    hours_logged DECIMAL(5, 2),
    
    -- Links to evidence (commits, documents, etc.)
    -- JSON array of objects: [{ url, type, description }]
    evidence_links JSONB DEFAULT '[]',
    
    -- Key accomplishments/milestones achieved
    -- JSON array of strings for bullet-point display
    accomplishments JSONB DEFAULT '[]',
    
    -- ========================================
    -- FEEDBACK FIELDS (from evaluators)
    -- ========================================
    
    -- Optional feedback from evaluator after review
    feedback TEXT,
    
    -- Who provided the feedback
    feedback_by UUID REFERENCES persons(person_id),
    
    -- When feedback was given
    feedback_at TIMESTAMPTZ,
    
    -- ========================================
    -- STATUS AND TIMESTAMPS
    -- ========================================
    
    -- Status of the work log
    -- 'draft' = still being edited by student
    -- 'submitted' = finalized for review
    -- 'reviewed' = evaluator has reviewed and provided feedback
    status VARCHAR(20) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('draft', 'submitted', 'reviewed')),
    
    -- When this log was first submitted
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- ========================================
    -- CONSTRAINTS
    -- ========================================
    
    -- One work log per member per session per project
    -- Ensures uniqueness of submission
    CONSTRAINT unique_member_session_project 
        UNIQUE (member_id, session_id, project_id)
);

-- ============================================================
-- STEP 2: Create indexes for efficient queries
-- ============================================================

-- Index for finding work logs by member and session
-- Used when displaying historical work for a specific person
CREATE INDEX IF NOT EXISTS idx_worklog_member_session 
    ON monthly_work_logs(member_id, session_id);

-- Index for finding work logs by project and session
-- Used when aggregating team work for a session
CREATE INDEX IF NOT EXISTS idx_worklog_project_session 
    ON monthly_work_logs(project_id, session_id);

-- Index for finding work logs by period
-- Used for temporal queries across all projects
CREATE INDEX IF NOT EXISTS idx_worklog_period 
    ON monthly_work_logs(period_id);

-- Index for status filtering
-- Used for finding logs needing review
CREATE INDEX IF NOT EXISTS idx_worklog_status 
    ON monthly_work_logs(status) 
    WHERE status != 'reviewed';

-- ============================================================
-- STEP 3: Create trigger for updated_at
-- ============================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_worklog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function on update
DROP TRIGGER IF EXISTS trg_worklog_updated_at ON monthly_work_logs;
CREATE TRIGGER trg_worklog_updated_at
    BEFORE UPDATE ON monthly_work_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_worklog_updated_at();

-- ============================================================
-- STEP 4: Add comments for documentation
-- ============================================================

COMMENT ON TABLE monthly_work_logs IS 
    'Tracks work completed by team members each month. SRS §4.1.2';

COMMENT ON COLUMN monthly_work_logs.content IS 
    'Description of work completed - supports markdown';

COMMENT ON COLUMN monthly_work_logs.hours_logged IS 
    'Optional: Hours spent on project this month';

COMMENT ON COLUMN monthly_work_logs.evidence_links IS 
    'JSON array of evidence links: [{ url, type, description }]';

COMMENT ON COLUMN monthly_work_logs.accomplishments IS 
    'JSON array of key accomplishments/milestones';

COMMENT ON COLUMN monthly_work_logs.feedback IS 
    'Evaluator feedback after review';

COMMIT;
