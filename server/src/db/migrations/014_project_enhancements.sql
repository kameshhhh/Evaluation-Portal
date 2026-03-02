-- ============================================================
-- MIGRATION 014: PROJECT MANAGEMENT ENHANCEMENTS
-- ============================================================
-- SRS 4.1.1: Member photos, defined scope, monthly plans, work logs
-- SRS 4.1.2: Review history, score comparison, improvement indicators
-- INNOVATION: GitHub-Lite repository, commits, branches, issues,
--             pull requests, activity feed
--
-- Run: psql -d bitsathy_auth -f 014_project_enhancements.sql
-- ============================================================

-- ============================================================
-- PART A: ALTER project_members — Add SRS 4.1.1 fields
-- ============================================================
-- photo_url: member photo for display in commit history & team view
-- defined_scope: individual responsibilities text
-- technical_stack: bonus array of technologies used
-- NOTE: declared_share_percentage already exists from migration 002
-- ============================================================

ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS defined_scope TEXT,
    ADD COLUMN IF NOT EXISTS technical_stack TEXT[];

-- ============================================================
-- PART B: Monthly Plans (SRS 4.1.1)
-- ============================================================
-- Structured monthly planning with goals, status workflow,
-- and approval chain (draft → submitted → approved → completed)
-- ============================================================

