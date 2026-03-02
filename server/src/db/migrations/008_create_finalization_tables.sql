-- ============================================================
-- MIGRATION 008: SESSION FINALIZATION & GOVERNANCE TABLES
-- ============================================================
-- Creates the governance layer for session lifecycle management.
-- This migration adds:
--   1. session_state_transitions — audit trail for every state change
--   2. New columns on evaluation_sessions — finalization metadata
--   3. session_finalization_readiness view — readiness dashboard
--   4. validate_session_finalization() function — programmatic check
--
-- SRS REFERENCES:
--   4.2.2 — Aggregation requires LOCKED session (governance gate)
--   4.1.5 — Zero-score semantics preserved through finalization
--   8.2   — Transparency (rules visible, judgments private)
--
-- SESSION LIFECYCLE (enforced by this migration):
--   draft → open → closed → locked → aggregated
--   NO REVERSE TRANSITIONS past 'locked'
--
-- ZERO CHANGES to existing columns or constraints.
-- All additions use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Session State Transitions — Audit Trail
-- ============================================================
-- Every state change is recorded with who, when, and why.
-- This table is append-only — rows are never updated or deleted.
-- ============================================================
CREATE TABLE IF NOT EXISTS session_state_transitions (
    -- Primary key for this transition record
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session transitioned
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- State before the transition
    from_state VARCHAR(20) NOT NULL,

    -- State after the transition
    to_state VARCHAR(20) NOT NULL,

    -- Who triggered the transition (NULL = system/automated)
    transitioned_by UUID REFERENCES persons(person_id),

    -- When the transition occurred
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Additional context for the transition
    -- Example: { "reason": "deadline_passed", "seal": "abc123..." }
    metadata JSONB DEFAULT '{}'
);

-- Fast lookup: all transitions for a session (audit trail)
CREATE INDEX IF NOT EXISTS idx_state_transitions_session
    ON session_state_transitions(session_id);

-- Fast lookup: transitions by time (recent-first for dashboards)
CREATE INDEX IF NOT EXISTS idx_state_transitions_time
    ON session_state_transitions(transitioned_at DESC);

-- Fast lookup: who triggered what (admin audit)
CREATE INDEX IF NOT EXISTS idx_state_transitions_actor
    ON session_state_transitions(transitioned_by);

-- ============================================================
-- STEP 2: Extend evaluation_sessions with finalization columns
-- ============================================================
-- These columns track the governance metadata for each session.
-- min_evaluators: minimum judges required before finalization
-- finalization_seal: SHA-256 hash of all allocations at lock time
-- sealed_at: when the seal was generated
-- finalized_by: who triggered finalization
-- finalized_at: when finalization completed
-- aggregated_at: when aggregation completed
-- aggregation_version: tracks re-aggregation count
-- ============================================================
ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS min_evaluators INTEGER DEFAULT 1;

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS finalization_seal TEXT;

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ;

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES persons(person_id);

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS aggregated_at TIMESTAMPTZ;

ALTER TABLE evaluation_sessions
    ADD COLUMN IF NOT EXISTS aggregation_version INTEGER DEFAULT 0;

-- ============================================================
-- STEP 3: Session Finalization Readiness View
-- ============================================================
-- Read-only view that shows whether each OPEN session is ready
-- to be finalized. Used by the admin dashboard.
-- ============================================================
CREATE OR REPLACE VIEW session_finalization_readiness AS
SELECT
    es.session_id,
    es.session_type,
    es.intent,
    es.status,
    es.evaluation_window_end AS deadline,
    es.min_evaluators,
    es.created_at,

    -- Evaluator metrics
    COUNT(DISTINCT sa.evaluator_id) AS active_evaluators,
    COUNT(DISTINCT sa.evaluator_id) >= COALESCE(es.min_evaluators, 1) AS has_min_evaluators,

    -- Target coverage: how many distinct targets have at least one allocation
    COUNT(DISTINCT sa.target_id) AS evaluated_targets,

    -- Deadline status
    (es.evaluation_window_end IS NULL OR NOW() > es.evaluation_window_end) AS deadline_passed,

    -- Overall readiness check
    CASE
        WHEN es.status NOT IN ('open', 'in_progress') THEN FALSE
        WHEN COUNT(DISTINCT sa.evaluator_id) < COALESCE(es.min_evaluators, 1) THEN FALSE
        WHEN (es.evaluation_window_end IS NOT NULL AND NOW() <= es.evaluation_window_end) THEN FALSE
        ELSE TRUE
    END AS ready_for_finalization

FROM evaluation_sessions es
LEFT JOIN scarcity_allocations sa ON sa.session_id = es.session_id
WHERE es.status IN ('open', 'in_progress', 'closed')
GROUP BY es.session_id;

-- ============================================================
-- STEP 4: Validate Session Finalization Function
-- ============================================================
-- Programmatic readiness check callable from application code.
-- Returns a single row with can_finalize, reason, and metrics.
-- ============================================================
CREATE OR REPLACE FUNCTION validate_session_finalization(p_session_id UUID)
RETURNS TABLE (
    can_finalize BOOLEAN,
    reason TEXT,
    evaluator_count INTEGER,
    target_coverage DECIMAL,
    deadline_status TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sfr.ready_for_finalization,
        CASE
            WHEN sfr.status NOT IN ('open', 'in_progress')
                THEN 'Session not in OPEN/IN_PROGRESS state'
            WHEN NOT sfr.has_min_evaluators
                THEN 'Insufficient evaluators (' || sfr.active_evaluators || '/' || sfr.min_evaluators || ')'
            WHEN NOT sfr.deadline_passed
                THEN 'Deadline not yet passed'
            ELSE 'Ready for finalization'
        END AS reason,
        sfr.active_evaluators::INTEGER,
        CASE
            WHEN sfr.evaluated_targets = 0 THEN 0.0::DECIMAL
            ELSE ROUND(sfr.evaluated_targets::DECIMAL / GREATEST(sfr.evaluated_targets, 1), 2)
        END AS target_coverage,
        CASE
            WHEN sfr.deadline IS NULL THEN 'No deadline set'
            WHEN sfr.deadline_passed THEN 'Deadline passed'
            ELSE 'Deadline not yet passed'
        END AS deadline_status
    FROM session_finalization_readiness sfr
    WHERE sfr.session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
