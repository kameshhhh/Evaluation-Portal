-- ============================================================
-- Migration 023: Exposure Normalization Engine (B-02)
-- SRS §4.4.3 — Full Exposure Normalization
-- ============================================================
-- Adds: normalization_audit_log, department_normalization_benchmarks,
--        normalization_whatif_scenarios.
-- Enhances: faculty_normalization_weights (versioning, response adj),
--           faculty_evaluation_assignments (enrolled_students).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Enhance faculty_evaluation_assignments
-- ────────────────────────────────────────────────────────────

ALTER TABLE faculty_evaluation_assignments
  ADD COLUMN IF NOT EXISTS enrolled_students INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS course_level VARCHAR(20) DEFAULT 'undergrad',
  ADD COLUMN IF NOT EXISTS is_team_taught BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS co_instructors INTEGER DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- 2. Enhance faculty_normalization_weights — versioning + response adj
-- ────────────────────────────────────────────────────────────

ALTER TABLE faculty_normalization_weights
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enable_response_adjustment BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS response_adjustment_exponent DECIMAL(3,2) DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS minimum_exposure_factor DECIMAL(4,3) DEFAULT 0.300,
  ADD COLUMN IF NOT EXISTS use_log_scaling BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────
-- 3. Normalization Audit Log — full calculation trace
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS normalization_audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  faculty_id        UUID NOT NULL,
  weight_config_id  UUID,

  -- Input values
  raw_score         DECIMAL(5,2)  NOT NULL,
  sessions_conducted INTEGER      NOT NULL DEFAULT 0,
  contact_hours     DECIMAL(6,2)  NOT NULL DEFAULT 0,
  role_type         VARCHAR(50)   NOT NULL DEFAULT 'lecture',
  response_rate     DECIMAL(5,2),

  -- Calculated components
  session_ratio     DECIMAL(5,4),
  hours_ratio       DECIMAL(5,4),
  role_multiplier   DECIMAL(4,3),
  exposure_factor   DECIMAL(5,4),
  response_adjustment DECIMAL(5,4) DEFAULT 1.0,

  -- Final score
  normalized_score  DECIMAL(5,2)  NOT NULL,

  calculated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_session  ON normalization_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_faculty  ON normalization_audit_log(faculty_id);
CREATE INDEX IF NOT EXISTS idx_audit_time     ON normalization_audit_log(calculated_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. Department Normalization Benchmarks — cached per session
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS department_normalization_benchmarks (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  department               VARCHAR(100) NOT NULL,

  -- Exposure benchmarks
  avg_sessions_per_faculty DECIMAL(6,2),
  avg_hours_per_faculty    DECIMAL(8,2),
  max_sessions             INTEGER,
  max_hours                DECIMAL(8,2),
  faculty_count            INTEGER DEFAULT 0,

  -- Score benchmarks
  dept_avg_raw_score       DECIMAL(5,2),
  dept_avg_normalized_score DECIMAL(5,2),
  dept_std_deviation       DECIMAL(5,2),

  calculated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, department)
);

CREATE INDEX IF NOT EXISTS idx_bench_lookup
  ON department_normalization_benchmarks(session_id, department);

-- ────────────────────────────────────────────────────────────
-- 5. What-If Scenarios — faculty scenario simulator
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS normalization_whatif_scenarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id          UUID NOT NULL,
  session_id          UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  scenario_name       VARCHAR(100) NOT NULL,

  -- Alternative weights
  alt_sessions_weight DECIMAL(4,3),
  alt_hours_weight    DECIMAL(4,3),
  alt_role_weight     DECIMAL(4,3),

  -- Result
  original_score      DECIMAL(5,2),
  alternative_score   DECIMAL(5,2),
  score_difference    DECIMAL(5,2),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID
);

CREATE INDEX IF NOT EXISTS idx_whatif_faculty ON normalization_whatif_scenarios(faculty_id);
CREATE INDEX IF NOT EXISTS idx_whatif_session ON normalization_whatif_scenarios(session_id);

-- ────────────────────────────────────────────────────────────
-- 6. Update default weight config with new columns
-- ────────────────────────────────────────────────────────────

UPDATE faculty_normalization_weights
SET version = 1,
    enable_response_adjustment = TRUE,
    response_adjustment_exponent = 0.50,
    minimum_exposure_factor = 0.300,
    use_log_scaling = TRUE
WHERE version IS NULL;

COMMIT;
