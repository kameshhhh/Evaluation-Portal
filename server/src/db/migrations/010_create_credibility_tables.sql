-- ============================================================
-- MIGRATION 010: CREDIBILITY ENGINE TABLES
-- ============================================================
-- Creates the trust-layer schema for SRS 5.1–5.3:
--   1. evaluator_session_signals   — Atomic per-session facts
--   2. evaluator_credibility_profiles — Derived slow-moving profiles
--   3. credibility_configuration    — Tunable parameters
--   4. credibility_update_queue     — Post-aggregation trigger queue
--   5. current_credibility_weights  — Materialized view for aggregation
--
-- DEPENDENCY: Requires evaluation_sessions, persons, aggregated_results
-- ============================================================

BEGIN;

-- ============================================================
-- TABLE 1: EVALUATOR SESSION SIGNALS (ATOMIC FACTS)
-- ============================================================
-- One row per evaluator per session per head.
-- Records alignment, discipline, and distribution signals
-- computed from sealed aggregation data. IMMUTABLE after write.
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluator_session_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References (use correct PK names from our schema)
  session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
  head_id UUID,  -- NULL if single-head session

  -- Signal 1: Alignment with consensus (SRS 5.1)
  alignment_deviation DECIMAL(5,4) NOT NULL CHECK (
    alignment_deviation BETWEEN 0 AND 1
  ),
  alignment_score DECIMAL(5,4) NOT NULL CHECK (
    alignment_score BETWEEN 0 AND 1
  ),

  -- Signal 2: Pool discipline (SRS 4.1.3 behavior)
  pool_usage_ratio DECIMAL(5,4) NOT NULL CHECK (
    pool_usage_ratio BETWEEN 0 AND 1
  ),
  zero_allocation_ratio DECIMAL(5,4) NOT NULL CHECK (
    zero_allocation_ratio BETWEEN 0 AND 1
  ),
  discipline_score DECIMAL(5,4) NOT NULL CHECK (
    discipline_score BETWEEN 0 AND 1
  ),

  -- Signal 3: Distribution shape indicators
  allocation_variance DECIMAL(10,4),
  allocation_skewness DECIMAL(10,4),

  -- Session context (frozen at compute time)
  session_pool_size DECIMAL(10,2) NOT NULL,
  session_target_count INTEGER NOT NULL,
  session_mode VARCHAR(50) NOT NULL,
  session_context JSONB DEFAULT '{}',

  -- Audit trail
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  computed_by VARCHAR(50) DEFAULT 'credibility_engine',

  -- Uniqueness: one signal per evaluator per session per head
  UNIQUE(session_id, evaluator_id, head_id)
);

-- Performance indexes for session signals
CREATE INDEX IF NOT EXISTS idx_session_signals_evaluator
  ON evaluator_session_signals (evaluator_id);
