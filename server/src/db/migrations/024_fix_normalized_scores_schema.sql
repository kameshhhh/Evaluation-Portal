-- Migration 024: Fix faculty_normalized_scores schema
-- The original migration 022 created this table with columns (target_id, raw_score,
-- faculty_session_count, faculty_contact_hours, computed_at) and FKs to evaluation_sessions
-- and users tables. But the faculty evaluation service code expects different columns
-- (raw_total_points, raw_average_score, student_count, response_rate, role_weight,
-- department_percentile, calculated_at) and FKs to faculty_evaluation_sessions and persons.
-- This migration drops and recreates the table with the correct schema.

DROP TABLE IF EXISTS faculty_normalized_scores CASCADE;

CREATE TABLE faculty_normalized_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
  raw_total_points NUMERIC(10,2) DEFAULT 0,
  raw_average_score NUMERIC(5,3) DEFAULT 0,
  student_count INTEGER DEFAULT 0,
  response_rate NUMERIC(5,2) DEFAULT 0,
  normalized_score NUMERIC(5,3) DEFAULT 0,
  exposure_factor NUMERIC(6,4) DEFAULT 1.0,
  role_weight NUMERIC(4,2) DEFAULT 1.0,
  department_percentile NUMERIC(5,2) DEFAULT 50,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_fns_session ON faculty_normalized_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_fns_faculty ON faculty_normalized_scores(faculty_id);
CREATE INDEX IF NOT EXISTS idx_fns_session_faculty ON faculty_normalized_scores(session_id, faculty_id);
