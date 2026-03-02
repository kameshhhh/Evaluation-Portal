-- ============================================================
-- Migration 017: Cross-Project Comparative Evaluation (SRS §4.3)
-- ============================================================
-- Hybrid model: Admin creates rounds → Judges pick 3-5 projects
-- Matrix grid: Projects × Criteria with scarcity allocation
-- Pool formula: configurable per round (default 10 × √(projectCount))
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COMPARATIVE ROUNDS — Admin-created evaluation framework
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_rounds (
    round_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(150) NOT NULL,
    description          TEXT,
    
    -- SRS §4.3.1: Scarcity parameters
    total_pool           DECIMAL(10,2) NOT NULL CHECK (total_pool > 0),
    
    -- SRS §4.3.2: Evaluation criteria with per-head pools
    -- Format: [{ "head_name": "Quality", "weight": 30, "pool": 6, "description": "..." }, ...]
    criteria             JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- SRS §8.1: Coverage rules
    -- Format: { "min_projects_per_judge": 3, "max_projects_per_judge": 5, "require_unevaluated": true }
    selection_rules      JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- SRS §5: Judge qualification thresholds
    min_judge_credibility DECIMAL(3,2) DEFAULT 0.0,
    
    -- SRS §6: Temporal settings
    evaluation_window_start TIMESTAMPTZ,
    evaluation_window_end   TIMESTAMPTZ,
    
    -- Status lifecycle: draft → active → closed → archived
    status               VARCHAR(20) NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'active', 'closed', 'archived')),
    
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID NOT NULL,
    
    CONSTRAINT valid_evaluation_window 
        CHECK (evaluation_window_end IS NULL OR evaluation_window_end > evaluation_window_start)
);

-- ============================================================
-- 2. ROUND-ELIGIBLE PROJECTS — Pool of projects in a round
-- ============================================================
CREATE TABLE IF NOT EXISTS round_eligible_projects (
    round_id    UUID NOT NULL REFERENCES comparative_rounds(round_id) ON DELETE CASCADE,
    project_id  UUID NOT NULL,
    
    -- Priority: 1 = must evaluate, 2 = recommended, 3 = optional
    priority    INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 3),
    
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (round_id, project_id)
);

-- ============================================================
-- 3. ROUND-ELIGIBLE JUDGES — Judges assigned to a round
-- ============================================================
CREATE TABLE IF NOT EXISTS round_eligible_judges (
    round_id    UUID NOT NULL REFERENCES comparative_rounds(round_id) ON DELETE CASCADE,
    judge_id    UUID NOT NULL,
    
    -- Credibility at time of assignment
    credibility_score DECIMAL(3,2) DEFAULT 0.0,
    
    -- Judge participation status
    status      VARCHAR(20) NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned', 'in_progress', 'completed', 'declined')),
    
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (round_id, judge_id)
);

-- ============================================================
-- 4. COMPARATIVE SESSIONS — Judge-created sessions within rounds
-- ============================================================
CREATE TABLE IF NOT EXISTS comparative_sessions (
    session_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id             UUID NOT NULL REFERENCES comparative_rounds(round_id) ON DELETE CASCADE,
    judge_id             UUID NOT NULL,
    
    -- Judge's selected projects (3-5 from eligible pool)
    project_ids          UUID[] NOT NULL,
    
    -- Scarcity parameters (copied from round at creation time)
    total_pool           DECIMAL(10,2) NOT NULL CHECK (total_pool > 0),
    criteria             JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Session lifecycle: draft → in_progress → submitted → locked
    status               VARCHAR(20) NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'in_progress', 'submitted', 'locked')),
    
    -- SRS §5: Judge credibility at session creation
    judge_credibility_score DECIMAL(3,2) DEFAULT 0.0,
    
    -- Timestamps
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at           TIMESTAMPTZ,
    submitted_at         TIMESTAMPTZ,
    
    -- Constraint: 3-5 projects per session
    CONSTRAINT valid_project_count 
        CHECK (array_length(project_ids, 1) BETWEEN 3 AND 5),
    
    -- One active session per judge per round
    CONSTRAINT unique_judge_round 
        UNIQUE (round_id, judge_id)
);

