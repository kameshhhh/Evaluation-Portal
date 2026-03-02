-- ============================================================
-- MIGRATION: 007_governance_scheduling.sql
-- PURPOSE: Verify/Add columns for Weekly Scheduling & Adaptive Engine
-- ============================================================

-- 1. Add governance fields to faculty_evaluation_sessions
DO $$
BEGIN
    -- session_week_start
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'session_week_start') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN session_week_start DATE;
    END IF;

    -- session_week_end
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'session_week_end') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN session_week_end DATE;
    END IF;

    -- editable_by_faculty
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'editable_by_faculty') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN editable_by_faculty BOOLEAN DEFAULT TRUE;
    END IF;

    -- auto_suggested (track if the session used the engine)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'faculty_evaluation_sessions' AND column_name = 'auto_suggested') THEN
        ALTER TABLE faculty_evaluation_sessions ADD COLUMN auto_suggested BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Add assignment source to session_planner_assignments
DO $$
BEGIN
    -- Check if 'assignment_source' column exists, otherwise create it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'session_planner_assignments' AND column_name = 'assignment_source') THEN
        -- We can just use text or create a type. Text is safer for now to avoid specific enum dependency issues.
        ALTER TABLE session_planner_assignments ADD COLUMN assignment_source VARCHAR(50) DEFAULT 'manual';
    END IF;
END $$;

-- 3. Create Governance Audit Logs table
CREATE TABLE IF NOT EXISTS governance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL, -- Who performed the action (Admin UUID)
    action_type VARCHAR(50) NOT NULL, -- 'OVERRIDE_WEEKLY_WINDOW', 'OVERRIDE_SCOPE', etc.
    target_entity_id UUID, -- SessionID or AssignmentID
    target_entity_table VARCHAR(50), 
    override_reason TEXT NOT NULL DEFAULT 'Not specified', -- Mandatory reason for accountability
    metadata JSONB DEFAULT '{}', -- Store 'original_date', 'new_date', etc.
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure override_reason exists if table was already created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'governance_audit_logs' AND column_name = 'override_reason') THEN
        ALTER TABLE governance_audit_logs ADD COLUMN override_reason TEXT NOT NULL DEFAULT 'Initial deployment default';
    END IF;
END $$;

-- Index for fast lookup of audit logs
CREATE INDEX IF NOT EXISTS idx_governance_audit_actor ON governance_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_governance_audit_type ON governance_audit_logs(action_type);
