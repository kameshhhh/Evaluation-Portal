-- ============================================================
-- Migration 051: Meet Links for Evaluation Schedules
-- ============================================================
-- Faculty can optionally send a meet link (Google Meet, Zoom, etc.)
-- to individual students during scheduled evaluations.
-- ============================================================

ALTER TABLE evaluation_schedules
    ADD COLUMN IF NOT EXISTS meet_link TEXT NOT NULL DEFAULT '';