-- ============================================================
-- 5. COMPARATIVE ALLOCATIONS — Per-criterion, per-project scores
-- ============================================================
-- The core matrix: for each criterion head, judge allocates points across projects
CREATE TABLE IF NOT EXISTS comparative_allocations (
    allocation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID NOT NULL REFERENCES comparative_sessions(session_id) ON DELETE CASCADE,
    
    -- Which criterion (matches criteria JSONB key from session)
    criterion_key  VARCHAR(50) NOT NULL,
    
    -- Target project receiving points
    project_id     UUID NOT NULL,
    
    -- Allocated points (>= 0, scarcity enforced at app level per criterion pool)
    points         DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (points >= 0),
    
    -- Metadata
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One allocation per session × criterion × project
    CONSTRAINT unique_session_criterion_project 
        UNIQUE (session_id, criterion_key, project_id)
);

-- ============================================================
-- 6. COMPARISON SNAPSHOTS — Auto-save drafts
-- ============================================================
CREATE TABLE IF NOT EXISTS comparison_snapshots (
    snapshot_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     UUID NOT NULL REFERENCES comparative_sessions(session_id) ON DELETE CASCADE,
    
    -- Full allocation state at time of snapshot
    -- Format: { "criterion_key": { "project_id": points, ... }, ... }
    allocation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Snapshot metadata
    snapshot_type  VARCHAR(20) NOT NULL DEFAULT 'auto'
                   CHECK (snapshot_type IN ('auto', 'manual', 'submit')),
    
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. INDEXES for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_comparative_rounds_status 
    ON comparative_rounds(status);
CREATE INDEX IF NOT EXISTS idx_comparative_rounds_created_by 
    ON comparative_rounds(created_by);

CREATE INDEX IF NOT EXISTS idx_round_eligible_projects_project 
    ON round_eligible_projects(project_id);

CREATE INDEX IF NOT EXISTS idx_round_eligible_judges_judge 
    ON round_eligible_judges(judge_id);

CREATE INDEX IF NOT EXISTS idx_comparative_sessions_round 
    ON comparative_sessions(round_id);
CREATE INDEX IF NOT EXISTS idx_comparative_sessions_judge 
    ON comparative_sessions(judge_id);
CREATE INDEX IF NOT EXISTS idx_comparative_sessions_status 
    ON comparative_sessions(status);

CREATE INDEX IF NOT EXISTS idx_comparative_allocations_session 
    ON comparative_allocations(session_id);
CREATE INDEX IF NOT EXISTS idx_comparative_allocations_project 
    ON comparative_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_comparative_allocations_criterion 
    ON comparative_allocations(criterion_key);

CREATE INDEX IF NOT EXISTS idx_comparison_snapshots_session 
    ON comparison_snapshots(session_id);

-- ============================================================
-- 8. VIEW: Round summary with project/judge counts
-- ============================================================
CREATE OR REPLACE VIEW comparative_round_summary AS
SELECT
    cr.round_id,
    cr.name,
    cr.status,
    cr.total_pool,
    cr.evaluation_window_start,
    cr.evaluation_window_end,
    cr.created_at,
    COUNT(DISTINCT rep.project_id) AS eligible_project_count,
    COUNT(DISTINCT rej.judge_id) AS eligible_judge_count,
    COUNT(DISTINCT cs.session_id) AS session_count,
    COUNT(DISTINCT cs.session_id) FILTER (WHERE cs.status = 'submitted') AS submitted_session_count
FROM comparative_rounds cr
LEFT JOIN round_eligible_projects rep ON rep.round_id = cr.round_id
LEFT JOIN round_eligible_judges rej ON rej.round_id = cr.round_id
LEFT JOIN comparative_sessions cs ON cs.round_id = cr.round_id
GROUP BY cr.round_id, cr.name, cr.status, cr.total_pool,
         cr.evaluation_window_start, cr.evaluation_window_end, cr.created_at;

-- ============================================================
-- 9. VIEW: Project scores aggregated across sessions in a round
-- ============================================================
CREATE OR REPLACE VIEW comparative_project_scores AS
SELECT
    cs.round_id,
    ca.project_id,
    ca.criterion_key,
    COUNT(DISTINCT cs.judge_id) AS judge_count,
    AVG(ca.points) AS avg_score,
    SUM(ca.points) AS total_score,
    MIN(ca.points) AS min_score,
    MAX(ca.points) AS max_score,
    STDDEV(ca.points) AS score_stddev
FROM comparative_allocations ca
JOIN comparative_sessions cs ON cs.session_id = ca.session_id
WHERE cs.status IN ('submitted', 'locked')
GROUP BY cs.round_id, ca.project_id, ca.criterion_key;

COMMIT;
