-- ============================================================
-- MIGRATION 009: ENHANCED AGGREGATION RESULTS TABLE
-- ============================================================
-- Extends the aggregation layer with governance-aware columns.
-- The existing session_aggregation_results table (migration 007)
-- handles basic per-target stats. This migration creates a
-- richer aggregated_results table that captures:
--   - Evaluation head support (multi-head sessions)
--   - Zero semantic classification (SRS 4.1.5)
--   - Consensus category labels
--   - Session context (pool size, mode, intent) frozen at compute time
--   - Range, quartiles, IQR for distribution analysis
--
-- Also creates:
--   - session_aggregation_summary view for dashboard queries
--
-- SRS REFERENCES:
--   4.1.5 — Zero-Score Semantics (classification stored)
--   4.2.2 — Aggregation Logic (statistical foundation)
--   5.1   — Credibility (variance/consensus signals)
--   7.2   — Reporting Rules (no raw rankings, only statistics)
--
-- ZERO DESTRUCTIVE CHANGES. Existing tables untouched.
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Enhanced Aggregated Results Table
-- ============================================================
-- This table stores the FULL statistical picture per target.
-- It is READ-ONLY derived data — never written by human input.
-- ============================================================
CREATE TABLE IF NOT EXISTS aggregated_results (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session this result belongs to
    session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,

    -- Optional: which evaluation head (for multi-head sessions)
    head_id UUID REFERENCES evaluation_heads(head_id),

    -- Which target (person/project) was evaluated
    target_id UUID NOT NULL,

    -- ── Core Statistics (SRS 4.2.2) ──
    mean_score DECIMAL(10,3) NOT NULL,
    min_score DECIMAL(10,3) NOT NULL,
    max_score DECIMAL(10,3) NOT NULL,
    range DECIMAL(10,3) NOT NULL,

    -- ── Variance Metrics (SRS 5 foundation) ──
    variance DECIMAL(10,3) NOT NULL,
    std_dev DECIMAL(10,3) NOT NULL,

    -- ── Distribution Shape ──
    median DECIMAL(10,3),
    q1 DECIMAL(10,3),         -- First quartile (25th percentile)
    q3 DECIMAL(10,3),         -- Third quartile (75th percentile)
    iqr DECIMAL(10,3),        -- Interquartile range (Q3 - Q1)
    skewness DECIMAL(10,3),
    kurtosis DECIMAL(10,3),

    -- ── Zero Allocation Analysis (SRS 4.1.5) ──
    zero_count INTEGER NOT NULL DEFAULT 0,
    zero_ratio DECIMAL(5,3) NOT NULL DEFAULT 0,
    zero_semantic VARCHAR(50),  -- NO_ZEROS, MINORITY_ZERO, MAJORITY_ZERO, UNANIMOUS_ZERO

    -- ── Consensus Metrics ──
    evaluator_count INTEGER NOT NULL,
    consensus_score DECIMAL(5,3) NOT NULL CHECK (consensus_score BETWEEN 0 AND 1),
    consensus_category VARCHAR(30),  -- PERFECT, HIGH, MODERATE, LOW, SPLIT

    -- ── Allocation Metadata ──
    allocation_count INTEGER NOT NULL,

    -- ── Context (frozen from session at compute time) ──
    pool_size DECIMAL(10,2),
    evaluation_mode VARCHAR(50),
    intent VARCHAR(50),

    -- ── Audit Trail ──
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    aggregation_version INTEGER NOT NULL DEFAULT 1,

    -- ── Constraints ──
    UNIQUE(session_id, head_id, target_id, aggregation_version),
    CHECK (mean_score >= 0),
    CHECK (variance >= 0),
    CHECK (zero_ratio BETWEEN 0 AND 1)
);

-- Fast lookup: all results for a session (results page)
CREATE INDEX IF NOT EXISTS idx_aggregated_session
    ON aggregated_results(session_id);

-- Fast lookup: results for a specific target (person profile)
CREATE INDEX IF NOT EXISTS idx_aggregated_target
    ON aggregated_results(target_id);

-- Ranking: order by mean score descending
CREATE INDEX IF NOT EXISTS idx_aggregated_mean
    ON aggregated_results(mean_score DESC);

-- Ranking: order by consensus score descending
CREATE INDEX IF NOT EXISTS idx_aggregated_consensus
    ON aggregated_results(consensus_score DESC);

-- ============================================================
-- STEP 2: Session Aggregation Summary View
-- ============================================================
-- Dashboard-friendly summary of aggregated sessions.
-- Shows overall statistics per session for quick review.
-- ============================================================
CREATE OR REPLACE VIEW session_aggregation_summary AS
SELECT
    es.session_id,
    es.session_type,
    es.status,
    es.evaluation_mode,
    es.intent,
    es.scarcity_pool_size,
    es.finalized_at,
    es.aggregated_at,

    -- Aggregation metrics (from aggregated_results)
    COUNT(DISTINCT ar.target_id) AS aggregated_targets,
    AVG(ar.mean_score)::DECIMAL(10,3) AS avg_mean_score,
    AVG(ar.variance)::DECIMAL(10,3) AS avg_variance,
    AVG(ar.consensus_score)::DECIMAL(5,3) AS avg_consensus,
    SUM(ar.zero_count) AS total_zeros,

    -- Evaluator participation (from scarcity_allocations)
    COUNT(DISTINCT sa.evaluator_id) AS total_evaluators

FROM evaluation_sessions es
LEFT JOIN aggregated_results ar ON ar.session_id = es.session_id
LEFT JOIN scarcity_allocations sa ON sa.session_id = es.session_id
WHERE es.status IN ('locked', 'aggregated')
GROUP BY es.session_id;

COMMIT;
