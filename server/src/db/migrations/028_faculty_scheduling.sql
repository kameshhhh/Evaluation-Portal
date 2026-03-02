-- ============================================================
-- MIGRATION 028: Faculty Scheduling — Date/Time/Venue per Assignment
-- ============================================================
-- Faculty can schedule evaluation date, time, and venue for
-- individual students or groups (team auto-select handled in app).
-- Cross-faculty visibility allows conflict detection.
-- ============================================================

CREATE TABLE IF NOT EXISTS evaluation_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session + faculty + student this schedule belongs to
    session_id      UUID NOT NULL REFERENCES faculty_evaluation_sessions(id) ON DELETE CASCADE,
    faculty_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,
    student_id      UUID NOT NULL REFERENCES persons(person_id) ON DELETE RESTRICT,

    -- Schedule details
    scheduled_date  DATE NOT NULL,
    scheduled_time  TIME NOT NULL,
    venue           TEXT NOT NULL DEFAULT '',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One schedule per faculty-student pair per session
    CONSTRAINT uq_eval_schedule UNIQUE (session_id, student_id, faculty_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_eval_schedule_session
    ON evaluation_schedules(session_id);
CREATE INDEX IF NOT EXISTS idx_eval_schedule_faculty
    ON evaluation_schedules(faculty_id);
CREATE INDEX IF NOT EXISTS idx_eval_schedule_student
    ON evaluation_schedules(student_id);
CREATE INDEX IF NOT EXISTS idx_eval_schedule_date
    ON evaluation_schedules(scheduled_date, scheduled_time);
