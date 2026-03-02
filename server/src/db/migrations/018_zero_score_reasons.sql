-- ============================================================
-- MIGRATION 018: Zero-Score Reason Capture
-- ============================================================
-- SRS §4.1.5: "When a member receives zero, Judge must implicitly
-- classify it as: Not selected due to scarcity, Below expectation,
-- Insufficient observation. Classification is internal, used for
-- analytics only."
--
-- This migration adds EXPLICIT reason capture from evaluators.
-- The existing zero_score_interpretations table stores SERVER-INFERRED
-- reasons (from ZeroScoreInterpreter.js). This new table stores
-- EVALUATOR-PROVIDED reasons — the actual intent behind a zero score.
--
-- Integration points:
--   - Scarcity allocations (scarcity_allocations table)
--   - Comparative allocations (comparative_allocations table)
--   - Analytics: credibility, person vector, improvement
--
-- Privacy: Reasons are for aggregate analytics ONLY.
--   Never shown to the evaluated person (SRS §8.2b).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CORE TABLE: Evaluator-provided zero-score reasons
-- ============================================================
CREATE TABLE IF NOT EXISTS zero_score_reasons (
  reason_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which evaluation system this came from
  evaluation_type   VARCHAR(20) NOT NULL
                    CHECK (evaluation_type IN ('scarcity', 'comparative')),

  -- Session context (polymorphic FK depending on evaluation_type)
  session_id        UUID NOT NULL,

  -- Who gave the zero
  evaluator_id      UUID NOT NULL,

  -- Who/what received the zero (person for scarcity, project for comparative)
  target_id         UUID NOT NULL,

  -- Optional: criterion key for comparative (null for scarcity)
  criterion_key     VARCHAR(50),

  -- SRS §4.1.5: The three defined classifications ONLY
  classification    VARCHAR(30) NOT NULL
                    CHECK (classification IN (
                      'scarcity_driven',
                      'below_expectation',
                      'insufficient_observation'
                    )),

  -- Optional free-text context (anonymized before any reporting)
  context_note      TEXT,

  -- Analytics metadata
  decision_time_ms  INTEGER,              -- How long evaluator took to select reason
  was_default       BOOLEAN DEFAULT false, -- Was this the pre-selected default?

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uniqueness: one reason per evaluator × target × criterion per session
  UNIQUE (session_id, evaluator_id, target_id, criterion_key)
);

-- ============================================================
-- 2. INDEXES for analytics queries
-- ============================================================

-- Evaluator patterns (credibility: consistency trait)
-- Evaluator patterns (credibility: consistency trait)
CREATE INDEX IF NOT EXISTS idx_zsr_evaluator_class
  ON zero_score_reasons (evaluator_id, classification);

-- Session-level retrieval (batch loading)
-- Session-level retrieval (batch loading)
CREATE INDEX IF NOT EXISTS idx_zsr_session
  ON zero_score_reasons (session_id);

-- Target-level analytics (improvement suggestions)
-- Target-level analytics (improvement suggestions)
CREATE INDEX IF NOT EXISTS idx_zsr_target_class
  ON zero_score_reasons (target_id, classification);

-- Time-based analytics (trends)
-- Time-based analytics (trends)
CREATE INDEX IF NOT EXISTS idx_zsr_created
  ON zero_score_reasons (created_at DESC);

-- Evaluation type filtering
-- Evaluation type filtering
CREATE INDEX IF NOT EXISTS idx_zsr_eval_type
  ON zero_score_reasons (evaluation_type, classification);

-- ============================================================
-- 3. AGGREGATE VIEW: Zero-score patterns per evaluator
-- ============================================================
-- Used by admin analytics tab and credibility engine
CREATE OR REPLACE VIEW zero_score_reason_summary AS
SELECT
  evaluator_id,
  evaluation_type,
  classification,
  COUNT(*)                                  AS reason_count,
  COUNT(DISTINCT session_id)                AS session_count,
  COUNT(DISTINCT target_id)                 AS target_count,
  ROUND(AVG(decision_time_ms)::numeric, 0) AS avg_decision_ms,
  ROUND(
    SUM(CASE WHEN was_default THEN 1 ELSE 0 END)::numeric * 100
    / NULLIF(COUNT(*), 0), 1
  )                                         AS default_pct,
  MIN(created_at)                           AS first_reason_at,
  MAX(created_at)                           AS last_reason_at
FROM zero_score_reasons
GROUP BY evaluator_id, evaluation_type, classification;

-- ============================================================
-- 4. AGGREGATE VIEW: Zero-score patterns per target (project/person)
-- ============================================================
-- Used for improvement suggestions
CREATE OR REPLACE VIEW zero_score_target_summary AS
SELECT
  target_id,
  evaluation_type,
  classification,
  COUNT(*)                   AS times_received,
  COUNT(DISTINCT evaluator_id) AS unique_evaluators,
  COUNT(DISTINCT session_id)   AS across_sessions
FROM zero_score_reasons
GROUP BY target_id, evaluation_type, classification;

COMMIT;
