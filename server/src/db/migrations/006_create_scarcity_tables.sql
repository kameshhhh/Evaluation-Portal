-- ============================================================
-- MIGRATION 006: CREATE SCARCITY EVALUATION TABLES
-- ============================================================
-- Creates the Scarcity Enforcement Engine (SEE) database layer.
-- Implements SRS requirements:
--   4.1.3 — Scarcity-Based Individual Scoring (pool constraints)
--   4.1.5 — Zero-Score Semantics (interpretation tracking)
--   4.2.1 — Independent Scoring (evaluator isolation)
--   4.3   — Comparative Project Evaluation (cross-project mode)
--   4.4   — Faculty Evaluation Module (variable pool sizes)
--
-- Tables created:
--   session_evaluators: links evaluators to sessions
--   scarcity_allocations: point distributions (CORE TABLE)
--   zero_score_interpretations: analytics for zero allocations
--
-- Columns added to evaluation_sessions:
--   scarcity_pool_size: total points available per evaluator
--   evaluation_mode: scoring mode (project_member/cross_project/faculty/peer)
--
-- ZERO CHANGES to existing table constraints or data.
-- All additions are non-destructive (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Extend evaluation_sessions with scarcity columns
-- ============================================================
-- Add scarcity-specific metadata to existing evaluation sessions.
-- These columns are nullable — sessions created before this migration
-- simply have NULL scarcity data (they weren't scarcity-based).
-- ============================================================

-- Total point pool available to each evaluator in this session
-- SRS 4.1.3: "Each judge is assigned a fixed total score pool"
-- Example: 3-member team → pool_size = 15 (5 points per member)
ALTER TABLE evaluation_sessions
ADD COLUMN IF NOT EXISTS scarcity_pool_size DECIMAL(10,2);

-- Evaluation mode determines HOW scoring works
-- 'project_member' — scoring individual team members (SRS 4.1.3)
-- 'cross_project' — comparing multiple projects     (SRS 4.3.1)
-- 'faculty'       — students scoring faculty         (SRS 4.4.1)
-- 'peer'          — peer ranking surveys             (SRS 4.5.2)
ALTER TABLE evaluation_sessions
ADD COLUMN IF NOT EXISTS evaluation_mode VARCHAR(30)
    CHECK (evaluation_mode IN ('project_member', 'cross_project', 'faculty', 'peer'));

-- ============================================================
-- STEP 2: Session Evaluators junction table
-- ============================================================
-- Links persons (evaluators) to evaluation sessions.
-- An evaluator must be assigned to a session before they can
-- submit allocations. This enforces authorization at DB level.
--
-- SRS 4.2.1: "Each judge evaluates independently"
-- We track which judges are assigned to which sessions.
-- ============================================================
CREATE TABLE IF NOT EXISTS session_evaluators (
    -- Which session the evaluator is assigned to
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- Which person is the evaluator
    -- References persons table (can be faculty, student, or admin)
    evaluator_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- When this evaluator was assigned to the session
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Whether the evaluator has completed their evaluation
    -- Set to true when they finalize/submit their allocations
    has_submitted BOOLEAN NOT NULL DEFAULT FALSE,

    -- When the evaluator submitted their evaluation (NULL until submitted)
    submitted_at TIMESTAMPTZ,

    -- Composite primary key: one assignment per evaluator per session
    PRIMARY KEY (session_id, evaluator_id)
);

-- Fast lookup: "What sessions is this evaluator assigned to?"
CREATE INDEX IF NOT EXISTS idx_session_evaluators_evaluator
    ON session_evaluators(evaluator_id);

-- Fast lookup: "Which evaluators have submitted in this session?"
CREATE INDEX IF NOT EXISTS idx_session_evaluators_status
    ON session_evaluators(session_id, has_submitted);

-- ============================================================
-- STEP 3: Scarcity Allocations — THE CORE TABLE
-- ============================================================
-- Records every point allocation made by an evaluator to a target.
-- This is the heart of the Scarcity Enforcement Engine.
--
-- SRS 4.1.3: "Judge must distribute all or part of the pool"
-- SRS 4.1.3: "System shall prevent exceeding total"
-- SRS 4.1.3: "No per-member upper cap"
--
-- SCARCITY RULE: For a given session + evaluator,
--   SUM(points) <= evaluation_sessions.scarcity_pool_size
-- Enforced by a database trigger (Step 4 below).
--
-- Each row = one evaluator's point allocation to one target
-- for one evaluation head in one session.
-- ============================================================
CREATE TABLE IF NOT EXISTS scarcity_allocations (
    -- Primary key for this allocation record
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which evaluation session this allocation belongs to
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- Who is giving the points (the evaluator/judge)
    evaluator_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- Who is receiving the points (the person being evaluated)
    target_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- Which evaluation criterion/dimension (optional)
    -- NULL means a single global score without rubric breakdown
    -- When set, allows rubric-based distribution (SRS 4.1.4)
    head_id UUID REFERENCES evaluation_heads(head_id),

    -- The number of points allocated (non-negative)
    -- Zero is a valid allocation (SRS 4.1.5 — has semantic meaning)
    -- No per-member upper cap (SRS 4.1.3)
    points DECIMAL(10,2) NOT NULL CHECK (points >= 0),

    -- Audit trail: when this allocation was recorded
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Audit trail: who created this record (usually same as evaluator_id)
    created_by UUID REFERENCES persons(person_id),

    -- Optimistic concurrency control (matches existing pattern)
    version INTEGER NOT NULL DEFAULT 1,

    -- UNIQUE constraint: one allocation per evaluator per target per head per session
    -- Prevents duplicate entries — re-submissions replace via DELETE + INSERT
    UNIQUE(session_id, evaluator_id, target_id, head_id),

    -- Ensure version is valid (matches existing pattern)
    CONSTRAINT valid_allocation_version CHECK (version >= 1)
);

-- Fast lookup: "All allocations for this session" (aggregation queries)
CREATE INDEX IF NOT EXISTS idx_scarcity_allocations_session
    ON scarcity_allocations(session_id);

-- Fast lookup: "All allocations by this evaluator" (pool usage check)
CREATE INDEX IF NOT EXISTS idx_scarcity_allocations_evaluator
    ON scarcity_allocations(session_id, evaluator_id);

-- Fast lookup: "All allocations targeting this person" (results view)
CREATE INDEX IF NOT EXISTS idx_scarcity_allocations_target
    ON scarcity_allocations(target_id);

-- ============================================================
-- STEP 4: Database trigger — ENFORCE SCARCITY CONSTRAINT
-- ============================================================
-- Runs BEFORE every INSERT or UPDATE on scarcity_allocations.
-- Checks that the evaluator's total allocation does NOT exceed
-- the session's scarcity_pool_size.
--
-- SRS 4.1.3: "System shall prevent exceeding total"
--
-- WHY A TRIGGER (not just application logic)?
--   - Defense in depth: even direct SQL won't bypass the constraint
--   - Race condition protection: concurrent inserts are serialized
--   - Single source of truth: the DB IS the constraint enforcer
-- ============================================================
CREATE OR REPLACE FUNCTION check_scarcity_constraint()
RETURNS TRIGGER AS $$
DECLARE
    pool_size DECIMAL(10,2);
    current_total DECIMAL(10,2);
    new_total DECIMAL(10,2);
BEGIN
    -- Get the pool size for this session
    SELECT scarcity_pool_size
    INTO pool_size
    FROM evaluation_sessions
    WHERE session_id = NEW.session_id;

    -- If no pool size is set, allow the allocation (non-scarcity session)
    IF pool_size IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calculate current total for this evaluator in this session
    -- EXCLUDE the row being updated (for UPDATE case) to avoid double-count
    SELECT COALESCE(SUM(points), 0)
    INTO current_total
    FROM scarcity_allocations
    WHERE session_id = NEW.session_id
      AND evaluator_id = NEW.evaluator_id
      AND allocation_id != COALESCE(NEW.allocation_id, '00000000-0000-0000-0000-000000000000');

    -- Calculate what the new total would be after this allocation
    new_total := current_total + NEW.points;

    -- ENFORCE SCARCITY: total must not exceed pool
    IF new_total > pool_size THEN
        RAISE EXCEPTION 'SCARCITY_VIOLATION: Allocated % of % pool (excess: %)',
            new_total, pool_size, new_total - pool_size
            USING ERRCODE = 'check_violation';
    END IF;

    -- Allocation is within pool — allow it
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger to scarcity_allocations
-- Runs BEFORE INSERT or UPDATE to prevent violation before it's committed
DROP TRIGGER IF EXISTS enforce_scarcity ON scarcity_allocations;
CREATE TRIGGER enforce_scarcity
    BEFORE INSERT OR UPDATE ON scarcity_allocations
    FOR EACH ROW EXECUTE FUNCTION check_scarcity_constraint();

-- ============================================================
-- STEP 5: Zero Score Interpretations table
-- ============================================================
-- When an evaluator gives a target zero points, the system
-- infers WHY based on the allocation pattern.
-- Data is for ANALYTICS ONLY — never shown to evaluators.
--
-- SRS 4.1.5: "When a member receives zero, judge must implicitly
-- classify it as: Not selected due to scarcity / Below expectation
-- / Insufficient observation"
--
-- These interpretations are computed by the application layer
-- and stored here for trend analysis and credibility scoring.
-- ============================================================
CREATE TABLE IF NOT EXISTS zero_score_interpretations (
    -- Primary key for this interpretation record
    interpretation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which zero-point allocation this interprets
    allocation_id UUID NOT NULL REFERENCES scarcity_allocations(allocation_id) ON DELETE CASCADE,

    -- The inferred reason for the zero allocation
    -- 'scarcity_driven'          — pool too small, had to choose others
    -- 'below_expectation'        — deliberately gave zero despite room
    -- 'insufficient_observation' — didn't observe enough to score
    inferred_reason VARCHAR(30) NOT NULL CHECK (
        inferred_reason IN ('scarcity_driven', 'below_expectation', 'insufficient_observation')
    ),

    -- How confident the system is in this interpretation (0.0 - 1.0)
    -- Higher = more certain about the reason
    confidence_score DECIMAL(3,2) NOT NULL CHECK (
        confidence_score >= 0 AND confidence_score <= 1
    ),

    -- Additional context data as JSON for analytics
    -- Contains: pool_utilization, zero_percentage, max_allocation, etc.
    context_data JSONB,

    -- When this interpretation was computed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One interpretation per allocation (can be re-computed via UPSERT)
    UNIQUE(allocation_id)
);

-- Fast lookup: interpretations by reason (for analytics dashboards)
CREATE INDEX IF NOT EXISTS idx_zero_interpretations_reason
    ON zero_score_interpretations(inferred_reason);

COMMIT;
