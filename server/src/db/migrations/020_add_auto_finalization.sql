-- ============================================================
-- MIGRATION 020: ADD AUTO-FINALIZATION TRACKING
-- ============================================================
-- Adds fields to track automated session finalization.
-- The SessionAutoFinalizer worker uses these fields to:
--   1. Track which sessions were auto-finalized (vs manual)
--   2. Record when auto-finalization occurred
--
-- SRS §5.1 — Zero admin intervention for credibility updates
-- ============================================================

-- Add auto_finalized flag to evaluation_sessions
ALTER TABLE evaluation_sessions
ADD COLUMN IF NOT EXISTS auto_finalized BOOLEAN DEFAULT FALSE;

-- Add timestamp for when session was auto-finalized
ALTER TABLE evaluation_sessions  
ADD COLUMN IF NOT EXISTS auto_finalized_at TIMESTAMPTZ;

-- Add index for finding sessions that need auto-finalization
CREATE INDEX IF NOT EXISTS idx_sessions_auto_finalize_pending
ON evaluation_sessions(evaluation_window_end, status)
WHERE status IN ('open', 'in_progress') AND auto_finalized = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN evaluation_sessions.auto_finalized IS 
  'Whether this session was automatically finalized by the SessionAutoFinalizer worker';

COMMENT ON COLUMN evaluation_sessions.auto_finalized_at IS 
  'Timestamp when the session was auto-finalized (NULL if manual or not yet finalized)';
