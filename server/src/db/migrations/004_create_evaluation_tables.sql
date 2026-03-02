-- ============================================================
-- MIGRATION 004: CREATE EVALUATION TABLES
-- ============================================================
-- Creates tables for evaluation sessions and evaluation heads.
-- These tables define WHEN and HOW evaluation happens.
-- The actual SCORES are in Part 3 — this module only defines
-- the evaluation STRUCTURE and CONTAINER.
--
-- evaluation_sessions: time-bounded evaluation events
-- evaluation_heads: dimensions/criteria for evaluation
-- session_evaluation_heads: which heads apply to which session
-- ============================================================

-- ============================================================
-- EVALUATION SESSIONS TABLE — Container for evaluation events
-- ============================================================
-- An evaluation session is a time-bounded event where evaluators
-- review projects. Sessions go through their own lifecycle:
--   DRAFT → SCHEDULED → OPEN → IN_PROGRESS → CLOSED → LOCKED
--
-- When a session opens, it freezes all relevant project entities
-- so evaluators see a consistent, immutable snapshot.
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_sessions (
    -- Primary key for this evaluation session
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Type of evaluation being conducted
    -- 'project_review' = reviewing project progress and deliverables
    -- 'faculty_assessment' = faculty evaluating student contributions
    -- 'peer_evaluation' = students evaluating each other's work
    session_type VARCHAR(30) NOT NULL CHECK (
        session_type IN ('project_review', 'faculty_assessment', 'peer_evaluation')
    ),

    -- Intent/purpose of the evaluation
    -- 'growth' = tracking improvement over time
    -- 'excellence' = identifying top performers
    -- 'leadership' = assessing leadership qualities
    -- 'comparative' = comparing entities against each other (scarcity model)
    intent VARCHAR(30) NOT NULL CHECK (
        intent IN ('growth', 'excellence', 'leadership', 'comparative')
    ),

    -- Which academic month period this session evaluates
    period_id UUID NOT NULL REFERENCES academic_months(period_id),

    -- Time window during which evaluation is open
    -- Evaluators can only submit scores within this window
    evaluation_window_start TIMESTAMPTZ NOT NULL,
    evaluation_window_end TIMESTAMPTZ NOT NULL,

    -- Session lifecycle status (managed by SessionStateMachine)
    -- 'draft' = being configured, not yet visible
    -- 'scheduled' = configured and scheduled, visible to admins
    -- 'open' = evaluators can view projects (entities being frozen)
    -- 'in_progress' = evaluators are actively submitting scores
    -- 'closed' = score submission ended, results being finalized
    -- 'locked' = results are final and immutable
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'scheduled', 'open', 'in_progress', 'closed', 'locked')),

    -- JSON array of frozen project IDs for this session
    -- Populated when the session opens and entities are frozen
    -- Example: ["uuid-1", "uuid-2", "uuid-3"]
    frozen_entities JSONB NOT NULL DEFAULT '[]',

    -- When the entity freeze was applied for this session
    frozen_at TIMESTAMPTZ,

    -- Audit trail: who created and when
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES persons(person_id),

    -- When the session was locked (results finalized)
    locked_at TIMESTAMPTZ,

    -- Who locked the session
    locked_by UUID REFERENCES persons(person_id),

    -- CONSTRAINT: evaluation window must be valid (start before end)
    CONSTRAINT valid_evaluation_window CHECK (
        evaluation_window_start < evaluation_window_end
    )
);

-- Fast lookup of sessions by period and status
CREATE INDEX IF NOT EXISTS idx_evaluation_sessions ON evaluation_sessions(period_id, status);

-- Fast lookup by evaluation window (for "what sessions are open now?" queries)
CREATE INDEX IF NOT EXISTS idx_evaluation_window ON evaluation_sessions(evaluation_window_start, evaluation_window_end);

-- Fast lookup by status (for dashboard queries)
CREATE INDEX IF NOT EXISTS idx_evaluation_sessions_status ON evaluation_sessions(status);

-- ============================================================
-- EVALUATION HEADS TABLE — Dimensions/criteria for evaluation
-- ============================================================
-- Defines WHAT is being evaluated (dimensions of comparison).
-- Examples: "Code Quality", "Innovation", "Teamwork", "Presentation"
-- Each head can apply to persons, projects, or teams.
--
-- Heads are versioned — if criteria change between semesters,
-- a new version is created while the old one remains for history.
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluation_heads (
    -- Primary key for this evaluation head
    head_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Name of the evaluation dimension
    -- Example: "Code Quality", "System Design", "Teamwork"
    head_name VARCHAR(100) NOT NULL,

    -- Detailed description of what this head evaluates
    -- Helps evaluators understand the criteria
    description TEXT,

    -- What entity type this head applies to
    -- 'person' = individual evaluation
    -- 'project' = project-level evaluation
    -- 'team' = team dynamics evaluation
    applicable_entity VARCHAR(20) NOT NULL CHECK (
        applicable_entity IN ('person', 'project', 'team')
    ),

    -- Maximum score possible for this head (defined in Part 3)
    -- NULL means "not yet configured" — must be set before use
    max_score DECIMAL(5,2),

    -- Scarcity pool size — how many entities can receive max score
    -- This is the CRITICAL innovation: limited high scores force comparison
    -- NULL means "not yet configured" — set when session is configured
    scarcity_pool_size INTEGER,

    -- Whether this head is currently active
    -- Inactive heads are preserved for history but ignored in new sessions
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Versioning: version number for this head
    -- New criteria = new version, old version stays for historical sessions
    version INTEGER NOT NULL DEFAULT 1,

    -- When this version of the head becomes effective
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,

    -- When this version stops being effective (NULL = currently active)
    -- Set when a new version supersedes this one
    effective_until DATE,

    -- Audit trail: who created this head
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES persons(person_id),

    -- UNIQUE: only one version of each head name
    UNIQUE(head_name, version)
);

-- Fast lookup of active heads by entity type
CREATE INDEX IF NOT EXISTS idx_evaluation_heads ON evaluation_heads(applicable_entity, is_active)
    WHERE is_active = TRUE;

-- Fast lookup by effectiveness period
CREATE INDEX IF NOT EXISTS idx_evaluation_heads_effective ON evaluation_heads(effective_from, effective_until);

-- ============================================================
-- SESSION-HEAD MAPPING — Which heads apply to which session
-- ============================================================
-- Links evaluation sessions to their evaluation criteria.
-- Each session can use a different set of heads with different weights.
-- This allows flexible evaluation configurations per session.
-- ============================================================
CREATE TABLE IF NOT EXISTS session_evaluation_heads (
    -- Which session this mapping belongs to
    -- ON DELETE CASCADE: if a session is removed, its head mappings go too
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- Which evaluation head is used in this session
    head_id UUID NOT NULL REFERENCES evaluation_heads(head_id),

    -- Weight of this head within the session (0-100)
    -- All weights should sum to 100 for a session (application enforced)
    -- NULL means equal weight across all heads
    weight DECIMAL(5,2) CHECK (weight >= 0 AND weight <= 100),

    -- Whether this head is required for the evaluation to be complete
    -- Required heads must have scores before submission is allowed
    is_required BOOLEAN NOT NULL DEFAULT TRUE,

    -- Composite primary key: one head per session
    PRIMARY KEY (session_id, head_id)
);
