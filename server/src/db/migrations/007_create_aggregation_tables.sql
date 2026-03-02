-- ============================================================
-- MIGRATION 007: Aggregation Engine Tables
-- ============================================================
-- Step 4 of PEMM evaluation pipeline.
-- Stores computed statistical results from multi-judge scarcity
-- allocations. All data here is DERIVED — raw allocations in
-- scarcity_allocations remain the source of truth.
--
-- Tables created:
--   1. session_aggregation_results — Per-target statistics
--   2. aggregation_queue           — Background processing queue
--
-- SRS 4.2.2: Aggregation Logic foundation
-- ============================================================

BEGIN;

-- ============================================================
-- TABLE 1: session_aggregation_results
-- ============================================================
-- Stores computed per-target statistics for each evaluation session.
-- One row per (session, target) pair. Re-computed when allocations change.
-- READ-ONLY from the application's perspective — only the
-- AggregationService writes to this table.
-- ============================================================
CREATE TABLE IF NOT EXISTS session_aggregation_results (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- FK to the evaluation session whose allocations were aggregated
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- The person/entity being evaluated (target of the allocations)
    target_id UUID NOT NULL,

    -- ============================
    -- CORE STATISTICS (SRS 4.2.2)
    -- ============================

    -- Arithmetic mean of all evaluator points for this target
    mean_score DECIMAL(10,3) NOT NULL,

    -- Lowest individual evaluator score
    min_score DECIMAL(10,3) NOT NULL,

    -- Highest individual evaluator score
    max_score DECIMAL(10,3) NOT NULL,

    -- Population variance — measures disagreement among judges
    variance DECIMAL(10,3) NOT NULL,

    -- Standard deviation — sqrt(variance)
    std_dev DECIMAL(10,3) NOT NULL,

    -- ============================
    -- DISTRIBUTION METRICS
    -- ============================

    -- How many distinct evaluators scored this target
    judge_count INTEGER NOT NULL,

    -- How many evaluators gave exactly 0 points
    zero_count INTEGER NOT NULL DEFAULT 0,

    -- Median score (50th percentile)
    median_score DECIMAL(10,3),

    -- Skewness: negative = harsh cluster, positive = generous cluster
    skewness DECIMAL(10,6),

    -- Kurtosis: high = peaked distribution, low = flat
    kurtosis DECIMAL(10,6),

    -- ============================
    -- CONSENSUS INDICATOR
    -- ============================

    -- 0.0 = total disagreement, 1.0 = perfect consensus
    consensus_score DECIMAL(5,3),

    -- ============================
    -- METADATA
    -- ============================

    -- When these statistics were computed
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Which system component produced this record
    computed_by TEXT NOT NULL DEFAULT 'aggregation_engine_v1',

    -- Schema version — allows future migration of computation logic
    version INTEGER NOT NULL DEFAULT 1,

    -- ============================
    -- CONSTRAINTS
    -- ============================

    -- One result row per (session, target) — allows idempotent re-aggregation
    UNIQUE(session_id, target_id),

    -- Scores cannot be negative (scarcity allocation range is [0, pool_size])
    CHECK (mean_score >= 0),
    CHECK (min_score >= 0),
    CHECK (max_score >= 0),

    -- Variance is always non-negative
    CHECK (variance >= 0),
    CHECK (std_dev >= 0),

    -- Consensus is a normalised metric
    CHECK (consensus_score IS NULL OR (consensus_score >= 0 AND consensus_score <= 1)),

    -- Must have at least 1 judge to have a result row
    CHECK (judge_count >= 1),

    -- Zero count cannot exceed judge count
    CHECK (zero_count >= 0 AND zero_count <= judge_count)
);

-- Fast lookup: all aggregation results for a given session
CREATE INDEX IF NOT EXISTS idx_agg_session
    ON session_aggregation_results(session_id);

-- Fast lookup: all sessions where a given target was evaluated
CREATE INDEX IF NOT EXISTS idx_agg_target
    ON session_aggregation_results(target_id);

-- Fast lookup: most-recently computed results first
CREATE INDEX IF NOT EXISTS idx_agg_computed_at
    ON session_aggregation_results(computed_at DESC);

-- Composite: leaderboard queries (session + descending mean)
CREATE INDEX IF NOT EXISTS idx_agg_session_mean
    ON session_aggregation_results(session_id, mean_score DESC);


-- ============================================================
-- TABLE 2: aggregation_queue
-- ============================================================
-- Lightweight queue that records which sessions need (re-)aggregation.
-- The trigger on scarcity_allocations inserts/upserts a row here
-- whenever allocations change. The AggregationService polls or
-- processes this queue.
-- ============================================================
CREATE TABLE IF NOT EXISTS aggregation_queue (
    -- One pending item per session (upsert on conflict)
    session_id UUID PRIMARY KEY REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- When the most recent allocation change occurred
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- FALSE = needs processing, TRUE = already aggregated
    processed BOOLEAN NOT NULL DEFAULT FALSE,

    -- When the aggregation service finished processing
    processed_at TIMESTAMPTZ,

    -- If aggregation failed, store the error for debugging
    error_message TEXT
);

-- Index: quickly find unprocessed items
CREATE INDEX IF NOT EXISTS idx_agg_queue_pending
    ON aggregation_queue(processed) WHERE processed = FALSE;


-- ============================================================
-- TRIGGER: Queue session for re-aggregation on allocation change
-- ============================================================
-- Fires after any INSERT / UPDATE / DELETE on scarcity_allocations.
-- Uses statement-level trigger so it fires once per DML statement
-- rather than per-row (for batch inserts).
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_aggregation_queue()
RETURNS TRIGGER AS $$
DECLARE
    -- Determine the affected session_id from NEW or OLD row
    affected_session UUID;
BEGIN
    -- NEW is available for INSERT/UPDATE, OLD for DELETE
    IF TG_OP = 'DELETE' THEN
        affected_session := OLD.session_id;
    ELSE
        affected_session := NEW.session_id;
    END IF;

    -- Upsert into the queue: mark as unprocessed
    INSERT INTO aggregation_queue (session_id, triggered_at, processed)
    VALUES (affected_session, NOW(), FALSE)
    ON CONFLICT (session_id) DO UPDATE SET
        triggered_at = NOW(),
        processed = FALSE,
        error_message = NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to scarcity_allocations (row-level so we can read NEW/OLD)
DROP TRIGGER IF EXISTS trg_queue_aggregation ON scarcity_allocations;

CREATE TRIGGER trg_queue_aggregation
    AFTER INSERT OR UPDATE OR DELETE ON scarcity_allocations
    FOR EACH ROW EXECUTE FUNCTION trigger_aggregation_queue();


COMMIT;
