-- ============================================================
-- Migration 015: Faculty Evaluation Module
-- SRS §4.4 — Students evaluate faculty with scarcity-based allocation
-- SRS §4.4.1 — Limited points, forced distribution
-- SRS §4.4.2 — Three configurable modes (binary/small/full pool)
-- SRS §4.4.3 — Exposure normalization support
-- ============================================================

-- Faculty Evaluation Sessions
-- Separate lifecycle from main evaluation_sessions
-- Admin creates these; students participate by allocating points
CREATE TABLE IF NOT EXISTS faculty_evaluation_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  evaluation_mode   VARCHAR(20) NOT NULL DEFAULT 'small_pool'
                      CHECK (evaluation_mode IN ('binary', 'small_pool', 'full_pool')),
  academic_year     INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_TIMESTAMP),
  semester          INTEGER NOT NULL DEFAULT 1,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'closed', 'archived')),
  opens_at          TIMESTAMPTZ,
  closes_at         TIMESTAMPTZ,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Faculty Evaluation Allocations
-- Each row = one student's tier assignment for one faculty in one session
-- UNIQUE constraint prevents duplicate submissions per student-faculty pair
-- SRS §4.4.1: "Student distributes points among faculty"
CREATE TABLE IF NOT EXISTS faculty_evaluation_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  student_person_id   UUID NOT NULL,
  faculty_person_id   UUID NOT NULL,
  tier                VARCHAR(20) NOT NULL DEFAULT 'unranked'
                        CHECK (tier IN ('tier1', 'tier2', 'tier3', 'unranked')),
  points              DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (points >= 0),
  is_draft            BOOLEAN NOT NULL DEFAULT true,
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, student_person_id, faculty_person_id)
);

-- Performance indexes (SRS §8.3: scalability for 1000+ projects)
CREATE INDEX IF NOT EXISTS idx_fes_status     ON faculty_evaluation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_fes_academic   ON faculty_evaluation_sessions(academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_fes_dates      ON faculty_evaluation_sessions(opens_at, closes_at);

CREATE INDEX IF NOT EXISTS idx_fea_session        ON faculty_evaluation_allocations(session_id);
CREATE INDEX IF NOT EXISTS idx_fea_student        ON faculty_evaluation_allocations(student_person_id);
CREATE INDEX IF NOT EXISTS idx_fea_faculty        ON faculty_evaluation_allocations(faculty_person_id);
CREATE INDEX IF NOT EXISTS idx_fea_session_student ON faculty_evaluation_allocations(session_id, student_person_id);
CREATE INDEX IF NOT EXISTS idx_fea_draft          ON faculty_evaluation_allocations(session_id, is_draft);
