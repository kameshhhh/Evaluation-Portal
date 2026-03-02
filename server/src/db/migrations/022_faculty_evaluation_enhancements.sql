-- ============================================================
-- Migration 022: Faculty Evaluation Enhancements
-- SRS §4.4.1 — Scarcity-Based Feedback (assignment tracking)
-- SRS §4.4.3 — Exposure Normalization (weighted scoring)
-- ============================================================
-- Adds: faculty_evaluation_assignments, faculty_normalized_scores,
--        faculty_normalization_weights, and pool_size column.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Extend faculty_evaluation_sessions with pool_size + normalization flags
-- ────────────────────────────────────────────────────────────

ALTER TABLE faculty_evaluation_sessions
  ADD COLUMN IF NOT EXISTS pool_size INTEGER,
  ADD COLUMN IF NOT EXISTS allow_assign_all BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalize_by_sessions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS normalize_by_hours BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS normalize_by_role BOOLEAN NOT NULL DEFAULT true;

-- ────────────────────────────────────────────────────────────
-- 2. Faculty-Session Assignments — exposure data per-session
-- SRS §4.4.3: "Normalize scores based on sessions attended,
--              contact hours, and role type"
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faculty_evaluation_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  faculty_id          UUID NOT NULL,
  sessions_conducted  INTEGER NOT NULL DEFAULT 0,
  contact_hours       DECIMAL(6,2) NOT NULL DEFAULT 0,
  role_type           VARCHAR(50) NOT NULL DEFAULT 'lecture'
                        CHECK (role_type IN ('lecture', 'lab', 'tutorial', 'seminar')),
  department          VARCHAR(100),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_feassign_session
  ON faculty_evaluation_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_feassign_faculty
  ON faculty_evaluation_assignments(faculty_id);
CREATE INDEX IF NOT EXISTS idx_feassign_exposure
  ON faculty_evaluation_assignments(session_id, faculty_id, contact_hours, sessions_conducted);

-- ────────────────────────────────────────────────────────────
-- 3. Normalized Faculty Scores — cached after each submission
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faculty_normalized_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  faculty_id            UUID NOT NULL,
  raw_total_points      DECIMAL(10,2) NOT NULL DEFAULT 0,
  raw_average_score     DECIMAL(5,2) NOT NULL DEFAULT 0,
  student_count         INTEGER NOT NULL DEFAULT 0,
  response_rate         DECIMAL(5,2),
  normalized_score      DECIMAL(5,2) NOT NULL DEFAULT 0,
  exposure_factor       DECIMAL(5,4) NOT NULL DEFAULT 1.0,
  role_weight           DECIMAL(5,4) NOT NULL DEFAULT 1.0,
  department_percentile INTEGER,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_fns_session
  ON faculty_normalized_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_fns_faculty
  ON faculty_normalized_scores(faculty_id);
CREATE INDEX IF NOT EXISTS idx_fns_score
  ON faculty_normalized_scores(session_id, normalized_score DESC);

-- ────────────────────────────────────────────────────────────
-- 4. Normalization Weights — admin-configurable parameters
-- SRS §4.4.3: "sessions_weight + hours_weight + role_weight = 1.0"
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faculty_normalization_weights (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(100) NOT NULL,
  sessions_weight   DECIMAL(3,2) NOT NULL DEFAULT 0.30,
  hours_weight      DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  role_weight       DECIMAL(3,2) NOT NULL DEFAULT 0.20,
  lecture_weight    DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  lab_weight        DECIMAL(3,2) NOT NULL DEFAULT 0.80,
  tutorial_weight   DECIMAL(3,2) NOT NULL DEFAULT 0.70,
  seminar_weight    DECIMAL(3,2) NOT NULL DEFAULT 0.90,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO faculty_normalization_weights (name)
VALUES ('Default')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. Add optional comment field to allocations
-- ────────────────────────────────────────────────────────────

ALTER TABLE faculty_evaluation_allocations
  ADD COLUMN IF NOT EXISTS comments TEXT;

COMMIT;
