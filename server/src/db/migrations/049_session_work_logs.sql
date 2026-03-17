-- ============================================================
-- Migration 049: Session Work Logs
-- ============================================================
-- Weekly work logs tied to evaluation sessions.
-- A student submits ONE log per session per week.
-- Only allowed while the session is active (opens_at → closes_at).
-- Completed/evaluated sessions become read-only.
-- ============================================================

CREATE TABLE IF NOT EXISTS session_work_logs (
    log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    week_start      DATE NOT NULL,                      -- Monday of the week
    summary         TEXT NOT NULL,                       -- Main work summary
    hours_spent     DECIMAL(5,2) NOT NULL CHECK (hours_spent > 0 AND hours_spent <= 100),
    tasks_completed JSONB DEFAULT '[]',                  -- Array of task strings
    challenges      TEXT,                                -- Blockers / difficulties
    learnings       TEXT,                                -- Key learnings
    next_week_plan  TEXT,                                -- Plan for next week
    evidence_urls   TEXT[] DEFAULT '{}',                  -- Supporting links
    status          VARCHAR(20) NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('draft', 'submitted', 'reviewed')),
    reviewed_by     UUID REFERENCES persons(person_id),
    reviewed_at     TIMESTAMPTZ,
    review_comment  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_student_session_week UNIQUE (session_id, student_id, week_start)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_swl_session   ON session_work_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_swl_student   ON session_work_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_swl_week      ON session_work_logs(week_start);
