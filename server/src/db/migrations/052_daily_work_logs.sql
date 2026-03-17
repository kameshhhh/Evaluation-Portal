-- ============================================================
-- Migration 052: Daily Work Logs
-- ============================================================
-- Students can submit one daily work log per day (Mon-Sat)
-- within the 8:00 AM - 4:00 PM IST window.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_work_logs (
    log_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
    log_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    summary         TEXT NOT NULL,
    hours_spent     DECIMAL(5,2) NOT NULL CHECK (hours_spent > 0 AND hours_spent <= 16),
    tasks_completed JSONB DEFAULT '[]',
    challenges      TEXT,
    learnings       TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('submitted', 'reviewed')),
    reviewed_by     UUID REFERENCES persons(person_id),
    reviewed_at     TIMESTAMPTZ,
    review_comment  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_student_daily_log UNIQUE (student_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_dwl_student ON daily_work_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_dwl_date ON daily_work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_dwl_status ON daily_work_logs(status);