CREATE TABLE IF NOT EXISTS project_monthly_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    month DATE NOT NULL,  -- First day of month
    plan_text TEXT NOT NULL,
    goals JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'approved', 'completed')),
    submitted_by UUID REFERENCES persons(person_id),
    submitted_at TIMESTAMPTZ,
    approved_by UUID REFERENCES persons(person_id),
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_project
    ON project_monthly_plans(project_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_status
    ON project_monthly_plans(project_id, status);

-- ============================================================
-- PART C: Work Logs (SRS 4.1.1) — Time tracking with evidence
-- ============================================================
-- Links to GitHub-Lite commits and issues for integrated tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS project_work_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES persons(person_id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours DECIMAL(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    description TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'coding'
        CHECK (category IN ('coding', 'research', 'meeting', 'design', 'testing', 'documentation', 'other')),
    tags TEXT[] DEFAULT '{}',
    linked_commit_id UUID,   -- FK added after repository_commits created
    linked_issue_id UUID,    -- FK added after project_issues created
    evidence_urls TEXT[] DEFAULT '{}',
    mood INTEGER CHECK (mood >= 1 AND mood <= 5),
    blockers TEXT,
    next_steps TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by UUID REFERENCES persons(person_id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_logs_project_person_date
    ON project_work_logs(project_id, person_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_work_logs_project_date
    ON project_work_logs(project_id, log_date DESC);

-- ============================================================
-- PART D: Improvement Metrics (SRS 4.1.2)
-- ============================================================
-- Tracks score, consistency, productivity trends per member
-- ============================================================

CREATE TABLE IF NOT EXISTS improvement_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES persons(person_id),
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    metric_type VARCHAR(50) NOT NULL
        CHECK (metric_type IN ('score', 'consistency', 'productivity', 'quality', 'collaboration')),
    current_value DECIMAL(7,2) NOT NULL,
    previous_value DECIMAL(7,2),
    delta DECIMAL(7,2),
    delta_percentage DECIMAL(7,2),
    trend VARCHAR(10) NOT NULL DEFAULT 'stable'
        CHECK (trend IN ('up', 'down', 'stable')),
    metadata JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_improvement_project_person
    ON improvement_metrics(project_id, person_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_improvement_type
    ON improvement_metrics(metric_type, metric_date DESC);

-- ============================================================
-- PART E: Repository Files (GitHub-Lite)
-- ============================================================
-- Git-like blob storage with file paths and version tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS repository_files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    file_path VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(20) NOT NULL DEFAULT 'file'
        CHECK (file_type IN ('file', 'directory')),
    mime_type VARCHAR(100),
    file_size BIGINT DEFAULT 0,
    content TEXT,
    blob_hash CHAR(64),  -- SHA-256 hash
    parent_commit_id UUID, -- FK added after repository_commits created
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    author_id UUID REFERENCES persons(person_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_repo_files_project_path
    ON repository_files(project_id, file_path, is_current);

CREATE INDEX IF NOT EXISTS idx_repo_files_blob
    ON repository_files(blob_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_files_active
    ON repository_files(project_id, file_path)
    WHERE deleted_at IS NULL AND is_current = TRUE;

-- ============================================================
-- PART F: Repository Commits (GitHub-Lite)
-- ============================================================
-- Git-like commit history with parent tracking and diff stats
-- ============================================================

CREATE TABLE IF NOT EXISTS repository_commits (
    commit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    commit_hash CHAR(64) NOT NULL,  -- SHA-256
    parent_hash CHAR(64),
    author_id UUID NOT NULL REFERENCES persons(person_id),
    author_name VARCHAR(255),
    message TEXT NOT NULL,
    description TEXT,
    branch VARCHAR(255) NOT NULL DEFAULT 'main',
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    changed_files INTEGER NOT NULL DEFAULT 0,
    file_changes JSONB DEFAULT '[]'::jsonb,
    tags TEXT[] DEFAULT '{}',
    is_merge BOOLEAN NOT NULL DEFAULT FALSE,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, commit_hash)
);

CREATE INDEX IF NOT EXISTS idx_commits_project_date
    ON repository_commits(project_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commits_author
    ON repository_commits(author_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commits_branch
    ON repository_commits(project_id, branch, committed_at DESC);

-- ============================================================
-- PART G: Repository Branches (GitHub-Lite)
-- ============================================================

CREATE TABLE IF NOT EXISTS repository_branches (
    branch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    branch_name VARCHAR(255) NOT NULL,
    head_commit_id UUID REFERENCES repository_commits(commit_id),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_protected BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES persons(person_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, branch_name)
);

CREATE INDEX IF NOT EXISTS idx_branches_project
    ON repository_branches(project_id);

-- ============================================================
-- PART H: Project Issues (GitHub-Lite)
-- ============================================================
-- Bug/feature tracking with assignments, labels, milestones
-- ============================================================

CREATE TABLE IF NOT EXISTS project_issues (
    issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    issue_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    issue_type VARCHAR(20) NOT NULL DEFAULT 'task'
        CHECK (issue_type IN ('task', 'bug', 'feature', 'research', 'documentation')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'review', 'done', 'closed')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    assignee_id UUID REFERENCES persons(person_id),
    reporter_id UUID REFERENCES persons(person_id),
    estimate_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    due_date DATE,
    labels TEXT[] DEFAULT '{}',
    milestone VARCHAR(100),
    linked_commit_id UUID REFERENCES repository_commits(commit_id),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES persons(person_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_issues_project_status
    ON project_issues(project_id, status);

CREATE INDEX IF NOT EXISTS idx_issues_assignee
    ON project_issues(assignee_id, status);

-- ============================================================
-- PART I: Pull Requests (GitHub-Lite)
-- ============================================================
-- Code review workflow with branch merging
-- ============================================================

CREATE TABLE IF NOT EXISTS pull_requests (
    pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    pr_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source_branch VARCHAR(255) NOT NULL,
    target_branch VARCHAR(255) NOT NULL DEFAULT 'main',
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'draft', 'review', 'merged', 'closed')),
    author_id UUID REFERENCES persons(person_id),
    reviewer_ids UUID[] DEFAULT '{}',
    commit_count INTEGER NOT NULL DEFAULT 0,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    comments JSONB DEFAULT '[]'::jsonb,
    merged_at TIMESTAMPTZ,
    merged_by UUID REFERENCES persons(person_id),
    merge_commit_id UUID REFERENCES repository_commits(commit_id),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES persons(person_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_prs_project_status
    ON pull_requests(project_id, status);

-- ============================================================
-- PART J: Project Activities (Denormalized Activity Feed)
-- ============================================================
-- Unified activity stream for ALL project events
-- ============================================================

CREATE TABLE IF NOT EXISTS project_activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    actor_id UUID REFERENCES persons(person_id),
    actor_name VARCHAR(255),
    actor_photo_url VARCHAR(500),
    target_type VARCHAR(50),
    target_id UUID,
    target_name VARCHAR(255),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_project_date
    ON project_activities(project_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_actor
    ON project_activities(actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_type
    ON project_activities(activity_type, occurred_at DESC);

-- ============================================================
-- PART K: Add deferred foreign keys
-- ============================================================
-- Now that all tables exist, add FK constraints for cross-references

ALTER TABLE project_work_logs
    DROP CONSTRAINT IF EXISTS fk_work_logs_commit;
ALTER TABLE project_work_logs
    ADD CONSTRAINT fk_work_logs_commit
    FOREIGN KEY (linked_commit_id) REFERENCES repository_commits(commit_id)
    ON DELETE SET NULL;

ALTER TABLE project_work_logs
    DROP CONSTRAINT IF EXISTS fk_work_logs_issue;
ALTER TABLE project_work_logs
    ADD CONSTRAINT fk_work_logs_issue
    FOREIGN KEY (linked_issue_id) REFERENCES project_issues(issue_id)
    ON DELETE SET NULL;

ALTER TABLE repository_files
    DROP CONSTRAINT IF EXISTS fk_repo_files_commit;
ALTER TABLE repository_files
    ADD CONSTRAINT fk_repo_files_commit
    FOREIGN KEY (parent_commit_id) REFERENCES repository_commits(commit_id)
    ON DELETE SET NULL;

-- ============================================================
-- PART L: Issue number sequence function
-- ============================================================
-- Auto-increment issue_number per project (like GitHub #1, #2, #3)
-- ============================================================

CREATE OR REPLACE FUNCTION next_issue_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(issue_number), 0) + 1
    INTO next_num
    FROM project_issues
    WHERE project_id = p_project_id;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Same for PR numbers
CREATE OR REPLACE FUNCTION next_pr_number(p_project_id UUID)
RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(pr_number), 0) + 1
    INTO next_num
    FROM pull_requests
    WHERE project_id = p_project_id;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART M: Updated_at trigger for new tables
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'project_monthly_plans',
            'project_work_logs',
            'repository_files',
            'repository_commits',
            'repository_branches',
            'project_issues',
            'pull_requests'
        ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trigger_update_%I ON %I; '
            'CREATE TRIGGER trigger_update_%I '
            'BEFORE UPDATE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl, tbl, tbl, tbl
        );
    END LOOP;
END;
$$;