CREATE INDEX IF NOT EXISTS idx_session_signals_computed
  ON evaluator_session_signals (computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_signals_alignment
  ON evaluator_session_signals (alignment_score DESC);

-- ============================================================
-- TABLE 2: EVALUATOR CREDIBILITY PROFILES (DERIVED, SLOW-MOVING)
-- ============================================================
-- One row per evaluator per head (plus one overall row with head_id NULL).
-- Updated via EMA after each session aggregation.
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluator_credibility_profiles (
  evaluator_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
  head_id UUID,  -- NULL for overall credibility

  -- Core credibility score (0.0–1.0, EMA smoothed)
  credibility_score DECIMAL(5,4) NOT NULL DEFAULT 0.5 CHECK (
    credibility_score BETWEEN 0 AND 1
  ),

  -- Credibility band (for display: LOW / MEDIUM / HIGH)
  credibility_band VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (
    credibility_band IN ('LOW', 'MEDIUM', 'HIGH')
  ),

  -- Signal components (for explainability)
  alignment_component DECIMAL(5,4),
  stability_component DECIMAL(5,4),
  discipline_component DECIMAL(5,4),

  -- Longitudinal metrics
  session_count INTEGER NOT NULL DEFAULT 0,
  mean_alignment_deviation DECIMAL(5,4),
  alignment_deviation_variance DECIMAL(5,4),
  last_alignment_score DECIMAL(5,4),

  -- Behavior patterns
  mean_pool_usage DECIMAL(5,4),
  mean_zero_ratio DECIMAL(5,4),

  -- Temporal tracking
  first_evaluated_at TIMESTAMPTZ,
  last_evaluated_at TIMESTAMPTZ,
  profile_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- PK: one profile per evaluator per head
  -- PK replacement: Unique index on coalesce
  CONSTRAINT uq_evaluator_head UNIQUE (evaluator_id, head_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ecp_pk 
  ON evaluator_credibility_profiles (evaluator_id, COALESCE(head_id, '00000000-0000-0000-0000-000000000000'));

-- Performance indexes for profiles
CREATE INDEX IF NOT EXISTS idx_credibility_band
  ON evaluator_credibility_profiles (credibility_band);
CREATE INDEX IF NOT EXISTS idx_credibility_score
  ON evaluator_credibility_profiles (credibility_score DESC);

-- ============================================================
-- TABLE 3: CREDIBILITY CONFIGURATION (TUNABLE PARAMETERS)
-- ============================================================
-- Admin-managed configuration for credibility engine behaviour.
-- All parameters that affect scoring live here, not in code.
-- ============================================================
CREATE TABLE IF NOT EXISTS credibility_configuration (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(100)
);

-- Seed default configuration (SRS 5.1 aligned)
INSERT INTO credibility_configuration (config_key, config_value, description) VALUES
  ('signal_weights',
   '{"alignment": 0.5, "stability": 0.3, "discipline": 0.2}',
   'Weights for credibility composition (must sum to 1.0)'),

  ('ema_parameters',
   '{"alpha": 0.2, "min_sessions": 3, "max_sessions": 20}',
   'Exponential Moving Average parameters for credibility updates'),

  ('band_thresholds',
   '{"HIGH": 0.75, "MEDIUM": 0.45, "LOW": 0.0}',
   'Credibility band classification thresholds'),

  ('alignment_config',
   '{"decay_rate": 5.0, "min_score": 0.1}',
   'Alignment deviation scoring parameters'),

  ('discipline_config',
   '{"ideal_pool_usage": {"min": 0.6, "max": 1.0}, "ideal_zero_ratio": {"min": 0.1, "max": 0.4}}',
   'Rules for scoring evaluator discipline in scarcity usage'),

  ('stability_config',
   '{"window_size": 10, "min_sessions_for_stability": 3}',
   'Configuration for stability (variance) analysis'),

  ('collusion_safeguards',
   '{"max_credibility_change_per_session": 0.15, "new_evaluator_start_score": 0.5, "grace_sessions": 2}',
   'Safeguards against rapid credibility changes')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- TABLE 4: CREDIBILITY UPDATE QUEUE
-- ============================================================
-- Sessions are queued for credibility processing after aggregation.
-- Processed asynchronously by the CredibilityEngine.
-- ============================================================
CREATE TABLE IF NOT EXISTS credibility_update_queue (
  session_id UUID PRIMARY KEY REFERENCES evaluation_sessions(session_id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

-- ============================================================
-- TABLE 5: WEIGHTED AGGREGATION RESULTS
-- ============================================================
-- Stores credibility-weighted means alongside raw means.
-- One row per target per head per session.
-- ============================================================
CREATE TABLE IF NOT EXISTS weighted_aggregation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES evaluation_sessions(session_id) ON DELETE CASCADE,
  head_id UUID,
  target_id UUID NOT NULL,

  -- Core results
  weighted_mean DECIMAL(10,3) NOT NULL,
  raw_mean DECIMAL(10,3) NOT NULL,
  weighting_effect DECIMAL(5,4),

  -- Weight statistics
  credibility_weight_total DECIMAL(10,3),
  mean_credibility_weight DECIMAL(5,4),

  -- Evaluator info
  evaluator_count INTEGER NOT NULL,

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, head_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_weighted_results_session
  ON weighted_aggregation_results (session_id);

-- ============================================================
-- MATERIALIZED VIEW: CURRENT CREDIBILITY WEIGHTS
-- ============================================================
-- Pre-computed view for fast weight lookup during aggregation.
-- Refreshed after each credibility update cycle.
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS current_credibility_weights AS
SELECT
  ecp.evaluator_id,
  ecp.head_id,
  ecp.credibility_score,
  ecp.credibility_band,
  ecp.session_count,
  -- New evaluators (< 3 sessions) get the neutral default weight
  CASE
    WHEN ecp.session_count < 3 THEN 0.5
    ELSE ecp.credibility_score
  END AS aggregation_weight,
  ecp.updated_at AS last_updated
FROM evaluator_credibility_profiles ecp
WHERE ecp.session_count >= 1;

-- Index on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccw_evaluator_head
  ON current_credibility_weights (evaluator_id, head_id);

COMMIT;
