-- ============================================================
-- MIGRATION 053: Faculty Alerts & Student Score Appeals
-- ============================================================
-- Creates two core tables for anomaly detection and appeals:
--   1. faculty_alerts — Faculty behavior anomaly alerts
--   2. score_appeals — Student score dispute appeals
-- ============================================================

-- ============================================================
-- TABLE: faculty_alerts
-- Purpose: Store faculty evaluation anomalies for admin review
-- Alert Types:
--   - identical_marks: Faculty gave same score to all students
--   - low_credibility: Faculty credibility < 0.4
--   - incomplete_evaluation: Faculty has pending evaluations
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty_alerts (
  id BIGSERIAL PRIMARY KEY,

  -- References
  faculty_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,

  -- Alert metadata
  alert_type VARCHAR(50) NOT NULL,
    -- Values: 'identical_marks', 'low_credibility', 'incomplete_evaluation'
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    -- Values: 'warning', 'critical'
  title TEXT NOT NULL,
    -- Human-readable alert title (e.g., "John gave identical marks to all 5 students")
  details JSONB,
    -- Additional context (e.g., { "studentCount": 5, "distinctMarks": 1 })

  -- Acknowledgment tracking
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by TEXT REFERENCES persons(person_id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMP NULL,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraint: One alert per faculty + session + type
  CONSTRAINT unique_faculty_session_alert UNIQUE (faculty_id, session_id, alert_type)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_faculty_alerts_faculty_id ON faculty_alerts(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_alerts_session_id ON faculty_alerts(session_id);
CREATE INDEX IF NOT EXISTS idx_faculty_alerts_is_acknowledged ON faculty_alerts(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_faculty_alerts_created_at ON faculty_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faculty_alerts_severity ON faculty_alerts(severity);

-- ============================================================
-- TABLE: score_appeals
-- Purpose: Track student score dispute appeals
-- Appeal Conditions:
--   A. Final score < 2.5 / 5.0
--   B. Large gap between faculty scores (max - min > 1.5)
--   C. Within 7-day window after session finalization
--   D. One appeal per student per session
-- ============================================================
CREATE TABLE IF NOT EXISTS score_appeals (
  id BIGSERIAL PRIMARY KEY,

  -- References
  student_id TEXT NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
  disputed_faculty_id TEXT REFERENCES persons(person_id) ON DELETE SET NULL,
    -- Optional: specific faculty member being disputed

  -- Appeal metadata
  reason TEXT NOT NULL,
    -- Why student is appealing (max 1000 characters)
  score_at_appeal NUMERIC(5,2),
    -- Student's final score when appeal was filed
  faculty_gap NUMERIC(5,2),
    -- Gap between highest and lowest faculty scores (max - min)

  -- Resolution tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Values: 'pending', 'accepted', 'rejected'
  resolved_by TEXT REFERENCES persons(person_id) ON DELETE SET NULL,
    -- Admin who resolved the appeal
  resolution_notes TEXT,
    -- Admin notes explaining decision (max 1000 characters)
  resolved_at TIMESTAMP NULL,

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraint: One appeal per student per session
  CONSTRAINT unique_student_session_appeal UNIQUE (student_id, session_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_score_appeals_student_id ON score_appeals(student_id);
CREATE INDEX IF NOT EXISTS idx_score_appeals_session_id ON score_appeals(session_id);
CREATE INDEX IF NOT EXISTS idx_score_appeals_status ON score_appeals(status);
CREATE INDEX IF NOT EXISTS idx_score_appeals_created_at ON score_appeals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_appeals_resolved_at ON score_appeals(resolved_at DESC);

-- ============================================================
-- AUDIT TRAIL
-- ============================================================
-- Optional: Add audit_log entries for appeal resolutions
-- (if using EntityAuditLogger pattern)
-- INSERT INTO audit_log (entity, verb, actor_id, details, created_at)
-- VALUES ('score_appeals', 'resolved', 'admin_id', {...}, NOW())
